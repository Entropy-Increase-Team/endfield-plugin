import { getUnbindMessage, getMessage } from '../utils/common.js'
import common from '../../../lib/common/common.js'
import EndfieldUser from '../model/endfieldUser.js'
import setting from '../utils/setting.js'

export class EndfieldArea extends plugin {
  constructor() {
    super({
      name: '[endfield-plugin]地区建设',
      dsc: '终末地区域建设信息',
      event: 'message',
      priority: 50,
      rule: [
        {
          reg: '^(?:[:：]|#zmd|#终末地)地区建设$',
          fnc: 'getArea'
        }
      ]
    })
  }

  async getArea() {
    const userId = this.e.at || this.e.user_id
    const sklUser = new EndfieldUser(userId)

    if (!await sklUser.getUser()) {
      await this.reply(getUnbindMessage())
      return true
    }

    await this.reply(getMessage('area.loading'))

    try {
      const zoneData = await this.fetchZoneData(sklUser)
      if (!zoneData) return true

      const { zones } = zoneData
      if (!zones || zones.length === 0) {
        await this.reply(getMessage('area.not_found_info'))
        return true
      }

      const areaMap = setting.getData('areaMap') || {}

      let msg = ``
      msg += `【地区建设】(${zones.length}个地区)\n`

      for (const zone of zones) {
        const zoneName = zone.zoneName || areaMap[zone.zoneId] || zone.zoneId || '未知'
        msg += `\n- 地区：${zoneName}\n`
        msg += `  等级：${zone.level ?? 0}\n`
        if (zone.moneyMgr != null && zone.moneyMgr !== '' && String(zone.moneyMgr) !== '0') {
          msg += `  资金：${zone.moneyMgr}\n`
        }

        const settlements = zone.settlements || []
        if (settlements.length) {
          msg += `  聚落：${settlements.length}个\n`
          for (const s of settlements) {
            const sName = s.name || s.id || '未知'
            const officerName = (s.officerCharIds && zone.charNameMap?.[s.officerCharIds]) ? zone.charNameMap[s.officerCharIds] : ''
            msg += `  • ${sName} Lv.${s.level ?? 0}${officerName ? `（派驻：${officerName}）` : ''}\n`
          }
        }

        const collections = zone.collections || []
        if (collections.length) {
          const totalChest = collections.reduce((sum, c) => sum + (Number(c.trchestCount) || 0), 0)
          const totalPuzzle = collections.reduce((sum, c) => sum + (Number(c.puzzleCount) || 0), 0)
          const totalBlackbox = collections.reduce((sum, c) => sum + (Number(c.blackboxCount) || 0), 0)
          msg += `  收集：宝箱 ${totalChest}、拼图 ${totalPuzzle}、黑匣 ${totalBlackbox}\n`
        }
      }

      const segments = this.splitContent(msg, 2000)
      const forwardMsg = common.makeForwardMsg(this.e, segments, '终末地地区建设')
      await this.e.reply(forwardMsg)
      return true
    } catch (error) {
      logger.error(`[终末地地区建设]查询失败: ${error}`)
      await this.reply(getMessage('area.query_failed', { error: error.message }))
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
    const zones = domainList.map((d) => ({
      zoneId: d.domainId,
      zoneName: d.name,
      level: d.level,
      moneyMgr: d.moneyMgr,
      settlements: d.settlements || [],
      collections: d.collections || [],
      charNameMap
    }))
    return { zones }
  }

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
