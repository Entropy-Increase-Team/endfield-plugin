import { getUnbindMessage, getMessage } from '../utils/common.js'
import common from '../../../lib/common/common.js'
import EndfieldUser from '../model/endfieldUser.js'
import setting from '../utils/setting.js'
import { getCopyright } from '../utils/copyright.js'

export class EndfieldArea extends plugin {
  constructor() {
    super({
      name: '[endfield-plugin]建设',
      dsc: '终末地地区建设与帝江号建设',
      event: 'message',
      priority: 50,
      rule: [
        {
          reg: '^(?:[:：]|[/#](?:zmd|终末地))地区建设$',
          fnc: 'getArea'
        },
        {
          reg: '^(?:[:：]|[/#](?:zmd|终末地))地区(收集|探索)$',
          fnc: 'getArea'
        },
        {
          reg: '^(?:[:：]|[/#](?:zmd|终末地))帝江号建设$',
          fnc: 'getSpaceship'
        }
      ]
    })
  }

  // ==================== 通用工具函数 - 金额转万单位 ====================
  /**
   * 格式化金额为万单位
   * @param {string|number} money - 原始金额
   * @returns {string} 格式化后的金额文本
   */
  formatMoneyToWan(money) {
    // 空值、非数字直接返回原内容
    if (money === '' || money == null || isNaN(Number(money))) {
      return String(money ?? '')
    }
    // 转换为数字并除以10000，保留2位小数后去掉末尾无意义的0
    const moneyInWan = (Number(money) / 10000).toFixed(2)
    return parseFloat(moneyInWan) + '万'
  }

