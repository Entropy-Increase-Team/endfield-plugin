import setting from '../utils/setting.js'

function getUnifiedBackendConfig() {
  const commonConfig = setting.getConfig('common') || {}
  return {
    baseUrl: 'https://end-api.shallow.ink',
    authorizationFrontendUrl: 'https://end.shallow.ink',
    apiKey: commonConfig.api_key || ''
  }
}

let hypergryphAPI = {
  async getUnifiedBackendQR() {
    const config = getUnifiedBackendConfig()

    try {
      const response = await fetch(`${config.baseUrl}/login/endfield/qr`, {
        timeout: 25000,
        method: 'get'
      })

      if (!response.ok) {
        logger.error(`[终末地插件][统一后端][获取二维码]${response.status} ${response.statusText}`)
        return null
      }

      const res = await response.json()
      if (res?.code !== 0) {
        logger.error(`[终末地插件][统一后端][获取二维码]${JSON.stringify(res)}`)
        return null
      }

      return res.data
    } catch (error) {
      logger.error(`[终末地插件][统一后端][获取二维码]${error.toString()}`)
      return null
    }
  },

  async getUnifiedBackendQRStatus(frameworkToken) {
    const config = getUnifiedBackendConfig()
    const requestUrl = `${config.baseUrl}/login/endfield/qr/status?framework_token=${frameworkToken}`

    try {
      const response = await fetch(requestUrl, {
        timeout: 25000,
        method: 'get'
      })

      if (!response.ok) {
        logger.error(`[终末地插件][统一后端][检查扫码状态]HTTP错误: ${response.status} ${response.statusText}`)
        return null
      }

      const res = await response.json()
      if (res?.code !== 0) {
        logger.error(`[终末地插件][统一后端][检查扫码状态]业务错误: code=${res?.code}, message=${res?.message || '(无)'}`)
        return null
      }

      return res.data
    } catch (error) {
      logger.error(`[终末地插件][统一后端][检查扫码状态]请求异常: ${error.toString()}`)
      return null
    }
  },

  async confirmUnifiedBackendLogin(frameworkToken, userIdentifier = '') {
    const config = getUnifiedBackendConfig()
    const requestUrl = `${config.baseUrl}/login/endfield/qr/confirm`
    const requestBody = {
      framework_token: frameworkToken,
      user_identifier: userIdentifier,
      platform: 'bot'
    }

    try {
      const response = await fetch(requestUrl, {
        timeout: 25000,
        method: 'post',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      })

      if (!response.ok) {
        try {
          const errorBody = await response.text()
          logger.error(`[终末地插件][统一后端][确认登录]请求失败: ${response.status} ${response.statusText}, 响应: ${errorBody}`)
        } catch (e) {
          logger.error(`[终末地插件][统一后端][确认登录]请求失败: ${response.status} ${response.statusText}`)
        }
        return null
      }

      const res = await response.json()
      
      if (res?.code !== 0) {
        logger.error(`[终末地插件][统一后端][确认登录]业务错误: ${JSON.stringify(res)}`)
        return null
      }

      return res.data
    } catch (error) {
      logger.error(`[终末地插件][统一后端][确认登录]请求异常: ${error.toString()}`)
      return null
    }
  },

  async unifiedBackendPhoneLogin(phone, code) {
    const config = getUnifiedBackendConfig()

    try {
      const response = await fetch(`${config.baseUrl}/login/endfield/phone/verify`, {
        timeout: 25000,
        method: 'post',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code })
      })

      if (!response.ok) {
        logger.error(`[终末地插件][统一后端][手机登录]${response.status} ${response.statusText}`)
        return null
      }

      const res = await response.json()
      if (res?.code !== 0) {
        logger.error(`[终末地插件][统一后端][手机登录]${JSON.stringify(res)}`)
        return null
      }

      return res.data
    } catch (error) {
      logger.error(`[终末地插件][统一后端][手机登录]${error.toString()}`)
      return null
    }
  },

  async unifiedBackendSendPhoneCode(phone) {
    const config = getUnifiedBackendConfig()

    try {
      const response = await fetch(`${config.baseUrl}/login/endfield/phone/send`, {
        timeout: 25000,
        method: 'post',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone })
      })

      if (!response.ok) {
        logger.error(`[终末地插件][统一后端][发送验证码]${response.status} ${response.statusText}`)
        return false
      }

      const res = await response.json()
      if (res?.code !== 0) {
        logger.error(`[终末地插件][统一后端][发送验证码]${JSON.stringify(res)}`)
        return false
      }

      logger.mark(`[终末地插件][统一后端][发送验证码]验证码发送成功`)
      return true
    } catch (error) {
      logger.error(`[终末地插件][统一后端][发送验证码]${error.toString()}`)
      return false
    }
  },

  async unifiedBackendCredLogin(cred) {
    const config = getUnifiedBackendConfig()

    try {
      const response = await fetch(`${config.baseUrl}/login/endfield/cred`, {
        timeout: 25000,
        method: 'post',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cred })
      })

      if (!response.ok) {
        logger.error(`[终末地插件][统一后端][Cred登录]${response.status} ${response.statusText}`)
        return null
      }

      const res = await response.json()
      if (res?.code !== 0) {
        logger.error(`[终末地插件][统一后端][Cred登录]${JSON.stringify(res)}`)
        return null
      }

      return res.data
    } catch (error) {
      logger.error(`[终末地插件][统一后端][Cred登录]${error.toString()}`)
      return null
    }
  },

  async createUnifiedBackendBinding(frameworkToken, userIdentifier, isPrimary = true, clientId = '') {
    const config = getUnifiedBackendConfig()
    const headers = {
      'Content-Type': 'application/json',
      ...(config.apiKey ? { 'X-API-Key': config.apiKey } : {})
    }

    try {
      const response = await fetch(`${config.baseUrl}/api/v1/bindings`, {
        timeout: 25000,
        method: 'post',
        headers,
        body: JSON.stringify({
          framework_token: frameworkToken,
          user_identifier: userIdentifier,
          client_type: 'bot',
          client_id: clientId || `bot-${userIdentifier}`,
          is_primary: isPrimary
        })
      })

      if (!response.ok) {
        logger.error(`[终末地插件][统一后端][创建绑定]${response.status} ${response.statusText}`)
        return null
      }

      const res = await response.json()
      if (res?.code !== 0) {
        logger.error(`[终末地插件][统一后端][创建绑定]${JSON.stringify(res)}`)
        return null
      }

      return res.data
    } catch (error) {
      logger.error(`[终末地插件][统一后端][创建绑定]${error.toString()}`)
      return null
    }
  },

  /**
   * 健康检测 GET /health
   * 用于授权轮询前判断后端是否可用，避免 502 时误删绑定
   * @returns {boolean} true=健康可用，false=不可用
   */
  async getUnifiedBackendHealth() {
    const config = getUnifiedBackendConfig()
    try {
      const response = await fetch(`${config.baseUrl}/health`, {
        timeout: 10000,
        method: 'get'
      })
      if (!response.ok) return false
      const res = await response.json()
      return res?.code === 0 && res?.data?.status === 'healthy'
    } catch (error) {
      return false
    }
  },

  async getUnifiedBackendBindings(userIdentifier) {
    const config = getUnifiedBackendConfig()
    const headers = config.apiKey ? { 'X-API-Key': config.apiKey } : {}

    try {
      const response = await fetch(`${config.baseUrl}/api/v1/bindings?user_identifier=${userIdentifier}&client_type=bot`, {
        timeout: 25000,
        method: 'get',
        headers
      })

      if (!response.ok) {
        logger.error(`[终末地插件][统一后端][获取绑定列表]${response.status} ${response.statusText}`)
        // 502/500 等服务器错误时返回 null，与「确认无绑定」区分，避免轮询误删
        return null
      }

      const res = await response.json()
      if (res?.code !== 0) {
        logger.error(`[终末地插件][统一后端][获取绑定列表]${JSON.stringify(res)}`)
        return null
      }

      return res.data?.bindings || []
    } catch (error) {
      logger.error(`[终末地插件][统一后端][获取绑定列表]${error.toString()}`)
      return null
    }
  },

  async deleteUnifiedBackendBinding(bindingId, userIdentifier) {
    const config = getUnifiedBackendConfig()
    const headers = config.apiKey ? { 'X-API-Key': config.apiKey } : {}
    const queryParams = userIdentifier ? `?user_identifier=${userIdentifier}&client_type=bot` : ''

    try {
      const response = await fetch(`${config.baseUrl}/api/v1/bindings/${bindingId}${queryParams}`, {
        timeout: 25000,
        method: 'delete',
        headers
      })

      if (!response.ok) {
        logger.error(`[终末地插件][统一后端][删除绑定]${response.status} ${response.statusText}`)
        return false
      }

      const res = await response.json()
      return res?.code === 0
    } catch (error) {
      logger.error(`[终末地插件][统一后端][删除绑定]${error.toString()}`)
      return false
    }
  },

  async setUnifiedBackendPrimaryBinding(bindingId, userIdentifier) {
    const config = getUnifiedBackendConfig()
    const headers = config.apiKey ? { 'X-API-Key': config.apiKey } : {}
    const queryParams = userIdentifier ? `?user_identifier=${userIdentifier}&client_type=bot` : ''

    try {
      const response = await fetch(`${config.baseUrl}/api/v1/bindings/${bindingId}/primary${queryParams}`, {
        timeout: 25000,
        method: 'post',
        headers
      })

      if (!response.ok) {
        logger.error(`[终末地插件][统一后端][设置主绑定]${response.status} ${response.statusText}`)
        return false
      }

      const res = await response.json()
      return res?.code === 0
    } catch (error) {
      logger.error(`[终末地插件][统一后端][设置主绑定]${error.toString()}`)
      return false
    }
  },

  async createAuthorizationRequest(params) {
    const config = getUnifiedBackendConfig()
    if (!config.apiKey) {
      logger.error('[终末地插件][授权登陆]未配置 api_key，请在 config/common.yaml 中填写')
      return null
    }

    try {
      const response = await fetch(`${config.baseUrl}/api/v1/authorization/requests`, {
        timeout: 25000,
        method: 'post',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': config.apiKey
        },
        body: JSON.stringify({
          client_id: params.client_id || 'qqbot',
          client_name: params.client_name || '终末地机器人',
          client_type: params.client_type || 'bot',
          scopes: params.scopes || ['user_info', 'binding_info', 'game_data', 'attendance']
        })
      })

      if (!response.ok) {
        logger.error(`[终末地插件][授权登陆][创建请求]${response.status} ${response.statusText}`)
        return null
      }

      const res = await response.json()
      if (res?.code !== 0) {
        logger.error(`[终末地插件][授权登陆][创建请求]${JSON.stringify(res)}`)
        return null
      }

      const data = res.data || {}
      let authUrl = data.auth_url || ''
      if (authUrl && authUrl.startsWith('/')) {
        const base = config.authorizationFrontendUrl || config.baseUrl
        authUrl = base ? base + authUrl : config.baseUrl + authUrl
      }
      return { ...data, auth_url: authUrl }
    } catch (error) {
      logger.error(`[终末地插件][授权登陆][创建请求]${error.toString()}`)
      return null
    }
  },

  async getAuthorizationRequestStatus(requestId) {
    const config = getUnifiedBackendConfig()
    if (!config.apiKey) return null

    try {
      const response = await fetch(
        `${config.baseUrl}/api/v1/authorization/requests/${encodeURIComponent(requestId)}/status`,
        {
          timeout: 25000,
          method: 'get',
          headers: { 'X-API-Key': config.apiKey }
        }
      )

      if (!response.ok) {
        logger.error(`[终末地插件][授权登陆][轮询状态]${response.status} ${response.statusText}`)
        return null
      }

      const res = await response.json()
      if (res?.code !== 0) {
        logger.error(`[终末地插件][授权登陆][轮询状态]${JSON.stringify(res)}`)
        return null
      }

      return res.data || null
    } catch (error) {
      logger.error(`[终末地插件][授权登陆][轮询状态]${error.toString()}`)
      return null
    }
  },

  /**
   * 检查客户端授权状态（用于网页授权删除时轮询）
   * GET /api/v1/authorization/clients/:client_id/status
   * @param {string} clientId 客户端标识（如 bot 的 self_id）
   * @param {string} [userIdentifier] 可选，用户标识，部分后端支持按用户查询
   * @returns {{ is_active: boolean, framework_token?: string, message?: string } | null}
   */
  async getAuthorizationClientStatus(clientId, userIdentifier = '') {
    const config = getUnifiedBackendConfig()
    if (!config.apiKey) return null

    const query = userIdentifier ? `?user_identifier=${encodeURIComponent(userIdentifier)}` : ''
    try {
      const response = await fetch(
        `${config.baseUrl}/api/v1/authorization/clients/${encodeURIComponent(clientId)}/status${query}`,
        {
          timeout: 15000,
          method: 'get',
          headers: { 'X-API-Key': config.apiKey }
        }
      )

      if (!response.ok) {
        if (response.status === 404) {
          return { is_active: false, message: '未找到该客户端的授权记录' }
        }
        logger.error(`[终末地插件][授权状态]${response.status} ${response.statusText}`)
        return null
      }

      const res = await response.json()
      if (res?.code !== 0) {
        logger.error(`[终末地插件][授权状态]${JSON.stringify(res)}`)
        return null
      }

      return res.data || null
    } catch (error) {
      logger.error(`[终末地插件][授权状态]${error.toString()}`)
      return null
    }
  },

  /**
   * 抽卡记录：获取可用账号列表
   * GET /api/endfield/gacha/accounts
   * @param {string} frameworkToken 用户凭证
   * @returns {{ accounts: Array, count: number, need_select: boolean } | null}
   */
  async getGachaAccounts(frameworkToken) {
    const config = getUnifiedBackendConfig()
    const headers = { 'X-Framework-Token': frameworkToken }
    if (config.apiKey) headers['X-API-Key'] = config.apiKey

    try {
      const response = await fetch(`${config.baseUrl}/api/endfield/gacha/accounts`, {
        timeout: 15000,
        method: 'get',
        headers
      })
      const bodyText = await response.text()
      const res = bodyText ? JSON.parse(bodyText) : null
      if (!response.ok) {
        logger.error(`[终末地插件][抽卡账号列表]${response.status} ${response.statusText} | ${res?.message || bodyText?.slice(0, 100)}`)
        return null
      }
      if (res?.code !== 0) return null
      return res.data || null
    } catch (error) {
      logger.error(`[终末地插件][抽卡账号列表]${error.toString()}`)
      return null
    }
  },

  /**
   * 抽卡记录：启动同步任务（异步）
   * POST /api/endfield/gacha/fetch
   * 后端根据 body.role_id 判断：数据库已有相同 roleId 则增量同步，否则全量
   * @param {string} frameworkToken 用户凭证
   * @param {{ account_uid?: string, role_id?: string }} body
   * @returns {{ status: string, message?: string } | null} 成功返回 data，409 表示正在同步中
   */
  async postGachaFetch(frameworkToken, body = {}) {
    const config = getUnifiedBackendConfig()
    const headers = { 'X-Framework-Token': frameworkToken, 'Content-Type': 'application/json' }
    if (config.apiKey) headers['X-API-Key'] = config.apiKey

    try {
      const response = await fetch(`${config.baseUrl}/api/endfield/gacha/fetch`, {
        timeout: 15000,
        method: 'post',
        headers,
        body: JSON.stringify(body)
      })
      const bodyText = await response.text()
      const res = bodyText ? JSON.parse(bodyText) : null
      if (!response.ok) {
        if (response.status === 409) return { status: 'conflict', message: res?.message || '正在同步中' }
        logger.error(`[终末地插件][抽卡同步启动]${response.status} ${response.statusText} | ${res?.message || bodyText?.slice(0, 100)}`)
        return null
      }
      if (res?.code !== 0) return null
      return res.data || null
    } catch (error) {
      logger.error(`[终末地插件][抽卡同步启动]${error.toString()}`)
      return null
    }
  },

  /**
   * 抽卡记录：获取同步状态（轮询）
   * GET /api/endfield/gacha/sync/status
   * @param {string} frameworkToken 用户凭证
   * @returns {{ status: string, progress?: number, message?: string, records_found?: number, new_records?: number, error?: string, ... } | null}
   */
  async getGachaSyncStatus(frameworkToken) {
    const config = getUnifiedBackendConfig()
    const headers = { 'X-Framework-Token': frameworkToken }
    if (config.apiKey) headers['X-API-Key'] = config.apiKey

    try {
      const response = await fetch(`${config.baseUrl}/api/endfield/gacha/sync/status`, {
        timeout: 15000,
        method: 'get',
        headers
      })
      const bodyText = await response.text()
      const res = bodyText ? JSON.parse(bodyText) : null
      if (!response.ok) return null
      if (res?.code !== 0) return null
      return res.data || null
    } catch (error) {
      logger.error(`[终末地插件][抽卡同步状态]${error.toString()}`)
      return null
    }
  },

  /**
   * 抽卡记录：获取已保存的记录（分页、卡池筛选）
   * GET /api/endfield/gacha/records
   * @param {string} frameworkToken 用户凭证
   * @param {{ pools?: string, page?: number, limit?: number }} params
   * @returns {{ records: Array, total: number, stats?: object, user_info?: object } | null}
   */
  async getGachaRecords(frameworkToken, params = {}) {
    const config = getUnifiedBackendConfig()
    const headers = { 'X-Framework-Token': frameworkToken }
    if (config.apiKey) headers['X-API-Key'] = config.apiKey
    const q = new URLSearchParams()
    if (params.pools) q.set('pools', params.pools)
    if (params.page != null) q.set('page', String(params.page))
    if (params.limit != null) q.set('limit', String(params.limit))
    const query = q.toString()

    try {
      const url = `${config.baseUrl}/api/endfield/gacha/records${query ? `?${query}` : ''}`
      const response = await fetch(url, { timeout: 15000, method: 'get', headers })
      const bodyText = await response.text()
      const res = bodyText ? JSON.parse(bodyText) : null
      if (!response.ok) return null
      if (res?.code !== 0) return null
      return res.data || null
    } catch (error) {
      logger.error(`[终末地插件][抽卡记录]${error.toString()}`)
      return null
    }
  },

  /**
   * 抽卡记录：分页拉取全部记录（用于抽卡分析等需要全量数据的场景）
   * @param {string} frameworkToken 用户凭证
   * @param {{ pools?: string, limit?: number }} params 卡池与每页条数（默认 500）
   * @returns {{ records: Array, total: number, stats?: object, user_info?: object } | null}
   */
  async getGachaRecordsAllPages(frameworkToken, params = {}) {
    const limit = params.limit ?? 500
    const first = await this.getGachaRecords(frameworkToken, { ...params, page: 1, limit })
    if (!first) return null
    const records = [...(first.records || [])]
    const pages = first.pages ?? 1
    if (pages <= 1) return { ...first, records }
    for (let page = 2; page <= pages; page++) {
      const next = await this.getGachaRecords(frameworkToken, { ...params, page, limit })
      if (next?.records?.length) records.push(...next.records)
    }
    return { ...first, records }
  },

  /**
   * 抽卡记录：获取统计信息
   * GET /api/endfield/gacha/stats
   * @param {string} frameworkToken 用户凭证
   * @returns {{ stats: object, pool_stats?: object, last_fetch?: string, has_records?: boolean, user_info?: object } | null}
   */
  async getGachaStats(frameworkToken) {
    const config = getUnifiedBackendConfig()
    const headers = { 'X-Framework-Token': frameworkToken }
    if (config.apiKey) headers['X-API-Key'] = config.apiKey

    try {
      const response = await fetch(`${config.baseUrl}/api/endfield/gacha/stats`, {
        timeout: 15000,
        method: 'get',
        headers
      })
      const bodyText = await response.text()
      const res = bodyText ? JSON.parse(bodyText) : null
      if (!response.ok) return null
      if (res?.code !== 0) return null
      return res.data || null
    } catch (error) {
      logger.error(`[终末地插件][抽卡统计]${error.toString()}`)
      return null
    }
  },

  /**
   * 抽卡记录：全服统计（公开接口，无需认证）
   * GET /api/endfield/gacha/global-stats
   * @param {string} [poolPeriod] 限定池分期（卡池名称），只统计该期；不传则返回全量
   * @param {boolean} [refresh] 是否强制刷新缓存
   * @returns {{ cached?: boolean, last_update?: string, stats?: object } | null}
   */
  async getGachaGlobalStats(poolPeriod = '', refresh = false) {
    const config = getUnifiedBackendConfig()
    const headers = {}
    if (config.apiKey) headers['X-API-Key'] = config.apiKey
    const qs = new URLSearchParams()
    if (poolPeriod && String(poolPeriod).trim()) qs.set('pool_period', String(poolPeriod).trim())
    if (refresh === true) qs.set('refresh', 'true')
    const query = qs.toString()
    const url = `${config.baseUrl}/api/endfield/gacha/global-stats` + (query ? `?${query}` : '')

    try {
      const response = await fetch(url, {
        timeout: 15000,
        method: 'get',
        headers: Object.keys(headers).length ? headers : undefined
      })
      const bodyText = await response.text()
      const res = bodyText ? JSON.parse(bodyText) : null
      if (!response.ok) return null
      if (res?.code !== 0) return null
      return res.data || null
    } catch (error) {
      logger.error(`[终末地插件][全服抽卡统计]${error.toString()}`)
      return null
    }
  },

  /**
   * 获取卡池角色/武器分布（用于模拟抽卡展示具体角色封面与名称）
   * GET /api/endfield/gacha/pool-chars
   * @param {string} [poolType] 卡池类型 limited/weapon/standard
   * @returns {{ pools: Array<{ star6_chars, star5_chars, star4_chars }> } | null}
   */
  async getGachaPoolChars(poolType = '') {
    const config = getUnifiedBackendConfig()
    const headers = {}
    if (config.apiKey) headers['X-API-Key'] = config.apiKey
    try {
      const query = poolType ? `?pool_type=${encodeURIComponent(poolType)}` : ''
      const response = await fetch(`${config.baseUrl}/api/endfield/gacha/pool-chars${query}`, {
        timeout: 10000,
        method: 'get',
        headers
      })
      const bodyText = await response.text()
      const res = bodyText ? JSON.parse(bodyText) : null
      if (!response.ok || !res || res.code !== 0) return null
      return res.data || null
    } catch (error) {
      logger.error(`[终末地插件][卡池角色分布]${error.toString()}`)
      return null
    }
  },

  /**
   * 模拟抽卡：获取卡池规则（用于计算当前概率/保底进度）
   * GET /api/endfield/gacha/simulate/rules?pool_type={poolType}
   * @param {string} [poolType=limited] limited/weapon/standard
   * @returns {{ pool_type: string, rules: object, all_rules?: object } | null}
   */
  async getGachaSimulateRules(poolType = 'limited') {
    const config = getUnifiedBackendConfig()
    const headers = {}
    if (config.apiKey) headers['X-API-Key'] = config.apiKey
    try {
      const q = poolType ? `?pool_type=${encodeURIComponent(poolType)}` : ''
      const response = await fetch(`${config.baseUrl}/api/endfield/gacha/simulate/rules${q}`, {
        timeout: 10000,
        method: 'get',
        headers
      })
      const bodyText = await response.text()
      const res = bodyText ? JSON.parse(bodyText) : null
      if (!response.ok || !res || res.code !== 0) return null
      return res.data || null
    } catch (error) {
      logger.error(`[终末地插件][模拟抽卡规则]${error.toString()}`)
      return null
    }
  },

  /**
   * 模拟抽卡：单抽（公开接口，无需认证）
   * POST /api/endfield/gacha/simulate/single
   * @param {string} [poolType=limited] 卡池类型 limited/weapon/standard
   * @param {object} [state] 模拟器状态，不传则从头开始
   * @returns {{ result: object, state: object } | null}
   */
  async postGachaSimulateSingle(poolType = 'limited', state = null) {
    const config = getUnifiedBackendConfig()
    const headers = { 'Content-Type': 'application/json' }
    if (config.apiKey) headers['X-API-Key'] = config.apiKey
    try {
      const body = { pool_type: poolType }
      if (state && typeof state === 'object') body.state = state
      const response = await fetch(`${config.baseUrl}/api/endfield/gacha/simulate/single`, {
        timeout: 15000,
        method: 'post',
        headers,
        body: JSON.stringify(body)
      })
      const bodyText = await response.text()
      const res = bodyText ? JSON.parse(bodyText) : null
      if (!response.ok || !res || res.code !== 0) return null
      return res.data || null
    } catch (error) {
      logger.error(`[终末地插件][模拟单抽]${error.toString()}`)
      return null
    }
  },

  /**
   * 模拟抽卡：十连（公开接口，无需认证）
   * POST /api/endfield/gacha/simulate/ten
   * @param {string} [poolType=limited] 卡池类型
   * @param {object} [state] 模拟器状态
   * @returns {{ results: array, state: object } | null}
   */
  async postGachaSimulateTen(poolType = 'limited', state = null) {
    const config = getUnifiedBackendConfig()
    const headers = { 'Content-Type': 'application/json' }
    if (config.apiKey) headers['X-API-Key'] = config.apiKey
    try {
      const body = { pool_type: poolType }
      if (state && typeof state === 'object') body.state = state
      const response = await fetch(`${config.baseUrl}/api/endfield/gacha/simulate/ten`, {
        timeout: 15000,
        method: 'post',
        headers,
        body: JSON.stringify(body)
      })
      const bodyText = await response.text()
      const res = bodyText ? JSON.parse(bodyText) : null
      if (!response.ok || !res || res.code !== 0) return null
      return res.data || null
    } catch (error) {
      logger.error(`[终末地插件][模拟十连]${error.toString()}`)
      return null
    }
  }
}

export default hypergryphAPI
