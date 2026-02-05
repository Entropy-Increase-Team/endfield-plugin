import { getMessage, ruleReg } from '../utils/common.js'
import hypergryphAPI from '../model/hypergryphApi.js'
import setting from '../utils/setting.js'

/** 模拟抽卡 Redis 键 */
const SIMULATE_KEYS = {
  state: (scope, poolType) => `ENDFIELD:GACHA:SIMULATE:STATE:${scope}:${poolType}`,
  daily: (date, scope, poolType) => `ENDFIELD:GACHA:SIMULATE:DAILY:${date}:${scope}:${poolType}`,
  statePrefix: 'ENDFIELD:GACHA:SIMULATE:STATE:'
}

/** 模拟抽卡卡池：关键词→key，key→label */
const SIMULATE = (() => {
  const pools = [
    { key: 'limited', keywords: ['UP', '限定'], label: 'UP池' },
    { key: 'standard', keywords: ['常驻'], label: '常驻池' },
    { key: 'weapon', keywords: ['武器'], label: '武器池' }
  ]
  const byKeyword = Object.fromEntries(pools.flatMap((p) => p.keywords.map((k) => [k, p.key])))
  const label = (key) => pools.find((p) => p.key === key)?.label || key
  return { pools, byKeyword, label }
})()

/** 模拟抽卡规则缓存 */
const SIMULATE_RULES_CACHE = new Map()

/** 保底数（仅用于模拟结果面板进度条） */
const PITY_SIMULATE = { charSoft: 80, charHard: 120, weaponMax: 40 }

/** 十连/百连/单抽 规则后缀（规则里与 getRulePrefix 拼接）；simulateDispatch 内用后缀正则单独匹配 */
const SIMULATE_CMD_SUFFIX = '(十连|百连|单抽)(?:\\s*[（(]?(常驻|UP|武器|限定)[）)]?)?$'

export class EndfieldGachaSimulate extends plugin {
  constructor() {
    super({
      name: '[endfield-plugin]模拟抽卡',
      dsc: '终末地模拟抽卡（十连/百连/单抽）',
      event: 'message',
      priority: 50,
      rule: [
        ruleReg(SIMULATE_CMD_SUFFIX, 'simulateDispatch'),
        ruleReg('(重置抽卡|抽卡重置)$', 'resetSimulateGacha'),
        ruleReg('重置全员抽卡$', 'resetAllSimulateGacha', { permission: 'master' })
      ]
    })
  }

  /** 合并入口：按消息后缀匹配，分发到十连/百连/单抽 */
  async simulateDispatch() {
    const raw = (this.e?.msg || '').trim()
    const suffixReg = /(十连|百连|单抽)(?:\s*[（(]?(常驻|UP|武器|限定)[）)]?)?\s*$/
    const m = raw.match(suffixReg)
    if (!m) return true
    const cmd = m[1]
    const poolType = (m[2] && SIMULATE.byKeyword[m[2]]) || 'limited'
    if (cmd === '单抽') return this.simulateSingle(poolType)
    if (cmd === '十连') return this.simulateTen(poolType)
    if (cmd === '百连') return this.simulateHundred(poolType)
    return true
  }

  getSimulateConfig() {
    const gacha = setting.getConfig('gacha') || {}
    const sim = gacha.simulate || {}
    return {
      enable: sim.enable !== false,
      group_whitelist: Array.isArray(sim.group_whitelist) ? sim.group_whitelist : [],
      daily_limit: {
        limited: Number(sim.daily_limit?.limited) || 0,
        standard: Number(sim.daily_limit?.standard) || 0,
        weapon: Number(sim.daily_limit?.weapon) || 0
      }
    }
  }

  checkSimulateAllowed() {
    const cfg = this.getSimulateConfig()
    if (!cfg.enable) return 'disabled'
    if (this.e.isGroup && cfg.group_whitelist.length > 0) {
      const gid = String(this.e.group_id)
      if (!cfg.group_whitelist.includes(gid)) return 'group_not_allowed'
    }
    return true
  }

