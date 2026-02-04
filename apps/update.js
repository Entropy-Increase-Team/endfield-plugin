import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { ruleReg } from '../utils/common.js'

const pluginName = 'endfield-plugin'

let UpdatePlugin = null
async function loadOtherUpdate() {
  if (UpdatePlugin) return UpdatePlugin
  try {
    const currentDir = path.dirname(fileURLToPath(import.meta.url))
    const otherUpdatePath = path.join(currentDir, '..', '..', 'other', 'update.js')
    const mod = await import(pathToFileURL(otherUpdatePath).href)
    UpdatePlugin = mod?.update ?? mod?.default
  } catch (e) {
    logger?.warn?.('[endfield-plugin] 未找到 plugins/other/update.js，插件更新命令不可用')
  }
  return UpdatePlugin
}

export class EndfieldUpdate extends plugin {
  constructor() {
    super({
      name: '[endfield-plugin]更新',
      dsc: '终末地插件更新',
      event: 'message',
      priority: 50,
      rule: [ruleReg('((插件)?(强制)?更新|update)$', 'update', { permission: 'master' })]
    })
  }

  async update() {
    if (!this.e?.isMaster) return false
    const Update = await loadOtherUpdate()
    if (!Update) return false
    this.e.msg = `#${this.e.msg.includes('强制') ? '强制' : ''}更新${pluginName}`
    const up = new Update()
    up.e = this.e
    up.reply = this.reply.bind(this)
    return up.update()
  }
}
