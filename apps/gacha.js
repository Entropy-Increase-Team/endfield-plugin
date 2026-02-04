import { getUnbindMessage, getMessage, ruleReg } from '../utils/common.js'
import EndfieldUser from '../model/endfieldUser.js'
import { REDIS_KEY } from '../model/endfieldUser.js'
import hypergryphAPI from '../model/hypergryphApi.js'
import setting from '../utils/setting.js'
import common from '../../../lib/common/common.js'

const GACHA_PENDING_KEY = (userId) => `ENDFIELD:GACHA_PENDING:${userId}`
const GACHA_LAST_ANALYSIS_KEY = (userId) => `ENDFIELD:GACHA_LAST_ANALYSIS:${userId}`
/** 模拟抽卡：持久化 state，按作用域+卡池 */
const GACHA_SIMULATE_STATE_KEY = (scope, poolType) => `ENDFIELD:GACHA:SIMULATE:STATE:${scope}:${poolType}`
/** 模拟抽卡：当日用量，按日期+作用域+卡池，过期 2 天自动清理 */
const GACHA_SIMULATE_DAILY_KEY = (date, scope, poolType) => `ENDFIELD:GACHA:SIMULATE:DAILY:${date}:${scope}:${poolType}`
const GACHA_SIMULATE_STATE_PREFIX = 'ENDFIELD:GACHA:SIMULATE:STATE:'
const POLL_INTERVAL_MS = 1500
const POLL_TIMEOUT_MS = 120000
const HOURLY_SYNC_DELAY_MIN_MS = 5000
const HOURLY_SYNC_DELAY_MAX_MS = 10000

/** 卡池唯一配置：抽卡记录分类与全服统计共用；用户输入按 label 模糊匹配（含“常驻”“新手池”等） */
const GACHA_POOLS = [
  { key: 'standard', label: '常驻角色' },
  { key: 'beginner', label: '新手池' },
  { key: 'weapon', label: '武器池' },
  { key: 'limited', label: '限定角色' }
]
const GACHA_POOL_BY_INPUT = (str) => {
  if (!str || typeof str !== 'string') return null
  const s = str.trim()
  if (s.length < 2) return null
  const exact = GACHA_POOLS.find((p) => p.label === s)
  if (exact) return { key: exact.key, label: exact.label }
  const prefix = GACHA_POOLS.find((p) => p.label.startsWith(s) || s.startsWith(p.label))
  return prefix ? { key: prefix.key, label: prefix.label } : null
}

/** 模拟抽卡卡池：单一配置表，关键词→key（API）+ label（展示） */
const SIMULATE_POOLS = [
  { key: 'limited', keywords: ['UP', '限定'], label: 'UP池' },
  { key: 'standard', keywords: ['常驻'], label: '常驻池' },
  { key: 'weapon', keywords: ['武器'], label: '武器池' }
]
const SIMULATE_KEYWORD_TO_KEY = Object.fromEntries(
  SIMULATE_POOLS.flatMap((p) => p.keywords.map((k) => [k, p.key]))
)
const SIMULATE_POOL_LABEL = Object.fromEntries(SIMULATE_POOLS.map((p) => [p.key, p.label]))

/** 从消息中解析模拟抽卡卡池类型（cmdName 为 十连|单抽|百连），默认 limited */
function parseSimulatePoolType(msg, cmdName) {
  if (!msg || typeof msg !== 'string') return 'limited'
  const m = msg.trim().match(new RegExp(`${cmdName}\\s*[（(]?(常驻|UP|武器|限定)[）)]?`))
  return (m && SIMULATE_KEYWORD_TO_KEY[m[1]]) || 'limited'
}

// 模拟抽卡规则缓存（避免每次渲染都请求）
const SIMULATE_RULES_CACHE = new Map()

export class EndfieldGacha extends plugin {
  constructor() {
    super({
      name: '[endfield-plugin]抽卡记录',
      dsc: '终末地抽卡记录同步',
      event: 'message',
      priority: 50,
      task: {
        name: '[endfield-plugin]抽卡记录定时同步',
        cron: '0 * * * *',
        fnc: () => this.hourlySyncAllGacha(),
        log: true
      },
      rule: [
        ruleReg('(抽卡记录同步|同步抽卡记录)$', 'syncGacha'),
        ruleReg('抽卡记录(?:\\s*(.+))?$', 'viewGachaRecords'),
        ruleReg('抽卡分析$', 'viewGachaAnalysis'),
        ruleReg('全服抽卡统计$', 'globalGachaStats'),
        ruleReg('十连(?:\\s*[（(]?(常驻|UP|武器|限定)[）)]?)?$', 'simulateTen'),
        ruleReg('百连(?:\\s*[（(]?(常驻|UP|武器|限定)[）)]?)?$', 'simulateHundred'),
        ruleReg('单抽(?:\\s*[（(]?(常驻|UP|武器|限定)[）)]?)?$', 'simulateSingle'),
        ruleReg('(重置模拟抽卡|模拟抽卡重置)$', 'resetSimulateGacha'),
        ruleReg('\\d+$', 'receiveGachaSelect')
      ]
    })
  }

  /** 读取模拟抽卡持久化 state（Redis，按作用域+卡池），不存在则返回 null */
  async loadSimulateState(scope, poolType) {
    if (!redis) return null
    try {
      const raw = await redis.get(GACHA_SIMULATE_STATE_KEY(scope, poolType))
      if (!raw) return null
      const state = JSON.parse(raw)
      return state && typeof state === 'object' ? state : null
    } catch {
      return null
    }
  }

  /** 保存模拟抽卡持久化 state（Redis，按作用域+卡池） */
  async saveSimulateState(scope, poolType, nextState) {
    if (!redis) return
    try {
      const key = GACHA_SIMULATE_STATE_KEY(scope, poolType)
      if (nextState && typeof nextState === 'object') {
        await redis.set(key, JSON.stringify(nextState))
      } else {
        await redis.del(key)
      }
    } catch (err) {
      logger.error(`[终末地插件][模拟抽卡] 保存 state 失败: ${err?.message || err}`)
    }
  }

  /** 清空模拟抽卡持久化 state（按作用域+卡池） */
  async clearSimulateState(scope, poolType) {
    await this.saveSimulateState(scope, poolType, null)
  }

