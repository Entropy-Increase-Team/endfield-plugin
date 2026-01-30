import setting from '../utils/setting.js'
import { rulePrefix } from '../utils/common.js'
import lodash from 'lodash'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

let cachedVersion = null
const getPluginVersion = () => {
  if (cachedVersion) return cachedVersion
  try {
    const pkgPath = path.resolve(process.cwd(), './plugins/endfield-plugin/package.json')
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
    cachedVersion = pkg?.version || ''
  } catch {
    cachedVersion = ''
  }
  return cachedVersion
}

const HELP_VIEWPORT_MAX = 1920

export class help extends plugin {
  constructor() {
    super({
      name: '[endfield-plugin]帮助',
      dsc: '终末地插件帮助',
      event: 'message',
      priority: 10,
      rule: [
        {
          reg: `^${rulePrefix}(帮助|help)$`,
          fnc: 'help'
        }
      ]
    })
    this.common_setting = setting.getConfig('common')
  }

  async help(e) {
    const help_setting = setting.getConfig('help')
    const msgCfg = setting.getConfig('message') || {}
    const mode = Number(this.common_setting?.prefix_mode) || 1
    const prefixTips = mode === 2
      ? (msgCfg.prefix_tips_mode2 || '前缀：#终末地 / #zmd')
      : (msgCfg.prefix_tips_mode1 || '前缀：: / ：')
    const cmdPrefix = mode === 2 ? '#zmd' : ':'
    const bluemapHelp = msgCfg.bluemap_help_doc || ''

    const helpCfg = {
      title: '终末地插件帮助',
      subTitle: prefixTips
    }
    const endfieldVersion = getPluginVersion()

    let helpGroup = help_setting?.help_group || []
    helpGroup = helpGroup.filter((group) => {
      if (group.auth === 'master') return this.e.isMaster
      return true
    })

    helpGroup = helpGroup.map((group) => ({
      ...group,
      group: (group.group || '')
        .replaceAll('{prefix}', cmdPrefix)
        .replaceAll('{bluemap_help}', bluemapHelp || '（未配置）'),
      list: (group.list || []).map((item) => ({
        ...item,
        title: (item.title || '').replaceAll('{prefix}', cmdPrefix),
        desc: (item.desc || '')
          .replaceAll('{prefix}', cmdPrefix)
          .replaceAll('{bluemap_help}', bluemapHelp || '（未配置）')
      }))
    }))

    const iconPath = path.join(process.cwd(), 'plugins/endfield-plugin/resources/help/icon.png')
    let iconUrl = ''
    if (fs.existsSync(iconPath)) {
      try {
        iconUrl = `data:image/png;base64,${fs.readFileSync(iconPath).toString('base64')}`
      } catch {
        iconUrl = pathToFileURL(iconPath).href
      }
    }
    lodash.forEach(helpGroup, (group) => {
      lodash.forEach(group.list, (item) => {
        item.iconUrl = (item.icon * 1) ? iconUrl : ''
      })
    })

    const layout = help_setting?.help_layout || {}
    const colCount = Number(layout.col_count) || 4
    const colWidth = Number(layout.col_width) || 380
    const widthGap = Number(layout.width_gap) || 50
    const contentWidth = colCount * colWidth + widthGap
    const helpLayoutMaxWidth = Math.min(contentWidth, HELP_VIEWPORT_MAX)
    const helpLayoutColCount = colCount

    try {
      return await e.runtime.render('endfield-plugin', 'help/help', {
        helpCfg,
        helpGroup,
        endfieldVersion,
        helpLayoutMaxWidth,
        helpLayoutColCount,
        viewport: { width: helpLayoutMaxWidth }
      }, {
        scale: 1.6
      })
    } catch (err) {
      logger.error(`[终末地插件][帮助]渲染失败: ${err}`)
      const fallback = [
        '终末地插件指令帮助（森空岛）',
        '',
        `说明：${prefixTips}`,
        '',
        ...helpGroup.flatMap((g) => [
          `${g.group}：`,
          ...(g.list || []).map((item) => `- ${item.title}${item.desc ? `（${item.desc}）` : ''}`),
          ''
        ])
      ].join('\n')
      await e.reply(fallback)
      return true
    }
  }
}
