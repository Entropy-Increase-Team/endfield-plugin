import { getMessage } from '../utils/common.js'
import hypergryphAPI from '../model/hypergryphApi.js'
import setting from '../utils/setting.js'
import common from '../../../lib/common/common.js'
import fs from 'node:fs'
import path from 'node:path'

const PLUGIN_ROOT = path.join(process.cwd(), 'plugins', 'endfield-plugin')
const ROLE_GACHA_TEMPLATE_SOURCE = path.join(PLUGIN_ROOT, 'resources', 'gacha', 'role', 'gacha_display.html')
const ROLE_GACHA_TEMPLATE_ADAPTER = path.join(process.cwd(), 'temp', 'endfield-plugin', 'gacha-role-adapter.html')
const ROLE_GACHA_ASSET_ROOT = `${PLUGIN_ROOT.replace(/\\/g, '/')}/resources/gacha/role/`
const ROLE_GACHA_CHARGACHA_DIR = path.join(PLUGIN_ROOT, 'resources', 'gacha', 'role', 'role', 'chargacha')
const ROLE_GACHA_FALLBACK_IDS = {
  6: ['chr_0025_ardelia', 'chr_0026_lastrite'],
  5: ['chr_0012_avywen', 'chr_0021_whiten'],
  4: ['chr_0023_antal', 'chr_0019_karin']
}

let roleNameToIdCache = null

/** 模拟抽卡 Redis 键 */
const SIMULATE_KEYS = {
  state: (scope, poolType) => `ENDFIELD:GACHA:SIMULATE:STATE:${scope}:${poolType}`,
  daily: (date, scope, poolType) => `ENDFIELD:GACHA:SIMULATE:DAILY:${date}:${scope}:${poolType}`,
  statePrefix: 'ENDFIELD:GACHA:SIMULATE:STATE:'
}

