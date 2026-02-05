import { getMessage } from '../utils/common.js'
import { saveUserBindings, cleanAccounts, REDIS_KEY } from '../model/endfieldUser.js'
import EndfieldRequest from '../model/endfieldReq.js'
import setting from '../utils/setting.js'
import hypergryphAPI from '../model/hypergryphApi.js'
import { sendOperatorList } from './operator.js'

// 网页授权绑定后台轮询任务
let authPollingTimer = null
let healthRecoveryTimer = null // 服务器不健康时，用于检测恢复的定时器

const POLL_INTERVAL_MS = 2 * 60 * 1000 // 2分钟轮询一次
const HEALTH_RECOVERY_INTERVAL_MS = 30 * 1000 // 服务器异常时，每30秒检测一次恢复
const AUTH_POLLING_START_DELAY_MS = 30 * 1000 // 启动后延迟 30 秒再执行第一次轮询

/**
 * 启动网页授权状态轮询任务
 * 定期检查所有网页授权类型的绑定，若授权被撤销则自动清理
 * 若 /health 检测不通过则暂停轮询，等服务器恢复后再开启
 * 保证：无论首次执行是否抛错，都会建立定时轮询，避免轮询“不执行”
 */
function startAuthPollingTask() {
  if (authPollingTimer) return

  const runPolling = async () => {
    try {
      const healthy = await hypergryphAPI.getUnifiedBackendHealth()
      if (!healthy) {
        if (authPollingTimer) {
          clearInterval(authPollingTimer)
          authPollingTimer = null
          logger.mark('[终末地插件][授权轮询]服务器健康检测不通过，暂停轮询，等待恢复')
        }
        startHealthRecoveryCheck()
        return
      }
      await checkAllAuthBindings()
    } catch (err) {
      logger.error(`[终末地插件][授权轮询任务]执行出错: ${err}`)
    }
  }

  function startHealthRecoveryCheck() {
    if (healthRecoveryTimer) return
    healthRecoveryTimer = setInterval(async () => {
      try {
        const healthy = await hypergryphAPI.getUnifiedBackendHealth()
        if (healthy) {
          clearInterval(healthRecoveryTimer)
          healthRecoveryTimer = null
          logger.mark('[终末地插件][授权轮询]服务器已恢复，重新启动授权轮询')
          authPollingTimer = setInterval(runPolling, POLL_INTERVAL_MS)
          await runPolling()
        }
      } catch (e) {
        logger.error(`[终末地插件][授权轮询]恢复检测异常: ${e}`)
      }
    }, HEALTH_RECOVERY_INTERVAL_MS)
  }

  function ensureIntervalStarted() {
    if (authPollingTimer || healthRecoveryTimer) return
    authPollingTimer = setInterval(runPolling, POLL_INTERVAL_MS)
    logger.mark('[终末地插件][授权轮询]定时轮询已启动，间隔 ' + (POLL_INTERVAL_MS / 60000) + ' 分钟')
  }

  // 延迟执行第一次轮询，且无论成功/抛错都确保启动定时器
  setTimeout(() => {
    runPolling()
      .catch((err) => logger.error(`[终末地插件][授权轮询]首次执行异常: ${err}`))
      .finally(ensureIntervalStarted)
  }, AUTH_POLLING_START_DELAY_MS)

  logger.mark('[终末地插件]网页授权状态轮询任务已注册，' + (AUTH_POLLING_START_DELAY_MS / 1000) + ' 秒后执行首次检查')
}

/**
 * 检查所有用户的网页授权绑定状态
 * 使用 Redis 扫描 ENDFIELD:USER:*，对每个用户校验授权是否仍存在
 */
async function checkAllAuthBindings() {
  if (!redis) {
    logger.warn('[终末地插件][授权轮询]redis 不可用，跳过本轮')
    return
  }
  let keys = []
  try {
    keys = await redis.keys('ENDFIELD:USER:*')
  } catch (err) {
    logger.error(`[终末地插件][授权轮询]redis.keys 失败: ${err}`)
    return
  }
  if (!keys || keys.length === 0) return

  for (const key of keys) {
    const userId = key.replace(/^ENDFIELD:USER:/, '')
    try {
      await checkUserAuthBindings(userId)
    } catch (err) {
      logger.error(`[终末地插件][授权轮询]检查用户 ${userId} 失败: ${err}`)
    }
  }
  logger.mark(`[终末地插件][授权轮询]本轮完成，共检查 ${keys.length} 个用户`)
}