  /** 查看抽卡记录：支持分类（常驻/新手/武器/限定）与页码，如 :抽卡记录 常驻、:抽卡记录 限定 2；无参数时四个卡池第1页合并转发 */
  async viewGachaRecords() {
    const sklUser = new EndfieldUser(this.e.user_id)
    if (!(await sklUser.getUser())) {
      await this.reply(getUnbindMessage())
      return true
    }
    const argStr = (this.e.msg || '').replace(/.*抽卡记录\s*/, '').trim()
    const parts = argStr ? argStr.split(/\s+/).filter(Boolean) : []
    let page = 1
    let pool = null
    for (const p of parts) {
      const num = parseInt(p, 10)
      if (Number.isFinite(num) && String(num) === p) {
        page = num
        break
      }
      pool = GACHA_POOL_BY_INPUT(p)
      if (pool) break
    }
    if (parts.length >= 2 && pool && Number.isFinite(parseInt(parts[1], 10))) {
      page = parseInt(parts[1], 10)
    } else if (parts.length === 1 && Number.isFinite(parseInt(parts[0], 10))) {
      page = parseInt(parts[0], 10)
    }
    const limit = 15
    const prefix = this.getCmdPrefix()
    const pluResPath = this.e?.runtime?.path?.plugin?.['endfield-plugin']?.res || ''

    // 无参数且支持渲染：四个卡池各第1页，合并转发发送
    if (!argStr && this.e?.runtime?.render) {
      try {
        const statsData = await hypergryphAPI.getGachaStats(sklUser.framework_token)
        if (!statsData) {
          await this.reply(getMessage('gacha.no_records'))
          return true
        }
        const stats = statsData.stats || {}
        const userInfo = statsData.user_info || {}
        const pageWidth = 500
        const baseOpt = { scale: 1.6, retType: 'base64', viewport: { width: pageWidth, height: 880 } }
        const forwardMessages = []
        for (const { key, label } of GACHA_POOLS) {
          const recordsData = await hypergryphAPI.getGachaRecords(sklUser.framework_token, { page: 1, limit, pools: key })
          const records = recordsData?.records || []
          const total = recordsData?.total ?? 0
          const pages = recordsData?.pages ?? 1
          const recordList = records.map((r, i) => ({
            index: i + 1,
            star: r.rarity === 6 ? '★6' : r.rarity === 5 ? '★5' : '★4',
            starClass: r.rarity === 6 ? 'star6' : r.rarity === 5 ? 'star5' : 'star4',
            name: r.char_name || r.item_name || '未知',
            poolName: r.pool_name || ''
          }))
          const renderData = {
            pageWidth,
            title: '抽卡记录',
            subtitle: `${userInfo.nickname || userInfo.game_uid || '未知'} · ${userInfo.channel_name || ''}`,
            totalCount: stats.total_count ?? 0,
            star6: stats.star6_count ?? 0,
            star5: stats.star5_count ?? 0,
            star4: stats.star4_count ?? 0,
            poolLabel: label,
            page: 1,
            pages,
            recordList,
            hasRecords: total > 0,
            pageHint: pages > 1 ? `${prefix}抽卡记录 ${label} 2` : '',
            syncHint: getMessage('gacha.records_sync_hint'),
            pluResPath
          }
          const imgSegment = await this.e.runtime.render('endfield-plugin', 'gacha/gacha-record', renderData, baseOpt)
          if (imgSegment) forwardMessages.push([imgSegment])
        }
        if (forwardMessages.length > 0) {
          const forwardMsg = common.makeForwardMsg(this.e, forwardMessages, '抽卡记录 · 常驻/新手/武器/限定 第1页')
          await this.e.reply(forwardMsg)
          return true
        }
      } catch (err) {
        logger.error(`[终末地插件][抽卡记录]合并转发渲染失败: ${err?.message || err}`)
      }
    }

    const params = { page, limit }
    if (pool) params.pools = pool.key
    const statsData = await hypergryphAPI.getGachaStats(sklUser.framework_token)
    const recordsData = await hypergryphAPI.getGachaRecords(sklUser.framework_token, params)
    if (!statsData && !recordsData) {
      await this.reply(getMessage('gacha.no_records'))
      return true
    }
    const stats = statsData?.stats || recordsData?.stats || {}
    const records = recordsData?.records || []
    const total = recordsData?.total ?? 0
    const pages = recordsData?.pages ?? 1
    const userInfo = statsData?.user_info || recordsData?.user_info || {}
    const poolLabel = pool ? pool.label : ''

    // 抽卡记录模板渲染（gacha-record）
    if (this.e?.runtime?.render) {
      try {
        const pageWidth = 500
        const baseOpt = { scale: 1.6, retType: 'base64', viewport: { width: pageWidth, height: 880 } }
        const recordList = records.map((r, i) => ({
          index: (page - 1) * limit + i + 1,
          star: r.rarity === 6 ? '★6' : r.rarity === 5 ? '★5' : '★4',
          starClass: r.rarity === 6 ? 'star6' : r.rarity === 5 ? 'star5' : 'star4',
          name: r.char_name || r.item_name || '未知',
          poolName: r.pool_name || ''
        }))
        const renderData = {
          pageWidth,
          title: '抽卡记录',
          subtitle: `${userInfo.nickname || userInfo.game_uid || '未知'} · ${userInfo.channel_name || ''}`,
          totalCount: stats.total_count ?? 0,
          star6: stats.star6_count ?? 0,
          star5: stats.star5_count ?? 0,
          star4: stats.star4_count ?? 0,
          poolLabel,
          page,
          pages,
          recordList,
          hasRecords: total > 0,
          pageHint: pages > 1
            ? (poolLabel ? `${prefix}抽卡记录 ${poolLabel} 2` : `${prefix}抽卡记录 2`)
            : '',
          syncHint: getMessage('gacha.records_sync_hint'),
          pluResPath
        }
        const imgSegment = await this.e.runtime.render('endfield-plugin', 'gacha/gacha-record', renderData, baseOpt)
        if (imgSegment) {
          await this.reply(imgSegment)
          return true
        }
      } catch (err) {
        logger.error(`[终末地插件][抽卡记录]渲染图失败: ${err?.message || err}`)
      }
    }

    let msg = '【抽卡记录】\n'
    msg += `角色：${userInfo.nickname || userInfo.game_uid || '未知'} | ${userInfo.channel_name || ''}\n`
    msg += `总抽数：${stats.total_count ?? 0} | 六星：${stats.star6_count ?? 0} | 五星：${stats.star5_count ?? 0} | 四星：${stats.star4_count ?? 0}\n`
    if (total > 0) {
      const subTitle = poolLabel ? ` · ${poolLabel}` : ''
      msg += `\n最近记录${subTitle}（第 ${page}/${pages} 页）：\n`
      records.forEach((r, i) => {
        const star = (r.rarity === 6 ? '★6' : r.rarity === 5 ? '★5' : '★4') || ''
        const name = r.char_name || r.item_name || '未知'
        const pool = r.pool_name ? ` [${r.pool_name}]` : ''
        msg += `${(page - 1) * limit + i + 1}. ${star} ${name}${pool}\n`
      })
      if (pages > 1) {
        const pageHint = poolLabel ? `${prefix}抽卡记录 ${poolLabel} 2` : `${prefix}抽卡记录 2`
        msg += `\n查看其他页：${pageHint}`
      }
    } else {
      msg += `\n${getMessage('gacha.no_records')}`
    }
    await this.reply(msg)
    return true
  }

  /** 抽卡分析：首次/无数据时自动同步并出图；已有数据时仅出图不自动同步 */
  async viewGachaAnalysis() {
    const sklUser = new EndfieldUser(this.e.user_id)
    if (!(await sklUser.getUser())) {
      await this.reply(getUnbindMessage())
      return true
    }
    const statsData = await hypergryphAPI.getGachaStats(sklUser.framework_token)
    if (!statsData) {
      await this.reply(getMessage('gacha.analysis_auto_sync_hint'))
      return await this.syncGacha({ afterSyncSendAnalysis: true, fromAnalysis: true })
    }
    const poolStats = statsData.pool_stats || {}
    const getPool = (charKey, shortKey) => poolStats[charKey] || poolStats[shortKey] || {}
    const limited = getPool('limited_char', 'limited')
    const weapon = getPool('weapon', 'weapon')
    const standard = getPool('standard_char', 'standard')
    const beginner = getPool('beginner_char', 'beginner')
    const totals = [
      limited.total ?? 0,
      weapon.total ?? 0,
      standard.total ?? 0,
      beginner.total ?? 0
    ]
    const allZero = totals.every((t) => (Number(t) || 0) === 0)
    if (allZero) {
      await this.reply(getMessage('gacha.analysis_auto_sync_hint'))
      return await this.syncGacha({ afterSyncSendAnalysis: true, fromAnalysis: true })
    }
    return await this.renderGachaAnalysisAndReply(statsData)
  }