/** 模拟抽卡卡池：关键词→key，key→label */
const SIMULATE = (() => {
  const pools = [
    { key: 'limited', keywords: ['UP', '限定'], label: getMessage('gacha_simulate.pool_limited') },
    { key: 'standard', keywords: ['常驻'], label: getMessage('gacha_simulate.pool_standard') },
    { key: 'weapon', keywords: ['武器'], label: getMessage('gacha_simulate.pool_weapon') }
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

function hasRoleGachaAsset(id) {
  return !!id && fs.existsSync(path.join(ROLE_GACHA_CHARGACHA_DIR, `${id}.png`))
}

function getRoleNameToIdMap() {
  if (roleNameToIdCache) return roleNameToIdCache
  const operatorMap = setting.getData('operatorMap') || {}
  roleNameToIdCache = new Map()
  for (const [id, name] of Object.entries(operatorMap)) {
    if (hasRoleGachaAsset(id)) {
      roleNameToIdCache.set(String(name || '').trim(), id)
    }
  }
  return roleNameToIdCache
}

function resolveRoleGachaId(char = {}) {
  const idCandidates = [
    char.id,
    char.char_id,
    char.charId,
    char.template_id,
    char.templateId
  ].map(v => String(v || '').trim()).filter(Boolean)
  for (const id of idCandidates) {
    if (hasRoleGachaAsset(id)) return id
  }

  const nameCandidates = [
    char.name,
    char.char_name,
    char.charName
  ].map(v => String(v || '').trim()).filter(Boolean)
  const nameMap = getRoleNameToIdMap()
  for (const name of nameCandidates) {
    const id = nameMap.get(name)
    if (id) return id
  }
  return ''
}

function pickFallbackRoleGachaId(rarity) {
  const list = ROLE_GACHA_FALLBACK_IDS[Number(rarity)] || ROLE_GACHA_FALLBACK_IDS[4]
  return list[Math.floor(Math.random() * list.length)]
}

function ensureRoleGachaAdapterTemplate() {
  const source = fs.readFileSync(ROLE_GACHA_TEMPLATE_SOURCE, 'utf8')
  let html = source
    .replace(/const gachaResults = \[[\s\S]*?\];/, 'const gachaResults = {{@ gachaResultsJson }};')
    .replace('<script>', '<script>\n        const assetRoot = {{@ assetRootJson }};')
    .replace(/`role\/chargacha\/\$\{result\.id\}\.png`/g, '`${assetRoot}role/chargacha/${result.id}.png`')
    .replace(/`role\/gachashadow\/\$\{result\.id\}\.png`/g, '`${assetRoot}role/gachashadow/${result.id}.png`')
    .replace(/`role\/gachashadow\/\$\{result\.id\}_s\.png`/g, '`${assetRoot}role/gachashadow/${result.id}_s.png`')
    .replace(/starImg\.src = 'role\/star\.svg';/g, 'starImg.src = `${assetRoot}role/star.svg`;')
    .replace(/\s*<div class="top-right-btns">[\s\S]*?<\/div>\s*/, '\n')

  fs.mkdirSync(path.dirname(ROLE_GACHA_TEMPLATE_ADAPTER), { recursive: true })
  if (!fs.existsSync(ROLE_GACHA_TEMPLATE_ADAPTER) || fs.readFileSync(ROLE_GACHA_TEMPLATE_ADAPTER, 'utf8') !== html) {
    fs.writeFileSync(ROLE_GACHA_TEMPLATE_ADAPTER, html, 'utf8')
  }
  return ROLE_GACHA_TEMPLATE_ADAPTER
}

export class EndfieldGachaSimulate extends plugin {
  constructor() {
    super({
      name: '[endfield-plugin]模拟抽卡',
      dsc: '终末地模拟抽卡（十连/百连/单抽）',
      event: 'message',
      priority: 50,
      rule: [
        {
          reg: `^(?:[:：]|[/#](?:zmd|终末地))${SIMULATE_CMD_SUFFIX}`,
          fnc: 'simulateDispatch'
        },
        {
          reg: '^(?:[:：]|[/#](?:zmd|终末地))(重置抽卡|抽卡重置)$',
          fnc: 'resetSimulateGacha'
        },
        {
          reg: '^(?:[:：]|[/#](?:zmd|终末地))重置全员抽卡$',
          fnc: 'resetAllSimulateGacha',
          permission: 'master'
        }
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
    return char ? { cover: char.cover || '', name: char.name || '', id: resolveRoleGachaId(char) } : {}
  }

  buildRoleGachaResults(results = [], pickChar) {
    return (Array.isArray(results) ? results : []).slice(0, 10).map((r) => {
      const rarity = Math.max(4, Math.min(6, Number(r?.rarity) || 4))
      const charInfo = typeof pickChar === 'function' ? pickChar(rarity, r?.is_up) : {}
      return {
        id: charInfo?.id || pickFallbackRoleGachaId(rarity),
        star: rarity,
        isNew: !!(r?.is_new ?? r?.isNew)
      }
    })
  }

  async renderRoleGachaTenResult(payload, pickChar) {
    if (!this.e?.runtime?.puppeteer?.screenshot || payload.poolType === 'weapon') return null
    const roleResults = this.buildRoleGachaResults(payload.results, pickChar)
    if (roleResults.length !== 10) return null

    try {
      const tplFile = ensureRoleGachaAdapterTemplate()
      const img = await this.e.runtime.puppeteer.screenshot('endfield-plugin/gacha/role-result', {
        tplFile,
        saveId: `role-result-${this.e.user_id || '0'}-${Date.now()}-${payload.batchIndex || 1}`,
        gachaResultsJson: JSON.stringify(roleResults),
        assetRootJson: JSON.stringify(`${ROLE_GACHA_ASSET_ROOT}/`.replace(/\/+$/, '/')),
        scale: 1.4,
        imgType: 'png',
        viewport: { width: 1600, height: 900 },
        pageGotoParams: { timeout: 120000, waitUntil: 'networkidle2' }
      })
      return img || null
    } catch (e) {
      logger.error(`[终末地插件][模拟抽卡] role模板渲染失败: ${e?.message || e}`)
      return null
    }
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
    let poolCharsData = payload.poolCharsData || null
    if (!poolCharsData) {
      try {
        poolCharsData = await hypergryphAPI.getGachaPoolChars(poolType)
      } catch (e) {}
    }
    const pickChar = (rarity, isUp) => this.pickRandomCharFromPool(poolCharsData, poolType, rarity, isUp)

    if (mode === 'ten' && payload.results) {
      const roleImg = await this.renderRoleGachaTenResult(payload, pickChar)
      if (roleImg) return roleImg
    }

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
      six: mkPity(sixCur, sixMax, { probText: getMessage('gacha_simulate.pity_prob_text', { pct: (curProb * 100).toFixed(2) }) }),
      guaranteedUpText: state.is_guaranteed_up == null
        ? getMessage('gacha_simulate.guaranteed_up_off')
        : state.is_guaranteed_up
          ? getMessage('gacha_simulate.guaranteed_up_on')
          : getMessage('gacha_simulate.guaranteed_up_off'),
      hard: hasHard ? mkPity(hardCur, hardMax, { label: getMessage('gacha_simulate.hard_pity_label', { count: hardMax }) }) : null
    }

    const sixCount = n(state.six_star_count ?? stats.six_star_count ?? stats.six_star)
    const fiveCount = n(state.five_star_count ?? stats.five_star_count ?? stats.five_star)
    const upSixCount = n(state.up_six_star_count ?? stats.up_six_star_count)
    const upRate = sixCount > 0 ? ((upSixCount / sixCount) * 100).toFixed(2) : (stats.up_rate != null ? Number(stats.up_rate) : null)
    const pctSub = (part, total) => (total ? `${((part / total) * 100).toFixed(2)}%` : '')
    const summaryCards = {
      total: { label: getMessage('gacha_simulate.summary_total_label'), value: totalPulls ?? '-', sub: '' },
      six: { label: getMessage('gacha_simulate.summary_star6_label'), value: sixCount, sub: pctSub(sixCount, totalPulls) },
      five: { label: getMessage('gacha_simulate.summary_star5_label'), value: fiveCount, sub: pctSub(fiveCount, totalPulls) },
      notWai: { label: getMessage('gacha_simulate.summary_not_wai_label'), value: upRate != null ? `${upRate}%` : '-', sub: upRate != null ? `${upSixCount} ${getMessage('gacha_simulate.tag_up')}` : '' }
    }

    let renderData = {
      mode,
      title: payload.title,
      subtitle: payload.poolLabel ? getMessage('gacha_simulate.pool_subtitle', { pool: payload.poolLabel }) : undefined,
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
        starLabel: r.rarity === 6 ? getMessage('gacha_simulate.star_6') : r.rarity === 5 ? getMessage('gacha_simulate.star_5') : getMessage('gacha_simulate.star_4'),
        tag: r.rarity === 6 && r.is_up ? getMessage('gacha_simulate.tag_up') : r.rarity === 6 && !r.is_up ? getMessage('gacha_simulate.tag_off') : '',
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
          starLabel: r.rarity === 6 ? getMessage('gacha_simulate.star_6') : r.rarity === 5 ? getMessage('gacha_simulate.star_5') : getMessage('gacha_simulate.star_4'),
          tag: r.rarity === 6 && r.is_up ? getMessage('gacha_simulate.tag_up') : r.rarity === 6 && !r.is_up ? getMessage('gacha_simulate.tag_off') : '',
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
    const star = r.rarity === 6 ? getMessage('gacha_simulate.star_6') : r.rarity === 5 ? getMessage('gacha_simulate.star_5') : getMessage('gacha_simulate.star_4')
    const tag = r.rarity === 6 && r.is_up ? ` ${getMessage('gacha_simulate.tag_up')}` : r.rarity === 6 && !r.is_up ? ` ${getMessage('gacha_simulate.tag_off')}` : ''
    const title = getMessage('gacha_simulate.title_single')
    let msg = getMessage('gacha_simulate.msg_single_header', { title, star, tag }) + '\n'
    if (r.rarity === 6 && r.pity_when_pulled != null) msg += getMessage('gacha_simulate.msg_single_detail_pity', { pull: r.pull_number, pity: r.pity_when_pulled })
    else msg += getMessage('gacha_simulate.msg_single_detail', { pull: r.pull_number })
    const img = await this.renderSimulateResult('single', { title, result: r, poolType, poolLabel, state: data.state, stats: data.stats })
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
      const star = r.rarity === 6 ? getMessage('gacha_simulate.star_6') : r.rarity === 5 ? getMessage('gacha_simulate.star_5') : getMessage('gacha_simulate.star_4')
      const tag = r.rarity === 6 && r.is_up ? ` ${getMessage('gacha_simulate.tag_up')}` : r.rarity === 6 && !r.is_up ? ` ${getMessage('gacha_simulate.tag_off')}` : ''
      if (r.rarity === 6) {
        star6Count += 1
        if (r.is_up) upCount += 1
      }
      return getMessage('gacha_simulate.msg_line', { pull: r.pull_number, star, tag })
    })
    const title = getMessage('gacha_simulate.title_ten')
    let msg = getMessage('gacha_simulate.msg_list_header', { title }) + '\n' + lines.join('\n')
    if (data.stats) {
      msg += '\n' + getMessage('gacha_simulate.separator') + '\n' + getMessage('gacha_simulate.msg_summary', {
        star6: star6Count,
        up: upCount,
        total: data.stats.total_pulls ?? '-'
      })
    }
    const img = await this.renderSimulateResult('ten', {
      title,
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
    const batches = []
    let lastState = null
    for (let i = 0; i < 10; i++) {
      const data = await hypergryphAPI.postGachaSimulateTen(poolType, prevState)
      if (!data?.results || !Array.isArray(data.results)) {
        await this.reply(getMessage('gacha.simulate_failed'))
        return true
      }
      const base = i * 10
      const batchResults = []
      for (const r of data.results) {
        batchResults.push({ ...r, pull_number: base + (r.pull_number || 0) })
      }
      allResults.push(...batchResults)
      batches.push({ results: batchResults, state: data.state || null, stats: data.stats || null })
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
    const lines = allResults.map((r) => {
      const star = r.rarity === 6 ? getMessage('gacha_simulate.star_6') : r.rarity === 5 ? getMessage('gacha_simulate.star_5') : getMessage('gacha_simulate.star_4')
      const tag = r.rarity === 6 && r.is_up ? ` ${getMessage('gacha_simulate.tag_up')}` : r.rarity === 6 && !r.is_up ? ` ${getMessage('gacha_simulate.tag_off')}` : ''
      return getMessage('gacha_simulate.msg_line', { pull: r.pull_number, star, tag })
    })
    const title = getMessage('gacha_simulate.title_hundred')
    let msg = getMessage('gacha_simulate.msg_list_header', { title }) + '\n' + lines.join('\n')
    msg += '\n' + getMessage('gacha_simulate.separator') + '\n' + getMessage('gacha_simulate.msg_summary', {
      star6: star6Count,
      up: upCount,
      total: 100
    })
    const poolCharsData = (await hypergryphAPI.getGachaPoolChars(poolType).catch(() => null)) || { pools: [] }
    const forwardParts = []
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i]
      let batchStar6Count = 0
      let batchUpCount = 0
      for (const r of batch.results) {
        if (r.rarity === 6) {
          batchStar6Count += 1
          if (r.is_up) batchUpCount += 1
        }
      }
      const batchStats = batch.stats || {
        total_pulls: batch.results.length,
        six_star_count: batchStar6Count,
        five_star_count: batch.results.filter((r) => r.rarity === 5).length,
        up_six_star_count: batchUpCount,
        up_rate: batchStar6Count ? ((batchUpCount / batchStar6Count) * 100).toFixed(2) : null
      }
      const img = await this.renderSimulateResult('ten', {
        title: `${title} ${i + 1}/10`,
        results: batch.results,
        stats: batchStats,
        star6Count: batchStar6Count,
        upCount: batchUpCount,
        poolType,
        poolLabel,
        state: batch.state || lastState,
        batchIndex: i + 1,
        poolCharsData
      })
      if (img) {
        forwardParts.push([img])
      }
    }
    if (forwardParts.length > 0) {
      const forwardMsg = await common.makeForwardMsg(this.e, forwardParts, title)
      await this.e.reply(forwardMsg)
      return true
    }
    await this.reply(msg)
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
    await this.reply(getMessage('gacha_simulate.reset_ok'))
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
