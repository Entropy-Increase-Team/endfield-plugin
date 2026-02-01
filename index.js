import fs from 'node:fs'
import setting from './utils/setting.js'

// 兼容部分适配器未提前注入 segment 的场景
if (!global.segment) {
  global.segment = (await import('oicq')).segment
}

if (!global.core) {
  try {
    global.core = (await import('oicq')).core
  } catch (err) {}
}

const files = fs
  .readdirSync('./plugins/endfield-plugin/apps')
  .filter((file) => file.endsWith('.js'))

let ret = []

logger.info('-------------------')
logger.info('endfield-plugin载入成功!')
const commonConfig = setting.getConfig('common') || {}
if (!commonConfig.api_key || String(commonConfig.api_key).trim() === '') {
  logger.warn('[endfield-plugin] 未配置 api_key，部分功能将不可用')
  logger.warn('请前往终末地协议终端 - https://end.shallow.ink 获取秘钥，并在 config/common.yaml 中填写')
}
logger.info('插件交流群：160759479')
logger.info('-------------------')

files.forEach((file) => {
  ret.push(import(`./apps/${file}`))
})

ret = await Promise.allSettled(ret)

let apps = {}
for (let i in files) {
  let name = files[i].replace('.js', '')

  if (ret[i].status !== 'fulfilled') {
    logger.error(`载入插件错误：${logger.red(name)}`)
    logger.error(ret[i].reason)
    continue
  }
  apps[name] = ret[i].value[Object.keys(ret[i].value)[0]]
}

export { apps }
