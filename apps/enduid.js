import { rulePrefix, getMessage } from '../utils/common.js'
import EndfieldRequest from '../model/endfieldReq.js'
import setting from '../utils/setting.js'
import hypergryphAPI from '../model/hypergryphApi.js'

export class EndfieldUid extends plugin {
  constructor() {
    super({
      name: '[endfield-plugin]登陆相关',
      dsc: '终末地森空岛账号信息管理',
      event: 'message',
      priority: 100,
      rule: [
        {
          reg: `^${rulePrefix}(绑定|登陆|登录)$`,
          fnc: 'bind'
        },
        {
          reg: `^${rulePrefix}扫码(绑定|登陆|登录)$`,
          fnc: 'scanQRBind'
        },
        {
          reg: `^${rulePrefix}授权(绑定|登陆|登录)$`,
          fnc: 'authBind'
        },
        {
          reg: `^${rulePrefix}我的cred$`,
          fnc: 'myCred'
        },
        {
          reg: `^${rulePrefix}删除cred$`,
          fnc: 'delCred'
        },
        {
          reg: `^${rulePrefix}(绑定|登陆|登录)列表$`,
          fnc: 'bindList'
        },
        {
          reg: `^${rulePrefix}删除(绑定|登陆|登录)\\s+(\\d+)$`,
          fnc: 'deleteBind'
        },
        {
          reg: `^${rulePrefix}切换(绑定|登陆|登录)\\s+(\\d+)$`,
          fnc: 'switchBind'
        },
        {
          reg: `^${rulePrefix}(cred|绑定|登陆|登录)帮助$`,
          fnc: 'credHelp'
        },
        {
          reg: `^${rulePrefix}手机(绑定|登陆|登录)(\\s*\\d{11})?$`,
          fnc: 'phoneBind'
        },
        {
          reg: `^${rulePrefix}验证码\\s*(\\d{6})$`,
          fnc: 'phoneVerifyCode'
        }
      ]
    })
    this.help_setting = setting.getConfig('help')
    this.common_setting = setting.getConfig('common')
  }

  async bind() {
    if (this.e.isGroup) {
      await this.reply(getMessage('enduid.please_private'))
      return true
    }
    await this.reply(getMessage('enduid.cred_please'))
    this.setContext('receiveCred')
    return true
  }

  async receiveCred() {
    if (this.e.isGroup) return true

    const received = this.e.message?.[0]?.text?.trim?.() || ''
    if (received.length === 24) {
      await this.reply(getMessage('enduid.cred_no_token'))
      this.finish('receiveCred')
      return true
    }

    if (received.length !== 32) {
      await this.reply(getMessage('enduid.cred_invalid'))
      this.finish('receiveCred')
      return true
    }

    await this.reply(getMessage('enduid.cred_checking'))
    await this.checkCredAndSave(received)
    this.finish('receiveCred')
    return true
  }

  async saveUnifiedBackendBinding(frameworkToken, bindingData, loginType = 'unknown') {
    const newAccount = {
      framework_token: frameworkToken,
      binding_id: bindingData.id,
      user_identifier: String(this.e.user_id),
      role_id: String(bindingData.role_id || ''),
      nickname: bindingData.nickname || '',
      server_id: String(bindingData.server_id || 1),
      is_active: bindingData.is_primary || false,
      is_primary: bindingData.is_primary || false,
      client_type: 'bot',
      login_type: loginType,
      bind_time: Date.now(),
      last_sync: Date.now()
    }

    const existingText = await redis.get(`ENDFIELD:USER:${this.e.user_id}`)
    let accounts = []
    
    if (existingText) {
      try {
        const existing = JSON.parse(existingText)
        accounts = Array.isArray(existing) ? existing : [existing]
      } catch (err) {
        logger.error(`[终末地插件]解析现有账号失败: ${err}`)
        accounts = []
      }
    }

    const existingIndex = accounts.findIndex(acc => acc.binding_id === bindingData.id)
    if (existingIndex >= 0) {
      const prev = accounts[existingIndex]
      accounts[existingIndex] = { ...prev, ...newAccount, login_type: prev.login_type || newAccount.login_type }
      await this.reply(getMessage('enduid.binding_ok', { nickname: bindingData.nickname, role_id: bindingData.role_id, server_id: bindingData.server_id || 1 }))
    } else {
      if (accounts.length === 0) {
        newAccount.is_active = true
      }
      accounts.push(newAccount)
      await this.reply(getMessage('enduid.login_ok', { nickname: bindingData.nickname, role_id: bindingData.role_id, server_id: bindingData.server_id || 1, count: accounts.length }))
    }

    await redis.set(`ENDFIELD:USER:${this.e.user_id}`, JSON.stringify(accounts))
    return true
  }