  // ==================== 地区建设 ====================
  async getArea() {
    const userId = this.e.at || this.e.user_id
    const sklUser = new EndfieldUser(userId)

    if (!await sklUser.getUser()) {
      await this.reply(getUnbindMessage())
      return true
    }

    await this.reply(getMessage('area.loading'))

    try {
      // 并行获取地区数据、用户基础信息、干员列表（用于派驻角色头像）
      const [zoneData, noteRes, cardDetailRes] = await Promise.all([
        this.fetchZoneData(sklUser),
        sklUser.sklReq.getData('note', {
          roleId: String(sklUser.endfield_uid || ''),
          serverId: sklUser.server_id || 1
        }).catch(() => null),
        sklUser.sklReq.getData('endfield_card_detail', {
          roleId: String(sklUser.endfield_uid || ''),
          serverId: sklUser.server_id || 1
        }).catch(() => null)
      ])
      if (!zoneData) return true

      const { zones } = zoneData
      // 用户基础信息（用于渲染顶部）
      const userBase = noteRes?.code === 0 ? (noteRes.data?.base || {}) : {}

      // 从 card/detail 构建 charId → 名字/头像 映射（domain 接口的 charNameMap 可能为空）
      const charInfoMap = {}
      let cardBase = null
      if (cardDetailRes?.code === 0) {
        const detail = cardDetailRes.data?.detail || {}
        cardBase = detail.base || null
        const detailChars = detail.chars || []
        for (const char of detailChars) {
          const c = char.charData || char
          const charId = char.id || char.instId || ''
          if (charId) {
            charInfoMap[charId] = {
              name: c.name || '',
              avatar: c.avatarRtUrl || ''
            }
          }
        }
      }
      if (!zones || zones.length === 0) {
        await this.reply(getMessage('area.not_found_info'))
        return true
      }

      // 构建各地区渲染数据
      const getCountPair = (value) => {
        if (value == null) return { count: 0, total: 0 }
        if (typeof value === 'object') {
          return {
            count: Number(value.count ?? 0) || 0,
            total: Number(value.total ?? 0) || 0
          }
        }
        const num = Number(value) || 0
        return { count: num, total: 0 }
      }

      const formatCountText = (count, total) => (total > 0 ? `${count}/${total}` : `${count}`)

      const formatMoneyText = (moneyMgr) => {
        if (moneyMgr == null || moneyMgr === '') return ''
        if (typeof moneyMgr === 'object') {
          const count = moneyMgr.count ?? ''
          const total = moneyMgr.total ?? ''
          if (count === '' && total === '') return ''
          // 格式化count和total为万单位
          const formattedCount = this.formatMoneyToWan(count)
          const formattedTotal = this.formatMoneyToWan(total)
          if (count !== '' && total !== '') return `${formattedCount}/${formattedTotal}`
          return String(count !== '' ? formattedCount : formattedTotal)
        }
        // 格式化普通数值为万单位
        return this.formatMoneyToWan(moneyMgr)
      }

      const zoneList = zones.map((zone) => {
        const zoneName = zone.zoneName || zone.zoneId || '未知'
        // 根据地区名称选择总调度券图标
        let moneyIcon = ''
        if (zoneName.includes('四号谷地')) {
          moneyIcon = 'moneysihaogudi.png'
        } else if (zoneName.includes('武陵')) {
          moneyIcon = 'moneywuling.png'
        }
        const charNameMap = zone.charNameMap || {}
        const officerAvatarMap = zone.officerAvatarMap || {}
        const settlements = (zone.settlements || []).map((s) => {
          const rawIds = s.officerCharIds ?? ''
          const officerIds = Array.isArray(rawIds)
            ? rawIds.map(String).map((id) => id.trim()).filter(Boolean)
            : String(rawIds).split(',').map((id) => id.trim()).filter(Boolean)
          const charId = officerIds[0] || ''
          // 优先用 domain 接口的 charNameMap/头像，为空则从 card/detail 获取
          const officerName = (charId && charNameMap?.[charId]) || charInfoMap[charId]?.name || ''
          const officerAvatar = s.officerCharAvatar || officerAvatarMap?.[charId] || charInfoMap[charId]?.avatar || ''
          const remainMoney = s.remainMoney ?? ''
          const moneyMax = s.moneyMax ?? ''
          // 格式化剩余资金和最大资金为万单位
          const formattedRemainMoney = this.formatMoneyToWan(remainMoney)
          const formattedMoneyMax = this.formatMoneyToWan(moneyMax)
          const remainMoneyText = (remainMoney !== '' && moneyMax !== '')
            ? `${formattedRemainMoney}/${formattedMoneyMax}`
            : String(remainMoney !== '' ? formattedRemainMoney : formattedMoneyMax || '')
          const remainMoneyNum = Number(remainMoney)
          const moneyMaxNum = Number(moneyMax)
          const remainMoneyPercent = (Number.isFinite(remainMoneyNum) && moneyMaxNum > 0)
            ? Math.max(0, Math.min(100, (remainMoneyNum / moneyMaxNum) * 100))
            : 0
          return {
            id: s.id || '', // 新增：传递聚落id到渲染数据
            name: s.name || s.id || '未知',
            level: s.level ?? 0,
            officerName,
            officerAvatar,
            remainMoneyText,
            remainMoneyPercent
          }
        })
        const collectionSource = (Array.isArray(zone.collections) && zone.collections.length > 0)
          ? zone.collections
          : (Array.isArray(zone.levels) ? zone.levels : [])
        let totalChest = 0
        let totalChestAll = 0
        let totalPuzzle = 0
        let totalPuzzleAll = 0
        let totalBlackbox = 0
        let totalBlackboxAll = 0
        let totalEquip = 0
        let totalEquipAll = 0
        let totalPiece = 0
        let totalPieceAll = 0
        for (const c of collectionSource) {
          const chest = getCountPair(c.trchestCount)
          const puzzle = getCountPair(c.puzzleCount)
          const blackbox = getCountPair(c.blackboxCount)
          const equip = getCountPair(c.equipTrchestCount)
          const piece = getCountPair(c.pieceCount)
          totalChest += chest.count
          totalChestAll += chest.total
          totalPuzzle += puzzle.count
          totalPuzzleAll += puzzle.total
          totalBlackbox += blackbox.count
          totalBlackboxAll += blackbox.total
          totalEquip += equip.count
          totalEquipAll += equip.total
          totalPiece += piece.count
          totalPieceAll += piece.total
        }
        // 按关卡维度构建资源收集明细
        const levelsSource = Array.isArray(zone.levels) && zone.levels.length > 0
          ? zone.levels
          : collectionSource
        const levelStats = levelsSource.map((lv) => {
          const levelId = lv.levelId || ''
          const name = lv.name || levelId || '未知'
          const chest = getCountPair(lv.trchestCount)
          const puzzle = getCountPair(lv.puzzleCount)
          const blackbox = getCountPair(lv.blackboxCount)
          const equip = getCountPair(lv.equipTrchestCount)
          const piece = getCountPair(lv.pieceCount)
          return {
            name,
            chestText: formatCountText(chest.count, chest.total),
            puzzleText: formatCountText(puzzle.count, puzzle.total),
            blackboxText: formatCountText(blackbox.count, blackbox.total),
            equipText: formatCountText(equip.count, equip.total),
            pieceText: formatCountText(piece.count, piece.total)
          }
        })
        const moneyText = formatMoneyText(zone.moneyMgr)
        return {
          zoneName,
          level: zone.level ?? 0,
          moneyMgr: (zone.moneyMgr != null && zone.moneyMgr !== '' && String(zone.moneyMgr) !== '0') ? zone.moneyMgr : null,
          moneyText,
          moneyIcon,
          settlements,
          levelStats,
          totalChest,
          totalPuzzle,
          totalBlackbox,
          totalEquip,
          totalPiece,
          totalChestText: formatCountText(totalChest, totalChestAll),
          totalPuzzleText: formatCountText(totalPuzzle, totalPuzzleAll),
          totalBlackboxText: formatCountText(totalBlackbox, totalBlackboxAll),
          totalEquipText: formatCountText(totalEquip, totalEquipAll),
          totalPieceText: formatCountText(totalPiece, totalPieceAll)
        }
      })

      // 优先使用 HTML 渲染模板
      if (this.e?.runtime?.render) {
        try {
          const pluResPath = this.e?.runtime?.path?.plugin?.['endfield-plugin']?.res || ''
          const rawMsg = String(this.e?.msg || this.e?.raw_message || '')
          const isExplore = rawMsg.includes('地区探索')
          const tplName = isExplore ? 'area/area-explore' : 'area/area'
          const renderData = {
            title: isExplore ? '地区探索' : '地区建设',
            zoneCount: zoneList.length,
            zones: zoneList,
            pluResPath,
            userAvatar: userBase.avatarUrl || cardBase?.avatarUrl || '',
            userNickname: userBase.name || cardBase?.name || '未知',
            userLevel: userBase.level ?? cardBase?.level ?? 0,
            userUid: userBase.roleId || cardBase?.roleId || sklUser.endfield_uid || '未知',
            ...getCopyright()
          }
          // 使用默认 viewport，由页面自身布局决定宽度
          const baseOpt = { retType: 'base64', scale: 2.0 }
          const imgSegment = await this.e.runtime.render('endfield-plugin', tplName, renderData, baseOpt)
          if (imgSegment) {
            await this.reply(imgSegment)
            return true
          }
        } catch (err) {
          logger.error(`[终末地地区建设]渲染图失败: ${err?.message || err}`)
        }
      }

      // 降级为纯文本转发
      const rawMsg = String(this.e?.msg || this.e?.raw_message || '')
      const isExplore = rawMsg.includes('地区探索')
      let msg = ``
      msg += `【${isExplore ? '地区探索' : '地区建设'}】(${zoneList.length}个地区)\\n`

      for (const zone of zoneList) {
        msg += `\\n- 地区：${zone.zoneName}\\n`
        msg += `  等级：${zone.level}\\n`
        if (zone.moneyText) {
          msg += `  资金：${zone.moneyText}\\n`
        }
        if (zone.settlements.length) {
          msg += `  聚落：${zone.settlements.length}个\\n`
          for (const s of zone.settlements) {
            msg += `  • ${s.name} Lv.${s.level}${s.officerName ? `（派驻：${s.officerName}）` : ''}\\n`
          }
        }
        msg += `  收集：宝箱 ${zone.totalChest}、醚质 ${zone.totalPuzzle}、协议采录桩 ${zone.totalBlackbox}、装备制造模板 ${zone.totalEquip}、维修灵感点 ${zone.totalPiece}\\n`
      }

      const segments = this.splitContent(msg, 2000)
      const forwardMsg = common.makeForwardMsg(this.e, segments, '终末地地区建设')
      await this.e.reply(forwardMsg)
      return true
    } catch (error) {
      logger.error(`[终末地地区建设]查询失败: ${error}`)
      await this.reply(getMessage('common.query_failed', { error: error.message }))
      return true
    }
  }

