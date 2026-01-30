import { rulePrefix, getUnbindMessage, getMessage } from '../utils/common.js'
import common from '../../../lib/common/common.js'
import EndfieldUser from '../model/endfieldUser.js'
import EndfieldRequest from '../model/endfieldReq.js'
import setting from '../utils/setting.js'

export class EndfieldWiki extends plugin {
  constructor() {
    super({
      name: '[endfield-plugin]Wiki查询',
      dsc: '终末地Wiki数据查询',
      event: 'message',
      priority: 50,
      rule: [
        { reg: `^${rulePrefix}wiki\\s+干员\\s+(.+)$`, fnc: 'queryChar' },
        { reg: `^${rulePrefix}wiki\\s+装备\\s+(.+)$`, fnc: 'queryEquip' },
        { reg: `^${rulePrefix}wiki\\s+战术物品\\s+(.+)$`, fnc: 'queryTactical' },
        { reg: `^${rulePrefix}wiki\\s+武器\\s+(.+)$`, fnc: 'queryWeapon' }
      ]
    })

    this.apiMap = {
      chars: 'endfield_search_chars',
      weapons: 'endfield_search_weapons',
      equips: 'endfield_search_equipments',
      tacticalItems: 'endfield_search_tactical_items'
    }
    this.common_setting = setting.getConfig('common')
  }

  renderText(text, params = {}) {
    if (!text) return ''
    const plain = String(text).replace(/<[^>]+>/g, '')
    return plain.replace(/\{(\w+):0(%?)\}/g, (m, key, percentFlag) => {
      const val = params?.[key]
      if (val === undefined || val === null || val === '') return m
      const num = Number(val)
      if (Number.isNaN(num)) return String(val)
      if (percentFlag) return `${Math.round(num * 100)}%`
      return String(val)
    })
  }

  findByName(list, name) {
    const exact = list.find((item) => (item.name || '') === name)
    if (exact) return { item: exact, matched: 'exact' }
    const fuzzy = list.find((item) => (item.name || '').includes(name))
    if (fuzzy) return { item: fuzzy, matched: 'fuzzy' }
    return { item: null }
  }

  getQueryName() {
    return this.e.msg
      ?.replace(new RegExp(`^${rulePrefix}wiki\\s+\\S+\\s+`), '')
      ?.trim?.() || ''
  }

  async queryChar() {
    const sklUser = await this.getUserOrReply()
    if (!sklUser) return true

    let name = this.getQueryName()
    if (!name) {
      await this.reply(getMessage('wiki.provide_operator'))
      return true
    }

    const data = await this.fetchWikiData(sklUser, 'chars')
    const list = data?.data?.chars || []
    const { item } = this.findByName(list, name)
    if (!item) {
      await this.reply(getMessage('wiki.not_found_operator', { name }))
      return true
    }

    let msg = ''
    msg += `干员名：${item.name || '未知'}\n`
    msg += `稀有度：${item.rarity?.value || '?'}星\n`
    msg += `职业：${item.profession?.value || '未知'}\n`
    msg += `属性：${item.property?.value || '未知'}\n`
    msg += `武器：${item.weaponType?.value || '未知'}\n`
    if (Array.isArray(item.tags) && item.tags.length > 0) {
      msg += `标签：${item.tags.join('、')}\n`
    }

    if (Array.isArray(item.skills) && item.skills.length > 0) {
      msg += `\n【技能】\n`
      for (const skill of item.skills) {
        const params = skill.descLevelParams?.['1']?.params || skill.descParams || {}
        msg += `• ${skill.name || '未知'} (${skill.type?.value || '未知'} / ${skill.property?.value || '未知'})\n`
        if (skill.desc) {
          msg += `  ${this.renderText(skill.desc, params).replace(/\n+/g, ' ')}\n`
        }
      }
    }

    const segments = this.splitContent(msg, 2000)
    const forwardMsg = common.makeForwardMsg(this.e, segments, '终末地Wiki-干员')
    await this.e.reply(forwardMsg)
    return true
  }