/**
 * 检查单个用户的网页授权绑定状态
 * 使用 GET /api/v1/authorization/clients/:client_id/status，client_id 传对应用户的 user_id（绑定者ID）
 * @param {string} userId 用户ID（绑定者 QQ）
 */
async function checkUserAuthBindings(userId) {
  const txt = await redis.get(REDIS_KEY(userId))
  if (!txt) return

  let accounts = []
  try {
    const parsed = JSON.parse(txt)
    accounts = Array.isArray(parsed) ? parsed : [parsed]
  } catch (err) {
    return
  }

  // 筛选网页授权类型的账号
  const authAccounts = accounts.filter(acc => acc.login_type === 'auth' || acc.login_type === 'cred')
  if (authAccounts.length === 0) return

  // 使用「检查客户端授权状态」接口，传入对应用户的 user_id 作为 client_id
  const status = await hypergryphAPI.getAuthorizationClientStatus(userId)
  // 网络/服务错误返回 null，不判定为撤销，跳过本次
  if (status === null) return

  if (status.is_active === false) {
    // 授权已撤销：从本地移除该用户下所有网页授权类型账号
    const updatedAccounts = accounts.filter(acc => acc.login_type !== 'auth' && acc.login_type !== 'cred')
    await saveUserBindings(userId, updatedAccounts)
    logger.mark(`[终末地插件][授权轮询]用户 ${userId} 授权已撤销(is_active=false)，已移除本地网页授权绑定`)
    try {
      const nickname = authAccounts[0]?.nickname || '未知'
      const notifyMsg = getMessage('enduid.auth_auto_revoked', { nickname })
      if (Bot?.pickUser) {
        await Bot.pickUser(userId).sendMsg(notifyMsg)
      } else if (Bot?.sendPrivateMsg) {
        await Bot.sendPrivateMsg(userId, notifyMsg)
      }
    } catch (e) {
      // 通知失败不影响清理
    }
  }
}

/**
 * 启动时检查所有用户的绑定数据：移除 is_active === false 的记录，并按 role_id 去重
 * 若清理后与存储不一致则写回 Redis
 */
async function cleanAllUserBindingsOnStartup() {
  if (!redis) {
    logger.warn('[终末地插件][启动清理]redis 不可用，跳过')
    return
  }
  let keys = []
  try {
    keys = await redis.keys('ENDFIELD:USER:*')
  } catch (err) {
    logger.error(`[终末地插件][启动清理]redis.keys 失败: ${err}`)
    return
  }
  if (!keys || keys.length === 0) return

  let cleanedCount = 0
  for (const key of keys) {
    try {
      const txt = await redis.get(key)
      if (!txt) continue
      let accounts = []
      try {
        let parsed
        try {
          parsed = JSON.parse(txt)
        } catch (e) {
          // 兼容 Redis 中可能存在的非法 JSON（如数组/对象末尾多余逗号）
          const fixed = txt.replace(/,\s*([}\]])/g, '$1')
          parsed = JSON.parse(fixed)
        }
        accounts = Array.isArray(parsed) ? parsed : [parsed]
      } catch (e) {
        logger.warn(`[终末地插件][启动清理]解析 ${key} 失败，跳过: ${e?.message || e}`)
        continue
      }
      const cleaned = cleanAccounts(accounts)
      const needSave = cleaned.length !== accounts.length || accounts.some(acc => acc.is_active === false)
      if (needSave) {
        const userId = key.replace(/^ENDFIELD:USER:/, '')
        await saveUserBindings(userId, cleaned)
        cleanedCount += 1
      }
    } catch (err) {
      logger.error(`[终末地插件][启动清理]处理 ${key} 失败: ${err}`)
    }
  }
  if (cleanedCount > 0) {
    logger.mark(`[终末地插件][启动清理]完成，已修正 ${cleanedCount} 个用户的绑定数据（去重/移除 is_active=false）`)
  } else {
    logger.mark(`[终末地插件][启动清理]完成，共检查 ${keys.length} 个用户，无需修正`)
  }
}

// 启动时执行一次绑定数据清理，再启动授权轮询
cleanAllUserBindingsOnStartup().catch((err) => logger.error(`[终末地插件][启动清理]异常: ${err}`))
// 启动后台轮询任务
startAuthPollingTask()

