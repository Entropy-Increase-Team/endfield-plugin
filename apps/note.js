import { rulePrefix, getUnbindMessage, getMessage } from '../utils/common.js'
import common from '../../../lib/common/common.js'
import EndfieldUser from '../model/endfieldUser.js'
import setting from '../utils/setting.js'

export class EndfieldNote extends plugin {
  constructor() {
    super({
      name: '[endfield-plugin]便签',
      dsc: '终末地角色便签',
      event: 'message',
      priority: 50,
      rule: [
        {
          reg: `^${rulePrefix}便签$`,
          fnc: 'getNote'
        }
      ]
    })
    this.common_setting = setting.getConfig('common')
  }

  async getNote() {
    const userId = this.e.at || this.e.user_id
    const sklUser = new EndfieldUser(userId)

    if (!await sklUser.getUser()) {
      await this.reply(getUnbindMessage())
      return true
    }

    await this.reply(getMessage('note.loading'))

    try {
      const detailData = await this.fetchCharacterDetail(sklUser)
      if (!detailData) return true

      const { base, chars, serverName } = detailData

      let msg = ``
      msg += `角色名：${base.name || '未知'}\n`
      msg += `角色ID：${base.roleId || '未知'}\n`
      msg += `等级：${base.level || 0}\n`
      msg += `经验：${base.exp || 0}\n`
      msg += `世界等级：${base.worldLevel || 0}\n`
      msg += `服务器：${serverName}\n`
      msg += `创建时间：${base.createTime ? new Date(parseInt(base.createTime) * 1000).toLocaleString('zh-CN') : '未知'}\n`
      msg += `最后登录：${base.lastLoginTime ? new Date(parseInt(base.lastLoginTime) * 1000).toLocaleString('zh-CN') : '未知'}\n`
      msg += `主线任务：${base.mainMission?.description || '未知'}\n\n`

      msg += `【收集统计】\n`
      msg += `角色数：${base.charNum || 0}\n`
      msg += `武器数：${base.weaponNum || 0}\n`
      msg += `文档数：${base.docNum || 0}\n\n`

      if (chars && chars.length > 0) {
        msg += `【已拥有干员】(${chars.length}个)\n`
        for (const char of chars) {
          const name = char.name || '未知'
          const rarity = char.rarity?.value || '?'
          const profession = char.profession?.value || '未知'
          const level = char.level || 0
          msg += `• ${name} (${rarity}星 ${profession} Lv.${level})\n`
        }
      } else {
        msg += `【已拥有干员】0个\n`
      }

      const segments = this.splitContent(msg, 2000)
      const forwardMsg = common.makeForwardMsg(this.e, segments, '终末地便签')
      await this.e.reply(forwardMsg)
      return true
    } catch (error) {
      logger.error(`[终末地便签]查询失败: ${error}`)
      await this.reply(getMessage('note.query_failed', { error: error.message }))
      return true
    }
  }

  async fetchCharacterDetail(sklUser) {
    const res = await sklUser.sklReq.getData('note')

    if (!res || res.code !== 0) {
      logger.error(`[终末地便签]获取角色信息失败: ${JSON.stringify(res)}`)
      await this.reply(getMessage('note.get_role_failed'))
      return null
    }
    const base = res.data?.base || {}
    const chars = res.data?.chars || []
    const serverName = base.serverName?.trim() || '未知'

    return { base, chars, serverName }
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