  async queryWeapon() {
    const sklUser = await this.getUserOrReply()
    if (!sklUser) return true

    let name = this.getQueryName()
    if (!name) {
      await this.reply(getMessage('wiki.provide_weapon'))
      return true
    }

    const data = await this.fetchWikiData(sklUser, 'weapons')
    const list = data?.data?.weapons || []
    const { item } = this.findByName(list, name)
    if (!item) {
      await this.reply(getMessage('wiki.not_found_weapon', { name }))
      return true
    }

    let msg = ''
    msg += `名称：${item.name || '未知'}\n`
    msg += `稀有度：${item.rarity?.value || '未知'}\n`
    msg += `类型：${item.type?.value || '未知'}\n`
    if (item.function) msg += `功能：${item.function}\n`
    if (item.description) msg += `描述：${item.description}\n`
    if (Array.isArray(item.skills) && item.skills.length > 0) {
      msg += `词条：${item.skills.map((s) => s.value).filter(Boolean).join('、')}\n`
    }

    const segments = this.splitContent(msg, 2000)
    const forwardMsg = common.makeForwardMsg(this.e, segments, '终末地Wiki-武器')
    await this.e.reply(forwardMsg)
    return true
  }

  async queryEquip() {
    const sklUser = await this.getUserOrReply()
    if (!sklUser) return true

    let name = this.getQueryName()
    if (!name) {
      await this.reply(getMessage('wiki.provide_equip'))
      return true
    }

    const data = await this.fetchWikiData(sklUser, 'equips')
    const list = data?.data?.equips || []
    const { item } = this.findByName(list, name)
    if (!item) {
      await this.reply(getMessage('wiki.not_found_equip', { name }))
      return true
    }

    let msg = ''
    msg += `名称：${item.name || '未知'}\n`
    msg += `稀有度：${item.rarity?.value || '未知'}\n`
    msg += `类型：${item.type?.value || '未知'}\n`
    msg += `等级：${item.level?.value || '未知'}\n`
    if (Array.isArray(item.properties) && item.properties.length > 0) {
      msg += `属性词条：${item.properties.join('、')}\n`
    }
    if (item.function) msg += `功能：${item.function}\n`
    if (item.pkg) msg += `简介：${item.pkg}\n`

    if (item.suit) {
      msg += `\n【套装】\n`
      msg += `名称：${item.suit.name || '未知'}\n`
      if (item.suit.skillDesc) {
        msg += `效果：${this.renderText(item.suit.skillDesc, item.suit.skillDescParams || {})}\n`
      }
    }

    const segments = this.splitContent(msg, 2000)
    const forwardMsg = common.makeForwardMsg(this.e, segments, '终末地Wiki-装备')
    await this.e.reply(forwardMsg)
    return true
  }

  async queryTactical() {
    const sklUser = await this.getUserOrReply()
    if (!sklUser) return true

    let name = this.getQueryName()
    if (!name) {
      await this.reply(getMessage('wiki.provide_tactical'))
      return true
    }

    const data = await this.fetchWikiData(sklUser, 'tacticalItems')
    const list = data?.data?.tacticalItems || []
    const { item } = this.findByName(list, name)
    if (!item) {
      await this.reply(getMessage('wiki.not_found_tactical', { name }))
      return true
    }

    let msg = ''
    msg += `名称：${item.name || '未知'}\n`
    msg += `稀有度：${item.rarity?.value || '未知'}\n`
    msg += `类型：${item.activeEffectType?.value || '未知'}\n`
    msg += `效果：${this.renderText(item.activeEffect || '未知', item.activeEffectParams || {})}\n`
    if (item.passiveEffect) {
      msg += `被动：${this.renderText(item.passiveEffect, item.passiveEffectParams || {})}\n`
    }

    const segments = this.splitContent(msg, 2000)
    const forwardMsg = common.makeForwardMsg(this.e, segments, '终末地Wiki-战术物品')
    await this.e.reply(forwardMsg)
    return true
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

  async getUserOrReply() {
    const userId = this.e.at || this.e.user_id
    const sklUser = new EndfieldUser(userId)
    if (!await sklUser.getUser()) {
      await this.reply(getUnbindMessage())
      return null
    }
    return sklUser
  }

  async fetchWikiData(sklUser, type) {
    const url = this.apiMap[type]
    if (!url) return null

    const apiType = this.apiMap[type]
    if (!apiType) return null

    const req = new EndfieldRequest(0, sklUser.cred, '')
    const data = await req.getData(apiType)
    if (!data || data.code !== 0) {
      logger.error(`[终末地插件][Wiki接口][${type}] 获取失败: ${JSON.stringify(data)}`)
      return null
    }
    return data
  }

  getCmdPrefix() {
    const mode = Number(this.common_setting?.prefix_mode) || 1
    return mode === 2 ? '#zmd' : ':'
  }
}
