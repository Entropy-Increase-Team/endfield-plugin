import YAML from 'yaml'
import chokidar from 'chokidar'
import fs from 'node:fs'

const _path = process.cwd().replace(/\\/g, '/')
const CONFIG_SKIP_COPY = ['help', 'message']

class Setting {
  constructor() {
    this.defPath = `${_path}/plugins/endfield-plugin/defSet/`
    this.defSet = {}
    this.configPath = `${_path}/plugins/endfield-plugin/config/`
    this.config = {}
    this.dataPath = `${_path}/plugins/endfield-plugin/data/`
    this.data = {}
    this.watcher = { config: {}, defSet: {}, data: {} }

    this.initCfg()
  }

  initCfg() {
    const files = fs.readdirSync(this.defPath).filter((file) => file.endsWith('.yaml'))
    for (let file of files) {
      const app = file.replace('.yaml', '')
      if (CONFIG_SKIP_COPY.includes(app)) continue
      if (!fs.existsSync(`${this.configPath}${file}`)) {
        fs.copyFileSync(`${this.defPath}${file}`, `${this.configPath}${file}`)
      }
      this.watch(`${this.configPath}${file}`, app, 'config')
    }
  }

  merge() {
    let sets = {}
    let appsConfig = fs.readdirSync(this.defPath).filter((file) => file.endsWith('.yaml'))
    for (let appConfig of appsConfig) {
      let filename = appConfig.replace(/.yaml/g, '').trim()
      sets[filename] = this.getConfig(filename)
    }
    return sets
  }

  analysis(config) {
    for (let key of Object.keys(config)) {
      this.setConfig(key, config[key])
    }
  }

  getdefSet(app) {
    return this.getYaml(app, 'defSet')
  }

  getConfig(app) {
    if (CONFIG_SKIP_COPY.includes(app)) {
      const configFile = `${this.configPath}${app}.yaml`
      if (fs.existsSync(configFile)) {
        return this.getYaml(app, 'config')
      }
      return this.getdefSet(app)
    }
    return { ...this.getdefSet(app), ...this.getYaml(app, 'config') }
  }

  getData(app) {
    return this.getYaml(app, 'data')
  }

  setConfig(app, data) {
    return this.setYaml(app, 'config', { ...this.getdefSet(app), ...data })
  }

  /** 写入 data 目录下的 yaml（如用量统计），不合并 defSet */
  setData(app, data) {
    return this.setYaml(app, 'data', data)
  }

  setYaml(app, type, data) {
    let file = this.getFilePath(app, type)
    try {
      if (type === 'data') {
        const dir = this.dataPath
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      }
      fs.writeFileSync(file, YAML.stringify(data), 'utf8')
      if (type === 'data' && this[type]?.[app]) delete this[type][app]
    } catch (error) {
      logger.error(`[${app}] 写入失败 ${error}`)
      return false
    }
  }

  getYaml(app, type) {
    if (type === 'config' && CONFIG_SKIP_COPY.includes(app)) {
      const configFile = `${this.configPath}${app}.yaml`
      if (!fs.existsSync(configFile)) return {}
      const file = configFile
      if (this[type][app]) return this[type][app]
      try {
        this[type][app] = YAML.parse(fs.readFileSync(file, 'utf8'))
      } catch (error) {
        logger.error(`[${app}] 格式错误 ${error}`)
        return {}
      }
      this.watch(file, app, type)
      return this[type][app]
    }
    let file = this.getFilePath(app, type)
    // data 目录下文件不存在时直接返回空对象，避免 ENOENT 报错
    if (type === 'data' && !fs.existsSync(file)) return {}
    if (this[type][app]) return this[type][app]

    try {
      this[type][app] = YAML.parse(fs.readFileSync(file, 'utf8'))
    } catch (error) {
      logger.error(`[${app}] 格式错误 ${error}`)
      return type === 'data' ? {} : false
    }
    this.watch(file, app, type)
    return this[type][app]
  }

  getFilePath(app, type) {
    if (type === 'defSet') return `${this.defPath}${app}.yaml`
    else if (type === 'data') {
      return `${this.dataPath}${app}.yaml`
    } else {
      try {
        if (!CONFIG_SKIP_COPY.includes(app) && !fs.existsSync(`${this.configPath}${app}.yaml`)) {
          fs.copyFileSync(`${this.defPath}${app}.yaml`, `${this.configPath}${app}.yaml`)
        }
      } catch (error) {
        logger.error(`终末地插件缺失默认文件[${app}]${error}`)
      }
      return `${this.configPath}${app}.yaml`
    }
  }

  watch(file, app, type = 'defSet') {
    if (this.watcher[type][app]) return

    const watcher = chokidar.watch(file)
    watcher.on('change', () => {
      delete this[type][app]
      logger.mark(`[终末地插件][修改配置文件][${type}][${app}]`)
      if (this[`change_${app}`]) {
        this[`change_${app}`]()
      }
    })
    this.watcher[type][app] = watcher
  }
}

export default new Setting()