  async checkCredAndSave(cred) {
    const loginRes = await hypergryphAPI.unifiedBackendCredLogin(cred)
    if (!loginRes || !loginRes.framework_token) {
      logger.error(`[终末地插件][统一后端]Cred登录失败`)
      await this.reply(getMessage('common.login_failed'))
      return false
    }

    const frameworkToken = loginRes.framework_token

    const bindingRes = await hypergryphAPI.createUnifiedBackendBinding(
      frameworkToken,
      String(this.e.user_id),
      true,
      String(this.e.self_id)
    )

    if (!bindingRes) {
      logger.error(`[终末地插件][统一后端]创建绑定失败`)
      await this.reply(getMessage('common.login_failed'))
      return false
    }

    return await this.saveUnifiedBackendBinding(frameworkToken, bindingRes, 'cred')
  }

  async authBind() {
    const config = this.common_setting || {}
    if (!config.api_key) {
      await this.reply(getMessage('enduid.auth_need_api_key'))
      return true
    }

    try {
      const clientId = String(this.e?.self_id || '')
      const clientName = config.auth_client_name || '终末地机器人'
      const clientType = config.auth_client_type || 'bot'
      const scopes = Array.isArray(config.auth_scopes) && config.auth_scopes.length > 0
        ? config.auth_scopes
        : ['user_info', 'binding_info', 'game_data', 'attendance']

      const authReq = await hypergryphAPI.createAuthorizationRequest({
        client_id: clientId,
        client_name: clientName,
        client_type: clientType,
        scopes
      })

      if (!authReq || !authReq.request_id || !authReq.auth_url) {
        await this.reply(getMessage('enduid.auth_create_failed'))
        return true
      }

      const requestId = authReq.request_id
      const authUrl = authReq.auth_url
      const expiresAt = authReq.expires_at || ''

      const formattedTime = this.formatAuthExpiryTime(expiresAt)
      const msg = [
        getMessage('enduid.auth_link_intro') + '\n',
        authUrl,
        formattedTime ? '\n' + getMessage('enduid.auth_link_expiry', { time: formattedTime }) : '',
        '\n' + getMessage('enduid.auth_link_wait')
      ].join('')
      await this.reply(msg)

      const maxAttempts = 90
      let authData = null
      for (let i = 0; i < maxAttempts; i++) {
        await this.sleep(2000)
        const statusData = await hypergryphAPI.getAuthorizationRequestStatus(requestId)
        if (!statusData) continue
        if (statusData.status === 'used' || statusData.status === 'approved') {
          if (statusData.framework_token) {
            authData = statusData
            logger.mark(`[终末地插件][授权登陆]用户已授权，request_id=${requestId}`)
            break
          }
        } else if (statusData.status === 'rejected') {
          await this.reply(getMessage('enduid.auth_rejected'))
          return true
        } else if (statusData.status === 'expired') {
          await this.reply(getMessage('enduid.auth_expired'))
          return true
        }
      }

      if (!authData || !authData.framework_token) {
        await this.reply(getMessage('enduid.auth_timeout'))
        return true
      }

      await this.reply(getMessage('enduid.auth_success'))

      const bindingRes = await hypergryphAPI.createUnifiedBackendBinding(
        authData.framework_token,
        String(this.e.user_id),
        true,
        String(this.e.self_id)
      )

      if (!bindingRes) {
        logger.error(`[终末地插件][授权登陆]创建绑定失败`)
        await this.reply(getMessage('enduid.bind_create_failed'))
        return true
      }

      await this.saveUnifiedBackendBinding(authData.framework_token, bindingRes, 'auth')
      return true
    } catch (error) {
      logger.error(`[终末地插件][授权登陆]出错: ${error}`)
      await this.reply(getMessage('enduid.auth_error'))
      return true
    }
  }

