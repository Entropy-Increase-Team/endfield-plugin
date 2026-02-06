import { getUnbindMessage, getMessage } from '../utils/common.js'
import EndfieldUser from '../model/endfieldUser.js'
import { REDIS_KEY } from '../model/endfieldUser.js'
import setting from '../utils/setting.js'
import { getCopyright } from '../utils/copyright.js'

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
        {
          reg: '^(?:[:：]|#zmd|#终末地)(理智|体力)$',
          fnc: 'getStamina'
        },
        {
          reg: '^(?:[:：]|#zmd|#终末地)(订阅(?:理智|体力)|(?:理智|体力)订阅)(?:\\s*(\\d+))?.*$',
          fnc: 'subscribeStamina'
        },
        {
          reg: '^(?:[:：]|#zmd|#终末地)取消\\s*订阅\\s*(?:理智|体力)$',
          fnc: 'unsubscribeStamina'
        },
        {
          reg: '^(?:[:：]|#zmd|#终末地)(订阅推送设置|订阅设置推送|推送设置订阅|设置推送订阅)\\s*(群聊|私信)(?:\\s*(\\d+))?$',
          fnc: 'subscribePushSetting'
        }
      ]
    })
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
      const allUsers = await EndfieldUser.getAllUsers(userId)
      if (allUsers.length === 0) {
        await this.reply(getUnbindMessage())
        return true
      }

      // 并行获取所有账号的理智数据
      const accountsData = await Promise.all(allUsers.map(sklUser => this.fetchOneStamina(sklUser)))
      const validAccounts = accountsData.filter(a => a !== null)

      if (validAccounts.length === 0) {
        await this.reply(getMessage('stamina.get_role_failed'))
        return true
      }

      // 优先渲染图片
      if (this.e?.runtime?.render) {
        try {
          const pluResPath = this.e?.runtime?.path?.plugin?.['endfield-plugin']?.res || ''
          const accounts = validAccounts.map(a => ({
            ...a,
            staminaPercent: a.max > 0 ? a.current / a.max : 0,
            activationPercent: a.maxActivation > 0 ? (a.activation / a.maxActivation) * 100 : 0
          }))
          const renderData = {
            pluResPath,
            accounts,
            ...getCopyright()
          }
          const baseOpt = { scale: 1.6, retType: 'base64' }
          const imgSegment = await this.e.runtime.render('endfield-plugin', 'stamina/stamina', renderData, baseOpt)
          if (imgSegment) {
            await this.reply(imgSegment)
            return true
          }
        } catch (err) {
          logger.error(`[终末地理智]渲染图失败: ${err?.message || err}`)
        }
      }

      // 降级为纯文本
      const textParts = validAccounts.map(a => {
        return `【${a.userName}】\n理智：${a.current}/${a.max}\n回满时间：${a.fullTime}\n日常活跃：${a.activation}/${a.maxActivation}`
      })
      await this.reply(textParts.join('\n\n'))
      return true
    } catch (error) {
      logger.error(`[终末地理智]查询失败: ${error}`)
      await this.reply(getMessage('stamina.query_failed', { error: error.message }))
      return true
    }
  }

  /** 获取单个账号的理智结构化数据（含随机干员立绘） */
  async fetchOneStamina(sklUser) {
    try {
      const [res, noteRes, cardRes] = await Promise.all([
        sklUser.sklReq.getData('stamina'),
        sklUser.sklReq.getData('note').catch(() => null),
        sklUser.sklReq.getData('endfield_card_detail').catch(() => null)
      ])

      if (!res || res.code !== 0) return null

      const stamina = res.data?.stamina || {}
      const dailyMission = res.data?.dailyMission || {}
      const role = res.data?.role || {}
      const userBase = noteRes?.code === 0 ? (noteRes.data?.base || {}) : {}

      const current = Number(stamina.current || 0)
      const max = Number(stamina.max || 0)
      const maxTs = Number(stamina.maxTs || 0)
      const recover = Number(stamina.recover || 360)
      const activation = Number(dailyMission.activation ?? 0)
      const maxActivation = Number(dailyMission.maxActivation ?? 100)

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

      // 从干员列表中随机选一个立绘
      let operatorImg = ''
      if (cardRes?.code === 0) {
        const chars = cardRes.data?.detail?.chars || []
        const illustrations = chars
          .map(c => (c.charData || c).illustrationUrl || '')
          .filter(Boolean)
        if (illustrations.length > 0) {
          operatorImg = illustrations[Math.floor(Math.random() * illustrations.length)]
        }
      }

      return {
        current,
        max,
        fullTime,
        activation,
        maxActivation,
        userAvatar: userBase.avatarUrl || '',
        userName: userBase.name || role.name || sklUser.nickname || '未知',
        userLevel: userBase.level ?? role.level ?? 0,
        userUid: userBase.roleId || role.roleId || sklUser.endfield_uid || '未知',
        operatorImg
      }
    } catch (err) {
      logger.error(`[终末地理智]获取账号 ${sklUser.endfield_uid} 理智失败: ${err}`)
      return null
    }
  }

  /** 获取理智文本（订阅推送用，取当前选中账号） */
  async getStaminaText(userId) {
    const sklUser = new EndfieldUser(userId)
    if (!await sklUser.getUser()) {
      return { ok: false, msg: getUnbindMessage() }
    }
    const data = await this.fetchOneStamina(sklUser)
    if (!data) return { ok: false, msg: getMessage('stamina.get_role_failed') }
    const msg = `理智：${data.current}/${data.max}\n回满时间：${data.fullTime}\n日常活跃：${data.activation}/${data.maxActivation}`
    return { ok: true, msg, current: data.current, max: data.max }
  }

  /** 理智订阅推送：遍历用户所有有效账号，统一阈值，跨过阈值时推送一次 */
  async pushStamina() {
    const list = await this.getStaminaSubList()
    if (!Array.isArray(list) || list.length === 0) return
    for (let i = 0; i < list.length; i++) {
      const sub = list[i]
      try {
        const allUsers = await EndfieldUser.getAllUsers(sub.user_id)
        if (allUsers.length === 0) continue

        // last_currents 记录每个账号上次的理智值，按 role_id 索引
        const lastMap = sub.last_currents || {}
        const pushLines = []

        for (const sklUser of allUsers) {
          const data = await this.fetchOneStamina(sklUser)
          if (!data) continue

          const rid = String(data.userUid || sklUser.endfield_uid)
          const threshold = sub.threshold != null ? sub.threshold : data.max
          const last = lastMap[rid] ?? -1
          const shouldPush = threshold > 0 && data.current >= threshold && last < threshold

          if (shouldPush) {
            pushLines.push(`【${data.userName}】理智已达 ${data.current}/${data.max}`)
          }
          lastMap[rid] = data.current
        }

        sub.last_currents = lastMap
        list[i] = sub

        if (pushLines.length > 0) {
          await this.sendStaminaMsg(sub, pushLines.join('\n'))
        }
      } catch (error) {
        logger.error(`[终末地理智]订阅推送失败: ${error}`)
      }
    }
    await this.setStaminaSubList(list)
  }

  async sendStaminaMsg(sub, pushMsg) {
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
        await this.reply(getMessage('stamina.push_setting_example', { prefix: ':' }), false, { at: isGroup })
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
}
