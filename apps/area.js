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
          reg: '^(?:[:：]|[/#](?:zmd|终末地))帝江号建设$',
          fnc: 'getSpaceship'
        }
      ]
    })
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

      const areaMap = setting.getData('areaMap') || {}

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
          if (count !== '' && total !== '') return `${count}/${total}`
          return String(count !== '' ? count : total)
        }
        return String(moneyMgr)
      }

      const zoneList = zones.map((zone) => {
        const zoneName = zone.zoneName || areaMap[zone.zoneId] || zone.zoneId || '未知'
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
          const remainMoneyText = (remainMoney !== '' && moneyMax !== '')
            ? `${remainMoney}/${moneyMax}`
            : String(remainMoney !== '' ? remainMoney : moneyMax || '')
          const remainMoneyNum = Number(remainMoney)
          const moneyMaxNum = Number(moneyMax)
          const remainMoneyPercent = (Number.isFinite(remainMoneyNum) && moneyMaxNum > 0)
            ? Math.max(0, Math.min(100, (remainMoneyNum / moneyMaxNum) * 100))
            : 0
          return {
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
        const moneyText = formatMoneyText(zone.moneyMgr)
        return {
          zoneName,
          level: zone.level ?? 0,
          moneyMgr: (zone.moneyMgr != null && zone.moneyMgr !== '' && String(zone.moneyMgr) !== '0') ? zone.moneyMgr : null,
          moneyText,
          settlements,
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
          const renderData = {
            title: '地区建设',
            zoneCount: zoneList.length,
            zones: zoneList,
            pluResPath,
            userAvatar: userBase.avatarUrl || cardBase?.avatarUrl || '',
            userNickname: userBase.name || cardBase?.name || '未知',
            userLevel: userBase.level ?? cardBase?.level ?? 0,
            userUid: userBase.roleId || cardBase?.roleId || sklUser.endfield_uid || '未知',
            ...getCopyright()
          }
          const baseOpt = { scale: 1.6, retType: 'base64' }
          const imgSegment = await this.e.runtime.render('endfield-plugin', 'area/area', renderData, baseOpt)
          if (imgSegment) {
            await this.reply(imgSegment)
            return true
          }
        } catch (err) {
          logger.error(`[终末地地区建设]渲染图失败: ${err?.message || err}`)
        }
      }

      // 降级为纯文本转发
      let msg = ``
      msg += `【地区建设】(${zoneList.length}个地区)\n`

      for (const zone of zoneList) {
        msg += `\n- 地区：${zone.zoneName}\n`
        msg += `  等级：${zone.level}\n`
        if (zone.moneyText) {
          msg += `  资金：${zone.moneyText}\n`
        }
        if (zone.settlements.length) {
          msg += `  聚落：${zone.settlements.length}个\n`
          for (const s of zone.settlements) {
            msg += `  • ${s.name} Lv.${s.level}${s.officerName ? `（派驻：${s.officerName}）` : ''}\n`
          }
        }
        msg += `  收集：宝箱 ${zone.totalChest}、醚质 ${zone.totalPuzzle}、协议采录桩 ${zone.totalBlackbox}、装备制造模板 ${zone.totalEquip}、维修灵感点 ${zone.totalPiece}\n`
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

      const roomMap = setting.getData('baseRoomMap') || {}
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
      const roomList = rooms.map((room, idx) => {
        const roomName = room.roomName || roomMap[room.id] || room.id || '未知'
        const lastReportTs = Number(room.lastReportTs ?? 0)
        const lastReportTime = lastReportTs ? new Date(lastReportTs * 1000).toLocaleString('zh-CN') : ''
        const chars = (room.chars || []).map((c) => {
          const charId = c.charId || c.id || ''
          return {
            name: c.name || charNameMap[charId] || charId || '未知',
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
          const baseOpt = { scale: 1.6, retType: 'base64' }
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
      msg += `【帝江号建设】(${roomList.length}个房间)\n`
      for (const room of roomList) {
        msg += `\n- 房间：${room.roomName}\n`
        msg += `  等级：${room.level}\n`
        if (!room.chars.length) {
          msg += `  干员：无\n`
          continue
        }
        msg += `  干员：${room.chars.length}人\n`
        for (const c of room.chars) {
          msg += `  • ${c.name}（${c.trustLevelName}，心情${c.moodPercent}% / 体力${c.physicalStrength}，信赖${c.trustPercent}% / 好感${c.favorability}）\n`
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
          segment.lastIndexOf('\n')
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
