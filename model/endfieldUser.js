import EndfieldRequest from './endfieldReq.js'

// ---------- Redis 绑定存储（原 bindingStorage）：仅允许以下字段（snake_case） ----------
const ALLOWED_BINDING_KEYS = [
  'framework_token', 'binding_id', 'user_identifier', 'role_id', 'nickname',
  'server_id', 'is_active', 'is_primary', 'client_type', 'login_type', 'bind_time', 'last_sync'
]

export const REDIS_KEY = (userId) => `ENDFIELD:USER:${userId}`

/** 将单条绑定规范为仅允许的字段，兼容旧数据 isActive -> is_active */
function normalizeBinding(acc) {
  if (!acc || typeof acc !== 'object') return null
  const out = {}
  out.is_active = !!(acc.is_active ?? acc.isActive)
  for (const key of ALLOWED_BINDING_KEYS) {
    if (key === 'is_active') continue
    const v = acc[key]
    if (v !== undefined && v !== null) out[key] = v
  }
  return out
}

/**
 * 清理账号列表：移除 is_active 为 false 的记录，并按 role_id 去重（每个 role_id 只保留一条，优先保留 last_sync 更新的）
 * 保证 Redis 中一个用户下 role_id 唯一，且不存储已失效的绑定
 */
export function cleanAccounts(accounts) {
  if (!Array.isArray(accounts)) return []
  const normalized = accounts.map(normalizeBinding).filter(Boolean)
  const activeOnly = normalized.filter(acc => acc.is_active === true)
  const byRoleId = new Map()
  for (const acc of activeOnly) {
    const rid = acc.role_id != null ? String(acc.role_id) : ''
    const existing = byRoleId.get(rid)
    if (!existing || (acc.last_sync || acc.bind_time || 0) > (existing.last_sync || existing.bind_time || 0)) {
      byRoleId.set(rid, acc)
    }
  }
  return Array.from(byRoleId.values())
}

/** 写入用户绑定列表；写入前自动清除 is_active=false 并按 role_id 去重 */
export async function saveUserBindings(userId, accounts) {
  if (!Array.isArray(accounts)) accounts = [accounts].filter(Boolean)
  const cleaned = cleanAccounts(accounts)
  const key = REDIS_KEY(userId)
  if (cleaned.length === 0) {
    await redis.del(key)
    return
  }
  await redis.set(key, JSON.stringify(cleaned))
}

// ---------- EndfieldUser ----------
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
    const user_info_text = await redis.get(REDIS_KEY(this.user_id))
    if (!user_info_text) return false

    let accounts = []
    try {
      const data = JSON.parse(user_info_text)
      if (Array.isArray(data)) accounts = data
      else {
        accounts = [{ ...data, is_active: true }]
      }
      const cleaned = cleanAccounts(accounts)
      if (cleaned.length !== accounts.length) {
        await saveUserBindings(this.user_id, cleaned)
        accounts = cleaned
      } else {
        accounts = cleaned
      }
    } catch (err) {
      logger.error(`[终末地插件]解析用户绑定信息失败: ${err}`)
      return false
    }

    if (accounts.length === 0) return false

    const isActive = (acc) => acc.is_active === true
    let user_info = accounts.find(isActive) || accounts[0]
    if (!isActive(user_info) && accounts.length > 0) {
      const updated = accounts.map((acc, i) => ({ ...acc, is_active: i === 0 }))
      await saveUserBindings(this.user_id, updated)
      user_info = updated[0]
    }

    this.framework_token = user_info.framework_token || null
    this.binding_id = user_info.binding_id || null

    if (!this.framework_token) {
      logger.error(`[终末地插件]统一后端模式缺少 framework_token`)
      return false
    }
    this.endfield_uid = Number(user_info?.role_id || 0)
    this.server_id = Number(user_info?.server_id || 1)
    this.sklReq = new EndfieldRequest(this.endfield_uid, '', '')
    this.sklReq.setFrameworkToken(this.framework_token)

    return true
  }
}

