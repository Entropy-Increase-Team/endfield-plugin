import { rulePrefix, getUnbindMessage, getMessage } from '../utils/common.js'
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
          reg: `^${rulePrefix}签到$`,
          fnc: 'attendance'
        },
        {
          reg: `^${rulePrefix}全部签到$`,
          permission: 'master',
          fnc: 'attendance_task'
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
    const sklUser = new EndfieldUser(userId)
    if (!await sklUser.getUser()) {
      await this.reply(getUnbindMessage())
      return true
    }

    const res = await sklUser.sklReq.getData('endfield_attendance')
    
    if (!res || res.code !== 0) {
      logger.error(`[终末地插件][签到]请求失败，响应:${JSON.stringify(res)}`)
      await this.reply(getMessage('attendance.sign_failed'))
      return true
    }

    if (res.data?.already_signed) {
      await this.reply(res.data.message || getMessage('attendance.already_signed'))
      return true
    }

    const awardIds = res.data?.awardIds || []
    const resourceInfoMap = res.data?.resourceInfoMap || {}
    let reply_msg = `签到完成！此次签到获得了:`
    
    if (!awardIds.length) {
      reply_msg += `\n无奖励信息`
    } else {
      for (let award of awardIds) {
        const item = resourceInfoMap?.[award.id] || {}
        reply_msg += `\n${item.name || '未知'} * ${item.count ?? award.count ?? 0}`
      }
    }
    
    await this.reply(reply_msg)
    return true
  }

  async attendance_task() {
    const is_manual = !!this?.e?.msg
    const keys = await redis.keys('ENDFIELD:USER:*')
    let success_count = 0
    let signed_count = 0
    let fail_count = 0
    const fail_users = []

    logger.mark('[终末地插件][签到任务]签到任务开始')
    
    const startMsg = getMessage('attendance.task_start_broadcast', { count: keys.length })
    await Bot.sendMasterMsg(startMsg)
    
    if (is_manual) {
      await this.e.reply(getMessage('attendance.task_start'))
    }

    for (let key of keys) {
      const user_id = key.replace(/ENDFIELD:USER:/g, '')
      const sklUser = new EndfieldUser(user_id)
      await common.sleep(2000)
      
      if (!await sklUser.getUser()) {
        fail_count += 1
        fail_users.push(user_id)
        continue
      }

      const res = await sklUser.sklReq.getData('endfield_attendance')
      
      if (!res || res.code !== 0) {
        fail_count += 1
        fail_users.push(user_id)
        continue
      }

      if (res.data?.already_signed) {
        signed_count += 1
        continue
      }

      success_count += 1
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
    
    await Bot.sendMasterMsg(completeMsg)
    
    if (is_manual) {
      await this.e.reply(completeMsg)
    }
    return true
  }

  getCmdPrefix() {
    const mode = Number(this.common_setting?.prefix_mode) || 1
    return mode === 2 ? '#zmd' : ':'
  }
}
