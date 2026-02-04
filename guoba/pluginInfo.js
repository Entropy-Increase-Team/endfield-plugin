import path from 'path'

const _path = process.cwd().replace(/\\/g, '/')
const pluginRoot = path.join(_path, 'plugins', 'endfield-plugin')

export default {
  name: 'endfield-plugin',
  title: 'Endfield-Plugin',
  author: ['@Entropy-Increase-Team'],
  authorLink: ['https://github.com/Entropy-Increase-Team'],
  link: 'https://github.com/Entropy-Increase-Team/endfield-plugin',
  isV3: true,
  isV2: false,
  showInMenu: true,
  description: '基于森空岛 API 的 Yunzai-Bot 终末地插件',
  iconPath: path.join(pluginRoot, 'resources/img/ET logo.svg'),
}