  async fetchZoneData(sklUser) {
    const roleId = String(sklUser.endfield_uid || '')
    const serverId = sklUser.server_id || 1

    if (!roleId || roleId === '0') {
      await this.reply(getMessage('common.not_found_role_id'))
      return null
    }

    const res = await sklUser.sklReq.getData('cultivate_zone', {
      roleId,
      serverId
    })

    if (!res || res.code !== 0) {
      logger.error(`[终末地地区建设]获取地区建设信息失败: ${JSON.stringify(res)}`)
      await this.reply(getMessage('area.get_zone_failed'))
      return null
    }

    // 接口返回 data.domain（GET /api/endfield/domain），无 data.zones
    const domainList = res.data?.domain || []
    const charNameMap = res.data?.charNameMap || {}
    const officerAvatarMap = res.data?.officerAvatarMap || {}
    const zones = domainList.map((d) => ({
      zoneId: d.domainId,
      zoneName: d.name,
      level: d.level,
      moneyMgr: d.moneyMgr,
      settlements: d.settlements || [],
      collections: d.collections || [],
      levels: d.levels || [],
      charNameMap,
      officerAvatarMap
    }))
    return { zones }
  }

  // ==================== 帝江号建设 ====================
  async getSpaceship() {
    const userId = this.e.at || this.e.user_id
    const sklUser = new EndfieldUser(userId)

    if (!await sklUser.getUser()) {
      await this.reply(getUnbindMessage())
      return true
    }

    await this.reply(getMessage('spaceship.loading'))

    try {
      // 并行获取帝江号数据、用户基础信息、干员列表（用于头像）
      const [shipData, noteRes, cardDetailRes] = await Promise.all([
        this.fetchSpaceshipData(sklUser),
        sklUser.sklReq.getData('note', {
          roleId: String(sklUser.endfield_uid || ''),
          serverId: sklUser.server_id || 1
        }).catch(() => null),
        sklUser.sklReq.getData('endfield_card_detail', {
          roleId: String(sklUser.endfield_uid || ''),
          serverId: sklUser.server_id || 1
        }).catch(() => null)
      ])
      if (!shipData) return true

      const { rooms, charNameMap, role, relationLevels } = shipData
      if (!rooms || rooms.length === 0) {
        await this.reply(getMessage('spaceship.not_found_info'))
        return true
      }

      const userBase = noteRes?.code === 0 ? (noteRes.data?.base || {}) : {}

      // 从 card/detail 构建 charId → 头像映射
      const charAvatarMap = {}
      if (cardDetailRes?.code === 0) {
        const detailChars = cardDetailRes.data?.detail?.chars || []
        for (const char of detailChars) {
          const c = char.charData || char
          const charId = char.id || char.instId || ''
          if (charId) {
            charAvatarMap[charId] = c.avatarRtUrl || ''
          }
        }
      }

      // 构建房间渲染数据（API 已过滤空房间）
      const operatorMap = setting.getData('operatorMap') || {}
      const roomList = rooms.map((room, idx) => {
        const roomName = room.roomName || room.id || '未知'
        const lastReportTs = Number(room.lastReportTs ?? 0)
        const lastReportTime = lastReportTs ? new Date(lastReportTs * 1000).toLocaleString('zh-CN') : ''
        const chars = (room.chars || []).map((c) => {
          const charId = c.charId || c.id || ''
          return {
            // 优先根据干员ID使用本地映射表显示中文名，其次回退到接口名称或原始ID
            name: operatorMap[charId] || c.name || charNameMap[charId] || charId || '未知',
            avatar: c.avatarUrl || charAvatarMap[charId] || '',
            physicalStrength: Math.round(c.physicalStrength ?? 0),
            favorability: Math.round(c.favorability ?? 0),
            moodPercent: this.calcMoodPercent(c.physicalStrength, c.moodPercent),
            trustPercent: this.calcTrustPercent(c.favorability, c.trustPercent),
            trustLevelName: this.resolveTrustLevelName(c.favorability, c.trustLevelName, relationLevels)
          }
        })
        return {
          roomName,
          roomId: room.id,
          level: room.level ?? 0,
          type: room.type ?? 0,
          lastReportTime,
          bgIndex: (idx % 3) + 1,
          chars
        }
      })

      // 优先使用 HTML 渲染模板
      if (this.e?.runtime?.render) {
        try {
          const pluResPath = this.e?.runtime?.path?.plugin?.['endfield-plugin']?.res || ''
          const renderData = {
            title: '帝江号建设',
            roomCount: roomList.length,
            rooms: roomList,
            pluResPath,
            userAvatar: userBase.avatarUrl || '',
            userNickname: userBase.name || role?.name || '未知',
            userLevel: userBase.level ?? role?.level ?? 0,
            userUid: userBase.roleId || role?.roleId || sklUser.endfield_uid || '未知',
            ...getCopyright()
          }
          // 使用默认 viewport，由页面自身布局决定宽度
          const baseOpt = { retType: 'base64', scale: 2.0 }
          const imgSegment = await this.e.runtime.render('endfield-plugin', 'area/spaceship', renderData, baseOpt)
          if (imgSegment) {
            await this.reply(imgSegment)
            return true
          }
        } catch (err) {
          logger.error(`[终末地帝江号建设]渲染图失败: ${err?.message || err}`)
        }
      }

      // 降级为纯文本转发
      let msg = ``
      msg += `【帝江号建设】(${roomList.length}个房间)\\n`
      for (const room of roomList) {
        msg += `\\n- 房间：${room.roomName}\\n`
        msg += `  等级：${room.level}\\n`
        if (!room.chars.length) {
          msg += `  干员：无\\n`
          continue
        }
        msg += `  干员：${room.chars.length}人\\n`
        for (const c of room.chars) {
          msg += `  • ${c.name}（${c.trustLevelName}，心情${c.moodPercent}% / 体力${c.physicalStrength}，信赖${c.trustPercent}% / 好感${c.favorability}）\\n`
        }
      }

      const segments = this.splitContent(msg, 2000)
      const forwardMsg = common.makeForwardMsg(this.e, segments, '终末地帝江号建设')
      await this.e.reply(forwardMsg)
      return true
    } catch (error) {
      logger.error(`[终末地帝江号建设]查询失败: ${error}`)
      await this.reply(getMessage('common.query_failed', { error: error.message }))
      return true
    }
  }

