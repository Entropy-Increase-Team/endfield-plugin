import setting from '../utils/setting.js'
import { getMessage, ruleReg } from '../utils/common.js'

export class EndfieldBluemap extends plugin {
  constructor() {
    super({
      name: '[endfield-plugin]蓝图',
      dsc: '终末地蓝图文档',
      event: 'message',
      priority: 50,
      rule: [ruleReg('蓝图$', 'bluemap')]
    })
    this.common_setting = setting.getConfig('common')
  }

  getCmdPrefix() {
    const mode = Number(this.common_setting?.prefix_mode) || 1
    return mode === 1 ? `#${this.common_setting?.keywords?.[0] || 'zmd'}` : ':'
  }

  async bluemap() {
    const msgCfg = setting.getConfig('message') || {}
    const url = msgCfg.bluemap_help_doc
    if (!url) {
      await this.reply(getMessage('bluemap.not_configured'))
      return true
    }
    await this.reply(getMessage('bluemap.doc_url', { url }))
    return true
  }
}