  async scanQRBind() {
    await this.reply(getMessage('enduid.qr_generating'))

    try {
      const qrData = await hypergryphAPI.getUnifiedBackendQR()
      if (!qrData || !qrData.framework_token || !qrData.qrcode) {
        await this.reply(getMessage('enduid.get_qrcode_failed'))
        return true
      }

      const frameworkToken = qrData.framework_token
      const qrcodeBase64 = qrData.qrcode
      const qrCodeBuffer = Buffer.from(qrcodeBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64')
      const msg = [
        '请使用森空岛APP扫描二维码进行登陆，二维码有效时间约3分钟。\n⚠️ 请不要扫描他人的登录二维码！',
        segment.image(qrCodeBuffer)
      ]
      await this.reply(msg)

      const maxAttempts = 90
      let loginData = null

      for (let i = 0; i < maxAttempts; i++) {
        await this.sleep(2000)
        const statusData = await hypergryphAPI.getUnifiedBackendQRStatus(frameworkToken)
        
        if (!statusData) continue

        if (statusData.status === 'done') {
          loginData = await hypergryphAPI.confirmUnifiedBackendLogin(frameworkToken, String(this.e.user_id))
          if (loginData && loginData.framework_token) {
            logger.mark(`[终末地插件][统一后端][扫码登录]确认登录成功`)
            break
          }
        } else if (statusData.status === 'expired') {
          logger.error(`[终末地插件][统一后端][扫码登录]二维码已过期`)
          await this.reply(getMessage('enduid.qr_expired'))
          return true
        } else if (statusData.status === 'failed') {
          logger.error(`[终末地插件][统一后端][扫码登录]登录失败`)
          await this.reply(getMessage('enduid.qr_login_failed'))
          return true
        } else if (statusData.status === 'scanned') {
          if (i === 0 || (i % 5 === 0)) await this.reply(getMessage('enduid.qr_confirm'))
        } else if (statusData.status === 'authed') {
          if (i === 0 || (i % 5 === 0)) {
            await this.reply(getMessage('enduid.qr_authed'))
          }
        }
      }

      if (!loginData || !loginData.framework_token) {
        await this.reply(getMessage('enduid.qr_timeout'))
        return true
      }

      await this.reply(getMessage('enduid.qr_login_ok'))

      const bindingRes = await hypergryphAPI.createUnifiedBackendBinding(
        loginData.framework_token,
        String(this.e.user_id),
        true,
        String(this.e.self_id)
      )

      if (!bindingRes) {
        logger.error(`[终末地插件][统一后端]创建绑定失败`)
        await this.reply(getMessage('enduid.bind_create_failed'))
        return true
      }

      await this.saveUnifiedBackendBinding(loginData.framework_token, bindingRes, 'qr')
      return true
    } catch (error) {
      logger.error(`[终末地插件][统一后端]扫码登陆出错: ${error}`)
      await this.reply(getMessage('enduid.qr_error'))
      return true
    }
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  async myCred() {
    if (this.e.isGroup) {
      await this.reply(getMessage('enduid.please_private_op'))
      return true
    }
    const txt = await redis.get(`ENDFIELD:USER:${this.e.user_id}`)
    if (!txt) {
      await this.reply(getMessage('enduid.unbind_hint', { prefix: this.getCmdPrefix() }))
      return true
    }
    try {
      const data = JSON.parse(txt)
      const accounts = Array.isArray(data) ? data : [data]
      const activeAccount = accounts.find(acc => acc.is_active || acc.isActive) || accounts[0]
      if (activeAccount?.framework_token) {
        await this.reply(getMessage('enduid.token_show', { token: activeAccount.framework_token }))
      } else {
        await this.reply(getMessage('enduid.token_not_found'))
      }
    } catch (error) {
      await this.reply(getMessage('enduid.read_bind_failed'))
    }
    return true
  }

  async delCred() {
    if (this.e.isGroup) {
      await this.reply(getMessage('enduid.please_private_op'))
      return true
    }
    await redis.del(`ENDFIELD:USER:${this.e.user_id}`)
    await this.reply(getMessage('enduid.delete_ok'))
    return true
  }

  async bindList() {
    const bindings = await hypergryphAPI.getUnifiedBackendBindings(String(this.e.user_id))
    
    if (!bindings || bindings.length === 0) {
      await this.reply(getMessage('enduid.not_logged_in'))
      return true
    }

    let accounts = []
    const txt = await redis.get(`ENDFIELD:USER:${this.e.user_id}`)
    if (txt) {
      try {
        const parsed = JSON.parse(txt)
        accounts = Array.isArray(parsed) ? parsed : [parsed]
      } catch (err) {}
    }

    const loginTypeLabel = { qr: '扫码', phone: '手机号', auth: '网页授权', cred: '网页授权' }
    const serverLabel = (serverId) => {
      const id = Number(serverId)
      if (id === 1) return '官服'
      if (id === 2) return 'B服'
      return serverId ? `ID=${serverId}` : '未知'
    }

    let msg = '【终末地登陆列表】\n\n'
    bindings.forEach((binding, index) => {
      const account = accounts.find(a => a.binding_id === binding.id)
      const typeLabel = loginTypeLabel[account?.login_type] || '未知'
      const activeMark = binding.is_primary ? ' ⭐当前' : ''
      msg += `[${index + 1}] 角色名：${binding.nickname || '未知'}${activeMark}\n`
      msg += `    角色ID：${binding.role_id || '未知'}\n`
      msg += `    服务器：${serverLabel(binding.server_id)}\n`
      msg += `    绑定类型：${typeLabel}\n`
      msg += `    绑定时间：${binding.created_at ? new Date(binding.created_at).toLocaleString('zh-CN') : '未知'}\n`
      if (index < bindings.length - 1) {
        msg += '\n'
      }
    })

    await this.reply(msg)
    return true
  }

  async deleteBind() {
    if (this.e.isGroup) {
      await this.reply(getMessage('enduid.please_private_op'))
      return true
    }

    const index = parseInt(this.e.msg.match(/\d+/)?.[0] || '0')
    if (index < 1) {
      await this.reply(getMessage('enduid.delete_index_hint', { prefix: this.getCmdPrefix() }))
      return true
    }

    const bindings = await hypergryphAPI.getUnifiedBackendBindings(String(this.e.user_id))
    
    if (!bindings || bindings.length === 0) {
      await this.reply(getMessage('common.not_found_login_info'))
      return true
    }

    if (index > bindings.length) {
      await this.reply(getMessage('enduid.index_out_of_range', { count: bindings.length }))
      return true
    }

    const deletedBinding = bindings[index - 1]
    let accounts = []
    const txt = await redis.get(`ENDFIELD:USER:${this.e.user_id}`)
    if (txt) {
      try {
        const parsed = JSON.parse(txt)
        accounts = Array.isArray(parsed) ? parsed : [parsed]
      } catch (err) {}
    }
    const account = accounts.find(a => a.binding_id === deletedBinding.id)
    if (account?.login_type === 'auth') {
      await this.reply(getMessage('enduid.unbind_auth_hint'))
      return true
    }
    const roleName = deletedBinding.nickname || '未知'
    const success = await hypergryphAPI.deleteUnifiedBackendBinding(deletedBinding.id, String(this.e.user_id))

    if (success) {
      const txt = await redis.get(`ENDFIELD:USER:${this.e.user_id}`)
      if (txt) {
        try {
          const accounts = JSON.parse(txt)
          const updatedAccounts = accounts.filter(acc => acc.binding_id !== deletedBinding.id)
          if (updatedAccounts.length === 0) {
            await redis.del(`ENDFIELD:USER:${this.e.user_id}`)
          } else {
            await redis.set(`ENDFIELD:USER:${this.e.user_id}`, JSON.stringify(updatedAccounts))
          }
        } catch (err) {}
      }
      
      await this.reply(getMessage('enduid.deleted_role', { roleName, suffix: bindings.length > 1 ? `\n剩余账号数：${bindings.length - 1}` : '' }))
    } else {
      await this.reply(getMessage('enduid.delete_failed'))
    }
    return true
  }

  async switchBind() {
    if (this.e.isGroup) {
      await this.reply(getMessage('enduid.please_private_op'))
      return true
    }

    const index = parseInt(this.e.msg.match(/\d+/)?.[0] || '0')
    if (index < 1) {
      await this.reply(getMessage('enduid.switch_index_hint', { prefix: this.getCmdPrefix() }))
      return true
    }

    const bindings = await hypergryphAPI.getUnifiedBackendBindings(String(this.e.user_id))
    
    if (!bindings || bindings.length === 0) {
      await this.reply(getMessage('common.not_found_login_info'))
      return true
    }

    if (index > bindings.length) {
      await this.reply(getMessage('enduid.index_out_of_range', { count: bindings.length }))
      return true
    }

    const targetBinding = bindings[index - 1]
    const success = await hypergryphAPI.setUnifiedBackendPrimaryBinding(targetBinding.id, String(this.e.user_id))

    if (success) {
      const txt = await redis.get(`ENDFIELD:USER:${this.e.user_id}`)
      if (txt) {
        try {
          const accounts = JSON.parse(txt)
          accounts.forEach(acc => {
            acc.is_active = acc.binding_id === targetBinding.id
            acc.is_primary = acc.binding_id === targetBinding.id
          })
          await redis.set(`ENDFIELD:USER:${this.e.user_id}`, JSON.stringify(accounts))
        } catch (err) {}
      }
      await this.reply(getMessage('enduid.switched', { nickname: targetBinding.nickname || '未知', role_id: targetBinding.role_id || '未知' }))
    } else {
      await this.reply(getMessage('enduid.switch_failed'))
    }
    return true
  }

  async phoneBind() {
    if (this.e.isGroup) {
      await this.reply(getMessage('enduid.phone_please_private'))
      return true
    }

    this.finish('receivePhone')
    this.finish('receivePhoneCode')

    const phoneMatch = this.e.msg.match(/手机(?:绑定|登陆)\s*(\d{11})/)
    const phone = phoneMatch ? phoneMatch[1] : null

    if (!phone) {
      await this.reply(getMessage('enduid.phone_ask_example', { prefix: this.getCmdPrefix() }))
      return true
    }

    await this.sendPhoneCodeAndWait(phone)
    return true
  }

  async receivePhone() {
    if (this.e.isGroup) return true

    const phone = this.e.message?.[0]?.text?.trim?.() || ''
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      await this.reply(getMessage('enduid.phone_invalid'))
      this.finish('receivePhone')
      return true
    }
    this.finish('receivePhone')
    await this.sendPhoneCodeAndWait(phone)
    return true
  }

  async sendPhoneCodeAndWait(phone) {
    const sendResult = await hypergryphAPI.unifiedBackendSendPhoneCode(phone)
    if (!sendResult) {
      await this.reply(getMessage('enduid.phone_send_failed'))
      return
    }

    const cacheData = { phone, timestamp: Date.now() }
    await redis.set(`ENDFIELD:PHONE_BIND:${this.e.user_id}`, JSON.stringify(cacheData), { EX: 300 })

    const prefix = this.getCmdPrefix()
    const mask = `${phone.substring(0, 3)}****${phone.substring(7)}`
    await this.reply(getMessage('enduid.phone_code_sent', { mask, prefix }))
  }

  async phoneVerifyCode() {
    if (this.e.isGroup) {
      await this.reply(getMessage('enduid.phone_please_private'))
      return true
    }

    const codeMatch = this.e.msg.match(/验证码\s*(\d{6})/)
    const code = codeMatch ? codeMatch[1] : null
    if (!code) {
      await this.reply(getMessage('enduid.phone_code_verify_example', { prefix: this.getCmdPrefix() }))
      return true
    }

    const cacheText = await redis.get(`ENDFIELD:PHONE_BIND:${this.e.user_id}`)
    if (!cacheText) {
      await this.reply(getMessage('enduid.phone_code_expired'))
      return true
    }

    let cache
    try {
      cache = JSON.parse(cacheText)
    } catch (e) {
      await this.reply(getMessage('enduid.phone_cache_error'))
      return true
    }

    if (!cache || !cache.phone) {
      await this.reply(getMessage('enduid.phone_code_expired'))
      return true
    }

    if (Date.now() - cache.timestamp > 5 * 60 * 1000) {
      await redis.del(`ENDFIELD:PHONE_BIND:${this.e.user_id}`)
      await this.reply(getMessage('enduid.phone_code_expired'))
      return true
    }

    const phone = cache.phone

    try {
      const loginData = await hypergryphAPI.unifiedBackendPhoneLogin(phone, code)
      if (!loginData || !loginData.framework_token) {
        await this.reply(getMessage('enduid.phone_code_wrong'))
        await redis.del(`ENDFIELD:PHONE_BIND:${this.e.user_id}`)
        return true
      }

      const bindingRes = await hypergryphAPI.createUnifiedBackendBinding(
        loginData.framework_token,
        String(this.e.user_id),
        true,
        String(this.e.self_id)
      )

      if (!bindingRes) {
        logger.error(`[终末地插件][统一后端]创建绑定失败`)
        await this.reply(getMessage('enduid.bind_create_failed'))
        await redis.del(`ENDFIELD:PHONE_BIND:${this.e.user_id}`)
        return true
      }

      await this.saveUnifiedBackendBinding(loginData.framework_token, bindingRes, 'phone')
      await redis.del(`ENDFIELD:PHONE_BIND:${this.e.user_id}`)
      await this.reply(getMessage('enduid.phone_login_ok'))
      return true
    } catch (error) {
      logger.error(`[终末地插件][手机登陆]登陆过程出错: ${error}`)
      await this.reply(getMessage('enduid.phone_login_error'))
      await redis.del(`ENDFIELD:PHONE_BIND:${this.e.user_id}`)
      return true
    }
  }

  async receivePhoneCode() {
    if (this.e.isGroup) return true

    const msg = this.e.message?.[0]?.text?.trim?.() || ''
    if (!/^\d+$/.test(msg)) {
      return false
    }

    if (!/^\d{6}$/.test(msg)) {
      await this.reply(getMessage('enduid.phone_code_digit'))
      return true
    }

    const code = msg
    const cacheText = await redis.get(`ENDFIELD:PHONE_BIND:${this.e.user_id}`)
    if (!cacheText) {
      await this.reply(getMessage('enduid.phone_code_expired'))
      this.finish('receivePhoneCode')
      return true
    }

    let cache
    try {
      cache = JSON.parse(cacheText)
    } catch (e) {
      await this.reply(getMessage('enduid.phone_cache_error'))
      this.finish('receivePhoneCode')
      return true
    }

    if (!cache || !cache.phone) {
      await this.reply(getMessage('enduid.phone_code_expired'))
      this.finish('receivePhoneCode')
      return true
    }
    if (Date.now() - cache.timestamp > 5 * 60 * 1000) {
      await redis.del(`ENDFIELD:PHONE_BIND:${this.e.user_id}`)
      await this.reply(getMessage('enduid.phone_code_expired'))
      this.finish('receivePhoneCode')
      return true
    }

    const phone = cache.phone
    try {
      const loginData = await hypergryphAPI.unifiedBackendPhoneLogin(phone, code)
      if (!loginData || !loginData.framework_token) {
        await this.reply(getMessage('enduid.phone_code_wrong'))
        await redis.del(`ENDFIELD:PHONE_BIND:${this.e.user_id}`)
        this.finish('receivePhoneCode')
        return true
      }
      const bindingRes = await hypergryphAPI.createUnifiedBackendBinding(
        loginData.framework_token,
        String(this.e.user_id),
        true,
        String(this.e.self_id)
      )

      if (!bindingRes) {
        logger.error(`[终末地插件][统一后端]创建绑定失败`)
        await this.reply(getMessage('enduid.bind_create_failed'))
        await redis.del(`ENDFIELD:PHONE_BIND:${this.e.user_id}`)
        this.finish('receivePhoneCode')
        return true
      }
      await this.saveUnifiedBackendBinding(loginData.framework_token, bindingRes, 'phone')
      await redis.del(`ENDFIELD:PHONE_BIND:${this.e.user_id}`)
      this.finish('receivePhoneCode')
      return true
    } catch (error) {
      logger.error(`[终末地插件][手机登陆]登陆过程出错: ${error}`)
      await this.reply(getMessage('enduid.phone_login_error'))
      await redis.del(`ENDFIELD:PHONE_BIND:${this.e.user_id}`)
      this.finish('receivePhoneCode')
      return true
    }
  }

  async credHelp() {
    const prefix = this.getCmdPrefix()
    const msg = getMessage('enduid.bind_help', { prefix })
    await this.reply(msg)
    return true
  }

  getCmdPrefix() {
    const mode = Number(this.common_setting?.prefix_mode) || 1
    return mode === 2 ? '#zmd' : ':'
  }

  formatAuthExpiryTime(isoString) {
    if (!isoString || typeof isoString !== 'string') return ''
    try {
      const d = new Date(isoString.trim())
      if (Number.isNaN(d.getTime())) return ''
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      const h = String(d.getHours()).padStart(2, '0')
      const min = String(d.getMinutes()).padStart(2, '0')
      const s = String(d.getSeconds()).padStart(2, '0')
      return `${y}-${m}-${day} ${h}:${min}:${s}`
    } catch {
      return ''
    }
  }
}