export class EndfieldUid extends plugin {
  constructor() {
    super({
      name: '[endfield-plugin]登陆相关',
      dsc: '终末地森空岛账号信息管理',
      event: 'message',
      priority: 100,
      rule: [
        {
          reg: '^(?:[:：]|#zmd|#终末地)扫码(绑定|登陆|登录)$',
          fnc: 'scanQRBind'
        },
        {
          reg: '^(?:[:：]|#zmd|#终末地)授权(绑定|登陆|登录)$',
          fnc: 'authBind'
        },
        {
          reg: '^(?:[:：]|#zmd|#终末地)(绑定|登陆|登录)列表$',
          fnc: 'bindList'
        },
        {
          reg: '^(?:[:：]|#zmd|#终末地)删除(绑定|登陆|登录)\\s*(\\d+)$',
          fnc: 'deleteBind'
        },
        {
          reg: '^(?:[:：]|#zmd|#终末地)切换(绑定|登陆|登录)\\s*(\\d+)$',
          fnc: 'switchBind'
        },
        {
          reg: '^(?:[:：]|#zmd|#终末地)(绑定|登陆|登录)帮助$',
          fnc: 'credHelp'
        },
        {
          reg: '^(?:[:：]|#zmd|#终末地)手机(绑定|登陆|登录)(\\s*\\d{11})?$',
          fnc: 'phoneBind'
        },
        {
          reg: '^(?:[:：]|#zmd|#终末地)\\d{6}$',
          fnc: 'phoneVerifyCode'
        }
      ]
    })
    this.help_setting = setting.getConfig('help')
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

    const existingText = await redis.get(REDIS_KEY(this.e.user_id))
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
      accounts[existingIndex] = { ...prev, ...newAccount, login_type: prev.login_type || newAccount.login_type, is_active: true }
      for (let i = 0; i < accounts.length; i++) {
        if (i !== existingIndex) accounts[i].is_active = false
      }
    } else {
      newAccount.is_active = true
      for (const a of accounts) a.is_active = false
      accounts.push(newAccount)
    }

    // 仅保留云端仍存在的绑定；清除 is_active: false 且不在云端的记录（自动清除）
    try {
      const cloudBindings = await hypergryphAPI.getUnifiedBackendBindings(String(this.e.user_id))
      const cloudIds = new Set((cloudBindings || []).map(b => b.id))
      const before = accounts.length
      accounts = accounts.filter(acc => cloudIds.has(acc.binding_id))
      if (accounts.length < before) {
        logger.mark(`[终末地插件][绑定]已清除 ${before - accounts.length} 个不在云端的本地记录`)
      }
    } catch (e) {
      logger.error(`[终末地插件][绑定]拉取云端列表失败，跳过清除: ${e?.message || e}`)
    }

    // 自动清除 is_active 为 false 的记录，并按 role_id 去重，保证 Redis 中 role_id 唯一
    const beforeClean = accounts.length
    accounts = cleanAccounts(accounts)
    if (accounts.length < beforeClean) {
      logger.mark(`[终末地插件][绑定]已清除无效或重复 role_id 记录，当前账号数：${accounts.length}`)
    }

    if (existingIndex >= 0) {
      await this.reply(getMessage('enduid.binding_ok', { nickname: bindingData.nickname, role_id: bindingData.role_id, server_id: bindingData.server_id || 1 }))
    } else {
      await this.reply(getMessage('enduid.login_ok', { nickname: bindingData.nickname, role_id: bindingData.role_id, server_id: bindingData.server_id || 1, count: accounts.length }))
    }

