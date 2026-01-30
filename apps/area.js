import { rulePrefix, getUnbindMessage, getMessage } from '../utils/common.js'
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
          reg: `^${rulePrefix}地区建设$`,
          fnc: 'getArea'
        }
      ]
    })
    this.common_setting = setting.getConfig('common')
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

        const buildings = zone.buildings || []
        if (buildings.length) {
          msg += `  建筑：${buildings.length}个\n`
          for (const building of buildings) {
            const buildingName = building.buildingName || building.buildingId || '未知'
            const status = building.status || 'unknown'
            const statusText = status === 'idle' ? '空闲' : status === 'working' ? '工作中' : status === 'upgrading' ? '升级中' : status
            msg += `  • ${buildingName} Lv.${building.level ?? 0}（${statusText}）\n`
          }
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

    const zones = res.data?.zones || []
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

  getCmdPrefix() {
    const mode = Number(this.common_setting?.prefix_mode) || 1
    return mode === 2 ? '#zmd' : ':'
  }
}