  /** 根据 statsData 拉取 note/wiki/records 并制图或文字回复（抽卡分析用；同步完成后也会调用） */
  async renderGachaAnalysisAndReply(statsData) {
    const sklUser = new EndfieldUser(this.e.user_id)
    if (!(await sklUser.getUser())) {
      await this.reply(getUnbindMessage())
      return true
    }
    const poolStats = statsData.pool_stats || {}
    const userInfo = statsData.user_info || {}
    const getPool = (charKey, shortKey) => poolStats[charKey] || poolStats[shortKey] || {}
    const fmtCost = (total, star6) => {
      if (star6 == null || star6 <= 0) return '-'
      const t = Number(total) || 0
      return t > 0 ? Math.round(t / star6) + '抽' : '-'
    }

    // note 干员：id/name -> avatarSqUrl；同时取 base 用于用户头像与昵称
    let noteCharMap = {}
    let userAvatar = ''
    let userNickname = userInfo.nickname || userInfo.game_uid || '未知'
    try {
      const noteRes = await sklUser.sklReq.getData('note')
      const base = noteRes?.data?.base || {}
      userAvatar = base.avatarUrl || ''
      if (base.name) userNickname = base.name
      const chars = noteRes?.data?.chars || []
      for (const c of chars) {
        const id = c.id || c.char_id || ''
        const name = (c.name || '').trim()
        const url = c.avatarSqUrl || ''
        if (url) {
          if (id) noteCharMap[id] = { name: name || id, url }
          if (name) noteCharMap[name] = { name, url }
        }
      }
    } catch (e) {
      logger.error(`[终末地插件][抽卡分析]获取 note 失败: ${e?.message || e}`)
    }
    const userUid = userInfo.game_uid || ''

    // wiki 武器：name -> cover，用于武器池
    let weaponCoverMap = {}
    try {
      const wikiRes = await sklUser.sklReq.getWikiData('wiki_items', { main_type_id: '1', sub_type_id: '2', page: 1, page_size: 100 })
      const items = wikiRes?.data?.items || []
      for (const it of items) {
        const name = (it.brief?.name || it.name || '').trim()
        const cover = it.brief?.cover || it.cover || ''
        if (name && cover) weaponCoverMap[name] = cover
      }
    } catch (e) {
      logger.error(`[终末地插件][抽卡分析]获取 wiki 武器图失败: ${e?.message || e}`)
    }

    // 限定池/武器池 UP：从全服统计 current_pool 取 UP 角色（up_char_id/up_char_name），武器 UP 若有则取；兼容 snake_case / camelCase
    let upCharId = ''
    let upCharName = ''
    let upWeaponName = ''
    try {
      const globalData = await hypergryphAPI.getGachaGlobalStats()
      const stats = globalData?.stats || globalData
      const currentPool = stats?.current_pool || globalData?.current_pool
      if (currentPool) {
        upCharId = String(currentPool.up_char_id ?? currentPool.upCharId ?? '').trim()
        upCharName = String(currentPool.up_char_name ?? currentPool.upCharName ?? '').trim()
        upWeaponName = String(currentPool.up_weapon_name ?? currentPool.upWeaponName ?? '').trim()
      }
      // 若 current_pool 无 UP 角色，从限定池出货排名首位兜底（通常为当期 UP）
      if ((!upCharId && !upCharName) && stats?.ranking?.limited?.six_star?.length) {
        const first = stats.ranking.limited.six_star[0]
        if (first) {
          upCharId = String(first.char_id ?? '').trim()
          upCharName = String(first.char_name ?? '').trim()
        }
      }
    } catch (e) {
      logger.error(`[终末地插件][抽卡分析]获取 current_pool 失败: ${e?.message || e}`)
    }

    /** 根据一组记录构建六星/五星图、垫抽数、指标（角色池/武器池按 pool_name 分组后复用）；isFreePool 时为免费池，会插入「未出」段行 */
    const buildPoolEntry = (records, opts) => {
      const { isChar, isLimited, noWaiTag, metric2Label, metric2Default, isFreePool } = opts
      const images = []
      const images5 = []
      const poolName = records.length > 0 ? (records[0].pool_name || '').trim() || '未知' : '未知'
      // 熔火灼痕等名称视为限定 UP 池（防止 pool_id 未含 'limited' 时漏判）
      const isLimitedPool = isLimited || (poolName && /熔火|灼痕|限定/.test(poolName))
      const sixStarRecords = records.filter((r) => r.rarity === 6)
      const total = records.length
      const star6 = sixStarRecords.length
      let metric2 = metric2Default !== undefined ? (metric2Default ?? star6) : star6
      if (isLimitedPool && sixStarRecords.length > 0 && (upCharId || upCharName)) {
        const upCount = sixStarRecords.filter((r) => {
          const cid = String(r.char_id || '').trim()
          const cname = String(r.char_name || r.item_name || '').trim()
          return (upCharId && cid === upCharId) || (upCharName && cname === upCharName)
        }).length
        metric2 = `${((upCount / sixStarRecords.length) * 100).toFixed(1)}%`
      }
      const sorted = [...records].sort((a, b) => String(a.seq_id || '').localeCompare(String(b.seq_id || ''), undefined, { numeric: true }))
      let pullsSinceLast6 = 0
      let lastWasWai = false
      const isWeapon = !isChar
      for (const r of sorted) {
        pullsSinceLast6 += 1
        if (r.rarity === 6) {
          const id = r.char_id || ''
          const name = (r.char_name || r.item_name || '').trim() || id
          const pullCount = pullsSinceLast6
          let tag = ''
          let badgeColor = 'normal'
          // 角色 UP 池：用 current_pool 的 up_char_id/up_char_name 判断，不匹配则显示歪（限定池用 isLimitedPool）
          if (isLimitedPool && !noWaiTag && (upCharId || upCharName)) {
            const charId = String(r.char_id ?? r.item_id ?? '').trim()
            const charName = String(r.char_name ?? r.item_name ?? '').trim()
            const idMatch = upCharId && charId && String(charId) === String(upCharId)
            const nameMatch = upCharName && charName && String(charName) === String(upCharName)
            const isUp = idMatch || nameMatch
            if (!isUp) {
              tag = '歪'
              badgeColor = 'wai'
              lastWasWai = true
            } else {
              tag = 'UP'
              badgeColor = 'up'
              lastWasWai = false
            }
            // 仅大保底区间（81~120 抽）显示「保底」
            if (pullCount >= 81 && pullCount <= 120) {
              tag = '保底'
              badgeColor = 'baodi'
            }
          } else if (isWeapon && (upWeaponName || !noWaiTag)) {
            const isUp = upWeaponName && String(name).trim() === upWeaponName
            if (lastWasWai && pullCount <= 40) {
              tag = '保底'
              badgeColor = 'baodi'
            } else if (pullCount <= 40 && upWeaponName && !isUp) {
              tag = '歪'
              badgeColor = 'wai'
              lastWasWai = true
            } else if (pullCount <= 40 && isUp) {
              tag = 'UP'
              badgeColor = 'up'
              lastWasWai = false
            } else {
              lastWasWai = false
            }
          } else {
            lastWasWai = false
          }
          // 角色限定 120，角色常驻/新手 80，武器池 40
          const maxPity = isLimited ? 120 : (isWeapon ? 40 : 80)
          const barPercent = Math.min(100, Math.round((pullCount / maxPity) * 100))
          // 进度条分级颜色：角色池 0~80、武器池 0~40，绿(0-50%)-黄(50-80%)-红(80-100%)
          const colorScale = isWeapon ? 40 : 80
          const colorPercent = Math.min(100, (pullCount / colorScale) * 100)
          const barColorLevel = colorPercent < 50 ? 'green' : colorPercent < 80 ? 'yellow' : 'red'
          // 背景参考线：角色 UP 池 80 抽处（小保底），武器池 40 抽处（100%，保底线）
          const refLinePercent = isLimited ? (80 / 120) * 100 : (isWeapon ? 100 : null)
          // 免费池：在每发出六星前，先插入一段「未出」的免费抽数行
          if (isFreePool && pullsSinceLast6 > 1) {
            const segmentPulls = pullsSinceLast6 - 1
            const freeMaxPity = isChar ? 80 : 40
            const freeColorPct = Math.min(100, (segmentPulls / freeMaxPity) * 100)
            const freeBarLevel = freeColorPct < 50 ? 'green' : freeColorPct < 80 ? 'yellow' : 'red'
            images.push({
              name: '免费未出',
              url: '',
              pullCount: segmentPulls,
              tag: '',
              badgeColor: 'normal',
              barPercent: Math.min(100, Math.round((segmentPulls / freeMaxPity) * 100)),
              barColorLevel: freeBarLevel,
              refLinePercent: null,
              isFreeRow: true
            })
          }
          if (isChar) {
            const info = noteCharMap[id] || noteCharMap[name]
            if (info) images.push({ name: info.name, url: info.url, pullCount, tag, badgeColor, barPercent, barColorLevel, refLinePercent })
          } else {
            const cover = weaponCoverMap[name]
            if (cover) images.push({ name, url: cover, pullCount, tag, badgeColor, barPercent, barColorLevel, refLinePercent })
          }
          pullsSinceLast6 = 0
          if (images.length >= 6) break
        }
      }
      let pitySinceLast6 = null
      const last6Idx = sorted.map((r, i) => (r.rarity === 6 ? i : -1)).filter((i) => i >= 0).pop()
      if (last6Idx != null) {
        pitySinceLast6 = sorted.length - last6Idx - 1
      } else {
        pitySinceLast6 = sorted.length
      }
      for (const r of sorted) {
        if (r.rarity !== 5) continue
        const id = r.char_id || ''
        const name = (r.char_name || r.item_name || '').trim() || id
        if (isChar) {
          const info = noteCharMap[id] || noteCharMap[name]
          if (info) images5.push({ name: info.name, url: info.url })
        } else {
          const cover = weaponCoverMap[name]
          if (cover) images5.push({ name, url: cover })
        }
        if (images5.length >= 12) break
      }
      // 免费池：最后一段未垫的免费抽也插入一行
      if (isFreePool && pitySinceLast6 > 0 && images.length > 0) {
        const freeMaxPity = isChar ? 80 : 40
        images.push({
          name: '免费未垫',
          url: '',
          pullCount: pitySinceLast6,
          tag: '',
          badgeColor: 'normal',
          barPercent: Math.min(100, Math.round((pitySinceLast6 / freeMaxPity) * 100)),
          refLinePercent: null,
          isFreeRow: true
        })
      }
      // 二级池子内六星记录倒序：刚出的显示在最顶上
      images.reverse()
      return { poolName, total, star6, metric2, images, images5, pitySinceLast6 }
    }

    // 角色池：限定+常驻+新手合并，按 pool_name 分开展示（熔火灼痕、基础寻访、启程寻访等）
    const charPoolKeys = ['limited', 'standard', 'beginner']
    let charRecords = []
    try {
      const charResults = await Promise.all(
        charPoolKeys.map((key) => hypergryphAPI.getGachaRecordsAllPages(sklUser.framework_token, { pools: key, limit: 500 }))
      )
      for (const res of charResults) {
        if (res?.records?.length) charRecords = charRecords.concat(res.records)
      }
    } catch (e) {
      logger.error(`[终末地插件][抽卡分析]获取角色池记录失败: ${e?.message || e}`)
    }
    const charByPoolName = {}
    const charFreeRecords = []
    for (const r of charRecords) {
      if (r.is_free === true) {
        charFreeRecords.push(r)
        continue
      }
      const name = (r.pool_name || '').trim() || '未知'
      if (!charByPoolName[name]) charByPoolName[name] = []
      charByPoolName[name].push(r)
    }
    const charPoolEntries = []
    const charPoolNames = Object.keys(charByPoolName).sort()
    for (const subPoolName of charPoolNames) {
      const groupRecords = charByPoolName[subPoolName]
      const firstPoolId = (groupRecords[0]?.pool_id || '').toLowerCase()
      const isLimited = firstPoolId.includes('limited')
      const noWaiTag = firstPoolId.includes('standard') || firstPoolId.includes('beginner')
      const metric1Label = isLimited ? '平均UP花费' : '每红花费'
      const metric2Label = isLimited ? '不歪概率' : '出红数'
      const metric2Default = isLimited ? '-' : null
      const entry = buildPoolEntry(groupRecords, {
        isChar: true,
        isLimited,
        noWaiTag,
        metric2Label,
        metric2Default
      })
      const pityPct80 = entry.pitySinceLast6 != null ? Math.min(100, (entry.pitySinceLast6 / 80) * 100) : 0
      const pityBarColorLevel = pityPct80 < 50 ? 'green' : pityPct80 < 80 ? 'yellow' : 'red'
      charPoolEntries.push({
        poolName: entry.poolName,
        total: entry.total,
        star6: entry.star6,
        metric1: fmtCost(entry.total, entry.star6),
        metric1Label,
        metric2: entry.metric2,
        metric2Label,
        images: entry.images,
        images5: entry.images5,
        pitySinceLast6: entry.pitySinceLast6,
        pityBarPercent: entry.pitySinceLast6 != null ? Math.min(100, Math.round((entry.pitySinceLast6 / 80) * 100)) : 0,
        pityBarColorLevel
      })
    }
    // 角色池倒序：熔火、启程、基础
    charPoolEntries.reverse()
    // 只有限定池（UP 池）有免费，本期为熔火；免费行插在熔火最下面、基础寻访上面（即倒序后第一个池子后面）
    if (charFreeRecords.length > 0) {
      const freeEntry = buildPoolEntry(charFreeRecords, {
        isChar: true,
        isLimited: false,
        noWaiTag: true,
        isFreePool: true,
        metric2Label: '出红数',
        metric2Default: null
      })
      if (freeEntry.images.length === 0 && (freeEntry.pitySinceLast6 > 0 || freeEntry.total > 0)) {
        const pulls = freeEntry.pitySinceLast6 > 0 ? freeEntry.pitySinceLast6 : freeEntry.total
        freeEntry.images.push({
          name: '免费十连',
          url: '',
          pullCount: pulls,
          tag: '免费十连',
          badgeColor: 'normal',
          barPercent: Math.min(100, Math.round((pulls / 80) * 100)),
          refLinePercent: null,
          isFreeRow: true
        })
      }
      freeEntry.images.forEach(im => { im.isFreeRow = true })
      const freeEntryObj = {
        poolName: '免费',
        total: freeEntry.total,
        star6: freeEntry.star6,
        metric1: fmtCost(freeEntry.total, freeEntry.star6),
        metric1Label: '每红花费',
        metric2: freeEntry.metric2,
        metric2Label: freeEntry.metric2Label,
        images: freeEntry.images,
        images5: freeEntry.images5,
        pitySinceLast6: freeEntry.pitySinceLast6,
        pityBarPercent: freeEntry.pitySinceLast6 != null ? Math.min(100, Math.round((freeEntry.pitySinceLast6 / 80) * 100)) : 0,
        pityBarColorLevel: (() => { const p = freeEntry.pitySinceLast6 != null ? Math.min(100, (freeEntry.pitySinceLast6 / 80) * 100) : 0; return p < 50 ? 'green' : p < 80 ? 'yellow' : 'red' })()
      }
      charPoolEntries.splice(1, 0, freeEntryObj)
    }

    // 武器池：按 pool_name 分开展示（星声申领、熔铸申领等）
    let weaponRecords = []
    try {
      const weaponRes = await hypergryphAPI.getGachaRecordsAllPages(sklUser.framework_token, { pools: 'weapon', limit: 500 })
      weaponRecords = weaponRes?.records || []
    } catch (e) {
      logger.error(`[终末地插件][抽卡分析]获取武器池记录失败: ${e?.message || e}`)
    }
    const weaponByPoolName = {}
    const weaponFreeByPoolName = {}
    for (const r of weaponRecords) {
      const name = (r.pool_name || '').trim() || '未知'
      if (r.is_free === true) {
        if (!weaponFreeByPoolName[name]) weaponFreeByPoolName[name] = []
        weaponFreeByPoolName[name].push(r)
        continue
      }
      if (!weaponByPoolName[name]) weaponByPoolName[name] = []
      weaponByPoolName[name].push(r)
    }
    const weaponPoolEntries = []
    const weaponMaxPity = 40
    const weaponPoolNames = Object.keys(weaponByPoolName).sort()
    for (const subPoolName of weaponPoolNames) {
      const groupRecords = weaponByPoolName[subPoolName]
      const entry = buildPoolEntry(groupRecords, {
        isChar: false,
        isLimited: false,
        noWaiTag: false,
        metric2Label: '出红数',
        metric2Default: null
      })
      // 武器池保底范围 0~40，垫抽进度条按 40 计算；分级颜色同 0~40
      const wpityPct = entry.pitySinceLast6 != null ? Math.min(100, (entry.pitySinceLast6 / weaponMaxPity) * 100) : 0
      const wpityBarColorLevel = wpityPct < 50 ? 'green' : wpityPct < 80 ? 'yellow' : 'red'
      weaponPoolEntries.push({
        poolName: entry.poolName,
        total: entry.total,
        star6: entry.star6,
        metric1: fmtCost(entry.total, entry.star6),
        metric1Label: '每红花费',
        metric2: entry.metric2,
        metric2Label: '出红数',
        images: entry.images,
        images5: entry.images5,
        pitySinceLast6: entry.pitySinceLast6,
        pityBarPercent: entry.pitySinceLast6 != null ? Math.min(100, Math.round((entry.pitySinceLast6 / weaponMaxPity) * 100)) : 0,
        pityBarColorLevel: wpityBarColorLevel
      })
      // 该池子下的免费记录紧跟在该池子后显示（免费与同池子绑定）
      const freeRecords = weaponFreeByPoolName[subPoolName]
      if (freeRecords?.length > 0) {
        const freeEntry = buildPoolEntry(freeRecords, {
          isChar: false,
          isLimited: false,
          noWaiTag: false,
          isFreePool: true,
          metric2Label: '出红数',
          metric2Default: null
        })
        if (freeEntry.images.length === 0 && (freeEntry.pitySinceLast6 > 0 || freeEntry.total > 0)) {
          const pulls = freeEntry.pitySinceLast6 > 0 ? freeEntry.pitySinceLast6 : freeEntry.total
          const fpct = Math.min(100, (pulls / weaponMaxPity) * 100)
          freeEntry.images.push({
            name: '免费十连',
            url: '',
            pullCount: pulls,
            tag: '免费十连',
            badgeColor: 'normal',
            barPercent: Math.min(100, Math.round(fpct)),
            barColorLevel: fpct < 50 ? 'green' : fpct < 80 ? 'yellow' : 'red',
            refLinePercent: null,
            isFreeRow: true
          })
        }
        freeEntry.images.forEach(im => { im.isFreeRow = true })
        const wfreePityPct = freeEntry.pitySinceLast6 != null ? Math.min(100, (freeEntry.pitySinceLast6 / weaponMaxPity) * 100) : 0
        weaponPoolEntries.push({
          poolName: '免费',
          total: freeEntry.total,
          star6: freeEntry.star6,
          metric1: fmtCost(freeEntry.total, freeEntry.star6),
          metric1Label: '每红花费',
          metric2: freeEntry.metric2,
          metric2Label: '出红数',
          images: freeEntry.images,
          images5: freeEntry.images5,
          pitySinceLast6: freeEntry.pitySinceLast6,
          pityBarPercent: freeEntry.pitySinceLast6 != null ? Math.min(100, Math.round((freeEntry.pitySinceLast6 / weaponMaxPity) * 100)) : 0,
          pityBarColorLevel: wfreePityPct < 50 ? 'green' : wfreePityPct < 80 ? 'yellow' : 'red'
        })
      }
    }
    // 武器池倒序：熔铸、星声 等（每池自带的免费行保持紧跟该池）
    weaponPoolEntries.reverse()

    const poolGroups = [
      { label: '角色池', pools: charPoolEntries },
      { label: '武器池', pools: weaponPoolEntries }
    ]

    // 顶部显示时间（替代「按池统计」）
    const now = new Date()
    const analysisTime =
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ` +
      `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

    const prefix = this.getCmdPrefix()
    const pluResPath = this.e?.runtime?.path?.plugin?.['endfield-plugin']?.res || ''

    if (this.e?.runtime?.render) {
      try {
        const pageWidth = 520
        const baseOpt = { scale: 1.6, retType: 'base64', viewport: { width: pageWidth, height: 900 } }
        const renderData = {
          pageWidth,
          title: '抽卡分析',
          subtitle: `${userNickname} · ${userInfo.channel_name || ''}`,
          userAvatar,
          userNickname,
          userUid,
          analysisTime,
          poolGroups,
          recordHint: `${prefix}抽卡记录`,
          pluResPath
        }
        const imgSegment = await this.e.runtime.render('endfield-plugin', 'gacha/gacha-analysis', renderData, baseOpt)
        if (imgSegment) {
          await this.reply(imgSegment)
          await redis.set(GACHA_LAST_ANALYSIS_KEY(this.e.user_id), String(Date.now()), { EX: 900 })
          return true
        }
      } catch (err) {
        logger.error(`[终末地插件][抽卡分析]渲染图失败: ${err?.message || err}`)
      }
    }

    let msg = '【抽卡分析】\n'
    msg += `角色：${userInfo.nickname || userInfo.game_uid || '未知'} · ${userInfo.channel_name || ''}\n`
    for (const group of poolGroups) {
      for (const p of group.pools) {
        msg += `${group.label} · ${p.poolName}：${p.total} 抽 | ${p.metric1Label} ${p.metric1} | ${p.metric2Label} ${p.metric2}\n`
      }
    }
    msg += `查看最近记录：${prefix}抽卡记录`
    await this.reply(msg)
    await redis.set(GACHA_LAST_ANALYSIS_KEY(this.e.user_id), String(Date.now()), { EX: 900 })
    return true
  }

