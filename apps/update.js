import path from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'
import { rulePrefix, getMessage } from '../utils/common.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
/** 插件根目录 */
const PLUGIN_ROOT = path.join(__dirname, '..')

export class EndfieldUpdate extends plugin {
  constructor() {
    super({
      name: '[endfield-plugin]更新',
      dsc: '终末地插件更新（git pull）',
      event: 'message',
      priority: 50,
      rule: [
        {
          reg: `^${rulePrefix}更新$`,
          fnc: 'updatePlugin',
          auth: 'master'
        }
      ]
    })
  }

  /** 执行插件更新：在插件目录下执行 git pull */
  async updatePlugin() {
    try {
      const output = execSync('git pull', {
        cwd: PLUGIN_ROOT,
        encoding: 'utf8',
        timeout: 60000
      })
      const msg = (output || '').trim() || '已是最新'
      await this.reply(getMessage('update.done', { output: msg }))
    } catch (err) {
      const stderr = err.stderr?.toString?.()?.trim() || err.message || String(err)
      logger.error('[终末地插件] 更新失败:', err)
      await this.reply(getMessage('update.failed', { error: stderr }))
    }
    return true
  }
}