  async replyIfSimulateNotAllowed() {
    const allowed = this.checkSimulateAllowed()
    if (allowed === true) return false
    if (allowed === 'disabled') await this.reply(getMessage('gacha.simulate_disabled'))
    else if (allowed === 'group_not_allowed') await this.reply(getMessage('gacha.simulate_group_not_allowed'))
    return true
  }

  async loadSimulateState(scope, poolType) {
    if (!redis) return null
    try {
      const raw = await redis.get(SIMULATE_KEYS.state(scope, poolType))
      if (!raw) return null
      const state = JSON.parse(raw)
      return state && typeof state === 'object' ? state : null
    } catch {
      return null
    }
  }

  async saveSimulateState(scope, poolType, nextState) {
    if (!redis) return
    try {
      const key = SIMULATE_KEYS.state(scope, poolType)
      if (nextState && typeof nextState === 'object') {
        await redis.set(key, JSON.stringify(nextState))
      } else {
        await redis.del(key)
      }
    } catch (err) {
      logger.error(`[终末地插件][模拟抽卡] 保存 state 失败: ${err?.message || err}`)
    }
  }

  async getSimulateDailyUsage(scope, poolType) {
    if (!redis) return 0
    try {
      const today = new Date().toISOString().slice(0, 10)
      const raw = await redis.get(SIMULATE_KEYS.daily(today, scope, poolType))
      return parseInt(raw, 10) || 0
    } catch {
      return 0
    }
  }

  async checkSimulateDailyLimit(scope, poolType) {
    const cfg = this.getSimulateConfig()
    const limit = cfg.daily_limit[poolType] ?? 0
    if (limit <= 0) return true
    const usage = await this.getSimulateDailyUsage(scope, poolType)
    return usage < limit
  }

  async incrementSimulateDailyUsage(scope, poolType) {
    if (!redis) return
    try {
      const today = new Date().toISOString().slice(0, 10)
      const key = SIMULATE_KEYS.daily(today, scope, poolType)
      const n = await redis.incr(key)
      if (n === 1) await redis.expire(key, 86400 * 2)
    } catch (err) {
      logger.error(`[终末地插件][模拟抽卡] 增加当日用量失败: ${err?.message || err}`)
    }
  }

  pickRandomCharFromPool(poolCharsData, poolType, rarity, isUp) {
    if (!poolCharsData?.pools?.length) return {}
    const pool = poolCharsData.pools.find((p) => p.pool_type === poolType) || poolCharsData.pools[0]
    const key = rarity === 6 ? 'star6_chars' : rarity === 5 ? 'star5_chars' : 'star4_chars'
    let list = Array.isArray(pool[key]) ? pool[key] : []
    if (rarity === 6 && list.length > 0) list = list.filter((c) => !!c.is_up === !!isUp)
    if (list.length === 0 && rarity === 6) list = Array.isArray(pool.star6_chars) ? pool.star6_chars : []
    const char = list[Math.floor(Math.random() * list.length)]
    return char ? { cover: char.cover || '', name: char.name || '' } : {}
  }

