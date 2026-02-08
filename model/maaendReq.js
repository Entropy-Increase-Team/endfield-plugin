/**
 * MaaEnd 远程控制 API 请求封装
 * 认证方式：X-API-Key（与 config/common.yaml 中 api_key 一致）
 * 文档：MaaEnd-API.md
 */
import setting from '../utils/setting.js'

const BASE_URL = 'https://end-api.shallow.ink'

export default class MaaendRequest {
  constructor(option = {}) {
    this.commonConfig = setting.getConfig('common') || {}
    this.baseUrl = BASE_URL
    this.option = { log: true, ...option }
  }

  getHeaders(extra = {}) {
    const apiKey = this.commonConfig.api_key
    if (!apiKey || String(apiKey).trim() === '') {
      logger.error('[终末地插件][MaaEnd] 未配置 api_key')
      return null
    }
    return {
      'X-API-Key': apiKey,
      'Content-Type': 'application/json',
      ...extra
    }
  }

  async request(method, path, body = null, opts = {}) {
    const headers = this.getHeaders(opts.headers)
    if (!headers) return null
    const url = `${this.baseUrl}${path}`
    const config = {
      method,
      headers,
      timeout: opts.timeout ?? 30000
    }
    if (body && (method === 'POST' || method === 'PATCH')) {
      config.body = typeof body === 'string' ? body : JSON.stringify(body)
    }
    try {
      const response = await fetch(url, config)
      const isImage = (opts.accept === 'image/png' && response.headers.get('content-type')?.includes('image'))
      if (isImage) {
        const buf = await response.arrayBuffer()
        return { ok: response.ok, code: response.ok ? 0 : response.status, data: Buffer.from(buf), isImage: true }
      }
      const data = await response.json().catch(() => ({}))
      if (this.option.log) {
        logger.mark(`[终末地插件][MaaEnd] ${method} ${path} ${response.status}`)
      }
      return { ok: response.ok, code: data.code ?? (response.ok ? 0 : response.status), message: data.message, data: data.data }
    } catch (err) {
      logger.error(`[终末地插件][MaaEnd] request error: ${err.message}`)
      return null
    }
  }

  /** 生成绑定码 */
  async createBindCode() {
    return this.request('POST', '/api/maaend/devices/bind-code')
  }

  /** 获取设备列表 */
  async getDevices() {
    return this.request('GET', '/api/maaend/devices')
  }

  /** 获取设备可用任务 */
  async getDeviceTasks(deviceId) {
    return this.request('GET', `/api/maaend/devices/${encodeURIComponent(deviceId)}/tasks`)
  }

  /** 执行任务 */
  async runTask(deviceId, body) {
    return this.request('POST', `/api/maaend/devices/${encodeURIComponent(deviceId)}/tasks`, body)
  }

  /** 查询任务状态 */
  async getJob(jobId) {
    return this.request('GET', `/api/maaend/jobs/${encodeURIComponent(jobId)}`)
  }

  /** 停止任务 */
  async stopJob(jobId) {
    return this.request('POST', `/api/maaend/jobs/${encodeURIComponent(jobId)}/stop`)
  }

  /** 任务历史 */
  async getJobs(params = {}) {
    const q = new URLSearchParams()
    if (params.page != null) q.set('page', params.page)
    if (params.limit != null) q.set('limit', params.limit)
    if (params.device_id) q.set('device_id', params.device_id)
    const query = q.toString()
    return this.request('GET', `/api/maaend/jobs${query ? `?${query}` : ''}`)
  }

  /** 获取设备截图（accept: 'image/png' 返回图片 buffer，否则返回 JSON） */
  async getScreenshot(deviceId, acceptImage = false) {
    const path = `/api/maaend/devices/${encodeURIComponent(deviceId)}/screenshot`
    const headers = acceptImage ? { Accept: 'image/png' } : {}
    return this.request('GET', path, null, { headers, accept: acceptImage ? 'image/png' : undefined, timeout: 15000 })
  }

  /** 重置设备任务状态 */
  async resetDevice(deviceId) {
    return this.request('POST', `/api/maaend/devices/${encodeURIComponent(deviceId)}/reset`)
  }

  /** 修改设备名称 */
  async updateDevice(deviceId, deviceName) {
    return this.request('PATCH', `/api/maaend/devices/${encodeURIComponent(deviceId)}`, { device_name: deviceName })
  }

  /** 删除设备 */
  async deleteDevice(deviceId) {
    return this.request('DELETE', `/api/maaend/devices/${encodeURIComponent(deviceId)}`)
  }
}
