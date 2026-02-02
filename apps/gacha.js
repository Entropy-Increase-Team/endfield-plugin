import { rulePrefix, getUnbindMessage, getMessage } from '../utils/common.js'
import EndfieldUser from '../model/endfieldUser.js'
import hypergryphAPI from '../model/hypergryphApi.js'
import setting from '../utils/setting.js'
import common from '../../../lib/common/common.js'

const GACHA_PENDING_KEY = (userId) => `ENDFIELD:GACHA_PENDING:${userId}`
const POLL_INTERVAL_MS = 1500
const POLL_TIMEOUT_MS = 120000

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
export class EndfieldGacha extends plugin {
  constructor() {
    super({
      name: '[endfield-plugin]抽卡记录',
      dsc: '终末地抽卡记录同步',
      event: 'message',
      priority: 50,
      rule: [
        {
          reg: `^${rulePrefix}(抽卡记录同步|同步抽卡记录)$`,
          fnc: 'syncGacha'
        },
        {
          reg: `^${rulePrefix}抽卡记录(?:\\s+(.+))?$`,
          fnc: 'viewGachaRecords'
        },
        {
          reg: `^${rulePrefix}抽卡分析$`,
          fnc: 'viewGachaAnalysis'
        },
        {
          reg: `^${rulePrefix}全服抽卡统计$`,
          fnc: 'globalGachaStats'
        },
        {
          reg: `^${rulePrefix}\\d+$`,
          fnc: 'receiveGachaSelect'
        }
      ]
    })
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
            maxWidth: pageWidth,
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
            syncHint: `${prefix}抽卡记录同步`,
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
          maxWidth: pageWidth,
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
          syncHint: `${prefix}抽卡记录同步`,
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
      msg += `\n暂无记录，请先使用「${prefix}抽卡记录同步」从官方拉取。`
    }
    await this.reply(msg)
    return true
  }

  /** 抽卡分析：先判断数据是否全为 0，全为 0 则发提示并自动同步，同步完成后再制图发送；否则直接制图 */
  async viewGachaAnalysis() {
    const sklUser = new EndfieldUser(this.e.user_id)
    if (!(await sklUser.getUser())) {
      await this.reply(getUnbindMessage())
      return true
    }
    const statsData = await hypergryphAPI.getGachaStats(sklUser.framework_token)
    if (!statsData) {
      await this.reply(getMessage('gacha.analysis_auto_sync_hint'))
      return await this.syncGacha({ afterSyncSendAnalysis: true })
    }
    // 判断各池数据是否全为 0（未进行过同步）
    const poolStats = statsData.pool_stats || {}
    const userInfo = statsData.user_info || {}
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
      return await this.syncGacha({ afterSyncSendAnalysis: true })
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

    // 限定池不歪概率：从全服统计 current_pool 取 UP 角色（up_char_id/up_char_name），再与用户限定池记录匹配
    let upCharId = ''
    let upCharName = ''
    try {
      const globalData = await hypergryphAPI.getGachaGlobalStats()
      const currentPool = globalData?.stats?.current_pool
      if (currentPool) {
        upCharId = (currentPool.up_char_id || '').trim()
        upCharName = (currentPool.up_char_name || '').trim()
      }
    } catch (e) {
      logger.error(`[终末地插件][抽卡分析]获取 current_pool 失败: ${e?.message || e}`)
    }

    const POOLS = [
      { key: 'limited', label: '限定池', metric1Label: '平均UP花费', metric2Label: '不歪概率', metric2Default: '-', isChar: true },
      { key: 'weapon', label: '武器池', metric1Label: '每红花费', metric2Label: '出红数', metric2Default: null, isChar: false },
      { key: 'standard', label: '常驻池', metric1Label: '每红花费', metric2Label: '出红数', metric2Default: null, isChar: true },
      { key: 'beginner', label: '新手池', metric1Label: '每红花费', metric2Label: '出红数', metric2Default: null, isChar: true }
    ]

    const poolList = []
    for (const def of POOLS) {
      const raw = getPool(def.key === 'limited' ? 'limited_char' : def.key === 'weapon' ? 'weapon' : def.key === 'standard' ? 'standard_char' : 'beginner_char', def.key)
      const total = raw.total ?? 0
      const star6 = raw.star6 ?? 0
      let metric2 = def.metric2Default !== undefined ? (def.metric2Default ?? star6) : star6

      // 从 GET /api/endfield/gacha/records 取该池记录，得到 pool_name、六星/五星图及抽数
      let poolName = ''
      const images = []
      const images5 = []
      try {
        const recordsData = await hypergryphAPI.getGachaRecords(sklUser.framework_token, { pools: def.key, page: 1, limit: 500 })
        const records = recordsData?.records || []
        if (records.length > 0) poolName = records[0].pool_name || ''
        const sixStarRecords = records.filter((r) => r.rarity === 6)
        // 限定池：不歪概率 = 6星中为 UP 角色的比例（用 current_pool.up_char_id/up_char_name 匹配）
        if (def.key === 'limited' && sixStarRecords.length > 0 && (upCharId || upCharName)) {
          const upCount = sixStarRecords.filter(
            (r) => (upCharId && String(r.char_id || '').trim() === upCharId) || (upCharName && String(r.char_name || '').trim() === upCharName)
          ).length
          metric2 = `${((upCount / sixStarRecords.length) * 100).toFixed(1)}%`
        }
        // 按 seq_id 升序（最早抽的在先）；六星抽数 = 距上一红的抽数（出红后重置为 0）
        const sorted = [...records].sort((a, b) => String(a.seq_id || '').localeCompare(String(b.seq_id || ''), undefined, { numeric: true }))
        let pullsSinceLast6 = 0
        for (const r of sorted) {
          pullsSinceLast6 += 1
          if (r.rarity === 6) {
            const id = r.char_id || ''
            const name = (r.char_name || '').trim() || id
            if (def.isChar) {
              const info = noteCharMap[id] || noteCharMap[name]
              if (info) images.push({ name: info.name, url: info.url, pullCount: pullsSinceLast6 })
            } else {
              const cover = weaponCoverMap[name]
              if (cover) images.push({ name, url: cover, pullCount: pullsSinceLast6 })
            }
            pullsSinceLast6 = 0
            if (images.length >= 6) break
          }
        }
        // 五星：小图换行展示，最多 12 个（不显示抽数）
        for (const r of sorted) {
          if (r.rarity !== 5) continue
          const id = r.char_id || ''
          const name = (r.char_name || r.item_name || '').trim() || id
          if (def.isChar) {
            const info = noteCharMap[id] || noteCharMap[name]
            if (info) images5.push({ name: info.name, url: info.url })
          } else {
            const cover = weaponCoverMap[name]
            if (cover) images5.push({ name, url: cover })
          }
          if (images5.length >= 12) break
        }
      } catch (e) {
        logger.error(`[终末地插件][抽卡分析]获取 ${def.label} 记录失败: ${e?.message || e}`)
      }

      poolList.push({
        label: def.label,
        poolName,
        total,
        star6,
        metric1: fmtCost(total, star6),
        metric1Label: def.metric1Label,
        metric2,
        metric2Label: def.metric2Label,
        images,
        images5,
        isChar: def.isChar
      })
    }

    const prefix = this.getCmdPrefix()
    const pluResPath = this.e?.runtime?.path?.plugin?.['endfield-plugin']?.res || ''

    if (this.e?.runtime?.render) {
      try {
        // 视口与页面同宽，避免截图两侧留白
        const pageWidth = 520
        const baseOpt = { scale: 1.6, retType: 'base64', viewport: { width: pageWidth, height: 900 } }
        const renderData = {
          maxWidth: pageWidth,
          title: '抽卡分析',
          subtitle: `${userNickname} · ${userInfo.channel_name || ''}`,
          userAvatar,
          userNickname,
          userUid,
          poolList,
          recordHint: `${prefix}抽卡记录`,
          pluResPath
        }
        const imgSegment = await this.e.runtime.render('endfield-plugin', 'gacha/gacha-analysis', renderData, baseOpt)
        if (imgSegment) {
          await this.reply(imgSegment)
          return true
        }
      } catch (err) {
        logger.error(`[终末地插件][抽卡分析]渲染图失败: ${err?.message || err}`)
      }
    }

    let msg = '【抽卡分析】\n'
    msg += `角色：${userInfo.nickname || userInfo.game_uid || '未知'} · ${userInfo.channel_name || ''}\n`
    for (const p of poolList) {
      const namePart = p.poolName ? ` · ${p.poolName}` : ''
      msg += `${p.label}${namePart}：${p.total} 抽 | ${p.metric1Label} ${p.metric1} | ${p.metric2Label} ${p.metric2}\n`
    }
    msg += `查看最近记录：${prefix}抽卡记录`
    await this.reply(msg)
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
    return Number(commonConfig.prefix_mode) === 2 ? '#zmd' : ':'
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
          const poolStar5 = poolData.star5 ?? 0
          const poolStar4 = poolData.star4 ?? 0
          const poolAvgPity = poolData.avg_pity != null ? Number(poolData.avg_pity).toFixed(2) : '-'
          const poolStar6Rate = poolTotal > 0 ? ((poolStar6 / poolTotal) * 100).toFixed(2) + '%' : '0%'
          const poolStar6RatePercent = poolTotal > 0 ? Math.min(100, (poolStar6 / poolTotal) * 100 * 20) : 0
          const poolAvgPityPercent = poolAvgPity !== '-' ? Math.min(100, (parseFloat(poolAvgPity) / 90) * 100) : 0
          const rankingTab6 = key === 'weapon' ? '6星武器' : '6星干员'
          const rankingTab5 = key === 'weapon' ? '5星武器' : '5星干员'
          // 出货排名：左列六星、右列五星，各取前 10
          const rankingList6 = buildRankingList(s.ranking?.[key]?.six_star || [], key === 'limited').slice(0, 10)
          const rankingList5 = buildRankingList(s.ranking?.[key]?.five_star || [], false).slice(0, 10)
          const renderData = {
            title: '全服寻访统计',
            maxWidth: gachaPageWidth,
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
            avgPity: poolAvgPity,
            avgPityPercent: poolAvgPityPercent,
            star6Rate: poolStar6Rate,
            star6RatePercent: poolStar6RatePercent,
            star5: poolStar5,
            star4: poolStar4,
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
        afterSyncSendAnalysis: options?.afterSyncSendAnalysis
      }), { EX: 300 })
      return true
    }

    const selectedUid = accounts[0]?.uid || null
    const roleId = sklUser.endfield_uid ? String(sklUser.endfield_uid) : null
    const qqName = this.e.sender?.nickname || this.e.sender?.card || String(this.e.user_id)
    await this.startFetchAndPoll(token, selectedUid, roleId, this.e.user_id, qqName, options?.afterSyncSendAnalysis)
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
    await this.startFetchAndPoll(data.token, selectedUid, roleId, this.e.user_id, qqName, data.afterSyncSendAnalysis)
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
   * @param {boolean} [afterSyncSendAnalysis] 同步完成后是否制图发送抽卡分析
   */
  async startFetchAndPoll(token, accountUid, roleId, userId, qqName, afterSyncSendAnalysis) {
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

    await this.reply(getMessage(isFirstSync ? 'gacha.auth_full_sync' : 'gacha.sync_start'))

    const start = Date.now()
    let lastProgressMessage = ''
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
        await this.reply(getMessage('gacha.sync_done', {
          records_found: total,
          new_records: added,
          pool_detail: poolLine
        }), false, { at: !!this.e.isGroup })
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
    await this.reply(getMessage('gacha.sync_timeout'))
  }

  sleep(ms) {
    return new Promise((r) => setTimeout(r, ms))
  }
}
