/**
 * Redis 清理：移除 ENDFIELD 命名空间下的无用/过期 key
 * 命令：:redis清理（仅管理员）
 */

/** 当前仍在使用的 key 前缀白名单 */
const VALID_PREFIXES = [
  'ENDFIELD:USER:',
  'ENDFIELD:MAAEND_DEVICES:',
  'ENDFIELD:MAAEND_DEFAULT:',
  'ENDFIELD:MAAEND_JOBS:',
  'ENDFIELD:STAMINA_SUBSCRIBE',
  'ENDFIELD:ANNOUNCEMENT_SUBSCRIBE',
  'ENDFIELD:GACHA:SIMULATE:STATE:',
  'ENDFIELD:GACHA_PENDING:',
  'ENDFIELD:GACHA_LAST_ANALYSIS:',
  'ENDFIELD:PHONE_BIND:',
]

/** 过期日期型 key（按日期判断是否过期） */
const DAILY_PREFIX = 'ENDFIELD:GACHA:SIMULATE:DAILY:'

/** 将 key 归类到功能前缀（如 ENDFIELD:USER:*），未匹配返回 null */
function getGroupPrefix(key) {
  for (const p of VALID_PREFIXES) {
    if (p.endsWith(':') && key.startsWith(p)) return p + '*'
    if (key === p) return p
  }
  if (key.startsWith(DAILY_PREFIX)) return DAILY_PREFIX + '*'
  return null
}

function isValidKey(key) {
  if (VALID_PREFIXES.some(p => key === p.replace(/:$/, '') || key.startsWith(p))) return true
  if (key.startsWith(DAILY_PREFIX)) {
    const rest = key.slice(DAILY_PREFIX.length)
    const dateStr = rest.split(':')[0]
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const keyDate = new Date(dateStr + 'T00:00:00')
      return !isNaN(keyDate.getTime()) && keyDate >= today
    }
    return true
  }
  return false
}

export class EndfieldRedisClean extends plugin {
  constructor() {
    super({
      name: '[endfield-plugin]Redis清理',
      dsc: '清理 ENDFIELD 命名空间下的无用 Redis key',
      event: 'message',
      priority: 50,
      rule: [
        {
          reg: '^(?:[:：]|#zmd|#终末地)redis清理$',
          fnc: 'cleanRedis',
          permission: 'master'
        }
      ]
    })
  }

  async cleanRedis() {
    if (!this.e?.isMaster) return false
    if (!redis) {
      await this.reply('Redis 不可用')
      return true
    }

    let allKeys = []
    try {
      allKeys = await redis.keys('ENDFIELD:*')
    } catch (err) {
      await this.reply(`扫描 Redis 失败：${err?.message || err}`)
      return true
    }

    if (allKeys.length === 0) {
      await this.reply('ENDFIELD 命名空间下没有任何 key。')
      return true
    }

    // 收集有设备绑定的用户，用于判断旧 MAAEND_DEFAULT / MAAEND_JOBS 是否孤立
    const maaDeviceUsers = new Set()
    for (const key of allKeys) {
      if (key.startsWith('ENDFIELD:MAAEND_DEVICES:')) {
        maaDeviceUsers.add(key.replace('ENDFIELD:MAAEND_DEVICES:', ''))
      }
    }

    const toDelete = []
    const kept = {}
    for (const key of allKeys) {
      // 旧 maa 键：MAAEND_DEFAULT / MAAEND_JOBS 没有对应 MAAEND_DEVICES → 孤立，清理
      if (key.startsWith('ENDFIELD:MAAEND_DEFAULT:')) {
        const uid = key.replace('ENDFIELD:MAAEND_DEFAULT:', '')
        if (!maaDeviceUsers.has(uid)) { toDelete.push(key); continue }
      }
      if (key.startsWith('ENDFIELD:MAAEND_JOBS:')) {
        const uid = key.replace('ENDFIELD:MAAEND_JOBS:', '')
        if (!maaDeviceUsers.has(uid)) { toDelete.push(key); continue }
      }

      if (isValidKey(key)) {
        const gp = getGroupPrefix(key) || 'ENDFIELD:*'
        kept[gp] = (kept[gp] || 0) + 1
      } else {
        toDelete.push(key)
      }
    }

    if (toDelete.length > 0) {
      for (const key of toDelete) {
        try {
          await redis.del(key)
        } catch (err) {
          logger.error(`[终末地插件][Redis清理] 删除 ${key} 失败: ${err?.message}`)
        }
      }
    }

    // 构建合并转发消息
    const msgs = []
    const botId = this.e.self_id || Bot.uin

    // 摘要
    const summary = [
      '【Redis 清理完成】',
      '',
      `扫描：${allKeys.length} 个 key`,
      `删除：${toDelete.length} 个无用 key`,
      `保留：${allKeys.length - toDelete.length} 个有效 key`,
    ]
    msgs.push({ message: summary.join('\n'), nickname: 'Redis 清理', user_id: botId })

    // 已删除明细
    if (toDelete.length > 0) {
      const grouped = {}
      for (const key of toDelete) {
        const gp = getGroupPrefix(key) || 'ENDFIELD:*'
        grouped[gp] = (grouped[gp] || 0) + 1
      }
      const delLines = ['已删除：']
      for (const [prefix, count] of Object.entries(grouped)) {
        delLines.push(`  ${prefix} × ${count}`)
      }
      msgs.push({ message: delLines.join('\n'), nickname: '删除明细', user_id: botId })

      // 详细 key 列表（超过 50 条截断）
      const detail = toDelete.slice(0, 50).map(k => `  ${k}`)
      if (toDelete.length > 50) detail.push(`  ...及其他 ${toDelete.length - 50} 个`)
      msgs.push({ message: '详细 key：\n' + detail.join('\n'), nickname: '删除列表', user_id: botId })
    }

    // 保留明细
    if (Object.keys(kept).length > 0) {
      const keepLines = ['保留：']
      for (const [prefix, count] of Object.entries(kept)) {
        keepLines.push(`  ${prefix} × ${count}`)
      }
      msgs.push({ message: keepLines.join('\n'), nickname: '保留明细', user_id: botId })
    }

    // 发送合并转发
    try {
      const forwardMsg = await this.e.group?.makeForwardMsg?.(msgs) || await this.e.friend?.makeForwardMsg?.(msgs)
      if (forwardMsg) {
        await this.reply(forwardMsg)
      } else {
        // 降级：逐条发送
        for (const m of msgs) await this.reply(m.message)
      }
    } catch {
      for (const m of msgs) await this.reply(m.message)
    }
    return true
  }
}
