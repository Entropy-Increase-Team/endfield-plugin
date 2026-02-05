import setting from './setting.js'

/** 统一占位符替换 */
function replacePlaceholders(message, params = {}) {
  const data = {
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