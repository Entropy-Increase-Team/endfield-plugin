import { getUnbindMessage, getMessage } from '../utils/common.js'
import common from '../../../lib/common/common.js'
import EndfieldUser from '../model/endfieldUser.js'
import setting from '../utils/setting.js'

export class EndfieldSpaceship extends plugin {
  constructor() {
    super({
      name: '[endfield-plugin]帝江号建设',
      dsc: '终末地帝江号建设信息',
      event: 'message',
      priority: 50,
      rule: [
        {
          reg: '^(?:[:：]|#zmd|#终末地)帝江号建设$',
          fnc: 'getBase'
        }
      ]
    })
  }

  async getBase() {
    const userId = this.e.at || this.e.user_id
    const sklUser = new EndfieldUser(userId)

    if (!await sklUser.getUser()) {
      await this.reply(getUnbindMessage())
      return true
    }

    await this.reply(getMessage('spaceship.loading'))

    try {
      const detailData = await this.fetchCharacterDetail(sklUser)
      if (!detailData) return true

      const { rooms, charNameMap } = detailData
      if (!rooms || rooms.length === 0) {
        await this.reply(getMessage('spaceship.not_found_info'))
        return true
      }

      const roomMap = setting.getData('baseRoomMap') || {}

      let msg = ``
      msg += `【帝江号建设】(${rooms.length}个房间)\n`
      for (const room of rooms) {
        const roomName = roomMap[room.id] || room.id || '未知'
        msg += `\n- 房间：${roomName}\n`
        msg += `  等级：${room.level ?? 0}\n`
        const roomChars = room.chars || []
        if (!roomChars.length) {
          msg += `  干员：无\n`
          continue
        }
        msg += `  干员：${roomChars.length}人\n`
        for (const item of roomChars) {
          const charId = item.charId
          const name = charNameMap[charId] || charId || '未知'
          const ps = item.physicalStrength ?? 0
          const fav = item.favorability ?? 0
          msg += `  • ${name}（体力${ps}，好感${fav}）\n`
        }
      }

      const segments = this.splitContent(msg, 2000)
      const forwardMsg = common.makeForwardMsg(this.e, segments, '终末地帝江号建设')
      await this.e.reply(forwardMsg)
      return true
    } catch (error) {
      logger.error(`[终末地帝江号建设]查询失败: ${error}`)
      await this.reply(getMessage('spaceship.query_failed', { error: error.message }))
      return true
    }
  }

  async fetchCharacterDetail(sklUser) {
    const res = await sklUser.sklReq.getData('spaceship')

    if (!res || res.code !== 0) {
      logger.error(`[终末地帝江号建设]获取建设信息失败: ${JSON.stringify(res)}`)
      await this.reply(getMessage('spaceship.get_role_failed'))
      return null
    }

    const spaceShip = res.data?.spaceShip || {}
    const charNameMap = res.data?.charNameMap || {}
    const rooms = spaceShip.rooms || []

    return { rooms, charNameMap }
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