  /** 同步完成后调用：拉取最新 stats 并制图发送抽卡分析 */
  async renderAndSendGachaAnalysis() {
    const sklUser = new EndfieldUser(this.e.user_id)
    if (!(await sklUser.getUser())) return
    const statsData = await hypergryphAPI.getGachaStats(sklUser.framework_token)
    if (!statsData) return
    await this.renderGachaAnalysisAndReply(statsData)
  }

  getCmdPrefix() {
    const commonConfig = setting.getConfig('common') || {}
    const mode = Number(commonConfig.prefix_mode) || 1
    return mode === 1 ? `#${commonConfig.keywords?.[0] || 'zmd'}` : ':'
  }

  /** 将后端返回的 {qqname}、{qq号} 替换为当前用户昵称与 QQ 号，用于控制台日志 */
  formatProgressMsg(msg, userId, qqName) {
    if (!msg || typeof msg !== 'string') return msg
    const uid = userId != null ? String(userId) : ''
    const name = qqName != null && qqName !== '' ? String(qqName) : uid || '用户'
    return msg.replace(/\{qq号\}/g, uid).replace(/\{qqname\}/g, name)
  }

  /** 全服抽卡统计：4 张图合并转发，失败则回退文字 */
  async globalGachaStats() {
    const data = await hypergryphAPI.getGachaGlobalStats()
    if (!data?.stats) {
      await this.reply(getMessage('gacha.global_stats_failed'))
      return true
    }
    const s = data.stats
    const totalPulls = s.total_pulls ?? 0
    const totalUsers = s.total_users ?? 0
    const star6 = s.star6_total ?? 0
    const star5 = s.star5_total ?? 0
    const star4 = s.star4_total ?? 0
    const avgPity = s.avg_pity != null ? Number(s.avg_pity).toFixed(2) : '-'
    const pool = s.current_pool
    const upName = pool?.up_char_name || '-'
    const upCharId = pool?.up_char_id || ''
    const byChannel = s.by_channel
    const officialRaw = byChannel?.official
    const bilibiliRaw = byChannel?.bilibili
    const fmt = (v) => (v != null ? Number(v).toFixed(2) : '-')
    // 格式化标题副标题时间：缓存显示「缓存约5分钟」，否则将 ISO 时间格式化为 YYYY-MM-DD HH:mm
    const formatSyncTime = (cached, lastUpdate) => {
      if (cached === true) return '缓存约5分钟'
      if (!lastUpdate) return '刚刚'
      try {
        const d = new Date(lastUpdate)
        if (Number.isNaN(d.getTime())) return String(lastUpdate)
        const y = d.getFullYear()
        const m = String(d.getMonth() + 1).padStart(2, '0')
        const day = String(d.getDate()).padStart(2, '0')
        const h = String(d.getHours()).padStart(2, '0')
        const min = String(d.getMinutes()).padStart(2, '0')
        return `${y}-${m}-${day} ${h}:${min}`
      } catch {
        return String(lastUpdate)
      }
    }
    const syncTime = formatSyncTime(data.cached, data.last_update)
    const byType = s.by_type || {}
    const official = officialRaw ? {
      total_users: officialRaw.total_users ?? 0,
      total_pulls: officialRaw.total_pulls ?? 0,
      star6_total: officialRaw.star6_total ?? 0,
      avg_pity: fmt(officialRaw.avg_pity)
    } : null
    const bilibili = bilibiliRaw ? {
      total_users: bilibiliRaw.total_users ?? 0,
      total_pulls: bilibiliRaw.total_pulls ?? 0,
      star6_total: bilibiliRaw.star6_total ?? 0,
      avg_pity: fmt(bilibiliRaw.avg_pity)
    } : null
    const rankingLimited = s.ranking?.limited?.six_star || []
    const upEntry = rankingLimited.find((r) => r.char_id === upCharId) ?? rankingLimited.find((r) => r.char_name === upName)
    const upWinRatePercent = (upEntry?.percent != null ? Number(upEntry.percent).toFixed(1) : '--.-')
    const upWinRateNum = (upEntry?.percent != null ? Math.min(100, Math.max(0, Number(upEntry.percent))) : 0)

    const buildDistributionList = (distRaw) => {
      const list = distRaw || []
      const maxC = Math.max(...list.map((d) => d.count ?? 0), 1)
      return list.map((d) => ({
        range: d.range || '-',
        count: d.count ?? 0,
        height: Math.min(100, Math.max(8, ((d.count ?? 0) / maxC) * 100))
      }))
    }

    const buildRankingList = (sixStar, isLimited) => {
      const list = sixStar || []
      return list.map((r) => ({
        char_name: r.char_name || '-',
        count: r.count ?? 0,
        percent: (r.percent != null ? Number(r.percent).toFixed(1) : '0'),
        isUp: isLimited && upCharId && r.char_id === upCharId
      }))
    }

    if (this.e?.runtime?.render) {
      try {
        // 页面宽度适配：750px 便于合并转发展示；viewport 与 scale 配合控制输出尺寸
        const gachaPageWidth = 750
        const baseOpt = {
          scale: 1.6,
          retType: 'base64',
          viewport: { width: gachaPageWidth, height: 1200 }
        }
        const forwardMessages = []
        for (const { key, label } of GACHA_POOLS) {
          const poolData = byType[key] || {}
          const poolTotal = poolData.total ?? 0
          const poolStar6 = poolData.star6 ?? 0
          const avgPity = poolData.avg_pity != null ? Number(poolData.avg_pity).toFixed(2) : '-'
          const star6Rate = poolTotal > 0 ? ((poolStar6 / poolTotal) * 100).toFixed(2) + '%' : '0%'
          const star6RatePercent = poolTotal > 0 ? Math.min(100, (poolStar6 / poolTotal) * 100 * 20) : 0
          const avgPityPercent = avgPity !== '-' ? Math.min(100, (parseFloat(avgPity) / 90) * 100) : 0
          const rankingTab6 = key === 'weapon' ? '6星武器' : '6星干员'
          const rankingTab5 = key === 'weapon' ? '5星武器' : '5星干员'
          const rankingList6 = buildRankingList(s.ranking?.[key]?.six_star || [], key === 'limited').slice(0, 10)
          const rankingList5 = buildRankingList(s.ranking?.[key]?.five_star || [], false).slice(0, 10)
          const renderData = {
            title: '全服寻访统计',
            pageWidth: gachaPageWidth,
            syncTime,
            totalPulls,
            totalUsers,
            star6,
            globalAvgPity: s.avg_pity != null ? Number(s.avg_pity).toFixed(2) : '-',
            showUpBlock: key === 'limited',
            upName,
            upWinRate: upWinRatePercent + '%',
            upWinRateNum,
            official,
            bilibili,
            poolChartTitle: label,
            avgPity,
            avgPityPercent,
            star6Rate,
            star6RatePercent,
            star5: poolData.star5 ?? 0,
            star4: poolData.star4 ?? 0,
            distributionList: buildDistributionList(poolData.distribution),
            showRankingBlock: key !== 'beginner',
            rankingList6,
            rankingList5,
            rankingTab6,
            rankingTab5
          }
          const imgSegment = await this.e.runtime.render('endfield-plugin', 'gacha/global-stats', renderData, baseOpt)
          if (imgSegment) forwardMessages.push([imgSegment])
        }
        if (forwardMessages.length > 0) {
          const forwardMsg = common.makeForwardMsg(this.e, forwardMessages, '全服抽卡统计 · 常驻 / 新手 / 武器 / 限定')
          await this.e.reply(forwardMsg)
          return true
        }
      } catch (err) {
        logger.error(`[终末地插件][全服抽卡统计]渲染图失败: ${err?.message || err}`)
      }
    }

    let msg = '【全服抽卡统计】\n'
    msg += `总抽数：${totalPulls} | 统计用户：${totalUsers}\n`
    msg += `六星：${star6} | 五星：${star5} | 四星：${star4} | 平均出货：${avgPity} 抽\n`
    msg += `当前UP：${upName}\n`
    if (officialRaw || bilibiliRaw) {
      msg += '【按服务器】\n'
      if (officialRaw) msg += `官服：${officialRaw.total_users ?? 0} 人，${officialRaw.total_pulls ?? 0} 抽，平均出货 ${fmt(officialRaw.avg_pity)}\n`
      if (bilibiliRaw) msg += `B服：${bilibiliRaw.total_users ?? 0} 人，${bilibiliRaw.total_pulls ?? 0} 抽，平均出货 ${fmt(bilibiliRaw.avg_pity)}\n`
    }
    if (data.cached === true) msg += '\n（缓存数据，约 5 分钟更新）'
    else if (data.last_update) msg += `\n更新时间：${data.last_update}`
    await this.reply(msg)
    return true
  }

