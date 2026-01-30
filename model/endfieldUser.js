import EndfieldRequest from './endfieldReq.js'

export default class EndfieldUser {
  constructor(user_id, option = {}) {
    this.user_id = user_id
    this.endfield_uid = 0
    this.server_id = 1
    this.framework_token = null
    this.binding_id = null
    this.sklReq = null

    this.option = {
      log: true,
      ...option
    }
  }

  async getUser() {
    const user_info_text = await redis.get(`ENDFIELD:USER:${this.user_id}`)
    if (!user_info_text) return false

    let accounts = []
    try {
      const data = JSON.parse(user_info_text)
      if (Array.isArray(data)) accounts = data
      else {
        data.isActive = true
        accounts = [data]
      }
    } catch (err) {
      logger.error(`[终末地插件]解析用户绑定信息失败: ${err}`)
      return false
    }

    if (accounts.length === 0) return false

    let user_info = accounts.find(acc => acc.is_active || acc.isActive) || accounts[0]
    if (!user_info.is_active && !user_info.isActive && accounts.length > 0) {
      accounts.forEach(acc => {
        acc.is_active = false
        acc.isActive = false
      })
      user_info.is_active = true
      user_info.isActive = true
      accounts[0] = user_info
      await redis.set(`ENDFIELD:USER:${this.user_id}`, JSON.stringify(accounts))
    }

    this.framework_token = user_info.framework_token || null
    this.binding_id = user_info.binding_id || null
    
    if (!this.framework_token) {
      logger.error(`[终末地插件]统一后端模式缺少 framework_token`)
      return false
    }
    this.endfield_uid = Number(user_info?.role_id || user_info?.roleId || 0)
    this.server_id = Number(user_info?.server_id || user_info?.serverId || 1)
    this.sklReq = new EndfieldRequest(this.endfield_uid, '', '')
    this.sklReq.setFrameworkToken(this.framework_token)
    
    return true
  }
}