  async fetchSpaceshipData(sklUser) {
    const roleId = String(sklUser.endfield_uid || '')
    const serverId = Number(sklUser.server_id || 1)
    const res = await sklUser.sklReq.getData('spaceship', { roleId, serverId })

    if (!res || res.code !== 0) {
      logger.error(`[终末地帝江号建设]获取建设信息失败: ${JSON.stringify(res)}`)
      await this.reply(getMessage('common.get_role_failed'))
      return null
    }

    const charNameMap = res.data?.charNameMap || {}
    const role = res.data?.role || {}
    const relationLevels = Array.isArray(res.data?.relationLevels) ? res.data.relationLevels : []
    const rooms = Array.isArray(res.data?.rooms) ? res.data.rooms : (res.data?.spaceShip?.rooms || [])

    return { rooms, charNameMap, role, relationLevels }
  }

  calcMoodPercent(physicalStrength, moodPercent) {
    if (Number.isFinite(Number(moodPercent))) return Math.max(0, Math.min(100, Math.round(Number(moodPercent))))
    const raw = Number(physicalStrength || 0)
    return Math.max(0, Math.min(100, Math.floor((raw / 10000) * 100)))
  }

  calcTrustPercent(favorability, trustPercent) {
    if (Number.isFinite(Number(trustPercent))) return Math.max(0, Math.min(200, Math.round(Number(trustPercent))))
    const fav = Number(favorability || 0)
    if (fav >= 1500) return 200
    if (fav >= 300) return 100 + Math.floor(((fav - 300) / 1200) * 100)
    return Math.floor((fav / 300) * 100)
  }