  async renderSimulateResult(mode, payload) {
    if (!this.e?.runtime?.render) return null
    const pluResPath = this.e?.runtime?.path?.plugin?.['endfield-plugin']?.res || ''
    const pageWidth = 760
    let viewportHeight = mode === 'single' ? 360 : mode === 'ten' ? 820 : 520
    if (mode === 'ten' && payload.results?.length > 10) {
      const rows = Math.ceil(payload.results.length / 5)
      viewportHeight = 530 + rows * 199
    }
    const baseOpt = { scale: 1.6, retType: 'base64', viewport: { width: pageWidth, height: viewportHeight } }
    const poolType = payload.poolType
    let poolCharsData = null
    try {
      poolCharsData = await hypergryphAPI.getGachaPoolChars(poolType)
    } catch (e) {}
    const pickChar = (rarity, isUp) => this.pickRandomCharFromPool(poolCharsData, poolType, rarity, isUp)

    let rulesData = SIMULATE_RULES_CACHE.get(poolType) || null
    if (!rulesData) {
      try {
        rulesData = await hypergryphAPI.getGachaSimulateRules(poolType)
        if (rulesData) SIMULATE_RULES_CACHE.set(poolType, rulesData)
      } catch (e) {}
    }
    const rules = rulesData?.rules || {}
    const state = payload.state && typeof payload.state === 'object' ? payload.state : {}
    const stats = payload.stats && typeof payload.stats === 'object' ? payload.stats : {}
    const totalPulls = state.total_pulls ?? stats.total_pulls

    const n = (v) => Number(v) || 0
    const pityPct = (cur, max) => (max > 0 ? Math.min(100, Math.max(0, (cur / max) * 100)) : 0)
    const mkPity = (cur, max, extra) => ({ cur, max, percent: pityPct(cur, max), ...extra })

    const sixMax = n(rules.six_star_pity) || (poolType === 'weapon' ? PITY_SIMULATE.weaponMax : PITY_SIMULATE.charSoft)
    const sixCur = n(state.six_star_pity)
    const baseProb = n(rules.six_star_base_probability) || (poolType === 'weapon' ? 0.04 : 0.008)
    const softStart = n(rules.six_star_soft_pity_start) || 65
    const softInc = n(rules.six_star_soft_pity_increase) || 0.05
    const softSteps = rules.has_soft_pity === true ? Math.max(0, sixCur + 1 - softStart + 1) : 0
    const curProb = Math.min(1, baseProb + softSteps * softInc)

    const hardMax = n(rules.guaranteed_limited_pity) || (poolType === 'weapon' ? 80 : PITY_SIMULATE.charHard)
    const hasHard = poolType !== 'standard' && hardMax > 0
    const hardCur = n(state.guaranteed_limited_pity)

    const pityPanel = {
      six: mkPity(sixCur, sixMax, { probText: `当前概率：${(curProb * 100).toFixed(2)}%` }),
      guaranteedUpText: state.is_guaranteed_up == null ? '未触发' : state.is_guaranteed_up ? '已触发' : '未触发',
      hard: hasHard ? mkPity(hardCur, hardMax, { label: `${hardMax}抽硬保底` }) : null
    }

    const sixCount = n(state.six_star_count ?? stats.six_star_count ?? stats.six_star)
    const fiveCount = n(state.five_star_count ?? stats.five_star_count ?? stats.five_star)
    const upSixCount = n(state.up_six_star_count ?? stats.up_six_star_count)
    const upRate = sixCount > 0 ? ((upSixCount / sixCount) * 100).toFixed(2) : (stats.up_rate != null ? Number(stats.up_rate) : null)
    const pctSub = (part, total) => (total ? `${((part / total) * 100).toFixed(2)}%` : '')
    const summaryCards = {
      total: { label: '总抽数', value: totalPulls ?? '-', sub: '' },
      six: { label: '6星数', value: sixCount, sub: pctSub(sixCount, totalPulls) },
      five: { label: '5星数', value: fiveCount, sub: pctSub(fiveCount, totalPulls) },
      notWai: { label: '不歪率', value: upRate != null ? `${upRate}%` : '-', sub: upRate != null ? `${upSixCount} UP` : '' }
    }

    let renderData = {
      mode,
      title: payload.title,
      subtitle: payload.poolLabel ? `卡池：${payload.poolLabel}` : undefined,
      pageWidth,
      pluResPath: pluResPath || undefined,
      pityPanel,
      summaryCards
    }
    if (mode === 'single' && payload.result) {
      const r = payload.result
      const charInfo = pickChar(r.rarity, r.is_up)
      renderData.result = {
        pull_number: r.pull_number,
        rarity: r.rarity,
        starLabel: r.rarity === 6 ? '★6' : r.rarity === 5 ? '★5' : '★4',
        tag: r.rarity === 6 && r.is_up ? 'UP' : r.rarity === 6 && !r.is_up ? '歪' : '',
        tagClass: r.rarity === 6 && r.is_up ? 'up' : r.rarity === 6 && !r.is_up ? 'wai' : '',
        pity_when_pulled: r.pity_when_pulled,
        cover: charInfo.cover || '',
        charName: charInfo.name || ''
      }
    } else if (mode === 'ten' && payload.results) {
      renderData.results = payload.results.map((r) => {
        const charInfo = pickChar(r.rarity, r.is_up)
        return {
          pull_number: r.pull_number,
          rarity: r.rarity,
          starLabel: r.rarity === 6 ? '★6' : r.rarity === 5 ? '★5' : '★4',
          tag: r.rarity === 6 && r.is_up ? 'UP' : r.rarity === 6 && !r.is_up ? '歪' : '',
          tagClass: r.rarity === 6 && r.is_up ? 'up' : r.rarity === 6 && !r.is_up ? 'wai' : '',
          cover: charInfo.cover || '',
          charName: charInfo.name || ''
        }
      })
      renderData.stats = payload.stats ? { star6Count: payload.star6Count, upCount: payload.upCount, total_pulls: payload.stats.total_pulls } : null
    } else {
      return null
    }
    try {
      const segment = await this.e.runtime.render('endfield-plugin', 'gacha/simulate-result', renderData, baseOpt)
      return segment || null
    } catch (e) {
      return null
    }
  }

