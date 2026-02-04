import setting from '../utils/setting.js'
import { getMessage, ruleReg } from '../utils/common.js'
import { getCopyright } from '../utils/copyright.js'

export class help extends plugin {
  constructor() {
    super({
      name: '[endfield-plugin]帮助',
      dsc: '终末地插件帮助',
      event: 'message',
      priority: 10,
      rule: [ruleReg('(帮助|help)$', 'help')]
    })
    this.common_setting = setting.getConfig('common')
  }

  async help(e) {
    const help_setting = setting.getConfig('help')
    const msgCfg = setting.getConfig('message') || {}
    // 每次请求时读取最新 common 配置，使帮助中的前缀/关键词与当前生效一致
    const commonCfg = setting.getConfig('common')
    const mode = Number(commonCfg?.prefix_mode) || 1
    const prefixTips = mode === 1 ? getMessage('prefix_tips_mode1') : getMessage('prefix_tips_mode2')
    const kw = commonCfg?.keywords?.[0] || 'zmd'
    const cmdPrefix = mode === 1 ? `#${kw}` : ':'
    const bluemapHelp = msgCfg.bluemap_help_doc
    const officialWebsite = msgCfg.official_website || 'https://end.shallow.ink'

    const helpCfg = {
      title: '终末地插件帮助',
      subTitle: prefixTips
    }
    const { copyright, sys } = getCopyright()

    let helpGroup = help_setting?.help_group || []
    helpGroup = helpGroup.filter((group) => {
      if (group.auth === 'master') return this.e.isMaster
      return true
    })

    helpGroup = helpGroup.map((group) => {
      if (group.type === 'tips' && Array.isArray(group.items)) {
        return {
          ...group,
          items: group.items.map((item) => ({
            title: item.title || '',
            text: (item.text || '')
              .replaceAll('{prefix}', cmdPrefix)
              .replaceAll('{bluemap_help}', bluemapHelp || '（未配置）')
              .replaceAll('{official_website}', officialWebsite)
          }))
        }
      }
      return {
        ...group,
        group: (group.group || '')
          .replaceAll('{prefix}', cmdPrefix)
          .replaceAll('{bluemap_help}', bluemapHelp || '（未配置）')
          .replaceAll('{official_website}', officialWebsite),
        list: (group.list || []).map((item) => ({
          ...item,
          title: (item.title || '').replaceAll('{prefix}', cmdPrefix),
          desc: (item.desc || '')
            .replaceAll('{prefix}', cmdPrefix)
            .replaceAll('{bluemap_help}', bluemapHelp || '（未配置）')
            .replaceAll('{official_website}', officialWebsite)
        }))
      }
    })

    const defSetHelp = setting.getdefSet('help') || {}
    const layout = { ...defSetHelp?.help_layout, ...help_setting?.help_layout }
    const colCount = Math.max(1, Number(layout.col_count) || 4)
    const colWidth = Math.max(100, Number(layout.col_width) || 400)
    const widthGap = Math.max(0, Number(layout.width_gap) || 40)
    const gridWidth = colCount * colWidth + Math.max(0, colCount - 1) * widthGap
    const contentWidth = gridWidth + 120

    try {
      return await e.runtime.render('endfield-plugin', 'help/help', {
        helpCfg,
        helpGroup,
        copyright,
        sys,
        contentWidth,
        colCount,
        colWidth,
        widthGap,
        viewport: { width: contentWidth }
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
        ...helpGroup.flatMap((g) => {
          if (g.type === 'tips' && g.items) {
            return g.items.map((item) => `【${item.title}】${item.text}`).concat([''])
          }
          if (g.group && !g.list) return [g.group, '']
          return [
            `${g.group}：`,
            ...(g.list || []).map((item) => `- ${item.title}${item.desc ? `（${item.desc}）` : ''}`),
            ''
          ]
        })
      ].join('\n')
      await e.reply(fallback)
      return true
    }
  }
}
