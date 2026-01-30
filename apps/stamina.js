import { rulePrefix, getUnbindMessage, getMessage } from '../utils/common.js'
import EndfieldUser from '../model/endfieldUser.js'
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
        cron: '0 * * * *',
        fnc: () => this.pushStamina()
      },
      rule: [
        {
          reg: `^${rulePrefix}理智$`,
          fnc: 'getStamina'
        },
        {
          reg: `^${rulePrefix}订阅理智(?:\\s+(\\d+))?$`,
          fnc: 'subscribeStamina'
        },
        {
          reg: `^${rulePrefix}取消订阅理智$`,
          fnc: 'unsubscribeStamina'
        }
      ]
    })
    this.common_setting = setting.getConfig('common')
  }

  async subscribeStamina() {
    const isGroup = !!this.e.isGroup
    const raw = (this.e.msg || '').trim()
    const valueMatch = raw.match(/订阅理智\s*(\d+)/)
    const threshold = valueMatch ? Math.max(0, parseInt(valueMatch[1], 10)) : undefined
    const sub = {
      bot_id: String(this.e.self_id),
      user_id: String(this.e.user_id),
      group_id: isGroup ? String(this.e.group_id) : '',
      is_group: isGroup,
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
      list[idx] = { ...list[idx], threshold, last_current: list[idx].last_current }
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
    if (maxTs) {
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
          await this.sendStaminaMsg(sub, msg)
        }
        sub.last_current = current
        list[i] = sub
      } catch (error) {
        logger.error(`[终末地理智]订阅推送失败: ${error}`)
      }
    }
    await this.setStaminaSubList(list)
  }

  async sendStaminaMsg(sub, msg) {
    if (sub.is_group && sub.group_id) {
      await Bot.pickGroup(sub.group_id).sendMsg([segment.at(sub.user_id), '\n', msg])
      return
    }
    await Bot.pickFriend(sub.user_id).sendMsg(msg)
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

  getCmdPrefix() {
    const mode = Number(this.common_setting?.prefix_mode) || 1
    return mode === 2 ? '#zmd' : ':'
  }
}