  async simulateSingle(poolType) {
    if (await this.replyIfSimulateNotAllowed()) return true
    const poolLabel = SIMULATE.label(poolType) || poolType
    const scope = `user_${this.e.user_id}`
    if (!(await this.checkSimulateDailyLimit(scope, poolType))) {
      await this.reply(getMessage('gacha.simulate_daily_limit_reached'))
      return true
    }
    const prevState = await this.loadSimulateState(scope, poolType)
    const data = await hypergryphAPI.postGachaSimulateSingle(poolType, prevState)
    if (!data?.result) {
      await this.reply(getMessage('gacha.simulate_failed'))
      return true
    }
    await this.saveSimulateState(scope, poolType, data.state || null)
    await this.incrementSimulateDailyUsage(scope, poolType)
    const r = data.result
    const star = r.rarity === 6 ? '★6' : r.rarity === 5 ? '★5' : '★4'
    const tag = r.rarity === 6 && r.is_up ? ' UP' : r.rarity === 6 && !r.is_up ? ' 歪' : ''
    let msg = `【模拟单抽】${star}${tag}\n`
    if (r.rarity === 6 && r.pity_when_pulled != null) msg += `第 ${r.pull_number} 抽出货（垫了 ${r.pity_when_pulled} 抽）`
    else msg += `第 ${r.pull_number} 抽`
    const img = await this.renderSimulateResult('single', { title: '模拟单抽', result: r, poolType, poolLabel, state: data.state, stats: data.stats })
    await this.reply(img || msg)
    return true
  }

  async simulateTen(poolType) {
    if (await this.replyIfSimulateNotAllowed()) return true
    const poolLabel = SIMULATE.label(poolType) || poolType
    const scope = `user_${this.e.user_id}`
    if (!(await this.checkSimulateDailyLimit(scope, poolType))) {
      await this.reply(getMessage('gacha.simulate_daily_limit_reached'))
      return true
    }
    const prevState = await this.loadSimulateState(scope, poolType)
    const data = await hypergryphAPI.postGachaSimulateTen(poolType, prevState)
    if (!data?.results || !Array.isArray(data.results)) {
      await this.reply(getMessage('gacha.simulate_failed'))
      return true
    }
    await this.saveSimulateState(scope, poolType, data.state || null)
    await this.incrementSimulateDailyUsage(scope, poolType)
    let star6Count = 0
    let upCount = 0
    const lines = data.results.map((r) => {
      const star = r.rarity === 6 ? '★6' : r.rarity === 5 ? '★5' : '★4'
      const tag = r.rarity === 6 && r.is_up ? ' UP' : r.rarity === 6 && !r.is_up ? ' 歪' : ''
      if (r.rarity === 6) {
        star6Count += 1
        if (r.is_up) upCount += 1
      }
      return `第${r.pull_number}抽 ${star}${tag}`
    })
    let msg = '【模拟十连】\n' + lines.join('\n')
    if (data.stats) msg += `\n──────────────\n六星：${star6Count} | UP：${upCount} | 总抽数：${data.stats.total_pulls ?? '-'}`
    const img = await this.renderSimulateResult('ten', {
      title: '模拟十连',
      results: data.results,
      stats: data.stats,
      star6Count,
      upCount,
      poolType,
      poolLabel,
      state: data.state
    })
    await this.reply(img || msg)
    return true
  }

