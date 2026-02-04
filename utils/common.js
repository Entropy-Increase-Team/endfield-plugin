import setting from './setting.js'

const DEFAULT_KEYWORDS = ['终末地', 'zmd']
const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** 统一获取配置 */
function getCommonCfg() {
  const cfg = setting.getConfig('common') || {}
  const kw = Array.isArray(cfg.keywords) && cfg.keywords.length ? cfg.keywords : DEFAULT_KEYWORDS
  const mode = Number(cfg.prefix_mode) || 1
  return { kw, mode }
}

export const getKeywords = () => getCommonCfg().kw

export function ruleReg(suffix, fnc, extra = {}) {
  return {
    get reg() { return new RegExp('^' + getRulePrefix() + suffix) },
    fnc,
    ...extra
  }
}

export function getRulePrefix() {
  const { kw, mode } = getCommonCfg()
  if (mode !== 1) return '[:：]'
  const part = [...kw].sort((a, b) => b.length - a.length).map(escapeRegex).join('|')
  return `[#](${part})`
}

export function getPrefixStripRegex() {
  const { kw, mode } = getCommonCfg()
  if (mode === 2) return /^[:：]\s*/
  const part = kw.map(escapeRegex).join('|')
  return new RegExp(`^#(${part})?\\s*`)
}

export const getKeywordsDisplay = () => getKeywords().map(k => `#${k}`).join(' / ')

/** 统一占位符替换 */
function replacePlaceholders(message, params = {}) {
  const { kw, mode } = getCommonCfg()
  const data = {
    prefix: mode === 1 ? `#${kw[0]}` : ':',
    keywords: getKeywordsDisplay(),
    ...params
  }
  return message.replace(/\{(\w+)\}/g, (_, key) => 
    data[key] !== undefined && data[key] !== null ? String(data[key]) : `{${key}}`
  )
}

/** 路径查找 */
function lookupMessage(config, path) {
  const value = path.split('.').reduce((obj, key) => obj?.[key], config)
  return typeof value === 'string' ? value : undefined
}

export function getMessage(path, params = {}) {
  const message = lookupMessage(setting.getConfig('message'), path) 
    || lookupMessage(setting.getdefSet?.('message'), path)
  
  return message ? replacePlaceholders(message, params) : `[消息未配置: ${path}]`
}

export const getUnbindMessage = () => getMessage('unbind_message')