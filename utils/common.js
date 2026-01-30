import setting from './setting.js'

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildRulePrefix() {
  const cfg = setting.getConfig('common') || {}
  const mode = Number(cfg.prefix_mode) || 1
  const keywords = Array.isArray(cfg.keywords) && cfg.keywords.length
    ? cfg.keywords
    : ['终末地', 'zmd']

  let prefixChar
  if (mode === 2) {
    prefixChar = '#'
  } else {
    prefixChar = ':：'
  }

  const sorted = [...keywords].sort((a, b) => (b?.length ?? 0) - (a?.length ?? 0))
  const part = sorted.map((k) => escapeRegex(k)).filter(Boolean).join('|') || '终末地'
  if (mode === 2) {
    return `[${prefixChar}](${part})`
  }
  return `[:：]`
}

export const rulePrefix = buildRulePrefix()

function getPrefix() {
  const commonConfig = setting.getConfig('common') || {}
  const mode = Number(commonConfig.prefix_mode) || 1
  return mode === 2 ? '#zmd' : ':'
}

function replacePlaceholders(message, params = {}) {
  let result = message
  const prefix = getPrefix()
  result = result.replace(/{prefix}/g, prefix)
  for (const [key, value] of Object.entries(params)) {
    const replacement = (value !== undefined && value !== null) ? String(value) : ''
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), replacement)
  }
  return result
}

export function getUnbindMessage() {
  const messageConfig = setting.getConfig('message') || {}
  let message = messageConfig.unbind_message || `未绑定终末地森空岛账号\n绑定命令 (仅私聊)\n1. {prefix}扫码登陆 -- 森空岛app扫码\n2. {prefix}手机登陆 [手机号] -- 手机号验证码登陆`
  return replacePlaceholders(message)
}

export function getMessage(path, params = {}) {
  const messageConfig = setting.getConfig('message') || {}
  const keys = path.split('.')
  let message = messageConfig
  for (const key of keys) {
    if (message && typeof message === 'object') {
      message = message[key]
    } else {
      message = undefined
      break
    }
  }
  if (!message || typeof message !== 'string') {
    return `[消息未配置: ${path}]`
  }
  
  return replacePlaceholders(message, params)
}

