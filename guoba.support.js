import setting from './utils/setting.js'
import lodash from 'lodash'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'node:fs'
import YAML from 'yaml'
import { pluginInfo, getSchemas } from './guoba/schemas.js'

const _path = process.cwd().replace(/\\/g, '/')
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export function supportGuoba() {
  const groupList = (() => {
    try {
      if (global.Bot?.gl) {
        return Array.from(Bot.gl.values()).map((item) => ({
          label: `${item.group_name || item.group_id}-${item.group_id}`,
          value: String(item.group_id)
        }))
      }
    } catch (e) {}
    return []
  })()

  return {
    pluginInfo,
    configInfo: {
      schemas: getSchemas(groupList),
      getConfigData() {
        const commonConfig = setting.getConfig('common') || {}
        const signConfig = setting.getConfig('sign') || {}
        const gachaConfig = setting.getConfig('gacha') || {}
        
        // message：defSet 为底，config 覆盖；config 中不存在的 defSet 键会增量显示，保存时全量写入 config
        const messageConfigPath = `${_path}/plugins/endfield-plugin/config/message.yaml`
        const messageDefSetPath = `${_path}/plugins/endfield-plugin/defSet/message.yaml`
        let messageDefSet = {}
        if (fs.existsSync(messageDefSetPath)) {
          try {
            messageDefSet = YAML.parse(fs.readFileSync(messageDefSetPath, 'utf8')) || {}
          } catch (error) {
            logger.error('[终末地插件] 读取 defSet/message.yaml 失败:', error)
          }
        }
        let messageConfigFromFile = {}
        if (fs.existsSync(messageConfigPath)) {
          try {
            messageConfigFromFile = YAML.parse(fs.readFileSync(messageConfigPath, 'utf8')) || {}
          } catch (error) {
            logger.error('[终末地插件] 读取 config/message.yaml 失败:', error)
          }
        }
        const messageConfig = lodash.merge({}, messageDefSet, messageConfigFromFile)
        
        // common：默认读 config（启动时 defSet 会复制到 config），缺项从 defSet 补全
        const commonDefSet = setting.getdefSet('common') || {}
        const common = lodash.merge({}, commonDefSet, commonConfig)
        if (Array.isArray(commonConfig.keywords)) common.keywords = commonConfig.keywords
        else if (!Array.isArray(common.keywords)) common.keywords = Array.isArray(commonDefSet.keywords) ? commonDefSet.keywords : []
        if (Array.isArray(commonConfig.auth_scopes)) common.auth_scopes = commonConfig.auth_scopes
        else if (!Array.isArray(common.auth_scopes)) common.auth_scopes = Array.isArray(commonDefSet.auth_scopes) ? commonDefSet.auth_scopes : []
        
        const sign = lodash.merge(
          {
            auto_sign: true,
            auto_sign_cron: '0 0 1 * * ?',
            notify_list: { friend: [], group: [] },
          },
          signConfig
        )
        // 兼容旧版 notify_list 为数组格式
        if (Array.isArray(sign.notify_list)) {
          const friend = []
          const group = []
          for (const raw of sign.notify_list) {
            const str = String(raw).trim()
            const lower = str.toLowerCase()
            if (lower.startsWith('group:')) group.push(str.slice(6).trim())
            else if (lower.startsWith('friend:')) friend.push(str.slice(7).trim())
          }
          sign.notify_list = { friend, group }
        }
        if (!sign.notify_list?.friend) sign.notify_list = { ...sign.notify_list, friend: [] }
        if (!sign.notify_list?.group) sign.notify_list = { ...sign.notify_list, group: [] }
        
        const gacha = lodash.merge(
          {
            simulate: {
              enable: true,
              group_whitelist: [],
              daily_limit: { limited: 0, standard: 0, weapon: 0 },
            },
          },
          gachaConfig
        )
        if (!gacha.simulate) gacha.simulate = { enable: true, group_whitelist: [], daily_limit: { limited: 0, standard: 0, weapon: 0 } }
        if (!Array.isArray(gacha.simulate.group_whitelist)) gacha.simulate.group_whitelist = []
        if (!gacha.simulate.daily_limit) gacha.simulate.daily_limit = { limited: 0, standard: 0, weapon: 0 }
        
        // 将嵌套对象展开为扁平字段名，以匹配 schemas 中的字段名格式
        const result = { ...common }
        
        // 展开 sign 配置（notify_list 单独展开 friend/group）
        for (const key in sign) {
          if (key === 'notify_list') {
            result['sign.notify_list.friend'] = sign.notify_list.friend || []
            result['sign.notify_list.group'] = sign.notify_list.group || []
          } else {
            result[`sign.${key}`] = sign[key]
          }
        }
        
        // 展开 gacha 配置（simulate 及其嵌套）
        result['gacha.simulate.enable'] = gacha.simulate.enable !== false
        result['gacha.simulate.group_whitelist'] = gacha.simulate.group_whitelist || []
        result['gacha.simulate.daily_limit.limited'] = Number(gacha.simulate.daily_limit?.limited) || 0
        result['gacha.simulate.daily_limit.standard'] = Number(gacha.simulate.daily_limit?.standard) || 0
        result['gacha.simulate.daily_limit.weapon'] = Number(gacha.simulate.daily_limit?.weapon) || 0
        
        // 将 message 配置的嵌套结构展开为扁平字段名（如 wiki.provide_operator）
        function flattenObject(obj, prefix = '') {
          const flattened = {}
          for (const key in obj) {
            const value = obj[key]
            const newKey = prefix ? `${prefix}.${key}` : key
            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
              Object.assign(flattened, flattenObject(value, newKey))
            } else {
              flattened[newKey] = value
            }
          }
          return flattened
        }
        
        const flattenedMessage = flattenObject(messageConfig)
        Object.assign(result, flattenedMessage)
        
        return result
      },
      setConfigData(data, { Result }) {
        try {
          // 将从锅巴面板接收到的扁平数据转换为嵌套对象
          const unflattenedData = {}
          for (const key in data) {
            lodash.set(unflattenedData, key, data[key])
          }
          
          // 隔离保存：各配置只写入对应文件，不混入其他文件
          // common → config/common.yaml；sign → config/sign.yaml；gacha → config/gacha.yaml；message → config/message.yaml
          const commonFields = ['prefix_mode', 'keywords', 'auth_client_name', 'auth_client_type', 'auth_scopes', 'api_key']

          // message 字段仅写入 config/message.yaml（defSet 中的叶子键，如 gacha.no_records）
          const defSetMessagePath = `${_path}/plugins/endfield-plugin/defSet/message.yaml`
          const messageFields = new Set()
          if (fs.existsSync(defSetMessagePath)) {
            try {
              const defSetMessage = YAML.parse(fs.readFileSync(defSetMessagePath, 'utf8')) || {}
              function extractKeys(obj, prefix = '') {
                for (const key in obj) {
                  const fullKey = prefix ? `${prefix}.${key}` : key
                  if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
                    extractKeys(obj[key], fullKey)
                  } else {
                    messageFields.add(fullKey)
                  }
                }
              }
              extractKeys(defSetMessage)
            } catch (error) {
              logger.warn('[终末地插件] 读取 defSet/message.yaml 失败，无法获取 message 字段列表')
            }
          }

          const commonData = {}
          const signData = {}
          const gachaData = {}
          const messageData = {}

          // 必须先判断 message 再按前缀分流，否则 gacha.xxx 等文案键会误入 gacha.yaml
          for (const key in data) {
            if (messageFields.has(key)) {
              messageData[key] = data[key]
            } else if (commonFields.includes(key)) {
              commonData[key] = data[key]
            } else if (key.startsWith('sign.')) {
              lodash.set(signData, key.replace('sign.', ''), data[key])
            } else if (key.startsWith('gacha.')) {
              lodash.set(gachaData, key.replace('gacha.', ''), data[key])
            }
          }
          
          // 保存 common 配置（keywords、auth_scopes 整体替换，否则 merge 按索引合并会导致删除项仍存在）
          if (Object.keys(commonData).length > 0) {
            const currentCommonConfig = setting.getConfig('common') || {}
            const mergedCommonConfig = lodash.merge({}, currentCommonConfig, commonData)
            if (Array.isArray(commonData.keywords)) {
              mergedCommonConfig.keywords = commonData.keywords
            }
            if (Array.isArray(commonData.auth_scopes)) {
              mergedCommonConfig.auth_scopes = commonData.auth_scopes
            }
            const result = setting.setConfig('common', mergedCommonConfig)
            if (result === false) {
              return Result.error('common 配置保存失败，请检查文件权限')
            }
          }
          
          // 保存 sign 配置（notify_list 整体替换，避免 lodash.merge 按索引合并数组导致删除项仍存在）
          if (Object.keys(signData).length > 0) {
            const currentSignConfig = setting.getConfig('sign') || {}
            const mergedSignConfig = lodash.merge({}, currentSignConfig, signData)
            if (signData.notify_list && typeof signData.notify_list === 'object') {
              mergedSignConfig.notify_list = signData.notify_list
            }
            const result = setting.setConfig('sign', mergedSignConfig)
            if (result === false) {
              return Result.error('sign 配置保存失败，请检查文件权限')
            }
          }
          
          // 保存 gacha 配置（模拟抽卡功能开关、群白名单、每日次数）
          if (Object.keys(gachaData).length > 0) {
            const currentGachaConfig = setting.getConfig('gacha') || {}
            const mergedGachaConfig = lodash.merge({}, currentGachaConfig, gachaData)
            // 整体替换数组/对象，否则 merge 按索引合并会导致白名单、daily_limit 清空不生效
            if (gachaData.simulate) {
              if (Array.isArray(gachaData.simulate.group_whitelist)) {
                mergedGachaConfig.simulate.group_whitelist = gachaData.simulate.group_whitelist
              }
              if (gachaData.simulate.daily_limit && typeof gachaData.simulate.daily_limit === 'object') {
                mergedGachaConfig.simulate.daily_limit = { ...mergedGachaConfig.simulate.daily_limit, ...gachaData.simulate.daily_limit }
              }
            }
            const gachaResult = setting.setConfig('gacha', mergedGachaConfig)
            if (gachaResult === false) {
              return Result.error('gacha 配置保存失败，请检查文件权限')
            }
          }
          
          // message：改了一条则在「当前合并结果」基础上全量写入 config；一条都没改则不保存（并删除 config）
          if (Object.keys(messageData).length > 0) {
            const messageConfigPath = `${_path}/plugins/endfield-plugin/config/message.yaml`
            const messageConfigDir = path.dirname(messageConfigPath)
            const defSetMessagePath = `${_path}/plugins/endfield-plugin/defSet/message.yaml`
            let defSetFlat = {}
            if (fs.existsSync(defSetMessagePath)) {
              try {
                const defSetMessage = YAML.parse(fs.readFileSync(defSetMessagePath, 'utf8')) || {}
                function flattenForCompare(obj, prefix = '') {
                  for (const key in obj) {
                    const fullKey = prefix ? `${prefix}.${key}` : key
                    const v = obj[key]
                    if (v != null && typeof v === 'object' && !Array.isArray(v)) {
                      flattenForCompare(v, fullKey)
                    } else {
                      defSetFlat[fullKey] = v
                    }
                  }
                }
                flattenForCompare(defSetMessage)
              } catch (e) {
                logger.warn('[终末地插件] 读取 defSet/message.yaml 失败，将保存 message 到 config')
              }
            }
            // 比较配置内容是否一致（注释不算配置，YAML.parse 已不包含注释；字符串 trim 避免空白/换行导致误判）
            const norm = (v) => (typeof v === 'string' ? v.trim() : v)
            const sameAsDefSet = Object.keys(defSetFlat).length > 0 && Object.keys(defSetFlat).every(
              (k) => String(norm(messageData[k] ?? '')) === String(norm(defSetFlat[k] ?? ''))
            )
            if (sameAsDefSet) {
              if (fs.existsSync(messageConfigPath)) {
                try {
                  fs.unlinkSync(messageConfigPath)
                } catch (e) {
                  logger.warn('[终末地插件] 删除 config/message.yaml 失败:', e)
                }
              }
            } else {
              if (!fs.existsSync(messageConfigDir)) {
                fs.mkdirSync(messageConfigDir, { recursive: true })
              }
              const nestedMessage = {}
              for (const key in messageData) {
                lodash.set(nestedMessage, key, messageData[key])
              }
              fs.writeFileSync(messageConfigPath, YAML.stringify(nestedMessage), 'utf8')
            }
            if (setting.config && setting.config.message) {
              delete setting.config.message
            }
          }
          
          logger.debug('[终末地插件] 配置已更新 (Guoba)')
          return Result.ok({}, '保存成功~')
        } catch (error) {
          logger.error('[终末地插件] 配置保存失败:', error)
          return Result.error('配置保存失败，请检查日志')
        }
      },
    },
  }
}
