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
 * 清理账号列表：
 * 1. 移除 is_active === false 的无效账号（授权已撤销）
 * 2. 按 role_id 去重（优先保留 is_primary 的，其次保留 last_sync 更新的）
 */
export function cleanAccounts(accounts) {
  if (!Array.isArray(accounts)) return []
  const normalized = accounts.map(normalizeBinding).filter(Boolean)
  // 移除无效账号（is_active === false 表示授权已撤销）
  const valid = normalized.filter(acc => acc.is_active !== false)
  // 按 role_id 去重
  const byRoleId = new Map()
  for (const acc of valid) {
    const rid = acc.role_id != null ? String(acc.role_id) : ''
    if (!rid) continue
    const existing = byRoleId.get(rid)
    if (!existing) {
      byRoleId.set(rid, acc)
    } else if (acc.is_primary && !existing.is_primary) {
      byRoleId.set(rid, acc)
    } else if (!!acc.is_primary === !!existing.is_primary) {
      if ((acc.last_sync || acc.bind_time || 0) > (existing.last_sync || existing.bind_time || 0)) {
        byRoleId.set(rid, acc)
      }
    }
  }
  return Array.from(byRoleId.values())
}

/** 写入用户绑定列表；写入前移除无效账号并按 role_id 去重 */
export async function saveUserBindings(userId, accounts) {
  if (!Array.isArray(accounts)) accounts = [accounts].filter(Boolean)
  const cleaned = cleanAccounts(accounts)
  const key = REDIS_KEY(userId)
  if (cleaned.length === 0) {
    await redis.del(key)
    return
  }
  // 确保至少有一个账号为当前选中
  if (!cleaned.some(acc => acc.is_primary)) {
    cleaned[0].is_primary = true
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

    // 按 is_primary 选取当前账号（is_active 表示有效性，cleanAccounts 已过滤无效的）
    const isPrimary = (acc) => acc.is_primary === true
    let user_info = accounts.find(isPrimary) || accounts[0]
    if (!isPrimary(user_info) && accounts.length > 0) {
      const updated = accounts.map((acc, i) => ({ ...acc, is_primary: i === 0 }))
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

  /**
   * 获取该用户绑定的所有账号，返回已初始化的 EndfieldUser 实例数组
   * 每个实例对应一个绑定的游戏账号，均可直接调用 sklReq
   * @returns {Promise<EndfieldUser[]>}
   */
  static async getAllUsers(userId, option = {}) {
    const text = await redis.get(REDIS_KEY(userId))
    if (!text) return []

    let accounts = []
    try {
      const data = JSON.parse(text)
      accounts = Array.isArray(data) ? data : [data]
      accounts = cleanAccounts(accounts)
    } catch (err) {
      logger.error(`[终末地插件]解析用户绑定信息失败: ${err}`)
      return []
    }

    const users = []
    for (const acc of accounts) {
      if (!acc.framework_token) continue
      const u = new EndfieldUser(userId, option)
      u.framework_token = acc.framework_token
      u.binding_id = acc.binding_id || null
      u.endfield_uid = Number(acc.role_id || 0)
      u.server_id = Number(acc.server_id || 1)
      u.nickname = acc.nickname || ''
      u.sklReq = new EndfieldRequest(u.endfield_uid, '', '')
      u.sklReq.setFrameworkToken(u.framework_token)
      users.push(u)
    }
    return users
  }
}

