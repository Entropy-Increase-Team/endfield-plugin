import { rulePrefix, getUnbindMessage, getMessage } from '../utils/common.js'
import EndfieldUser from '../model/endfieldUser.js'
import hypergryphAPI from '../model/hypergryphApi.js'
import setting from '../utils/setting.js'
import common from '../../../lib/common/common.js'

const GACHA_PENDING_KEY = (userId) => `ENDFIELD:GACHA_PENDING:${userId}`
const POLL_INTERVAL_MS = 1500
const POLL_TIMEOUT_MS = 120000
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
          reg: `^${rulePrefix}抽卡记录(?:\\s+(\\d+))?$`,
          fnc: 'viewGachaRecords'
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

  /** 查看抽卡记录：统计 + 最近 N 条记录，可选页码（群聊/私聊均可） */
  async viewGachaRecords() {
    const sklUser = new EndfieldUser(this.e.user_id)
    if (!(await sklUser.getUser())) {
      await this.reply(getUnbindMessage())
      return true
    }
    const pageStr = (this.e.msg || '').replace(/.*抽卡记录\s*/, '').trim()
    const page = (pageStr && parseInt(pageStr, 10)) ? parseInt(pageStr, 10) : 1
    const limit = 15
    const statsData = await hypergryphAPI.getGachaStats(sklUser.framework_token)
    const recordsData = await hypergryphAPI.getGachaRecords(sklUser.framework_token, { page, limit })
    if (!statsData && !recordsData) {
      await this.reply(getMessage('gacha.no_records'))
      return true
    }
    const stats = statsData?.stats || recordsData?.stats || {}
    const records = recordsData?.records || []
    const total = recordsData?.total ?? 0
    const pages = recordsData?.pages ?? 1
    const userInfo = statsData?.user_info || recordsData?.user_info || {}
    let msg = '【抽卡记录】\n'
    msg += `角色：${userInfo.nickname || userInfo.game_uid || '未知'} | ${userInfo.channel_name || ''}\n`
    msg += `总抽数：${stats.total_count ?? 0} | 六星：${stats.star6_count ?? 0} | 五星：${stats.star5_count ?? 0} | 四星：${stats.star4_count ?? 0}\n`
    if (total > 0) {
      msg += `\n最近记录（第 ${page}/${pages} 页）：\n`
      records.forEach((r, i) => {
        const star = (r.rarity === 6 ? '★6' : r.rarity === 5 ? '★5' : '★4') || ''
        const name = r.char_name || r.item_name || '未知'
        const pool = r.pool_name ? ` [${r.pool_name}]` : ''
        msg += `${(page - 1) * limit + i + 1}. ${star} ${name}${pool}\n`
      })
      if (pages > 1) {
        msg += `\n查看其他页：${this.getCmdPrefix()}抽卡记录 2`
      }
    } else {
      msg += `\n暂无记录，请先使用「${this.getCmdPrefix()}抽卡记录同步」从官方拉取。`
    }
    await this.reply(msg)
    return true
  }

  getCmdPrefix() {
    const commonConfig = setting.getConfig('common') || {}
    return Number(commonConfig.prefix_mode) === 2 ? '#zmd' : ':'
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
    const syncTime = data.cached === true ? '缓存约5分钟' : (data.last_update ? `${data.last_update}` : '刚刚')
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
    const poolKeys = [
      { key: 'standard', label: '常驻角色' },
      { key: 'beginner', label: '新手池' },
      { key: 'weapon', label: '武器池' },
      { key: 'limited', label: '限定角色' }
    ]
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
        const baseOpt = { scale: 1.6, retType: 'base64' }
        const forwardMessages = []
        for (const { key, label } of poolKeys) {
          const poolData = byType[key] || {}
          const poolTotal = poolData.total ?? 0
          const poolStar6 = poolData.star6 ?? 0
          const poolStar5 = poolData.star5 ?? 0
          const poolStar4 = poolData.star4 ?? 0
          const poolAvgPity = poolData.avg_pity != null ? Number(poolData.avg_pity).toFixed(2) : '-'
          const poolStar6Rate = poolTotal > 0 ? ((poolStar6 / poolTotal) * 100).toFixed(2) + '%' : '0%'
          const poolStar6RatePercent = poolTotal > 0 ? Math.min(100, (poolStar6 / poolTotal) * 100 * 20) : 0
          const poolAvgPityPercent = poolAvgPity !== '-' ? Math.min(100, (parseFloat(poolAvgPity) / 90) * 100) : 0
          const highlight = { limited: false, standard: false, beginner: false, weapon: false }
          highlight[key] = true
          const rankingTab6 = key === 'weapon' ? '6星武器' : '6星干员'
          const rankingTab5 = key === 'weapon' ? '5星武器' : '5星干员'
          const renderData = {
            title: '全服寻访统计',
            maxWidth: 920,
            syncTime,
            totalPulls,
            totalUsers,
            star6,
            globalAvgPity: s.avg_pity != null ? Number(s.avg_pity).toFixed(2) : '-',
            upName,
            upWinRate: upWinRatePercent + '%',
            upWinRateNum,
            official,
            bilibili,
            limitedTotal: (byType.limited || {}).total ?? 0,
            standardTotal: (byType.standard || {}).total ?? 0,
            beginnerTotal: (byType.beginner || {}).total ?? 0,
            weaponTotal: (byType.weapon || {}).total ?? 0,
            highlightLimited: highlight.limited,
            highlightStandard: highlight.standard,
            highlightBeginner: highlight.beginner,
            highlightWeapon: highlight.weapon,
            poolChartTitle: label,
            avgPity: poolAvgPity,
            avgPityPercent: poolAvgPityPercent,
            star6Rate: poolStar6Rate,
            star6RatePercent: poolStar6RatePercent,
            star5: poolStar5,
            star4: poolStar4,
            distributionList: buildDistributionList(poolData.distribution),
            rankingList: buildRankingList(s.ranking?.[key]?.six_star || [], key === 'limited'),
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

  /** 抽卡记录同步入口：获取账号列表 → 多账号则让用户选择 → 启动同步 → 轮询状态（群聊/私聊均可） */
  async syncGacha() {
    const sklUser = new EndfieldUser(this.e.user_id)
    if (!(await sklUser.getUser())) {
      await this.reply(getUnbindMessage())
      return true
    }

    const token = sklUser.framework_token

    const statusData = await hypergryphAPI.getGachaSyncStatus(token)
    if (statusData?.status === 'syncing') {
      const { message, progress, stage, current_pool, records_found, completed_pools, total_pools, elapsed_seconds } = statusData
      const progressMsg = message || (current_pool ? `正在查询${current_pool}...` : '')
      const stageLabel = { grant: '验证 Token', bindings: '获取绑定账号', u8token: '获取访问凭证', records: '获取抽卡记录', saving: '保存数据' }[stage] || stage || ''
      let msg = getMessage('gacha.sync_in_progress') + '\n'
      if (progressMsg) msg += `${progressMsg}\n`
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
        timestamp: Date.now()
      }), { EX: 300 })
      return true
    }

    const selectedUid = accounts[0]?.uid || null
    await this.replyWebAuthSyncHint(token)
    await this.startFetchAndPoll(token, selectedUid)
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
    await this.replyWebAuthSyncHint(data.token)
    await this.startFetchAndPoll(data.token, selectedUid)
    return true
  }

  /**
   * 启动同步任务并轮询直到 completed / failed
   * @param {string} token 用户 framework_token
   * @param {string|null} accountUid 多账号时选中的 uid
   */
  async startFetchAndPoll(token, accountUid) {
    const body = accountUid ? { account_uid: accountUid } : {}
    const fetchRes = await hypergryphAPI.postGachaFetch(token, body)
    if (fetchRes && fetchRes.status === 'conflict') {
      await this.reply(getMessage('gacha.sync_busy'))
      return
    }
    if (!fetchRes || !fetchRes.status) {
      await this.reply(getMessage('gacha.sync_start_failed'))
      return
    }

    const start = Date.now()
    let lastProgressMessage = ''
    while (Date.now() - start < POLL_TIMEOUT_MS) {
      await this.sleep(POLL_INTERVAL_MS)
      const statusData = await hypergryphAPI.getGachaSyncStatus(token)
      if (!statusData) continue
      const { status, message, records_found, new_records, error, current_pool } = statusData
      if (status === 'syncing' && (message || current_pool)) {
        const progressMsg = message || (current_pool ? `正在查询${current_pool}...` : '')
        if (progressMsg && progressMsg !== lastProgressMessage) {
          lastProgressMessage = progressMsg
          if (!progressMsg.includes('访问凭证')) {
            await this.reply(progressMsg)
          }
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
