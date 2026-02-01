import EndfieldApi from './endfieldApi.js'
import setting from '../utils/setting.js'

export default class EndfieldRequest {
  constructor(uid, cred, token = '', option = {}) {
    this.uid = uid
    this.framework_token = null
    this.server = 'cn'
    this.endfieldApi = new EndfieldApi(this.uid, this.server)
    this.commonConfig = setting.getConfig('common') || {}
    this.unifiedBackendBaseUrl = 'https://end-api.shallow.ink'

    this.option = {
      log: true,
      ...option
    }
  }

  setFrameworkToken(frameworkToken) {
    this.framework_token = frameworkToken
  }

  getUrl(type, data = {}) {
    let urlMap = this.endfieldApi.getUrlMap({ ...data })
    if (!urlMap[type]) return false

    let { url, query = '', body = '', method = '' } = urlMap[type]

    if (query) {
      url += `?${query}`
    }
    if (body) {
      body = JSON.stringify(body)
    }
    
    return { url, headers: {}, body, method }
  }

  async getData(type, data = {}) {
    if (!this.framework_token) {
      logger.error(`[终末地插件][统一后端]缺少 framework_token`)
      return false
    }

    let { url, headers = {}, body, method } = this.getUrl(type, data)
    if (!url) return false

    headers['X-Framework-Token'] = this.framework_token
    headers['Content-Type'] = 'application/json'
    if (this.commonConfig.api_key) {
      headers['X-API-Key'] = this.commonConfig.api_key
    }

    if (data.headers) {
      headers = { ...headers, ...data.headers }
      delete data.headers
    }

    let param = {
      headers,
      timeout: 25000
    }
    if (method) {
      param.method = method
      if (body) param.body = body
    } else if (body) {
      param.method = 'post'
      param.body = body
    } else {
      param.method = 'get'
    }

    let response = {}
    let start = Date.now()
    try {
      response = await fetch(url, param)
    } catch (error) {
      logger.error(`[终末地插件][统一后端] fetch error：${error.toString()}`)
      return false
    }

    if (!response.ok) {
      logger.error(`[终末地插件][统一后端][${type}][${this.uid}] ${response.status} ${response.statusText}`)
      return false
    }

    if (this.option.log) {
      logger.mark(`[终末地插件][统一后端][${type}][${this.uid}] ${Date.now() - start}ms`)
    }

    const res = await response.json()
    if (!res) return false

    res.api = type
    return res
  }

  /**
   * Wiki 百科 API 请求（仅需 api_key，无需 framework_token）
   * @param {string} type - wiki_search | wiki_item_detail
   * @param {object} data - q/main_type_id/sub_type_id/page/page_size 或 id
   */
  async getWikiData(type, data = {}) {
    const urlMap = this.endfieldApi.getWikiUrlMap(data)[type]
    if (!urlMap) {
      logger.error(`[终末地插件][Wiki] 未知类型: ${type}`)
      return false
    }
    if (!this.commonConfig.api_key || String(this.commonConfig.api_key).trim() === '') {
      logger.error(`[终末地插件][Wiki] 未配置 api_key`)
      return false
    }
    let url = urlMap.url
    if (urlMap.query) {
      url += `?${urlMap.query}`
    }
    const headers = {
      'X-API-Key': this.commonConfig.api_key,
      'Content-Type': 'application/json'
    }
    try {
      const response = await fetch(url, { headers, method: 'get', timeout: 25000 })
      if (!response.ok) {
        logger.error(`[终末地插件][Wiki][${type}] ${response.status} ${response.statusText}`)
        return false
      }
      const res = await response.json()
      if (!res) return false
      res.api = type
      return res
    } catch (error) {
      logger.error(`[终末地插件][Wiki][${type}] fetch error: ${error.toString()}`)
      return false
    }
  }
}
