import { getUnbindMessage, getMessage, ruleReg } from '../utils/common.js'
import EndfieldUser from '../model/endfieldUser.js'
import { REDIS_KEY } from '../model/endfieldUser.js'
import setting from '../utils/setting.js'

export class EndfieldStamina extends plugin {
  constructor() {
    super({
      name: '[endfield-plugin]理智',
      dsc: '终末地理智与日常活跃度',
      event: 'message',
      priority: 50,
      task: {
        name: '[endfield-plugin]理智订阅推送',
        cron: '*/15 * * * *', // 每 15 分钟
        fnc: () => this.pushStamina()
      },
      rule: [
        ruleReg('(理智|体力)$', 'getStamina'),
        ruleReg('(订阅(?:理智|体力)|(?:理智|体力)订阅)(?:\\s*(\\d+))?.*$', 'subscribeStamina'),
        ruleReg('取消\\s*订阅\\s*(?:理智|体力)$', 'unsubscribeStamina'),
        ruleReg('(订阅推送设置|订阅设置推送|推送设置订阅|设置推送订阅)\\s*(群聊|私信)(?:\\s*(\\d+))?$', 'subscribePushSetting')
      ]
    })
    this.common_setting = setting.getConfig('common')
  }

  async subscribeStamina() {
    const isGroup = !!this.e.isGroup
    const raw = (this.e.msg || '').trim()
    const valueMatch = raw.match(/(?:订阅(?:理智|体力)|(?:理智|体力)订阅)\s*(\d+)/)
    const threshold = valueMatch ? Math.max(0, parseInt(valueMatch[1], 10)) : undefined
    const nickname = this.e.sender?.nickname || this.e.sender?.card || String(this.e.user_id)
    const sub = {
      bot_id: String(this.e.self_id),
      user_id: String(this.e.user_id),
      group_id: isGroup ? String(this.e.group_id) : '',
      is_group: isGroup,
      push_type: isGroup ? 'group' : 'private',
      push_target: isGroup ? String(this.e.group_id) : String(this.e.user_id),
      nickname,
      threshold,
      last_current: undefined
    }
    const list = await this.getStaminaSubList()
    const idx = list.findIndex((item) => (
      item.bot_id === sub.bot_id
      && item.user_id === sub.user_id
      && item.group_id === sub.group_id
    ))
    if (idx >= 0) {
      list[idx] = { ...list[idx], nickname, threshold, last_current: list[idx].last_current }
      await this.setStaminaSubList(list)
      const replyMsg = threshold != null
        ? getMessage('stamina.subscribe_ok_threshold', { threshold })
        : getMessage('stamina.subscribe_ok_full')
      await this.reply(replyMsg, false, { at: isGroup })
      return true
    }
    list.push(sub)
    await this.setStaminaSubList(list)
    const replyMsg = threshold != null
      ? getMessage('stamina.subscribe_ok_threshold', { threshold })
      : getMessage('stamina.subscribe_ok_full')
    await this.reply(replyMsg, false, { at: isGroup })
    return true
  }

  /** 取消订阅理智推送 */
  async unsubscribeStamina() {
    const isGroup = !!this.e.isGroup
    const sub = {
      bot_id: String(this.e.self_id),
      user_id: String(this.e.user_id),
      group_id: isGroup ? String(this.e.group_id) : ''
    }
    const list = await this.getStaminaSubList()
    const filtered = list.filter((item) => !(
      item.bot_id === sub.bot_id
      && item.user_id === sub.user_id
      && item.group_id === sub.group_id
    ))
    if (filtered.length === list.length) {
      await this.reply(getMessage('stamina.not_subscribed'), false, { at: isGroup })
      return true
    }
    await this.setStaminaSubList(filtered)
    await this.reply(getMessage('stamina.unsubscribe_ok'), false, { at: isGroup })
    return true
  }

  async getStamina() {
    const userId = this.e.at || this.e.user_id
    await this.reply(getMessage('stamina.loading'))

    try {
      const { ok, msg } = await this.getStaminaText(userId)
      if (ok) {
        await this.reply(msg.trim())
      } else {
        await this.reply(msg)
      }
      return true
    } catch (error) {
      logger.error(`[终末地理智]查询失败: ${error}`)
      await this.reply(getMessage('stamina.query_failed', { error: error.message }))
      return true
    }
  }