  /** 获取模拟抽卡配置（合并默认值） */
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

  /** 模拟抽卡用量作用域：群聊按群、私聊按用户 */
  getSimulateScope() {
    return this.e.isGroup ? `group_${this.e.group_id}` : `user_${this.e.user_id}`
  }

  /** 检查是否允许使用模拟抽卡：功能开关 + 群白名单（好友不限制群） */
  checkSimulateAllowed() {
    const cfg = this.getSimulateConfig()
    if (!cfg.enable) return 'disabled'
    if (this.e.isGroup && cfg.group_whitelist.length > 0) {
      const gid = String(this.e.group_id)
      if (!cfg.group_whitelist.includes(gid)) return 'group_not_allowed'
    }
    return true
  }

  /** 获取当日某作用域某卡池已使用次数（Redis） */
  async getSimulateDailyUsage(scope, poolType) {
    if (!redis) return 0
    try {
      const today = new Date().toISOString().slice(0, 10)
      const raw = await redis.get(GACHA_SIMULATE_DAILY_KEY(today, scope, poolType))
      return parseInt(raw, 10) || 0
    } catch {
      return 0
    }
  }

  /** 检查当日次数是否未超限（0 表示不限制） */
  async checkSimulateDailyLimit(scope, poolType) {
    const cfg = this.getSimulateConfig()
    const limit = cfg.daily_limit[poolType] ?? 0
    if (limit <= 0) return true
    const usage = await this.getSimulateDailyUsage(scope, poolType)
    return usage < limit
  }