  async simulateHundred(poolType) {
    if (await this.replyIfSimulateNotAllowed()) return true
    const poolLabel = SIMULATE.label(poolType) || poolType
    const scope = `user_${this.e.user_id}`
    const cfg = this.getSimulateConfig()
    const limit = cfg.daily_limit[poolType] ?? 0
    if (limit > 0) {
      const usage = await this.getSimulateDailyUsage(scope, poolType)
      if (usage + 10 > limit) {
        await this.reply(getMessage('gacha.simulate_daily_limit_reached'))
        return true
      }
    }
    let prevState = await this.loadSimulateState(scope, poolType)
    const allResults = []
    let lastState = null
    for (let i = 0; i < 10; i++) {
      const data = await hypergryphAPI.postGachaSimulateTen(poolType, prevState)
      if (!data?.results || !Array.isArray(data.results)) {
        await this.reply(getMessage('gacha.simulate_failed'))
        return true
      }
      const base = i * 10
      for (const r of data.results) {
        allResults.push({ ...r, pull_number: base + (r.pull_number || 0) })
      }
      prevState = data.state || null
      lastState = prevState
    }
    await this.saveSimulateState(scope, poolType, lastState)
    for (let j = 0; j < 10; j++) await this.incrementSimulateDailyUsage(scope, poolType)

    let star6Count = 0
    let upCount = 0
    for (const r of allResults) {
      if (r.rarity === 6) {
        star6Count += 1
        if (r.is_up) upCount += 1
      }
    }
    const stats = {
      total_pulls: 100,
      six_star_count: star6Count,
      five_star_count: allResults.filter((r) => r.rarity === 5).length,
      up_six_star_count: upCount,
      up_rate: star6Count ? ((upCount / star6Count) * 100).toFixed(2) : null
    }
    const lines = allResults.map((r) => {
      const star = r.rarity === 6 ? '★6' : r.rarity === 5 ? '★5' : '★4'
      const tag = r.rarity === 6 && r.is_up ? ' UP' : r.rarity === 6 && !r.is_up ? ' 歪' : ''
      return `第${r.pull_number}抽 ${star}${tag}`
    })
    let msg = '【模拟百连】\n' + lines.join('\n') + `\n──────────────\n六星：${star6Count} | UP：${upCount} | 总抽数：100`
    const img = await this.renderSimulateResult('ten', {
      title: '模拟百连',
      results: allResults,
      stats: { ...stats, total_pulls: 100 },
      star6Count,
      upCount,
      poolType,
      poolLabel,
      state: lastState
    })
    await this.reply(img || msg)
    return true
  }

  async resetSimulateGacha() {
    if (await this.replyIfSimulateNotAllowed()) return true
    const scope = `user_${this.e.user_id}`
    if (redis) {
      try {
        const keys = await redis.keys(SIMULATE_KEYS.statePrefix + scope + ':*')
        if (keys?.length) for (const k of keys) await redis.del(k)
      } catch (err) {
        logger.error(`[终末地插件][模拟抽卡] 重置 state 失败: ${err?.message || err}`)
      }
    }
    await this.reply('已重置模拟抽卡状态（全部卡池），下次将从头开始。')
    return true
  }

  /** 管理员：重置所有用户的模拟抽卡状态 */
  async resetAllSimulateGacha() {
    if (!this.e?.isMaster) {
      await this.reply(getMessage('gacha.simulate_reset_all_no_auth'))
      return true
    }
    if (!redis) {
      await this.reply(getMessage('gacha.simulate_failed'))
      return true
    }
    try {
      const keys = await redis.keys(SIMULATE_KEYS.statePrefix + '*')
      if (keys?.length) {
        for (const k of keys) await redis.del(k)
      }
      await this.reply(getMessage('gacha.simulate_reset_all_ok', { count: keys?.length || 0 }))
    } catch (err) {
      logger.error(`[终末地插件][模拟抽卡] 重置全员 state 失败: ${err?.message || err}`)
      await this.reply(getMessage('gacha.simulate_failed'))
    }
    return true
  }
}
