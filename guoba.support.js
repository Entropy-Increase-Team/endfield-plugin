import setting from './utils/setting.js'
import lodash from 'lodash'
import path from 'path'
import { fileURLToPath } from 'url'

const _path = process.cwd().replace(/\\/g, '/')
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const pluginRoot = path.join(_path, 'plugins', 'endfield-plugin')

export function supportGuoba() {
  return {
    pluginInfo: {
      name: 'endfield-plugin',
      title: 'Endfield-Plugin',
      author: ['@Entropy-Increase-Team'],
      authorLink: ['https://github.com/Entropy-Increase-Team'],
      link: 'https://github.com/Entropy-Increase-Team/endfield-plugin',
      isV3: true,
      isV2: false,
      showInMenu: true,
      description: '基于森空岛 API 的 Yunzai-Bot 终末地插件',
    },
    configInfo: {
      schemas: [
        {
          component: 'Divider',
          label: '基础配置',
        },
        {
          field: 'prefix_mode',
          label: '命令前缀模式',
          bottomHelpMessage: '1: 符号前缀（: 或 ：）| 2: 关键词前缀（#终末地 / #zmd）',
          component: 'Select',
          componentProps: {
            placeholder: '请选择前缀模式',
            options: [
              { label: '符号前缀（: 或 ：）', value: 1 },
              { label: '关键词前缀（#终末地 / #zmd）', value: 2 },
            ],
          },
        },
        {
          field: 'keywords',
          label: '关键词列表',
          bottomHelpMessage: '命令需要匹配其中任意一个关键词（仅在关键词前缀模式下生效）',
          component: 'GTags',
          componentProps: {
            placeholder: '请输入关键词后回车',
          },
        },
        {
          component: 'Divider',
          label: '授权请求配置',
        },
        {
          field: 'auth_client_name',
          label: '客户端名称',
          bottomHelpMessage: '授权登陆时展示的客户端名称',
          component: 'Input',
          componentProps: {
            placeholder: '终末地机器人',
          },
        },
        {
          field: 'auth_client_type',
          label: '客户端类型',
          bottomHelpMessage: '授权请求的客户端类型（如 bot）',
          component: 'Input',
          componentProps: {
            placeholder: 'bot',
          },
        },
        {
          field: 'auth_scopes',
          label: '授权范围',
          bottomHelpMessage: '授权请求的权限范围列表',
          component: 'GTags',
          componentProps: {
            placeholder: '请输入授权范围后回车',
          },
        },
        {
          component: 'Divider',
          label: 'API 认证',
        },
        {
          field: 'api_key',
          label: 'API 密钥',
          bottomHelpMessage: '用于第三方客户端认证的 API 密钥，在 https://end.shallow.ink 获取',
          component: 'Input',
          required: true,
          componentProps: {
            placeholder: '请输入 API 密钥',
            type: 'password',
          },
        },
      ],
      getConfigData() {
        // 从 setting 读取配置，合并 defSet 和 config
        const config = setting.getConfig('common') || {}
        
        // 确保 keywords 是数组
        const common = lodash.merge(
          {
            prefix_mode: 1,
            keywords: ['终末地', 'zmd'],
            auth_client_name: '终末地机器人',
            auth_client_type: 'bot',
            auth_scopes: ['user_info', 'binding_info', 'game_data', 'attendance'],
            api_key: '',
          },
          config
        )
        
        // 确保 keywords 和 auth_scopes 是数组
        if (!Array.isArray(common.keywords)) {
          common.keywords = ['终末地', 'zmd']
        }
        if (!Array.isArray(common.auth_scopes)) {
          common.auth_scopes = ['user_info', 'binding_info', 'game_data', 'attendance']
        }
        
        return common
      },
      setConfigData(data, { Result }) {
        try {
          // 获取当前配置
          const currentConfig = setting.getConfig('common') || {}
          
          // 将从锅巴面板接收到的扁平数据转换为嵌套对象
          const unflattenedData = {}
          for (const key in data) {
            lodash.set(unflattenedData, key, data[key])
          }
          
          // 合并配置
          const mergedConfig = lodash.merge({}, currentConfig, unflattenedData)
          
          // 使用 setting.setConfig 保存配置（setConfig 会合并 defSet，但这里我们直接传入完整配置）
          const result = setting.setConfig('common', mergedConfig)
          
          // setConfig 成功时返回 undefined，失败时返回 false
          if (result !== false) {
            logger.debug('[终末地插件] 配置已更新 (Guoba)')
            return Result.ok({}, '保存成功~')
          } else {
            return Result.error('配置保存失败，请检查文件权限')
          }
        } catch (error) {
          logger.error('[终末地插件] 配置保存失败:', error)
          return Result.error('配置保存失败，请检查日志')
        }
      },
    },
  }
}