  /** 当日使用次数 +1（Redis，键 2 天后过期） */
  async incrementSimulateDailyUsage(scope, poolType) {
    if (!redis) return
    try {
      const today = new Date().toISOString().slice(0, 10)
      const key = GACHA_SIMULATE_DAILY_KEY(today, scope, poolType)
      const n = await redis.incr(key)
      if (n === 1) await redis.expire(key, 86400 * 2)
    } catch (err) {
      logger.error(`[终末地插件][模拟抽卡] 增加当日用量失败: ${err?.message || err}`)
    }
  }

  /** 从卡池角色分布中按稀有度与 UP 状态随机选一个，返回 { cover, name }，无数据则返回空对象 */
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

  /** 构建模拟抽卡渲染数据并尝试渲染（含 pool-chars 封面与名称），成功返回 base64 图片段，失败返回 null */
  async renderSimulateResult(mode, payload) {
    if (!this.e?.runtime?.render) return null
    const pluResPath = this.e?.runtime?.path?.plugin?.['endfield-plugin']?.res || ''
    // 整体放大：提高页面宽度与视口高度（卡片网格更大、更接近游戏展示）
    const pageWidth = 760
    let viewportHeight = mode === 'single' ? 360 : mode === 'ten' ? 820 : 520
    // 百连等超过 10 条结果时拉高视口以展示全部卡片（5 列，每行约 199px）
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

    // 模拟抽卡规则（用于进度条与当前概率）
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

    const sixMax = n(rules.six_star_pity) || (poolType === 'weapon' ? 40 : 80)
    const sixCur = n(state.six_star_pity)
    const baseProb = n(rules.six_star_base_probability) || (poolType === 'weapon' ? 0.04 : 0.008)
    const softStart = n(rules.six_star_soft_pity_start) || 65
    const softInc = n(rules.six_star_soft_pity_increase) || 0.05
    const softSteps = rules.has_soft_pity === true ? Math.max(0, sixCur + 1 - softStart + 1) : 0
    const curProb = Math.min(1, baseProb + softSteps * softInc)

    const hardMax = n(rules.guaranteed_limited_pity) || (poolType === 'weapon' ? 80 : 120)
    const hasHard = poolType !== 'standard' && hardMax > 0
    const hardCur = n(state.guaranteed_limited_pity)

    const pityPanel = {
      six: mkPity(sixCur, sixMax, { probText: `当前概率：${(curProb * 100).toFixed(2)}%` }),
      guaranteedUpText: state.is_guaranteed_up == null ? '未触发' : state.is_guaranteed_up ? '已触发' : '未触发',
      hard: hasHard ? mkPity(hardCur, hardMax, { label: `${hardMax}抽硬保底` }) : null
    }

    // 统计卡片：使用当前卡池的累计总和（state 优先），与保底进度一致
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

  /** 模拟单抽：调用公开 API，支持 单抽(常驻/UP/武器) 或 单抽 (常驻/UP/武器)，默认限定池 */
  async simulateSingle() {
    const allowed = this.checkSimulateAllowed()
    if (allowed !== true) {
      if (allowed === 'disabled') await this.reply(getMessage('gacha.simulate_disabled'))
      else if (allowed === 'group_not_allowed') await this.reply(getMessage('gacha.simulate_group_not_allowed'))
      return true
    }
    const poolType = parseSimulatePoolType(this.e.msg, '单抽')
    const poolLabel = SIMULATE_POOL_LABEL[poolType] || poolType
    const scope = this.getSimulateScope()
    if (!(await this.checkSimulateDailyLimit(scope, poolType))) {
      await this.reply(getMessage('gacha.simulate_daily_limit_reached'))
      return true
    }
    // 不主动重置则叠加：从 Redis 持久化 state 继续抽
    const prevState = await this.loadSimulateState(scope, poolType)
    const data = await hypergryphAPI.postGachaSimulateSingle(poolType, prevState)
    if (!data?.result) {
      await this.reply(getMessage('gacha.simulate_failed'))
      return true
    }
    // 保存最新 state，后续继续叠加
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

  /** 模拟十连：调用公开 API，支持 十连(常驻/UP/武器) 或 十连 (常驻/UP/武器)，默认限定池 */
  async simulateTen() {
    const allowed = this.checkSimulateAllowed()
    if (allowed !== true) {
      if (allowed === 'disabled') await this.reply(getMessage('gacha.simulate_disabled'))
      else if (allowed === 'group_not_allowed') await this.reply(getMessage('gacha.simulate_group_not_allowed'))
      return true
    }
    const poolType = parseSimulatePoolType(this.e.msg, '十连')
    const poolLabel = SIMULATE_POOL_LABEL[poolType] || poolType
    const scope = this.getSimulateScope()
    if (!(await this.checkSimulateDailyLimit(scope, poolType))) {
      await this.reply(getMessage('gacha.simulate_daily_limit_reached'))
      return true
    }
    // 不主动重置则叠加：从 Redis 持久化 state 继续抽
    const prevState = await this.loadSimulateState(scope, poolType)
    const data = await hypergryphAPI.postGachaSimulateTen(poolType, prevState)
    if (!data?.results || !Array.isArray(data.results)) {
      await this.reply(getMessage('gacha.simulate_failed'))
      return true
    }
    // 保存最新 state，后续继续叠加
    await this.saveSimulateState(scope, poolType, data.state || null)
    await this.incrementSimulateDailyUsage(scope, poolType)
    const lines = []
    let star6Count = 0
    let upCount = 0
    for (const r of data.results) {
      const star = r.rarity === 6 ? '★6' : r.rarity === 5 ? '★5' : '★4'
      const tag = r.rarity === 6 && r.is_up ? ' UP' : r.rarity === 6 && !r.is_up ? ' 歪' : ''
      lines.push(`第${r.pull_number}抽 ${star}${tag}`)
      if (r.rarity === 6) {
        star6Count += 1
        if (r.is_up) upCount += 1
      }
    }
    let msg = '【模拟十连】\n' + lines.join('\n')
    if (data.stats) {
      msg += `\n──────────────\n`
      msg += `六星：${star6Count} | UP：${upCount} | 总抽数：${data.stats.total_pulls ?? '-'}`
    }
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

  /** 模拟百连：连续 10 次十连，共用 state，每日次数计 10 次 */
  async simulateHundred() {
    const allowed = this.checkSimulateAllowed()
    if (allowed !== true) {
      if (allowed === 'disabled') await this.reply(getMessage('gacha.simulate_disabled'))
      else if (allowed === 'group_not_allowed') await this.reply(getMessage('gacha.simulate_group_not_allowed'))
      return true
    }
    const poolType = parseSimulatePoolType(this.e.msg, '百连')
    const poolLabel = SIMULATE_POOL_LABEL[poolType] || poolType
    const scope = this.getSimulateScope()
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
    let lastStats = null
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
      lastStats = data.stats || null
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
    let msg = '【模拟百连】\n' + lines.join('\n')
    msg += `\n──────────────\n六星：${star6Count} | UP：${upCount} | 总抽数：100`

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

  /** 重置模拟抽卡状态：不传则默认限定池，可带 (常驻/UP/武器) */
  async resetSimulateGacha() {
    const allowed = this.checkSimulateAllowed()
    if (allowed !== true) {
      if (allowed === 'disabled') await this.reply(getMessage('gacha.simulate_disabled'))
      else if (allowed === 'group_not_allowed') await this.reply(getMessage('gacha.simulate_group_not_allowed'))
      return true
    }
    const scope = this.getSimulateScope()
    // Redis：删除该作用域下全部卡池的 state 键
    if (redis) {
      try {
        const keys = await redis.keys(GACHA_SIMULATE_STATE_PREFIX + scope + ':*')
        if (keys?.length) for (const k of keys) await redis.del(k)
      } catch (err) {
        logger.error(`[终末地插件][模拟抽卡] 重置 state 失败: ${err?.message || err}`)
      }
    }
    await this.reply('已重置模拟抽卡状态（全部卡池），下次将从头开始。')
    return true
  }

  /** 当前用户是否包含网页授权绑定（Redis 绑定中 login_type === 'auth' 即为网页授权） */
  async isAuthBindingUser(userId) {
    const raw = await redis.get(`ENDFIELD:USER:${userId}`)
    if (!raw) return false
    try {
      const data = JSON.parse(raw)
      const accounts = Array.isArray(data) ? data : [data]
      return accounts.some((acc) => acc.login_type === 'auth')
    } catch {
      return false
    }
  }

  /** 当前激活账号是否为网页授权（用于抽卡同步：仅网页授权用户先查 stats 判断有/无同步记录） */
  async isWebAuthUser(userId) {
    const raw = await redis.get(`ENDFIELD:USER:${userId}`)
    if (!raw) return false
    try {
      const data = JSON.parse(raw)
      const accounts = Array.isArray(data) ? data : [data]
      const active = accounts.find((acc) => acc.is_active || acc.isActive) || accounts[0]
      return active && active.login_type === 'auth'
    } catch {
      return false
    }
  }

  /** 抽卡记录同步入口：获取账号列表 → 多账号则让用户选择 → 启动同步 → 轮询状态（群聊/私聊均可）；options.afterSyncSendAnalysis 为 true 时同步完成后会制图发送抽卡分析 */
  async syncGacha(options = {}) {
    const sklUser = new EndfieldUser(this.e.user_id)
    if (!(await sklUser.getUser())) {
      await this.reply(getUnbindMessage())
      return true
    }

    const token = sklUser.framework_token

    const statusData = await hypergryphAPI.getGachaSyncStatus(token)
    if (statusData?.status === 'syncing') {
      const { message, progress, stage, current_pool, records_found, completed_pools, total_pools, elapsed_seconds } = statusData
      const rawMsg = message || (current_pool ? `正在查询${current_pool}...` : '')
      const progressMsg = this.formatProgressMsg(rawMsg, this.e.user_id, this.e.sender?.nickname || this.e.sender?.card)
      if (progressMsg) logger.mark(`[终末地插件][抽卡同步] ${progressMsg}`)
      const stageLabel = { grant: '验证 Token', bindings: '获取绑定账号', u8token: '获取访问凭证', records: '获取抽卡记录', saving: '保存数据' }[stage] || stage || ''
      let msg = getMessage('gacha.sync_in_progress') + '\n'
      msg += `进度：${progress ?? 0}%`
      if (total_pools != null && completed_pools != null) msg += ` | 卡池 ${completed_pools}/${total_pools}`
      if (records_found != null) msg += ` | 已获取 ${records_found} 条`
      if (elapsed_seconds != null) msg += ` | 已用 ${Math.round(elapsed_seconds)} 秒`
      if (stageLabel) msg += `\n阶段：${stageLabel}`
      await this.reply(msg)
      return true
    }

    const accountsData = await hypergryphAPI.getGachaAccounts(token)
    if (!accountsData || !accountsData.accounts?.length) {
      await this.reply(getMessage('gacha.no_accounts'))
      return true
    }

    const { accounts, count, need_select } = accountsData
    if (need_select && count > 1) {
      let msg = getMessage('gacha.select_account') + '\n'
      accounts.forEach((acc, i) => {
        msg += `${i + 1}. ${acc.channel_name || '未知'} - ${acc.nick_name || acc.game_uid || acc.uid}\n`
      })
      msg += getMessage('gacha.reply_index')
      await this.reply(msg)
      await redis.set(GACHA_PENDING_KEY(this.e.user_id), JSON.stringify({
        accounts,
        token,
        timestamp: Date.now(),
        afterSyncSendAnalysis: options?.afterSyncSendAnalysis,
        fromAnalysis: options?.fromAnalysis
      }), { EX: 300 })
      return true
    }

    const selectedUid = accounts[0]?.uid || null
    const roleId = sklUser.endfield_uid ? String(sklUser.endfield_uid) : null
    const qqName = this.e.sender?.nickname || this.e.sender?.card || String(this.e.user_id)
    await this.startFetchAndPoll(token, selectedUid, roleId, this.e.user_id, qqName, {
      afterSyncSendAnalysis: options?.afterSyncSendAnalysis,
      fromAnalysis: options?.fromAnalysis
    })
    return true
  }

  /** 网页授权用户：在开始拉取前根据 GET /api/endfield/gacha/stats 提示“有同步记录→增量”或“无→从零”（仅发一条提示，不阻塞） */
  async replyWebAuthSyncHint(token) {
    const isWebAuth = await this.isWebAuthUser(this.e.user_id)
    if (!isWebAuth) return
    const statsData = await hypergryphAPI.getGachaStats(token)
    const hasSyncRecord = statsData?.has_records === true || (statsData?.last_fetch != null && String(statsData.last_fetch).trim() !== '')
    await this.reply(getMessage(hasSyncRecord ? 'gacha.auth_incremental_sync' : 'gacha.auth_full_sync'))
  }

  /** 用户回复序号选择账号后启动同步并轮询（以 Redis pending 为准，群聊/私聊均可） */
  async receiveGachaSelect() {
    const raw = await redis.get(GACHA_PENDING_KEY(this.e.user_id))
    if (!raw) return true
    let data
    try {
      data = JSON.parse(raw)
    } catch {
      await redis.del(GACHA_PENDING_KEY(this.e.user_id))
      return true
    }
    const msg = (this.e.msg || '').trim().replace(/^[:：]\s*/, '')
    const index = parseInt(msg, 10)
    if (!Number.isFinite(index) || index < 1 || index > (data.accounts?.length || 0)) {
      await this.reply(getMessage('gacha.invalid_index'))
      return true
    }
    await redis.del(GACHA_PENDING_KEY(this.e.user_id))
    const account = data.accounts[index - 1]
    const selectedUid = account?.uid || null
    const sklUser = new EndfieldUser(this.e.user_id)
    const roleId = (await sklUser.getUser()) && sklUser.endfield_uid ? String(sklUser.endfield_uid) : null
    const qqName = this.e.sender?.nickname || this.e.sender?.card || String(this.e.user_id)
    await this.startFetchAndPoll(data.token, selectedUid, roleId, this.e.user_id, qqName, {
      afterSyncSendAnalysis: data.afterSyncSendAnalysis,
      fromAnalysis: data.fromAnalysis
    })
    return true
  }

  /**
   * 启动同步任务并轮询直到 completed / failed
   * 后端根据 body.role_id 判断：数据库已有相同 roleId 则增量，否则全量
   * @param {string} token 用户 framework_token
   * @param {string|null} accountUid 多账号时选中的 uid
   * @param {string|null} roleId 当前角色 ID，供后端判断增量/全量
   * @param {string|number} [userId] 当前 QQ 号，用于日志占位符 {qq号}
   * @param {string} [qqName] 当前 QQ 昵称，用于日志占位符 {qqname}
   * @param {{ afterSyncSendAnalysis?: boolean, fromAnalysis?: boolean }} [options] 同步完成后发抽卡分析图；fromAnalysis 为 true 时不发「开始同步」类提示（由抽卡分析已发过）
   */
  async startFetchAndPoll(token, accountUid, roleId, userId, qqName, options = {}) {
    const afterSyncSendAnalysis = options?.afterSyncSendAnalysis ?? false
    const fromAnalysis = options?.fromAnalysis ?? false
    // 先判断是否首次同步，只发一条开始提示（首次→首次同步，否则→开始同步）
    const statsData = await hypergryphAPI.getGachaStats(token)
    const hasSyncRecord = statsData?.has_records === true ||
      (statsData?.last_fetch != null && String(statsData.last_fetch).trim() !== '') ||
      ((statsData?.stats?.total_count ?? 0) > 0)
    const isFirstSync = !hasSyncRecord

    const body = {}
    if (accountUid) body.account_uid = accountUid
    if (roleId) body.role_id = roleId
    const fetchRes = await hypergryphAPI.postGachaFetch(token, body)
    if (fetchRes && fetchRes.status === 'conflict') {
      await this.reply(getMessage('gacha.sync_busy'))
      return
    }
    if (!fetchRes || !fetchRes.status) {
      await this.reply(getMessage('gacha.sync_start_failed'))
      return
    }

    // 由抽卡分析触发的同步已发过「未同步/正在拉取」提示，此处不再重复发开始提示
    if (!fromAnalysis) {
      await this.reply(getMessage(isFirstSync ? 'gacha.auth_full_sync' : 'gacha.sync_start'))
    }

    let lastProgressMessage = ''
    let timeoutRetryUsed = false
    while (true) {
      const start = Date.now()
      while (Date.now() - start < POLL_TIMEOUT_MS) {
        await this.sleep(POLL_INTERVAL_MS)
        const statusData = await hypergryphAPI.getGachaSyncStatus(token)
        if (!statusData) continue
        const { status, message, records_found, new_records, error, current_pool } = statusData
        if (status === 'syncing' && (message || current_pool)) {
          const rawMsg = message || (current_pool ? `正在查询${current_pool}...` : '')
          const progressMsg = this.formatProgressMsg(rawMsg, userId, qqName)
          if (progressMsg && progressMsg !== lastProgressMessage) {
            lastProgressMessage = progressMsg
            logger.mark(`[终末地插件][抽卡同步] ${progressMsg}`)
          }
        }
        if (status === 'completed') {
          const total = records_found ?? 0
          const added = new_records ?? 0
          let poolLine = ''
          const statsData = await hypergryphAPI.getGachaStats(token)
          const stats = statsData?.stats || {}
          if (stats.limited_char_count != null || stats.standard_char_count != null || stats.beginner_char_count != null || stats.weapon_count != null) {
            const parts = []
            if (stats.limited_char_count != null) parts.push(`限定池 ${stats.limited_char_count} 条`)
            if (stats.standard_char_count != null) parts.push(`常驻池 ${stats.standard_char_count} 条`)
            if (stats.beginner_char_count != null) parts.push(`新手池 ${stats.beginner_char_count} 条`)
            if (stats.weapon_count != null) parts.push(`武器池 ${stats.weapon_count} 条`)
            if (parts.length) poolLine = '\n' + getMessage('gacha.sync_done_pools', { pools: parts.join(' | ') }).trim()
          }
          // 本次新增 0 条且要发分析图时，不发同步文案，直接发图
          if (added > 0 || !afterSyncSendAnalysis) {
            await this.reply(getMessage('gacha.sync_done', {
              records_found: total,
              new_records: added,
              pool_detail: poolLine
            }), false, { at: !!this.e.isGroup })
          }
          if (afterSyncSendAnalysis) {
            await this.renderAndSendGachaAnalysis()
          }
          return
        }
        if (status === 'failed') {
          await this.reply(getMessage('gacha.sync_failed', { error: error || message || '未知错误' }))
          return
        }
      }
      // 本轮超时：首次则等待 5 秒后继续轮询（不提醒用户），再次超时再提醒
      if (!timeoutRetryUsed) {
        timeoutRetryUsed = true
        await this.sleep(5000)
        continue
      }
      await this.reply(getMessage('gacha.sync_timeout'))
      return
    }
  }

  sleep(ms) {
    return new Promise((r) => setTimeout(r, ms))
  }

  /** 定时任务：每小时自动同步所有账号的抽卡记录，每个账号开始时间间隔 5～10 秒随机 */
  async hourlySyncAllGacha() {
    let keys = []
    try {
      keys = await redis.keys('ENDFIELD:USER:*')
    } catch (err) {
      logger.error(`[终末地插件][抽卡定时同步]redis.keys 失败: ${err?.message || err}`)
      return
    }
    const tasks = []
    for (const key of keys) {
      const userId = key.replace(/^ENDFIELD:USER:/, '')
      const raw = await redis.get(REDIS_KEY(userId))
      if (!raw) continue
      let accounts = []
      try {
        const data = JSON.parse(raw)
        accounts = Array.isArray(data) ? data : [{ ...data, is_active: true }]
      } catch {
        continue
      }
      const active = accounts.find((a) => a.is_active === true) || accounts[0]
      const token = active?.framework_token
      const roleId = active?.role_id != null ? String(active.role_id) : null
      if (!token) continue
      const accountsData = await hypergryphAPI.getGachaAccounts(token)
      if (!accountsData?.accounts?.length) continue
      const gachaAccounts = accountsData.accounts
      if (gachaAccounts.length === 1) {
        tasks.push({ token, accountUid: gachaAccounts[0]?.uid || null, roleId })
      } else {
        for (const acc of gachaAccounts) {
          tasks.push({ token, accountUid: acc?.uid || null, roleId })
        }
      }
    }
    for (let i = 0; i < tasks.length; i++) {
      if (i > 0) {
        const delay = HOURLY_SYNC_DELAY_MIN_MS + Math.floor(Math.random() * (HOURLY_SYNC_DELAY_MAX_MS - HOURLY_SYNC_DELAY_MIN_MS + 1))
        await this.sleep(delay)
      }
      const { token, accountUid, roleId } = tasks[i]
      const body = {}
      if (accountUid) body.account_uid = accountUid
      if (roleId) body.role_id = roleId
      const res = await hypergryphAPI.postGachaFetch(token, body)
      if (res?.status === 'conflict') {
        logger.mark(`[终末地插件][抽卡定时同步] 某账号正在同步中，跳过`)
      } else if (res?.status) {
        logger.mark(`[终末地插件][抽卡定时同步] 已触发第 ${i + 1}/${tasks.length} 个账号同步`)
      } else {
        logger.warn(`[终末地插件][抽卡定时同步] 第 ${i + 1} 个账号触发失败`)
      }
    }
  }
}
