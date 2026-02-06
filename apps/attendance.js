import { getUnbindMessage, getMessage } from '../utils/common.js'
import EndfieldUser from '../model/endfieldUser.js'
import setting from '../utils/setting.js'
import common from '../../../lib/common/common.js'

export class EndfieldAttendance extends plugin {
  constructor() {
    super({
      name: '[endfield-plugin]签到',
      dsc: '终末地森空岛签到',
      event: 'message',
      priority: 50,
      rule: [
        {
          reg: '^(?:[:：]|#zmd|#终末地)签到$',
          fnc: 'attendance'
        },
        {
          reg: '^(?:[:：]|#zmd|#终末地)全部签到$',
          fnc: 'attendance_task',
          permission: 'master'
        }
      ]
    })

    this.setting = setting.getConfig('sign')
    this.common_setting = setting.getConfig('common')
    this.task = {
      cron: this.setting.auto_sign_cron,
      name: '终末地森空岛签到任务',
      fnc: () => this.attendance_task()
    }
  }

  async attendance() {
    const userId = this.e.at || this.e.user_id
    const allUsers = await EndfieldUser.getAllUsers(userId)

    if (allUsers.length === 0) {
      await this.reply(getUnbindMessage())
      return true
    }

    const results = []
    for (const sklUser of allUsers) {
      const label = sklUser.nickname || sklUser.endfield_uid || '未知'
      try {
        const res = await sklUser.sklReq.getData('endfield_attendance')

        if (!res || res.code !== 0) {
          logger.error(`[终末地插件][签到]账号 ${label} 请求失败: ${JSON.stringify(res)}`)
          results.push(`【${label}】签到失败`)
          continue
        }

        if (res.data?.already_signed) {
          results.push(`【${label}】${res.data.message || '今日已签到'}`)
          continue
        }

        const awardIds = res.data?.awardIds || []
        const resourceInfoMap = res.data?.resourceInfoMap || {}
        let msg = `【${label}】签到完成！获得:`

        if (!awardIds.length) {
          msg += ` 无奖励信息`
        } else {
          for (let award of awardIds) {
            const item = resourceInfoMap?.[award.id] || {}
            msg += `\n  ${item.name || '未知'} * ${item.count ?? award.count ?? 0}`
          }
        }
        results.push(msg)
      } catch (err) {
        logger.error(`[终末地插件][签到]账号 ${label} 异常: ${err}`)
        results.push(`【${label}】签到异常`)
      }
    }

    await this.reply(results.join('\n'))
    return true
  }

  /**
   * 向 sign.yaml 中 notify_list 配置的目标推送消息
   * notify_list: { friend: [QQ号], group: [群号] }
   * @param {string} msg 要发送的文本
   * @param {string} [excludeId] 要排除的用户ID（避免手动触发时重复发送）
   */
  async sendNotifyList(msg, excludeId) {
    const cfg = this.setting?.notify_list
    if (!cfg) return
    // 兼容旧版数组格式
    let friendIds = []
    let groupIds = []
    if (Array.isArray(cfg)) {
      for (const raw of cfg) {
        const str = String(raw).trim()
        const lower = str.toLowerCase()
        if (lower.startsWith('group:')) groupIds.push(str.slice(6).trim())
        else if (lower.startsWith('friend:')) friendIds.push(str.slice(7).trim())
      }
    } else {
      friendIds = Array.isArray(cfg.friend) ? cfg.friend : []
      groupIds = Array.isArray(cfg.group) ? cfg.group : []
    }
    for (const id of friendIds) {
      // 跳过空值和已排除的用户（手动触发者会通过 e.reply 接收消息）
      if (!id || String(id) === String(excludeId)) continue
      try {
        if (Bot?.pickUser) {
          await Bot.pickUser(id).sendMsg(msg)
        } else if (Bot?.sendPrivateMsg) {
          await Bot.sendPrivateMsg(id, msg)
        }
      } catch (e) {
        logger.error(`[终末地插件][签到任务]通知好友 ${id} 失败: ${e?.message || e}`)
      }
    }
    for (const id of groupIds) {
      if (!id) continue
      try {
        if (Bot?.pickGroup) {
          await Bot.pickGroup(id).sendMsg(msg)
        }
      } catch (e) {
        logger.error(`[终末地插件][签到任务]通知群 ${id} 失败: ${e?.message || e}`)
      }
    }
  }

  async attendance_task() {
    if (this.e?.msg && !this.e?.isMaster) return false
    const is_manual = !!this?.e?.msg
    const keys = await redis.keys('ENDFIELD:USER:*')
    let success_count = 0
    let signed_count = 0
    let fail_count = 0
    const fail_users = []

    logger.mark('[终末地插件][签到任务]签到任务开始')

    // 从配置读取通知列表（notify_list），向配置的QQ号发送消息
    this.setting = setting.getConfig('sign')
    // 手动触发时排除当前用户，避免 sendNotifyList 和 e.reply 重复发送
    const excludeId = is_manual ? String(this.e.user_id) : null
    const startMsg = getMessage('attendance.task_start_broadcast', { count: keys.length })
    await this.sendNotifyList(startMsg, excludeId)
    
    if (is_manual) {
      await this.e.reply(getMessage('attendance.task_start'))
    }

    for (let key of keys) {
      const user_id = key.replace(/ENDFIELD:USER:/g, '')
      const allUsers = await EndfieldUser.getAllUsers(user_id)

      if (allUsers.length === 0) {
        fail_count += 1
        fail_users.push(user_id)
        continue
      }

      // 遍历该用户绑定的所有账号逐一签到
      for (const sklUser of allUsers) {
        await common.sleep(2000)
        try {
          const res = await sklUser.sklReq.getData('endfield_attendance')

          if (!res || res.code !== 0) {
            fail_count += 1
            fail_users.push(`${user_id}(${sklUser.nickname || sklUser.endfield_uid})`)
            continue
          }

          if (res.data?.already_signed) {
            signed_count += 1
            continue
          }

          success_count += 1
        } catch (err) {
          fail_count += 1
          fail_users.push(`${user_id}(${sklUser.nickname || sklUser.endfield_uid})`)
        }
      }
    }

    let completeMsg = getMessage('attendance.task_complete', {
      total: keys.length,
      signed: signed_count,
      success: success_count,
      fail: fail_count
    })
    if (fail_users.length > 0) {
      completeMsg += getMessage('attendance.task_complete_fail_users', { fail_users: fail_users.join('\n') })
    }

    logger.mark(`[终末地插件][签到任务]任务完成：${keys.length}个\n已签：${signed_count}个\n成功：${success_count}个\n失败：${fail_count}个`)

    await this.sendNotifyList(completeMsg, excludeId)
    
    if (is_manual) {
      await this.e.reply(completeMsg)
    }
    return true
  }
}
