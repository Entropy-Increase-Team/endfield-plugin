/**
 * MaaEnd 教程 - 图文合并转发
 */
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import common from '../../../lib/common/common.js'

const resPath = resolve(dirname(fileURLToPath(import.meta.url)), '../resources/tutorialmaa')

/**
 * 教程步骤：[文字, ...图片文件名]
 * 仅文字时不带图片，图片按顺序跟在文字后
 */
const MAA_STEPS = [
  ['MaaEnd 远程控制教程\n通过 QQ 机器人远程控制 MaaEnd Client，实现终末地自动化任务管理'],
  [
    '=== 第一步：下载 MaaEnd Client ===\n'
    + '前往 GitHub 下载最新版本：\nhttps://github.com/Entropy-Increase-Team/MaaEnd-Client/releases\n'
    + '或者蓝奏云：https://wwaln.lanzoum.com/b0sygztzi 密码:maac\n'
    + '将下载好的 MaaEnd Client 放入 MaaEnd 文件夹下，双击运行即可',
    '1.png'
  ],
  ['=== 第二步：绑定设备 ===\n1. 私聊机器人发送【:maa 绑定】获取绑定码', '2.png'],
  ['2. 在 MaaEnd Client 中输入绑定码完成绑定', '3.png'],
  ['3. 发送【:maa 设备】确认设备已上线', '4.png'],
  ['=== 第三步：设置默认设备 ===\n发送【:maa 设置设备 1】设置默认设备\n设置后，后续命令可省略设备序号', '5.png'],
  ['=== 第四步：查看并执行任务 ===\n发送【:maa 任务列表】查看可用任务', '6.png'],
  ['发送【:maa 执行 <序号>】执行任务\n任务下发后会自动附带截图，完成后也会推送通知', '7.png', '8.png'],
]

export class endfieldTutorial extends plugin {
  constructor() { 
    super({
      name: '[endfield-plugin]MaaEnd教程',
      dsc: 'MaaEnd 远程控制教程',
      event: 'message',
      priority: 50,
      rule: [
        { reg: '^(?:[:：]|#zmd|#终末地)maa\\s*教程$', fnc: 'maaTutorial' }
      ]
    })
  }

  async maaTutorial() {
    const seg = global.segment || (await import('oicq')).segment
    const msg = MAA_STEPS.map(([text, ...imgs]) => [
      text,
      ...imgs.map(f => seg.image(`${resPath}/${f}`))
    ])
    this.e.reply(common.makeForwardMsg(this.e, msg, 'MaaEnd 远程控制教程'))
    return true
  }
}