  resolveTrustLevelName(favorability, trustLevelName, relationLevels = []) {
    if (trustLevelName) return String(trustLevelName)
    const levels = Array.isArray(relationLevels) ? relationLevels : []
    if (levels.length > 0) {
      const fav = Number(favorability || 0)
      let hit = levels[0]
      for (const lv of levels) {
        if (fav >= Number(lv?.threshold ?? 0)) hit = lv
      }
      const levelName = String(hit?.name || '').trim()
      if (levelName) return levelName
    }
    const fav = Number(favorability || 0)
    if (fav >= 1500) return '信任'
    if (fav >= 300) return '亲近'
    return '友好'
  }

  // ==================== 工具方法 ====================
  splitContent(content, maxLength = 2000) {
    if (!content) return []
    
    const messages = []
    let currentIndex = 0

    while (currentIndex < content.length) {
      let segment = content.slice(currentIndex, currentIndex + maxLength)
      
      if (currentIndex + maxLength < content.length) {
        const lastPunctuation = Math.max(
          segment.lastIndexOf('。'),
          segment.lastIndexOf('！'),
          segment.lastIndexOf('？'),
          segment.lastIndexOf('\\n')
        )
        
        if (lastPunctuation > maxLength * 0.5) {
          segment = segment.slice(0, lastPunctuation + 1)
          currentIndex += lastPunctuation + 1
        } else {
          currentIndex += maxLength
        }
      } else {
        currentIndex = content.length
      }

      if (segment.trim()) {
        messages.push([segment])
      }
    }

    return messages
  }
}