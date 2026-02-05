import setting from '../utils/setting.js'
import { getMessage } from '../utils/common.js'

export class EndfieldBluemap extends plugin {
  constructor() {
    super({
      name: '[endfield-plugin]蓝图',
      dsc: '终末地蓝图文档',
      event: 'message',
      priority: 50,
      rule: [
        {
          reg: '^(?:[:：]|#zmd|#终末地)蓝图$',
          fnc: 'bluemap'
        }
      ]
    })
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
