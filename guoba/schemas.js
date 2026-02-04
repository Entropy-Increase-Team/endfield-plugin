import pluginInfo from './pluginInfo.js'
import getCommonSchemas from './common.js'
import getSignSchemas from './sign.js'
import getGachaSchemas from './gacha.js'
import getMessageSchemas from './message.js'

export { pluginInfo }

/** 锅巴配置项 schema 列表，groupList 由 supportGuoba 注入 */
export function getSchemas(groupList) {
  return [
    ...getCommonSchemas(),
    ...getSignSchemas(groupList),
    ...getGachaSchemas(groupList),
    ...getMessageSchemas(),
  ]
}
