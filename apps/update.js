import { rulePrefix } from '../utils/common.js'
import { update as UpdatePlugin } from '../../../other/update.js'

const pluginName = 'endfield-plugin'

export class EndfieldUpdate extends plugin {
  constructor() {
    super({
      name: '[endfield-plugin]更新',
      dsc: '终末地插件更新',
      event: 'message',
      priority: 50,
      rule: [
        {
          reg: new RegExp(`^${rulePrefix}((插件)?(强制)?更新|update)$`),
          fnc: 'update',
          permission: 'master'
        }
      ]
    })
  }

  async update() {
    if (!this.e?.isMaster) return false
    if (!UpdatePlugin) return false
    this.e.msg = `#${this.e.msg.includes('强制') ? '强制' : ''}更新${pluginName}`
    const up = new UpdatePlugin()
    up.e = this.e
    up.reply = this.reply.bind(this)
    return up.update()
  }
}
