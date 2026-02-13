import { getUnbindMessage, getMessage } from '../utils/common.js'
import EndfieldUser from '../model/endfieldUser.js'
import { REDIS_KEY } from '../model/endfieldUser.js'
import EndfieldRequest from '../model/endfieldReq.js'
import hypergryphAPI from '../model/hypergryphApi.js'
import setting from '../utils/setting.js'
import { getCopyright } from '../utils/copyright.js'

/** Redis 键：抽卡同步选择账号 pending、抽卡分析时间；模拟抽卡键在 gachaSimulate.js */
const GACHA_KEYS = {
  pending: (userId) => `ENDFIELD:GACHA_PENDING:${userId}`,
  lastAnalysis: (userId) => `ENDFIELD:GACHA_LAST_ANALYSIS:${userId}`,
}
const SYNC_MS = { pollInterval: 1500, pollTimeout: Infinity }

/** 保底与进度条：角色池小保底 80、大保底 120；武器池保底 31～40、进度条满 40 */
const PITY = {
  charSoft: 80,
  charHard: 120,
  weaponMax: 40,
  weaponBaodiMin: 31,
  weaponBaodiMax: 40
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
          reg: '^(?:[:：]|#zmd|#终末地)抽卡记录(?:\\s*(.+))?$',
          fnc: 'viewGachaRecords'
        },
        {
          reg: '^(?:[:：]|#zmd|#终末地)抽卡分析(?:同步)?(?:\\s+.*)?$',
          fnc: 'viewGachaAnalysis'
        },
        {
          reg: '^(?:[:：]|#zmd|#终末地)全服抽卡统计(?:\\s+(.+))?$',
          fnc: 'globalGachaStats'
        },
        {
          reg: '^(?:[:：]|#zmd|#终末地)同步全部抽卡$',
          fnc: 'syncAllGacha',
          permission: 'master'
        },
        {
          reg: '^(?:[:：]|#zmd|#终末地)?[1-9]\\d{0,2}$',
          fnc: 'receiveGachaSelect',
          log: false
        }
      ]
    })
  }

  /**
   * 从 /api/bili-wiki/activities 获取当期 UP：仅取 is_active 为 true 的活动，
   * 按 API 文档使用 up 字段：特许寻访为 UP 角色名，武库申领为 UP 武器名。
   * 返回 { upCharNames, upCharName, upWeaponName, activeCharPoolName, activeWeaponPoolName }；
   * 失败或未配置 api_key 时返回 null。
   */
  async getCurrentUpFromBiliWiki() {
    const commonCfg = setting.getConfig('common') || {}
    if (!commonCfg.api_key || String(commonCfg.api_key).trim() === '') return null
    try {
      const req = new EndfieldRequest(0, '', '')
      const res = await req.getWikiData('bili_wiki_activities')
      if (!res || res.code !== 0) return null
      const list = Array.isArray(res.data?.items) ? res.data.items : (Array.isArray(res.data?.activities) ? res.data.activities : [])
      const activeOnly = list.filter((a) => a?.is_active === true)
      let upCharNames = []
      let upWeaponName = ''
      let activeCharPoolName = ''
      let activeWeaponPoolName = ''
      const charActivity = activeOnly.find((a) => (a?.type || '') === '特许寻访')
      if (charActivity?.up && String(charActivity.up).trim()) {
        const upStr = String(charActivity.up).trim()
        upCharNames = [upStr]
      }
      if (charActivity?.name) {
        const idx = charActivity.name.indexOf('·')
        activeCharPoolName = idx !== -1 ? charActivity.name.slice(idx + 1).trim() : charActivity.name.trim()
      }
      const weaponActivity = activeOnly.find((a) => (a?.type || '') === '武库申领')
      if (weaponActivity?.up && String(weaponActivity.up).trim()) {
        upWeaponName = String(weaponActivity.up).trim()
        activeWeaponPoolName = upWeaponName
      } else if (weaponActivity?.name) {
        const idx = weaponActivity.name.indexOf('·')
        activeWeaponPoolName = idx !== -1 ? weaponActivity.name.slice(idx + 1).trim() : weaponActivity.name.trim()
      }
      // 构建所有池子（含历史）的 UP 映射：池子名 → UP 角色/武器名
      const poolUpMap = {}
      for (const a of list) {
        if (!a?.name || !a?.up) continue
        const pIdx = a.name.indexOf('·')
        const pName = pIdx !== -1 ? a.name.slice(pIdx + 1).trim() : a.name.trim()
        const upStr = String(a.up).trim()
        if (pName && upStr) poolUpMap[pName] = upStr
      }
      const upCharName = upCharNames.length > 0 ? upCharNames.join('、') : ''
      return { upCharNames, upCharName, upWeaponName, activeCharPoolName, activeWeaponPoolName, poolUpMap }
    } catch (e) {
      logger.error(`[终末地插件][抽卡] getCurrentUpFromBiliWiki 失败: ${e?.message || e}`)
      return null
    }
  }

  /** 查看抽卡记录：四个卡池合并到一张图中展示，支持 :抽卡记录 <页码> */
  async viewGachaRecords() {
    const sklUser = new EndfieldUser(this.e.user_id)
    if (!(await sklUser.getUser())) {
      await this.reply(getUnbindMessage())
      return true
    }
    // 解析页码参数
    const argStr = (this.e.msg || '').replace(/.*抽卡记录\s*/, '').trim()
    const page = (argStr && Number.isFinite(parseInt(argStr, 10))) ? Math.max(1, parseInt(argStr, 10)) : 1
    const limit = 10
    const pluResPath = this.e?.runtime?.path?.plugin?.['endfield-plugin']?.res || ''

    // 获取角色/武器头像映射
    let charAvatarMap = {}
    try {
      const noteRes = await sklUser.sklReq.getData('note')
      const chars = noteRes?.data?.chars || []
      for (const c of chars) {
        const name = (c.name || '').trim()
        const url = c.avatarSqUrl || ''
        if (name && url) charAvatarMap[name] = url
      }
    } catch (e) { /* 获取失败不影响记录展示 */ }
    try {
      const poolCharsData = await hypergryphAPI.getGachaPoolChars()
      const pools = poolCharsData?.pools || []
      for (const p of pools) {
        for (const list of [p.star6_chars, p.star5_chars, p.star4_chars]) {
          if (!Array.isArray(list)) continue
          for (const c of list) {
            const name = (c.name || '').trim()
            const cover = c.cover || ''
            if (name && cover && !charAvatarMap[name]) charAvatarMap[name] = cover
          }
        }
      }
    } catch (e) { /* 获取失败不影响记录展示 */ }

    // 获取当前 UP 角色/武器名，用于标记 UP
    let upCharNames = []
    let upWeaponName = ''
    const biliUp = await this.getCurrentUpFromBiliWiki()
    if (biliUp?.upCharNames?.length) {
      upCharNames = biliUp.upCharNames
      if (biliUp.upWeaponName) upWeaponName = biliUp.upWeaponName
    }
    if (upCharNames.length === 0) {
      try {
        const globalData = await hypergryphAPI.getGachaGlobalStats()
        const gs = globalData?.stats || globalData
        const cp = gs?.current_pool || globalData?.current_pool
        if (cp) {
          const n = String(cp.up_char_name ?? cp.upCharName ?? '').trim()
          if (n) upCharNames = [n]
          const w = String(cp.up_weapon_name ?? cp.upWeaponName ?? '').trim()
          if (w) upWeaponName = w
        }
      } catch (e) { /* 获取失败不影响记录展示 */ }
    }

    // 抽卡记录按池子：常驻/新手/武器/限定
    const poolList = [
      { key: 'standard', label: '常驻角色' },
      { key: 'beginner', label: '新手池' },
      { key: 'weapon', label: '武器池' },
      { key: 'limited', label: '限定角色' }
    ]
    const [statsData, noteRes, ...poolResults] = await Promise.all([
      hypergryphAPI.getGachaStats(sklUser.framework_token),
      sklUser.sklReq.getData('note').catch(() => null),
      ...poolList.map(({ key }) =>
        hypergryphAPI.getGachaRecords(sklUser.framework_token, { page, limit, pools: key }).catch(() => null)
      )
    ])

    if (!statsData) {
      await this.reply(getMessage('gacha.no_records'))
      return true
    }

    const stats = statsData.stats || {}
    const userInfo = statsData.user_info || {}
    const noteBase = noteRes?.code === 0 ? (noteRes.data?.base || {}) : {}

    // 判断是否为 UP 角色/武器
    const isUpItem = (name, poolKey) => {
      const n = String(name || '').trim()
      if (!n) return false
      if (poolKey === 'limited' && upCharNames.length > 0) {
        return upCharNames.some((u) => n === u || n.includes(u) || u.includes(n))
      }
      if (poolKey === 'weapon' && upWeaponName) {
        return n === upWeaponName || n.includes(upWeaponName) || upWeaponName.includes(n)
      }
      return false
    }

    // 构建每个池子的数据
    const poolSections = poolList.map(({ key, label }, idx) => {
      const rd = poolResults[idx]
      const records = rd?.records || []
      const total = rd?.total ?? 0
      const pages = rd?.pages ?? 1
      return {
        label,
        total,
        page,
        pages,
        hasRecords: total > 0,
        records: records.map((r, i) => {
          const name = r.char_name || r.item_name || '未知'
          const isUp = r.rarity >= 5 && isUpItem(name, key)
          return {
            index: (page - 1) * limit + i + 1,
            rarity: r.rarity,
            starClass: r.rarity === 6 ? 'star6' : r.rarity === 5 ? 'star5' : 'star4',
            name,
            avatar: charAvatarMap[name] || '',
            isUp
          }
        })
      }
    })

    // 渲染模板
    if (this.e?.runtime?.render) {
      try {
        const renderData = {
          title: '抽卡记录',
          totalCount: stats.total_count ?? 0,
          star6: stats.star6_count ?? 0,
          star5: stats.star5_count ?? 0,
          star4: stats.star4_count ?? 0,
          userAvatar: noteBase.avatarUrl || '',
          userNickname: noteBase.name || userInfo.nickname || userInfo.game_uid || '未知',
          userLevel: noteBase.level ?? 0,
          userUid: userInfo.game_uid || noteBase.roleId || '',
          page,
          poolSections,
          pluResPath,
          ...getCopyright()
        }
        const imgSegment = await this.e.runtime.render('endfield-plugin', 'gacha/gacha-record', renderData, { scale: 1.6, retType: 'base64' })
        if (imgSegment) {
          await this.reply(imgSegment)
          return true
        }
      } catch (err) {
        logger.error(`[终末地插件][抽卡记录]渲染图失败: ${err?.message || err}`)
      }
    }

    // 降级纯文本
    let msg = '【抽卡记录】\n'
    msg += `角色：${userInfo.nickname || userInfo.game_uid || '未知'} | ${userInfo.channel_name || ''}\n`
    msg += `总抽数：${stats.total_count ?? 0} | 六星：${stats.star6_count ?? 0} | 五星：${stats.star5_count ?? 0} | 四星：${stats.star4_count ?? 0}\n`
    for (const sec of poolSections) {
      msg += `\n【${sec.label}】共 ${sec.total} 抽\n`
      if (sec.hasRecords) {
        sec.records.forEach((r) => {
          msg += `${r.index}. ★${r.rarity} ${r.name}\n`
        })
      } else {
        msg += '暂无记录\n'
      }
    }
    await this.reply(msg)
    return true
  }

  /** 抽卡分析：不带「同步」则仅用已有数据出图；带「同步」才走同步流程（多账号选择、增量同步、同步完成后出图） */
  async viewGachaAnalysis() {
    const wantsSync = /同步/.test(this.e.msg || '')
    if (!wantsSync) {
      // 不同步：直接拉取当前账号的 stats 并出图，无数据时提示先同步
      const sklUser = new EndfieldUser(this.e.user_id)
      if (!(await sklUser.getUser())) {
        await this.reply(getUnbindMessage())
        return true
      }
      const statsData = await hypergryphAPI.getGachaStats(sklUser.framework_token)
      const hasRecord = statsData?.has_records === true ||
        (statsData?.last_fetch != null && String(statsData.last_fetch).trim() !== '') ||
        ((statsData?.stats?.total_count ?? 0) > 0)
      if (!statsData || !hasRecord) {
        await this.reply(getMessage('gacha.analysis_need_sync'))
        return true
      }
      await this.renderGachaAnalysisAndReply(statsData)
      return true
    }
    await this.reply(getMessage('gacha.analysis_sync_start'))
    return await this.syncGacha({
      afterSyncSendAnalysis: true,
      fromAnalysis: true,
      selectPrompt: getMessage('gacha.select_account_sync')
    })
  }

  /** 根据 statsData 拉取 note/wiki/records 并制图或文字回复（抽卡分析用；同步完成后也会调用）；options.syncMsg 时将文字与图片合并为一条消息；options.targetUserId 指定查询目标用户 */
  async renderGachaAnalysisAndReply(statsData, options = {}) {
    const targetUserId = options.targetUserId || this.e.user_id
    const sklUser = new EndfieldUser(targetUserId)
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

    // 限定池/武器池 UP：优先从 /api/bili-wiki/activities 取 is_active 且解析 description；失败则从全服统计 current_pool 兜底
    let upCharName = ''
    let upCharNames = []
    let upWeaponName = ''
    const biliUp = await this.getCurrentUpFromBiliWiki()
    if (biliUp?.upCharNames?.length) {
      upCharNames = biliUp.upCharNames
      upCharName = biliUp.upCharName || upCharNames.join('、')
      if (biliUp.upWeaponName) upWeaponName = biliUp.upWeaponName
    }
    if (upCharNames.length === 0) {
      try {
        const globalData = await hypergryphAPI.getGachaGlobalStats()
        const stats = globalData?.stats || globalData
        const currentPool = stats?.current_pool || globalData?.current_pool
        if (currentPool) {
          upCharName = String(currentPool.up_char_name ?? currentPool.upCharName ?? '').trim()
          upWeaponName = String(currentPool.up_weapon_name ?? currentPool.upWeaponName ?? '').trim()
        }
        if (!upCharName && stats?.ranking?.limited?.six_star?.length) {
          const first = stats.ranking.limited.six_star[0]
          if (first) {
            upCharName = String(first.char_name ?? '').trim()
          }
        }
      } catch (e) {
        logger.error(`[终末地插件][抽卡分析]获取 current_pool 失败: ${e?.message || e}`)
      }
    }

    /** 根据一组记录构建六星/五星图、垫抽数、指标（角色池/武器池按 pool_name 分组后复用）；isFreePool 时为免费池，会插入「未出」段行。showNotWaiRate 为 true 时仅当池在 bili-wiki activities 且 is_active 时展示不歪率 */
    const buildPoolEntry = (records, opts) => {
      const { isChar, isLimited, noWaiTag, metric2Label, metric2Default, showNotWaiRate, poolUpCharNames, poolUpWeaponName } = opts
      const images = []
      const poolName = records.length > 0 ? (records[0].pool_name || '').trim() || '未知' : '未知'
      // 池子专属 UP：优先使用传入的池子 UP，否则回退到全局当前 UP
      const effectiveUpCharNames = (poolUpCharNames && poolUpCharNames.length > 0) ? poolUpCharNames : (upCharNames.length > 0 ? upCharNames : (upCharName ? [upCharName] : []))
      const effectiveUpWeaponName = (poolUpWeaponName !== undefined && poolUpWeaponName !== null) ? poolUpWeaponName : upWeaponName
      // 判定是否为限定 UP 池：pool_id 含 limited 或有已知 UP 角色
      const isLimitedPool = isLimited || (isChar && effectiveUpCharNames.length > 0)
      const total = records.length
      const isWeapon = !isChar
      const sorted = [...records].sort((a, b) => String(a.seq_id || '').localeCompare(String(b.seq_id || ''), undefined, { numeric: true }))
      // === 分析统计（对齐 endfield-gacha）===
      const countsByRarity = { 6: 0, '6_std': 0, 5: 0, 4: 0 }
      const upSixStarPullsDetail = []
      let analysisPity = 0
      let analysisCumulative = 0
      let analysisHasGotUpBefore120 = false
      for (const r of sorted) {
        analysisPity++
        analysisCumulative++
        if (r.rarity === 6) {
          const cname = String(r.char_name || r.item_name || '').trim()
          let isUp = false
          if (isLimitedPool && !noWaiTag && effectiveUpCharNames.length > 0) {
            isUp = effectiveUpCharNames.some((n) => cname === n || cname.includes(n) || n.includes(cname))
          } else if (isWeapon && effectiveUpWeaponName) {
            isUp = cname === effectiveUpWeaponName || cname.includes(effectiveUpWeaponName) || effectiveUpWeaponName.includes(cname)
          }
          let isSpark = false
          if (isLimited && isUp && analysisCumulative === PITY.charHard && !analysisHasGotUpBefore120) {
            isSpark = true
          }
          if (isUp && analysisCumulative < PITY.charHard) {
            analysisHasGotUpBefore120 = true
          }
          if (isUp) countsByRarity[6]++
          else countsByRarity['6_std']++
          if (isUp) upSixStarPullsDetail.push({ count: analysisPity, isSpark, name: cname })
          analysisPity = 0
        } else if (r.rarity === 5) {
          countsByRarity[5]++
        } else {
          countsByRarity[4]++
        }
      }
      const totalStar6 = countsByRarity[6] + countsByRarity['6_std']
      const star6 = totalStar6
      const sparkCount = upSixStarPullsDetail.filter(p => p.isSpark).length
      // 不歪率
      const analysisWinRate = totalStar6 > 0 ? ((countsByRarity[6] / totalStar6) * 100).toFixed(1) + '%' : '-'
      // 平均UP花费（排除 Spark）
      const upPullsExcludingSpark = upSixStarPullsDetail.filter(p => !p.isSpark)
      const avgUpCost = upPullsExcludingSpark.length > 0
        ? Math.round(upPullsExcludingSpark.reduce((s, p) => s + p.count, 0) / upPullsExcludingSpark.length) + '抽'
        : '-'
      // 每红花费（所有6星，按有效抽数）
      const avgAllCost = totalStar6 > 0 ? Math.round(total / totalStar6) + '抽' : '-'
      // metric2
      let metric2 = metric2Default !== undefined ? (metric2Default ?? totalStar6) : totalStar6
      if (showNotWaiRate && totalStar6 > 0) {
        metric2 = analysisWinRate
      }
      let pullsSinceLast6 = 0
      for (const r of sorted) {
        pullsSinceLast6 += 1
        if (r.rarity === 6) {
          const id = r.char_id || ''
          const name = (r.char_name || r.item_name || '').trim() || id
          const pullCount = pullsSinceLast6
          let tag = ''
          let badgeColor = 'normal'
          // 角色 UP 池：使用池子专属 UP 名称判断（已按池子映射或回退到全局 UP）
          if (isLimitedPool && !noWaiTag && effectiveUpCharNames.length > 0) {
            const charName = String(r.char_name ?? r.item_name ?? '').trim()
            const isUp = effectiveUpCharNames.some((n) => charName === n || charName.includes(n) || n.includes(charName))
            if (!isUp) {
              tag = '歪'
              badgeColor = 'wai'
            } else {
              tag = 'UP'
              badgeColor = 'up'
            }
            // 仅大保底区间（81~120 抽）显示「保底」
            if (pullCount >= PITY.charSoft + 1 && pullCount <= PITY.charHard) {
              tag = '保底'
              badgeColor = 'baodi'
            }
          } else if (isWeapon && (effectiveUpWeaponName || !noWaiTag)) {
            // 星声申领无 UP/歪概念，不显示歪与不歪标签
            const isStarlightPool = poolName && poolName.includes('星声申领')
            if (isStarlightPool) {
              tag = ''
              badgeColor = 'normal'
            } else {
              const isUp = effectiveUpWeaponName && String(name).trim() === effectiveUpWeaponName
              if (pullCount >= PITY.weaponBaodiMin && pullCount <= PITY.weaponBaodiMax) {
                tag = '保底'
                badgeColor = 'baodi'
              } else if (pullCount < PITY.weaponBaodiMin && effectiveUpWeaponName && !isUp) {
                tag = '歪'
                badgeColor = 'wai'
              } else if (pullCount < PITY.weaponBaodiMin && isUp) {
                tag = 'UP'
                badgeColor = 'up'
              }
            }
          }
          const maxPity = isLimited ? PITY.charHard : (isWeapon ? PITY.weaponMax : PITY.charSoft)
          const barPercent = Math.min(100, Math.round((pullCount / maxPity) * 100))
          const colorScale = isWeapon ? PITY.weaponMax : PITY.charSoft
          const colorPercent = Math.min(100, (pullCount / colorScale) * 100)
          const barColorLevel = colorPercent < 50 ? 'green' : colorPercent < 80 ? 'yellow' : 'red'
          const refLinePercent = isLimited ? (PITY.charSoft / PITY.charHard) * 100 : (isWeapon ? 100 : null)
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
      // 有效抽数：剔除最后一次出红之后的垫抽，用于总抽数展示和每红花费计算
      const effectiveTotal = (star6 > 0 && pitySinceLast6 != null) ? total - pitySinceLast6 : total
      // 二级池子内六星记录倒序：刚出的显示在最顶上
      images.reverse()
      return { poolName, total, star6, effectiveTotal, metric2, images, pitySinceLast6, counts: countsByRarity, winRate: analysisWinRate, avgUpCost, avgAllCost, sparkCount }
    }

    /** 从免费记录中提取 6 星图片（标记「免费」），用于追加到对应池子的 images 中 */
    const buildFreeStarImages = (freeRecords, isChar) => {
      const imgs = []
      for (const r of freeRecords) {
        if (r.rarity !== 6) continue
        const id = r.char_id || ''
        const name = (r.char_name || r.item_name || '').trim() || id
        if (isChar) {
          const info = noteCharMap[id] || noteCharMap[name]
          if (info) imgs.push({ name: info.name, url: info.url, pullCount: '免费', tag: '免费', badgeColor: 'free', barPercent: 0, barColorLevel: 'green', refLinePercent: null })
        } else {
          const cover = weaponCoverMap[name]
          if (cover) imgs.push({ name, url: cover, pullCount: '免费', tag: '免费', badgeColor: 'free', barPercent: 0, barColorLevel: 'green', refLinePercent: null })
        }
      }
      return imgs
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
    const charFreeByPoolName = {}
    for (const r of charRecords) {
      const name = (r.pool_name || '').trim() || '未知'
      if (r.is_free === true) {
        if (!charFreeByPoolName[name]) charFreeByPoolName[name] = []
        charFreeByPoolName[name].push(r)
        continue
      }
      if (!charByPoolName[name]) charByPoolName[name] = []
      charByPoolName[name].push(r)
    }
    const charPoolEntries = []
    const charPoolNames = Object.keys(charByPoolName).sort()
    const matchActivePool = (poolName, activeName) =>
      activeName && (poolName === activeName || poolName.includes(activeName) || activeName.includes(poolName))
    // 所有池子的 UP 映射（含历史池子），用于按池子匹配 UP
    const poolUpMap = biliUp?.poolUpMap || {}
    for (const subPoolName of charPoolNames) {
      const groupRecords = charByPoolName[subPoolName]
      const firstPoolId = (groupRecords[0]?.pool_id || '').toLowerCase()
      const isLimited = firstPoolId.includes('limited')
      const noWaiTag = firstPoolId.includes('standard') || firstPoolId.includes('beginner')
      // 从 poolUpMap 获取该池子的 UP 角色名（支持历史池子）
      const poolSpecificUp = poolUpMap[subPoolName]
      const poolUpChars = poolSpecificUp ? [poolSpecificUp] : null
      const metric1Label = (isLimited || poolUpChars) ? '平均UP花费' : '每红花费'
      const showNotWaiRate = !!matchActivePool(subPoolName, biliUp?.activeCharPoolName)
      const metric2Label = showNotWaiRate ? '不歪率' : '出红数'
      const metric2Default = showNotWaiRate ? '-' : null
      const entry = buildPoolEntry(groupRecords, {
        isChar: true,
        isLimited,
        noWaiTag,
        metric2Label,
        metric2Default,
        showNotWaiRate,
        poolUpCharNames: poolUpChars
      })
      const pityPct = entry.pitySinceLast6 != null ? Math.min(100, (entry.pitySinceLast6 / PITY.charSoft) * 100) : 0
      const pityBarColorLevel = pityPct < 50 ? 'green' : pityPct < 80 ? 'yellow' : 'red'
      // 获取该池子的免费记录数，并提取免费抽中的 6 星图片
      const freeRecords = charFreeByPoolName[subPoolName] || []
      const freeStarImgs = buildFreeStarImages(freeRecords, true)
      const mergedImages = [...entry.images, ...freeStarImgs]
      // 总抽数展示含已垫抽数；每红花费按有效抽数（不含垫抽）计算
      charPoolEntries.push({
        poolName: entry.poolName,
        total: entry.total,
        star6: entry.star6,
        metric1: (isLimited || poolUpChars) ? entry.avgUpCost : fmtCost(entry.effectiveTotal ?? entry.total, entry.star6),
        metric1Label,
        metric2: entry.metric2,
        metric2Label,
        images: mergedImages,
        pitySinceLast6: entry.pitySinceLast6,
        pityBarPercent: entry.pitySinceLast6 != null ? Math.min(100, Math.round((entry.pitySinceLast6 / PITY.charSoft) * 100)) : 0,
        pityBarColorLevel,
        freeTotal: freeRecords.length,
        freeBarPercent: freeRecords.length > 0 ? Math.min(100, Math.round((freeRecords.length / 10) * 100)) : 0,
        counts: entry.counts,
        winRate: entry.winRate,
        sparkCount: entry.sparkCount
      })
    }

    // UP 池垫抽数继承：上一 UP 池的垫抽合并到当前 UP 池显示
    const upEntryIndices = []
    for (let i = 0; i < charPoolEntries.length; i++) {
      if (poolUpMap[charPoolEntries[i].poolName]) upEntryIndices.push(i)
    }
    if (upEntryIndices.length >= 2) {
      // 按记录时间排序（max seq_id 最大的为最新池子）
      const getMaxSeqId = (poolName) => {
        const records = charByPoolName[poolName] || []
        let maxSeq = ''
        for (const r of records) {
          const s = String(r.seq_id || '')
          if (s > maxSeq) maxSeq = s
        }
        return maxSeq
      }
      upEntryIndices.sort((a, b) => {
        const seqA = getMaxSeqId(charPoolEntries[a].poolName)
        const seqB = getMaxSeqId(charPoolEntries[b].poolName)
        return seqA.localeCompare(seqB, undefined, { numeric: true })
      })
      const newestIdx = upEntryIndices[upEntryIndices.length - 1]
      const previousIdx = upEntryIndices[upEntryIndices.length - 2]
      const newestEntry = charPoolEntries[newestIdx]
      const previousEntry = charPoolEntries[previousIdx]
      const previousPity = previousEntry.pitySinceLast6 || 0
      // 上一 UP 池的垫抽不再单独显示（已继承或已消耗）
      previousEntry.pitySinceLast6 = null
      previousEntry.pityBarPercent = 0
      // 当前 UP 池未出过六星时，继承上一 UP 池的垫抽（蓝色显示）
      if (newestEntry.star6 === 0 && previousPity > 0) {
        const ownPity = newestEntry.pitySinceLast6 || 0
        newestEntry.inheritedPity = previousPity
        newestEntry.pitySinceLast6 = previousPity + ownPity
        newestEntry.pityBarPercent = Math.min(100, Math.round((newestEntry.pitySinceLast6 / PITY.charSoft) * 100))
        newestEntry.inheritedPityPercent = newestEntry.pitySinceLast6 > 0 ? Math.round((previousPity / newestEntry.pitySinceLast6) * 100) : 0
        const pityPct = (newestEntry.pitySinceLast6 / PITY.charSoft) * 100
        newestEntry.pityBarColorLevel = pityPct < 50 ? 'green' : pityPct < 80 ? 'yellow' : 'red'
      }
    }
    // 角色池倒序：最新 UP 池在最上面
    charPoolEntries.reverse()

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
    const weaponPoolNames = Object.keys(weaponByPoolName).sort()
    for (const subPoolName of weaponPoolNames) {
      const groupRecords = weaponByPoolName[subPoolName]
      const showNotWaiRate = !!matchActivePool(subPoolName, biliUp?.activeWeaponPoolName)
      const metric2Label = showNotWaiRate ? '不歪率' : '出红数'
      // 从 poolUpMap 获取该池子的 UP 武器名（支持历史池子）
      const poolSpecificWeaponUp = poolUpMap[subPoolName] || null
      const entry = buildPoolEntry(groupRecords, {
        isChar: false,
        isLimited: false,
        noWaiTag: false,
        metric2Label,
        metric2Default: showNotWaiRate ? '-' : null,
        showNotWaiRate,
        poolUpWeaponName: poolSpecificWeaponUp
      })
      // 获取该池子的免费记录数，并提取免费抽中的 6 星图片
      const wFreeRecords = weaponFreeByPoolName[subPoolName] || []
      const wFreeStarImgs = buildFreeStarImages(wFreeRecords, false)
      const wMergedImages = [...entry.images, ...wFreeStarImgs]
      weaponPoolEntries.push({
        poolName: entry.poolName,
        total: entry.total,
        star6: entry.star6,
        metric1: entry.avgAllCost,
        metric1Label: '每红花费',
        metric2: entry.metric2,
        metric2Label,
        images: wMergedImages,
        pitySinceLast6: null, // 武器池无垫抽概念，不显示已垫
        pityBarPercent: 0,
        pityBarColorLevel: 'green',
        freeTotal: wFreeRecords.length,
        freeBarPercent: wFreeRecords.length > 0 ? Math.min(100, Math.round((wFreeRecords.length / 10) * 100)) : 0,
        counts: entry.counts,
        winRate: entry.winRate,
        sparkCount: entry.sparkCount
      })
    }
    // 武器池倒序：熔铸、星声等
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
        // 统计概览数据
        const overallStats = statsData.stats || {}
        const limited = getPool('limited_char', 'limited')
        const standard = getPool('standard_char', 'standard')
        const beginner = getPool('beginner_char', 'beginner')
        const weapon = getPool('weapon', 'weapon')
        const baseOpt = { scale: 1.6, retType: 'base64' }
        const renderData = {
          title: '抽卡分析',
          subtitle: `${userNickname} · ${userInfo.channel_name || ''}`,
          userAvatar,
          userNickname,
          userUid,
          analysisTime,
          totalCount: overallStats.total_count ?? 0,
          star6: overallStats.star6_count ?? 0,
          star5: overallStats.star5_count ?? 0,
          star4: overallStats.star4_count ?? 0,
          limitedTotal: limited.total ?? 0,
          standardTotal: standard.total ?? 0,
          beginnerTotal: beginner.total ?? 0,
          weaponTotal: weapon.total ?? 0,
          poolGroups,
          syncHint: `若需要刷新，发送 :抽卡分析同步`,
          pluResPath,
          ...getCopyright()
        }
        const imgSegment = await this.e.runtime.render('endfield-plugin', 'gacha/gacha-analysis', renderData, baseOpt)
        if (imgSegment) {
          if (options.syncMsg) {
            // 同步完成文字 + 分析图合并为一条消息发送
            await this.reply([options.syncMsg + '\n', imgSegment], false, { at: !!this.e.isGroup })
          } else {
            await this.reply(imgSegment)
          }
          await redis.set(GACHA_KEYS.lastAnalysis(this.e.user_id), String(Date.now()), { EX: 900 })
          return true
        }
      } catch (err) {
        logger.error(`[终末地插件][抽卡分析]渲染图失败: ${err?.message || err}`)
      }
    }

    let msg = options.syncMsg ? options.syncMsg + '\n\n' : ''
    msg += '【抽卡分析】\n'
    msg += `角色：${userInfo.nickname || userInfo.game_uid || '未知'} · ${userInfo.channel_name || ''}\n`
    for (const group of poolGroups) {
      for (const p of group.pools) {
        msg += `${group.label} · ${p.poolName}：${p.total} 抽 | ${p.metric1Label} ${p.metric1} | ${p.metric2Label} ${p.metric2}\n`
      }
    }
    msg += `查看最近记录：${prefix}抽卡记录`
    await this.reply(msg, false, options.syncMsg ? { at: !!this.e.isGroup } : {})
    await redis.set(GACHA_KEYS.lastAnalysis(this.e.user_id), String(Date.now()), { EX: 900 })
    return true
  }

  /** 同步完成后调用：拉取最新 stats 并制图发送抽卡分析；syncMsg 非空时与图片合并为一条消息；targetUserId 指定查询目标用户 */
  async renderAndSendGachaAnalysis(syncMsg, targetUserId) {
    const uid = targetUserId || this.e.user_id
    const sklUser = new EndfieldUser(uid)
    if (!(await sklUser.getUser())) {
      if (syncMsg) await this.reply(syncMsg, false, { at: !!this.e.isGroup })
      return
    }
    const statsData = await hypergryphAPI.getGachaStats(sklUser.framework_token)
    if (!statsData) {
      if (syncMsg) await this.reply(syncMsg, false, { at: !!this.e.isGroup })
      return
    }
    const opts = { targetUserId: uid }
    if (syncMsg) opts.syncMsg = syncMsg
    await this.renderGachaAnalysisAndReply(statsData, opts)
  }

  getCmdPrefix() {
    return ':'
  }

  /** 将后端返回的 {qqname}、{qq号} 替换为当前用户昵称与 QQ 号，用于控制台日志 */
  formatProgressMsg(msg, userId, qqName) {
    if (!msg || typeof msg !== 'string') return msg
    const uid = userId != null ? String(userId) : ''
    const name = qqName != null && qqName !== '' ? String(qqName) : uid || '用户'
    return msg.replace(/\{qq号\}/g, uid).replace(/\{qqname\}/g, name)
  }

  /** 全服抽卡统计：常驻/新手/武器/限定四类卡池均展示；顶部 UP 与限定池可切换期数，发送「:全服抽卡统计 <干员名>」切换为该干员对应期 */
  async globalGachaStats() {
    const pluResPath = this.e?.runtime?.path?.plugin?.['endfield-plugin']?.res || ''
    const msg = (this.e.msg || '').trim()
    const charNameMatch = msg.match(/(?:[:：]|#zmd|#终末地)全服抽卡统计\s*(.*)$/)
    const charName = (charNameMatch && charNameMatch[1] ? charNameMatch[1].trim() : '') || ''

    let data = await hypergryphAPI.getGachaGlobalStats()
    if (!data?.stats) {
      await this.reply(getMessage('gacha.global_stats_failed'))
      return true
    }

    let periodLabel = '当期UP'
    if (charName) {
      const periods = data.stats.pool_periods || []
      const found = periods.find((p) => {
        const names = p.up_char_names || []
        const poolName = (p.pool_name || '').trim()
        return names.some((n) => (String(n || '').trim() === charName || (n || '').includes(charName) || charName.includes(n))) ||
          poolName === charName || poolName.includes(charName) || charName.includes(poolName)
      })
      if (!found) {
        await this.reply(getMessage('gacha.global_stats_pool_not_found', { name: charName }))
        return true
      }
      data = await hypergryphAPI.getGachaGlobalStats(found.pool_name)
      if (!data?.stats) {
        await this.reply(getMessage('gacha.global_stats_failed'))
        return true
      }
      periodLabel = found.pool_name
    } else {
      const currentPoolName = data.stats.current_pool?.pool_name
      if (currentPoolName) {
        data = await hypergryphAPI.getGachaGlobalStats(currentPoolName)
        if (data?.stats) periodLabel = '当期UP'
      }
    }

    const s = data.stats
    const totalPulls = s.total_pulls ?? 0
    const totalUsers = s.total_users ?? 0
    const star6 = s.star6_total ?? 0
    const star5 = s.star5_total ?? 0
    const star4 = s.star4_total ?? 0
    const avgPity = s.avg_pity != null ? Number(s.avg_pity).toFixed(2) : '-'
    const pool = s.current_pool
    const biliUp = await this.getCurrentUpFromBiliWiki()
    const upName = (pool?.up_char_name || (pool?.up_char_names && pool.up_char_names[0]) || (biliUp?.upCharName && biliUp.upCharName.trim()) || '-').trim()
    const upCharNames = (pool?.up_char_names && pool.up_char_names.length) ? pool.up_char_names : (biliUp?.upCharNames?.length ? biliUp.upCharNames : [upName].filter(Boolean))
    const upCharId = pool?.up_char_id || ''
    const byChannel = s.by_channel
    const officialRaw = byChannel?.official
    const bilibiliRaw = byChannel?.bilibili
    const fmt = (v) => (v != null ? Number(v).toFixed(2) : '-')
    const formatSyncTime = (cached, lastUpdate) => {
      if (cached === true) return '缓存约5分钟'
      if (!lastUpdate) return '刚刚'
      try {
        const d = new Date(lastUpdate)
        if (Number.isNaN(d.getTime())) return String(lastUpdate)
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
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
    const upEntry = rankingLimited.find((r) => r.char_id === upCharId) ??
      (upCharNames.length > 0 ? rankingLimited.find((r) => upCharNames.some((n) => (r.char_name || '') === n || (r.char_name || '').includes(n))) : null) ??
      rankingLimited.find((r) => r.char_name === upName)
    const upWinRatePercent = (upEntry?.percent != null ? Number(upEntry.percent).toFixed(1) : '--.-')
    const upWinRateNum = (upEntry?.percent != null ? Math.min(100, Math.max(0, Number(upEntry.percent))) : 0)
    const upWeaponNameStr = (pool?.up_weapon_name && pool.up_weapon_name.trim()) ? pool.up_weapon_name.trim() : (biliUp?.upWeaponName && biliUp.upWeaponName.trim() ? biliUp.upWeaponName.trim() : '')
    const rankingWeapon = s.ranking?.weapon?.six_star || []
    const upWeaponEntry = upWeaponNameStr ? rankingWeapon.find((r) => {
      const n = (r.char_name || '').trim()
      return n === upWeaponNameStr || n.includes(upWeaponNameStr) || upWeaponNameStr.includes(n)
    }) : null
    const upWeaponWinRatePercent = (upWeaponEntry?.percent != null ? Number(upWeaponEntry.percent).toFixed(1) : '--.-')
    const upWeaponWinRateNum = (upWeaponEntry?.percent != null ? Math.min(100, Math.max(0, Number(upWeaponEntry.percent))) : 0)
    const isUpChar = (r) => {
      if (upCharNames.length > 0) return upCharNames.some((n) => (r.char_name || '') === n || (r.char_name || '').includes(n))
      return !!(upCharId && r.char_id === upCharId)
    }
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
      return (sixStar || []).map((r) => ({
        char_name: r.char_name || '-',
        count: r.count ?? 0,
        percent: (r.percent != null ? Number(r.percent).toFixed(1) : '0'),
        isUp: isLimited && isUpChar(r)
      }))
    }

    if (this.e?.runtime?.render) {
      try {
        const buildPoolSection = (key, label, rankTop = 5) => {
          const poolData = byType[key] || {}
          const poolTotal = poolData.total ?? 0
          const poolStar6 = poolData.star6 ?? 0
          const pAvgPity = poolData.avg_pity != null ? Number(poolData.avg_pity).toFixed(1) : '-'
          const pStar6Rate = poolTotal > 0 ? ((poolStar6 / poolTotal) * 100).toFixed(2) + '%' : '0%'
          const rankingList6 = buildRankingList(s.ranking?.[key]?.six_star || [], key === 'limited').slice(0, rankTop)
          const rankingList5 = buildRankingList(s.ranking?.[key]?.five_star || [], false).slice(0, rankTop)
          return {
            label, key,
            total: poolTotal, star6: poolStar6, star5: poolData.star5 ?? 0, star4: poolData.star4 ?? 0,
            avgPity: pAvgPity, star6Rate: pStar6Rate,
            distributionList: buildDistributionList(poolData.distribution),
            showRanking: true, rankingList6, rankingList5,
            rankingTab6: key === 'weapon' ? '6星武器' : '6星干员',
            rankingTab5: key === 'weapon' ? '5星武器' : '5星干员'
          }
        }
        const standardSec = buildPoolSection('standard', '常驻角色')
        const beginnerSec = buildPoolSection('beginner', '新手池')
        beginnerSec.showRanking = false
        const weaponSec = buildPoolSection('weapon', '武器池')
        const limitedSec = buildPoolSection('limited', periodLabel === '当期UP' ? '限定 · 当期UP' : `限定 · ${periodLabel}`, 10)
        const poolSections = [beginnerSec, standardSec, weaponSec, limitedSec]

        const renderData = {
          title: '全服寻访统计',
          periodLabel,
          syncTime,
          totalPulls,
          totalUsers,
          star6,
          globalAvgPity: s.avg_pity != null ? Number(s.avg_pity).toFixed(2) : '-',
          showUpBlock: !!(upName && upName !== '-') || !!(upWeaponNameStr && upWeaponNameStr !== ''),
          upName,
          upWeaponName: upWeaponNameStr,
          upWinRate: upWinRatePercent + '%',
          upWinRateNum,
          upWeaponWinRate: upWeaponWinRatePercent + '%',
          upWeaponWinRateNum,
          official,
          bilibili,
          poolSections,
          pluResPath,
          periodHint: '发送 :全服抽卡统计 <干员名> 可查看其他期数',
          ...getCopyright()
        }
        const imgSegment = await this.e.runtime.render('endfield-plugin', 'gacha/global-stats', renderData, { scale: 1.6, retType: 'base64' })
        if (imgSegment) {
          await this.reply(imgSegment)
          return true
        }
      } catch (err) {
        logger.error(`[终末地插件][全服抽卡统计]渲染图失败: ${err?.message || err}`)
      }
    }

    let text = '【全服抽卡统计】'
    if (periodLabel !== '当期UP') text += ` · ${periodLabel}`
    text += '\n'
    text += `总抽数：${totalPulls} | 统计用户：${totalUsers}\n`
    text += `六星：${star6} | 五星：${star5} | 四星：${star4} | 平均出货：${avgPity} 抽\n`
    text += `当前UP：${upName}\n`
    if (officialRaw || bilibiliRaw) {
      if (officialRaw) text += `官服：${officialRaw.total_users ?? 0} 人，${officialRaw.total_pulls ?? 0} 抽，均出 ${fmt(officialRaw.avg_pity)}\n`
      if (bilibiliRaw) text += `B服：${bilibiliRaw.total_users ?? 0} 人，${bilibiliRaw.total_pulls ?? 0} 抽，均出 ${fmt(bilibiliRaw.avg_pity)}\n`
    }
    text += '\n发送 :全服抽卡统计 <干员名> 可查看其他期数\n'
    if (data.cached === true) text += '（缓存约 5 分钟）'
    else if (data.last_update) text += `更新时间：${data.last_update}`
    await this.reply(text)
    return true
  }

  /** 同步全部抽卡：管理员专用，为所有已绑定用户触发抽卡同步（仅发起请求，不轮询等待）；账号间间隔约 3 秒避免并发过高 */
  async syncAllGacha() {
    if (!this.e?.isMaster) return false
    if (!redis) {
      await this.reply(getMessage('gacha.no_accounts'))
      return true
    }
    let keys = []
    try {
      keys = await redis.keys('ENDFIELD:USER:*')
    } catch (err) {
      logger.error(`[终末地插件][同步全部抽卡] redis.keys 失败: ${err?.message || err}`)
      await this.reply(getMessage('gacha.sync_all_get_users_failed'))
      return true
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
    if (tasks.length === 0) {
      await this.reply(getMessage('gacha.sync_all_no_accounts'))
      return true
    }
    let triggered = 0
    let skipped = 0
    for (let i = 0; i < tasks.length; i++) {
      if (i > 0) await this.sleep(3000)
      const { token, accountUid, roleId } = tasks[i]
      const statusData = await hypergryphAPI.getGachaSyncStatus(token)
      if (statusData?.status === 'syncing') {
        skipped++
        continue
      }
      const body = {}
      if (accountUid) body.account_uid = accountUid
      if (roleId) body.role_id = roleId
      const res = await hypergryphAPI.postGachaFetch(token, body)
      if (res?.status === 'conflict') skipped++
      else if (res?.status) triggered++
    }
    const skippedText = skipped > 0 ? `，跳过（进行中/冲突）${skipped} 个` : ''
    await this.reply(getMessage('gacha.sync_all_done', { triggered, skipped_text: skippedText }))
    return true
  }

  /** 抽卡记录同步入口：获取账号列表 → 多账号则让用户选择 → 启动同步 → 轮询状态（群聊/私聊均可）；options.afterSyncSendAnalysis 为 true 时同步完成后会制图发送抽卡分析 */
  async syncGacha(options = {}) {
    const targetInfo = await this.resolveSyncTarget(options)
    if (!targetInfo) return true
    if (targetInfo.error) {
      await this.reply(targetInfo.error)
      return true
    }
    if (targetInfo.requiresMaster && !this.e?.isMaster) {
      return false
    }
    const targetUserId = targetInfo.userId
    const sklUser = new EndfieldUser(targetUserId)
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
      let msg = (options?.selectPrompt || getMessage('gacha.select_account_sync')) + '\n'
      accounts.forEach((acc, i) => {
        msg += `${i + 1}. ${acc.channel_name || '未知'} - ${acc.nick_name || acc.game_uid || acc.uid}\n`
      })
      msg += getMessage('gacha.reply_index')
      await this.reply(msg)
      await redis.set(GACHA_KEYS.pending(this.e.user_id), JSON.stringify({
        accounts,
        token,
        target_user_id: String(targetUserId),
        timestamp: Date.now(),
        afterSyncSendAnalysis: options?.afterSyncSendAnalysis,
        fromAnalysis: options?.fromAnalysis
      }), { EX: 300 })
      return true
    }

    const selectedUid = accounts[0]?.uid || null
    const roleId = sklUser.endfield_uid ? String(sklUser.endfield_uid) : null
    const qqName = this.e.sender?.nickname || this.e.sender?.card || String(this.e.user_id)
    await this.startFetchAndPoll(token, selectedUid, roleId, targetUserId, qqName, {
      afterSyncSendAnalysis: options?.afterSyncSendAnalysis,
      fromAnalysis: options?.fromAnalysis
    })
    return true
  }

  async resolveSyncTarget(options = {}) {
    const atUser = this.e?.at
    const msg = (this.e.msg || '').trim()
    const match = msg.match(/(?:抽卡分析)(?:同步)?\s*(\d+)/)
    if (!atUser && !match) {
      return { userId: String(this.e.user_id), requiresMaster: false }
    }
    if (!this.e?.isMaster) {
      return { error: getMessage('gacha.sync_master_only') }
    }
    if (atUser) {
      return { userId: String(atUser), requiresMaster: true }
    }
    const roleId = match[1]
    if (!redis) return { error: getMessage('gacha.no_accounts') }
    try {
      const keys = await redis.keys('ENDFIELD:USER:*')
      for (const key of keys) {
        const raw = await redis.get(key)
        if (!raw) continue
        let accounts = []
        try {
          const parsed = JSON.parse(raw)
          accounts = Array.isArray(parsed) ? parsed : [parsed]
        } catch {
          continue
        }
        if (accounts.some((acc) => String(acc?.role_id || '') === roleId)) {
          return { userId: key.replace('ENDFIELD:USER:', ''), requiresMaster: true }
        }
      }
    } catch (err) {
      logger.error(`[终末地插件][抽卡同步] 解析平台 userid 失败: ${err}`)
    }
    return { error: getMessage('gacha.no_accounts') }
  }

  /** 用户回复序号选择账号后启动同步并轮询（以 Redis pending 为准，群聊/私聊均可） */
  async receiveGachaSelect() {
    const raw = await redis.get(GACHA_KEYS.pending(this.e.user_id))
    if (!raw) return false // 无待选状态时不消费消息，让其他插件处理
    let data
    try {
      data = JSON.parse(raw)
    } catch {
      await redis.del(GACHA_KEYS.pending(this.e.user_id))
      return true
    }
    const msg = (this.e.msg || '').trim().replace(/^(?:[:：]|#zmd|#终末地)\s*/, '')
    const index = parseInt(msg, 10)
    if (!Number.isFinite(index) || index < 1 || index > (data.accounts?.length || 0)) {
      await this.reply(getMessage('gacha.invalid_index'))
      return true
    }
    await redis.del(GACHA_KEYS.pending(this.e.user_id))
    await this.reply(getMessage('gacha.account_selected'))
    const account = data.accounts[index - 1]
    const selectedUid = account?.uid || null
    const targetUserId = data.target_user_id || this.e.user_id
    const sklUser = new EndfieldUser(targetUserId)
    const roleId = (await sklUser.getUser()) && sklUser.endfield_uid ? String(sklUser.endfield_uid) : null
    const qqName = this.e.sender?.nickname || this.e.sender?.card || String(this.e.user_id)
    await this.startFetchAndPoll(data.token, selectedUid, roleId, targetUserId, qqName, {
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
      while (Date.now() - start < SYNC_MS.pollTimeout) {
        await this.sleep(SYNC_MS.pollInterval)
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
          const syncDoneMsg = getMessage('gacha.sync_done', {
            records_found: total,
            new_records: added,
            pool_detail: poolLine
          })
          // 同步完成文字 + 分析图始终合并为一条消息发送
          await this.renderAndSendGachaAnalysis(syncDoneMsg, userId)
          return
        }
        if (status === 'failed') {
          await this.reply(getMessage('gacha.sync_failed', { error: error || message || '未知错误' }))
          return
        }
      }
      if (Number.isFinite(SYNC_MS.pollTimeout)) {
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
  }

  sleep(ms) {
    return new Promise((r) => setTimeout(r, ms))
  }
}