  async getStaminaText(userId) {
    const sklUser = new EndfieldUser(userId)
    if (!await sklUser.getUser()) {
      return {
        ok: false,
        msg: getUnbindMessage()
      }
    }
    const res = await sklUser.sklReq.getData('stamina')

    if (!res || res.code !== 0) {
      logger.error(`[终末地理智]获取理智信息失败: ${JSON.stringify(res)}`)
      return { ok: false, msg: getMessage('stamina.get_role_failed') }
    }

    const stamina = res.data?.stamina || {}
    const dailyMission = res.data?.dailyMission || {}

    const current = Number(stamina.current || 0)
    const max = Number(stamina.max || 0)
    const maxTs = Number(stamina.maxTs || 0)
    const recover = Number(stamina.recover || 360)
    let fullTime = '未知'
    if (current >= max && max > 0) {
      fullTime = '已满'
    } else if (maxTs) {
      fullTime = new Date(maxTs * 1000).toLocaleString('zh-CN')
    } else if (current < max && recover) {
      const remaining = max - current
      const recoverMinutes = Math.ceil((remaining * recover) / 60)
      const recoverTime = new Date(Date.now() + recoverMinutes * 60 * 1000)
      fullTime = recoverTime.toLocaleString('zh-CN')
    }

    let msg = ''
    msg += `理智：${current}/${max}\n`
    msg += `回满时间：${fullTime}\n`
    msg += `日常活跃：${dailyMission.activation ?? 0}/${dailyMission.maxActivation ?? 100}\n`
    return { ok: true, msg: msg.trim(), current, max }
  }

  /** 理智订阅推送：未设阈值时理智满推送，设阈值时达到该值推送（跨过阈值时推一次，避免重复） */
  async pushStamina() {
    const list = await this.getStaminaSubList()
    if (!Array.isArray(list) || list.length === 0) return
    for (let i = 0; i < list.length; i++) {
      const sub = list[i]
      try {
        const result = await this.getStaminaText(sub.user_id)
        const { ok, msg, current = 0, max = 0 } = result
        if (!ok) continue
        const target = sub.threshold != null ? sub.threshold : max
        const last = sub.last_current ?? -1
        const shouldPush = target > 0 && current >= target && last < target
        if (shouldPush) {
          await this.sendStaminaMsg(sub, current)
        }
        sub.last_current = current
        list[i] = sub
      } catch (error) {
        logger.error(`[终末地理智]订阅推送失败: ${error}`)
      }
    }
    await this.setStaminaSubList(list)
  }

  /** 从 Redis 绑定数据取当前账号的游戏内名称 */
  async getGameNickname(userId) {
    const raw = await redis.get(REDIS_KEY(userId))
    if (!raw) return ''
    try {
      const data = JSON.parse(raw)
      const accounts = Array.isArray(data) ? data : [data]
      const active = accounts.find((a) => a.is_active === true) || accounts[0]
      return active?.nickname || ''
    } catch {
      return ''
    }
  }

  async sendStaminaMsg(sub, current) {
    const name = (await this.getGameNickname(sub.user_id)) || '你'
    const pushMsg = getMessage('stamina.push_msg', { name, current })
    const type = sub.push_type ?? (sub.is_group ? 'group' : 'private')
    const target = sub.push_target ?? (sub.is_group ? sub.group_id : sub.user_id)
    if (type === 'group' && target) {
      await Bot.pickGroup(target).sendMsg([segment.at(sub.user_id), '\n', pushMsg])
      return
    }
    const uid = type === 'private' && target ? target : sub.user_id
    await Bot.pickFriend(uid).sendMsg(pushMsg)
  }

  async getStaminaSubList() {
    const raw = await redis.get('ENDFIELD:STAMINA_SUBSCRIBE')
    try {
      return raw ? JSON.parse(raw) : []
    } catch {
      return []
    }
  }

  async setStaminaSubList(list) {
    await redis.set('ENDFIELD:STAMINA_SUBSCRIBE', JSON.stringify(list || []))
  }

  /** 订阅推送设置：群聊 [群号] | 私信（不填则发本人） */
  async subscribePushSetting() {
    const isGroup = !!this.e.isGroup
    const raw = (this.e.msg || '').trim()
    const match = raw.match(/(?:订阅推送设置|订阅设置推送|推送设置订阅|设置推送订阅)\s*(群聊|私信)(?:\s*(\d+))?/)
    if (!match) return true
    const [, type, idStr] = match
    const list = await this.getStaminaSubList()
    const ctxGroupId = isGroup ? String(this.e.group_id) : ''
    const idx = list.findIndex((item) => (
      item.bot_id === String(this.e.self_id)
      && item.user_id === String(this.e.user_id)
      && item.group_id === ctxGroupId
    ))
    if (idx < 0) {
      await this.reply(getMessage('stamina.not_subscribed'), false, { at: isGroup })
      return true
    }
    const sub = list[idx]
    if (type === '私信') {
      sub.push_type = 'private'
      sub.push_target = String(this.e.user_id)
    } else {
      const groupId = idStr && idStr.trim() ? idStr.trim() : (isGroup ? String(this.e.group_id) : '')
      if (!groupId) {
        await this.reply(getMessage('stamina.push_setting_example', { prefix: this.getCmdPrefix() }), false, { at: isGroup })
        return true
      }
      sub.push_type = 'group'
      sub.push_target = groupId
    }
    list[idx] = sub
    await this.setStaminaSubList(list)
    const tip = type === '私信' ? '已改为推送到私信（本人）' : `已改为推送到群聊 ${sub.push_target}`
    await this.reply(tip, false, { at: isGroup })
    return true
  }

  getCmdPrefix() {
    const mode = Number(this.common_setting?.prefix_mode) || 1
    return mode === 1 ? `#${this.common_setting?.keywords?.[0] || 'zmd'}` : ':'
  }
}