    await saveUserBindings(this.e.user_id, accounts)
    // 绑定成功后自动发送干员列表（静默失败，不影响绑定流程）
    try {
      await sendOperatorList(this.e, this.e.user_id, { skipLoadingReply: true })
    } catch (err) {
      logger.error(`[终末地插件][绑定]绑定成功后发送干员列表失败: ${err}`)
    }
    return true
  }

  async authBind() {
    const config = this.common_setting || {}
    if (!config.api_key) {
      await this.reply(getMessage('enduid.auth_need_api_key'))
      return true
    }

    try {
      // 授权绑定使用绑定者 ID 作为 client_id（与后端「检查客户端授权状态」按绑定者区分）
      const clientId = String(this.e?.user_id || '')
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
      const authLinkSent = await this.reply(msg)

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
        clientId
      )

      if (!bindingRes) {
        logger.error(`[终末地插件][授权登陆]创建绑定失败`)
        await this.reply(getMessage('enduid.bind_create_failed'))
        return true
      }

      await this.saveUnifiedBackendBinding(authData.framework_token, bindingRes, 'auth')
      // 群聊时授权成功后撤回授权链接，私聊不管
      if (this.e.isGroup && authLinkSent?.message_id && this.e.group?.recallMsg) {
        try { await this.e.group.recallMsg(authLinkSent.message_id) } catch (e) { /* 撤回失败静默 */ }
      }
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
      const qrCodeSent = await this.reply(msg)

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
      // 群聊时扫码成功后撤回二维码，私聊不管
      if (this.e.isGroup && qrCodeSent?.message_id && this.e.group?.recallMsg) {
        try { await this.e.group.recallMsg(qrCodeSent.message_id) } catch (e) { /* 撤回失败静默 */ }
      }
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

  async bindList() {
    const bindings = await hypergryphAPI.getUnifiedBackendBindings(String(this.e.user_id))

    if (!bindings || bindings.length === 0) {
      await this.reply(getMessage('enduid.not_logged_in'))
      return true
    }

    let accounts = []
    const txt = await redis.get(REDIS_KEY(this.e.user_id))
    if (txt) {
      try {
        const parsed = JSON.parse(txt)
        const raw = Array.isArray(parsed) ? parsed : [parsed]
        accounts = cleanAccounts(raw)
        if (accounts.length !== raw.length) {
          await saveUserBindings(this.e.user_id, accounts)
        }
      } catch (err) {}
    }

    const loginTypeLabel = { qr: '扫码', phone: '手机号', auth: '网页授权', cred: '网页授权' }
    const serverLabel = (serverId) => {
      const id = Number(serverId)
      if (id === 1) return '官服'
      if (id === 2) return 'B服'
      return serverId ? `ID=${serverId}` : '未知'
    }

    const cloudIdSet = new Set(bindings.map(b => b.id))
    const bindingItems = bindings.map((binding, index) => {
      const account = accounts.find(a => a.binding_id === binding.id)
      const typeLabel = loginTypeLabel[account?.login_type] || '未知'
      return {
        index: index + 1,
        nickname: binding.nickname || '未知',
        role_id: binding.role_id || '未知',
        server_label: serverLabel(binding.server_id),
        type_label: typeLabel,
        created_at: binding.created_at ? new Date(binding.created_at).toLocaleString('zh-CN') : '未知',
        isPrimary: !!binding.is_primary
      }
    })

    // 当前 Redis 绑定：区分在云端列表有的 / 仅本地的
    const redisBindings = accounts.map((acc, idx) => {
      const inCloud = cloudIdSet.has(acc.binding_id)
      return {
        index: idx + 1,
        nickname: acc.nickname || '未知',
        role_id: acc.role_id || '未知',
        server_label: serverLabel(acc.server_id),
        type_label: loginTypeLabel[acc.login_type] || '未知',
        inCloud,
        isActive: !!acc.is_active
      }
    })

    // 优先使用渲染模板出图，失败则回退文字
    if (this.e?.runtime?.render) {
      try {
        const pluResPath = this.e?.runtime?.path?.plugin?.['endfield-plugin']?.res || ''
        const pageWidth = 420
        const baseOpt = { scale: 1.6, retType: 'base64', viewport: { width: pageWidth, height: 820 } }
        const renderData = {
          title: '终末地登陆列表',
          subtitle: `共 ${bindings.length} 个绑定`,
          bindings: bindingItems,
          redisBindings,
          pluResPath
        }
        const imgSegment = await this.e.runtime.render('endfield-plugin', 'enduid/bind-list', renderData, baseOpt)
        if (imgSegment) {
          await this.reply(imgSegment)
          return true
        }
      } catch (err) {
        logger.error(`[终末地插件][绑定列表]渲染图失败: ${err?.message || err}`)
      }
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
      if (index < bindings.length - 1) msg += '\n'
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
    const txt = await redis.get(REDIS_KEY(this.e.user_id))
    if (txt) {
      try {
        const parsed = JSON.parse(txt)
        accounts = Array.isArray(parsed) ? parsed : [parsed]
      } catch (err) {}
    }
    const account = accounts.find(a => a.binding_id === deletedBinding.id)
    if (account?.login_type === 'auth' || account?.login_type === 'cred') {
      // 网页授权类型由后台任务自动检测，无需手动删除
      await this.reply(getMessage('enduid.unbind_auth_auto'))
      return true
    }
    const roleName = deletedBinding.nickname || '未知'
    const bindingIdToDelete = deletedBinding.id
    const success = await hypergryphAPI.deleteUnifiedBackendBinding(bindingIdToDelete, String(this.e.user_id))

    if (success) {
      // 验证云端是否真的删除了：再次查询绑定列表，确认该绑定不存在
      const verifyBindings = await hypergryphAPI.getUnifiedBackendBindings(String(this.e.user_id))
      const stillExists = verifyBindings && verifyBindings.some(b => b.id === bindingIdToDelete)
      
      if (stillExists) {
        logger.error(`[终末地插件][删除绑定]云端验证失败，绑定 ${bindingIdToDelete} 仍然存在`)
        await this.reply(getMessage('enduid.delete_failed'))
        return true
      }
      
      const txt = await redis.get(REDIS_KEY(this.e.user_id))
      if (txt) {
        try {
          const accounts = JSON.parse(txt)
          const updatedAccounts = accounts.filter(acc => acc.binding_id !== bindingIdToDelete)
          await saveUserBindings(this.e.user_id, updatedAccounts)
        } catch (err) {}
      }
      
      await this.reply(getMessage('enduid.deleted_role', { roleName, suffix: bindings.length > 1 ? `\n剩余账号数：${bindings.length - 1}` : '' }))
    } else {
      await this.reply(getMessage('enduid.delete_failed'))
    }
    return true
  }

  /**
   * 网页授权删除：轮询授权状态接口，检测到用户已在官网解除授权后清理本地记录
   * @param {string} bindingId 要清理的绑定 ID
   * @param {string} userId 用户 ID
   * @param {string} clientId 客户端标识（授权绑定时为绑定者 user_id），用于请求 /authorization/clients/:client_id/status
   * @param {function(string, object): Promise} reply 回复函数，入参为 message 键与插值参数
   * @param {string} roleName 账号名称，用于提示文案
   */
  async pollAuthRevokedAndClean(bindingId, userId, clientId, reply, roleName = '未知') {
    const POLL_INTERVAL_MS = 12000
    const TIMEOUT_MS = 2.5 * 60 * 1000 // 2分30秒

    const start = Date.now()
    while (Date.now() - start < TIMEOUT_MS) {
      const status = await hypergryphAPI.getAuthorizationClientStatus(clientId, userId)
      if (status && status.is_active === false) {
        // 先调用服务端删除绑定 DELETE /api/v1/bindings/:id
        await hypergryphAPI.deleteUnifiedBackendBinding(bindingId, userId)
        const txt = await redis.get(REDIS_KEY(userId))
        if (txt) {
          try {
            const accounts = JSON.parse(txt)
            const updated = accounts.filter(acc => acc.binding_id !== bindingId)
            await saveUserBindings(userId, updated)
          } catch (err) {
            logger.error(`[终末地插件][网页授权轮询]清理本地记录失败: ${err}`)
          }
        }
        await reply('enduid.unbind_auth_revoked', { roleName })
        return
      }
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))
    }
    await reply('enduid.unbind_auth_poll_timeout')
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
      const txt = await redis.get(REDIS_KEY(this.e.user_id))
      if (txt) {
        try {
          const accounts = JSON.parse(txt)
          const updated = accounts.map(acc => ({
            ...acc,
            is_active: acc.binding_id === targetBinding.id,
            is_primary: acc.binding_id === targetBinding.id
          }))
          await saveUserBindings(this.e.user_id, updated)
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
    if (this.e.isGroup) return false

    // 仅当该用户存在待验证状态（发送过手机验证后）才将本条 6 位数字当作验证码处理，否则不消费消息
    const cacheText = await redis.get(`ENDFIELD:PHONE_BIND:${this.e.user_id}`)
    if (!cacheText) return false

    const raw = (this.e.msg || '').replace(/^([:：]|#zmd|#终末地)\s*/i, '').trim()
    const code = /^\d{6}$/.test(raw) ? raw : null
    if (!code) return false

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
    return mode === 1 ? `#${this.common_setting?.keywords?.[0] || 'zmd'}` : ':'
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

