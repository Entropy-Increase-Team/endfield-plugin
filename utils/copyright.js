/**
 * 页脚版权文案（与 help 一致）：供各渲染页使用 {{@copyright || sys?.copyright}}
 */
import path from 'node:path'
import fs from 'node:fs'

let cachedPluginVersion = null
let cachedYunzaiInfo = null

export function getPluginVersion() {
  if (cachedPluginVersion) return cachedPluginVersion
  try {
    const pkgPath = path.resolve(process.cwd(), './plugins/endfield-plugin/package.json')
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
    cachedPluginVersion = pkg?.version || ''
  } catch {
    cachedPluginVersion = ''
  }
  return cachedPluginVersion
}

/** 从根目录 package.json 读取并格式化 Yunzai 名称（用于页脚版权） */
export function getYunzaiCopyright() {
  if (cachedYunzaiInfo) return cachedYunzaiInfo
  let name = 'Yunzai'
  let version = ''
  try {
    const rootPkgPath = path.resolve(process.cwd(), 'package.json')
    const pkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf8'))
    const rawName = (pkg?.name || '').toLowerCase()
    version = pkg?.version || ''
    if (rawName === 'miao-yunzai') name = 'Miao-Yunzai'
    else if (rawName === 'trss-yunzai') name = 'TRSS-Yunzai'
    else if (rawName === 'yunzai-bot' || rawName === 'yunzai') name = 'Yunzai-Bot'
    else if (rawName) name = rawName.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('-')
  } catch {
    // 保持默认
  }
  cachedYunzaiInfo = { name, version }
  return cachedYunzaiInfo
}

/** 返回与 help 一致的页脚版权对象，供模板 {{@copyright || sys?.copyright}} 使用 */
export function getCopyright() {
  const endfieldVersion = getPluginVersion()
  const { name: yunzaiName, version: yunzaiVersion } = getYunzaiCopyright()
  const copyright = `Created By ${yunzaiName}<span class="version">${yunzaiVersion}</span> & endfield-plugin <span class="version">${endfieldVersion}</span>`
  return { copyright, sys: { copyright } }
}
