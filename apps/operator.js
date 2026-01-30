import path from 'node:path'
import fs from 'node:fs'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { rulePrefix, getUnbindMessage, getMessage } from '../utils/common.js'
import common from '../../../lib/common/common.js'
import EndfieldUser from '../model/endfieldUser.js'
import setting from '../utils/setting.js'
import puppeteer from '../../../lib/puppeteer/puppeteer.js'

const _dir = path.dirname(fileURLToPath(import.meta.url))
const _res = path.join(_dir, '..', 'resources')
const _operator = path.join(_res, 'operator')
const _meta = path.join(_res, 'meta')

const OPERATOR_DIR = _operator
const META_CLASS_DIR = path.join(_meta, 'class')
const META_ATTRPANLE_DIR = path.join(_meta, 'attrpanle')
const OPERATOR_TPL = path.join(_operator, 'operator.html')
const OPERATOR_CSS = path.join(_operator, 'operator.css')
const LIST_TPL = path.join(_operator, 'list.html')
const LIST_CSS = path.join(_operator, 'list.css')
const LIST_BG_DIR = path.join(_operator, 'img')
const LIST_BG_FILES = ['bg1.png', 'bg2.png']

const SCREENSHOT = { name: 'endfield-operator', saveId: 'index' }
const LIST_SCREENSHOT = { name: 'endfield-operator-list', saveId: 'index' }

function iconToDataUrl(dir, chineseName) {
  if (!chineseName || typeof chineseName !== 'string') return ''
  const exts = ['.jpg', '.jpeg', '.png']
  const name = chineseName.trim()
  for (const ext of exts) {
    const p = path.join(dir, name + ext)
    if (fs.existsSync(p)) {
      const buf = fs.readFileSync(p)
      const mime = ext === '.png' ? 'image/png' : 'image/jpeg'
      return `data:${mime};base64,${buf.toString('base64')}`
    }
  }
  return ''
}

export class EndfieldOperator extends plugin {
  constructor() {
    super({
      name: '[endfield-plugin]干员查询',
      dsc: '终末地干员详情查询',
      event: 'message',
      priority: 50,
      rule: [
        { reg: `^${rulePrefix}干员列表$`, fnc: 'getOperatorList' },
        { reg: `^${rulePrefix}(.+?)面板$`, fnc: 'getOperator' }
      ]
    })
    this.common_setting = setting.getConfig('common')
  }

  getOperatorNameFromMsg() {
    let s = (this.e.msg || '').replace(/面板$/, '').trim()
    s = s.replace(/^[:：]\s*/, '').replace(/^#(终末地|zmd)?/, '').trim()
    return s
  }

  async getOperator() {
    const userId = this.e.at || this.e.user_id
    const sklUser = new EndfieldUser(userId)

    if (!await sklUser.getUser()) {
      await this.reply(getUnbindMessage())
      return true
    }

    const operatorName = this.getOperatorNameFromMsg()
    if (!operatorName) {
      await this.reply(getMessage('operator.provide_name', { prefix: this.getCmdPrefix() }))
      return true
    }

    await this.reply(getMessage('operator.loading_detail'))

    try {
      const res = await sklUser.sklReq.getData('note')
      
      if (!res || res.code !== 0) {
        logger.error(`[终末地干员]获取干员列表失败: ${JSON.stringify(res)}`)
        await this.reply(getMessage('operator.get_role_failed'))
        return true
      }

      const chars = res.data?.chars || []
      if (!chars.length) {
        await this.reply(getMessage('operator.not_found_info'))
        return true
      }

      const exactMatches = chars.filter((c) => (c.name || '') === operatorName)
      const fuzzyMatches = exactMatches.length > 0
        ? exactMatches
        : chars.filter((c) => (c.name || '').includes(operatorName))

      if (fuzzyMatches.length === 0) {
        await this.reply(getMessage('operator.not_found', { name: operatorName }))
        return true
      }

      const matched = fuzzyMatches[0]
      const instId = matched.id || ''
      if (!instId) {
        await this.reply(getMessage('operator.no_operator_id'))
        return true
      }

      const operatorRes = await sklUser.sklReq.getData('endfield_card_char', {
        instId
      })
      if (!operatorRes || operatorRes.code !== 0) {
        logger.error(`[终末地干员]获取干员详情失败: ${JSON.stringify(operatorRes)}`)
        await this.reply(getMessage('operator.get_detail_failed'))
        return true
      }

      const { operator, charData, userSkills, container } = this.extractOperatorDetail(operatorRes.data)
      if (!operator || !charData) {
        await this.reply(getMessage('operator.not_found_info'))
        return true
      }

      const tplData = this.buildPanelData(operator, charData, userSkills, container)
      const screenshotData = {
        tplFile: OPERATOR_TPL,
        saveId: SCREENSHOT.saveId,
        operatorCssHref: pathToFileURL(OPERATOR_CSS).href,
        ...tplData,
        viewport: { width: 720, height: 1750 }
      }
      const img = await puppeteer.screenshot(SCREENSHOT.name, screenshotData)
      if (img) {
        await this.e.reply(img)
      } else {
        await this.reply(getMessage('operator.panel_failed'))
      }
      return true
    } catch (error) {
      logger.error(`[终末地干员]查询失败: ${error}`)
      await this.reply(getMessage('operator.query_failed', { error: error.message }))
      return true
    }
  }

  buildPanelData(operator, charData, userSkills, container) {
    const rarity = parseInt(charData.rarity?.value || '1', 10) || 1
    const stars = Array.from({ length: Math.min(6, Math.max(1, rarity)) }, (_, i) => i + 1)
    const tags = charData.tags || []
    const tagsList = tags.filter(Boolean)
    const tagsLength = tagsList.length

    const skills = (charData.skills || []).map((s) => {
      const u = userSkills?.[s.id] || {}
      return {
        name: s.name || '未知',
        iconUrl: s.iconUrl || '',
        level: u.level ?? 1,
        maxLevel: u.maxLevel ?? ''
      }
    })

    const weaponRaw = operator.weapon || container?.weapon
    let weapon = null
    let gem = null
    if (weaponRaw?.weaponData) {
      const w = weaponRaw.weaponData
      const wr = parseInt(w.rarity?.value || '1', 10) || 1
      const gemRaw = weaponRaw.gem
      if (gemRaw && (gemRaw.icon || gemRaw.id)) {
        gem = { name: gemRaw.name || '基质', iconUrl: gemRaw.icon || '' }
      }
      weapon = {
        name: w.name || '未知',
        level: weaponRaw.level ?? 0,
        iconUrl: w.iconUrl || '',
        stars: Array.from({ length: Math.min(6, Math.max(1, wr)) }, (_, i) => i + 1),
        gem
      }
    }

    const parseRarity = (r) => {
      const key = r?.key || ''
      const m = /equip_rarity_(\d)|rarity_(\d)/.exec(key)
      const v = m ? parseInt(m[1] || m[2], 10) : NaN
      const rarity = (v >= 1 && v <= 6) ? v : 1
      return { rarity, rarityClass: `equip_rarity_${rarity}` }
    }
    const pickEquip = (slot) => {
      const raw = slot?.equipData || slot
      if (!raw?.name) return null
      const lv = raw.level?.value ?? raw.level ?? ''
      const { rarity, rarityClass } = parseRarity(raw.rarity)
      return { name: raw.name, iconUrl: raw.iconUrl || '', level: lv, rarity, rarityClass }
    }
    const bodyEquip = pickEquip(operator.bodyEquip || container?.bodyEquip)
    const armEquip = pickEquip(operator.armEquip || container?.armEquip)
    const firstAccessory = pickEquip(operator.firstAccessory || container?.firstAccessory)
    const secondAccessory = pickEquip(operator.secondAccessory || container?.secondAccessory)

    const tactRaw = (operator.tacticalItem || container?.tacticalItem)?.tacticalItemData
    let tacticalItem = null
    if (tactRaw?.name) {
      const { rarity, rarityClass } = parseRarity(tactRaw.rarity)
      tacticalItem = { name: tactRaw.name, iconUrl: tactRaw.iconUrl || '', level: '', rarity, rarityClass }
    }

    const displaySkills = skills.slice(0, 4)
    while (displaySkills.length < 4) displaySkills.push({ empty: true })
    return {
      name: charData.name || '未知',
      illustrationUrl: charData.illustrationUrl || charData.avatarRtUrl || 'https://bbs.hycdn.cn/image/2025/11/12/9d96cc859f508f7add6668fd9280df7b.png',
      level: operator.level ?? 0,
      stars,
      tagsList,
      tagsLength,
      skills,
      displaySkills,
      weapon,
      gem,
      bodyEquip,
      armEquip,
      firstAccessory,
      secondAccessory,
      tacticalItem
    }
  }

  extractOperatorDetail(data = {}) {
    const container = data?.detail || data || {}
    const operator = container.char || container.operator || container || {}
    const charData = operator.charData || container.charData || operator?.char?.charData || {}
    const userSkills = operator.userSkills || container.userSkills || operator?.char?.userSkills || {}
    return { operator, charData, userSkills, container }
  }

  async fetchCharacterDetail(sklUser) {
    const res = await sklUser.sklReq.getData('note')
    if (!res || res.code !== 0) {
      logger.error(`[终末地干员]获取角色信息失败: ${JSON.stringify(res)}`)
      await this.reply(getMessage('operator.get_role_failed'))
      return null
    }
    const base = res.data?.base || {}
    const chars = res.data?.chars || []
    const serverName = base.serverName?.trim() || '未知'
    return { base, chars, serverName }
  }

  async fetchCharacterDetailForList(sklUser) {
    const res = await sklUser.sklReq.getData('endfield_card_detail')
    if (!res || res.code !== 0) {
      logger.error(`[终末地干员列表]card/detail 失败: ${JSON.stringify(res)}`)
      return null
    }
    const detail = res.data?.detail || {}
    const base = detail.base || {}
    const chars = detail.chars || []
    return { base, chars }
  }

  async getOperatorList() {
    const userId = this.e.at || this.e.user_id
    const sklUser = new EndfieldUser(userId)

    if (!await sklUser.getUser()) {
      await this.reply(getUnbindMessage())
      return true
    }

    await this.reply(getMessage('operator.loading_list'))

    try {
      const detailData = await this.fetchCharacterDetailForList(sklUser)
      if (!detailData) {
        await this.reply(getMessage('operator.get_role_failed'))
        return true
      }

      const { chars, base } = detailData
      if (!chars.length) {
        await this.reply(getMessage('operator.not_found_info'))
        return true
      }

      const userAvatar = base?.avatarUrl || ''
      const userNickname = base?.name || '未知'
      const userLevel = base?.level ?? 0

      const logoPath = path.join(process.cwd(), 'plugins/endfield-plugin/resources/img/logo.png')
      const logoUrl = pathToFileURL(logoPath).href

      const operators = chars.map((char) => {
        const c = char.charData || char
        const imageUrl = c.avatarRtUrl || ''
        const rarity = parseInt(c.rarity?.value || '1', 10) || 1
        const rarityClass = `rarity_${rarity}`
        const level = char.level ?? c.level ?? 0
        const profession = c.profession?.value || ''
        const property = c.property?.value || ''
        const professionIcon = iconToDataUrl(META_CLASS_DIR, profession)
        const propertyIcon = iconToDataUrl(META_ATTRPANLE_DIR, property)
        const colorCodeMap = {
          char_property_physical: 'PHY',
          char_property_fire: 'FIRE',
          char_property_electric: 'ELEC',
          char_property_pulse: 'ELEC',
          char_property_ice: 'ICE',
          char_property_cryst: 'ICE',
          char_property_nature: 'NATURE'
        }
        const colorCode = (colorCodeMap[c.property?.key] || c.colorCode || 'PHY').toUpperCase()
        const name = String(c.name ?? '').trim() || '未知'
        return {
          name,
          nameChars: Array.from(name),
          imageUrl: imageUrl || 'https://assets.skland.com/ui-component/endfield/assets/evolve-phases/phase-1.png',
          rarityClass,
          rarity,
          level,
          profession,
          professionIcon,
          property,
          propertyIcon,
          colorCode
        }
      })

      const listBgFile = LIST_BG_FILES[Math.floor(Math.random() * LIST_BG_FILES.length)]
      const listBgPath = path.join(LIST_BG_DIR, listBgFile)
      const listBgUrl = fs.existsSync(listBgPath) ? pathToFileURL(listBgPath).href : ''

      const tplData = {
        totalCount: operators.length,
        operators,
        userAvatar,
        userNickname,
        userLevel,
        logoUrl,
        listBgUrl
      }

      const screenshotData = {
        tplFile: LIST_TPL,
        saveId: LIST_SCREENSHOT.saveId,
        listCssHref: pathToFileURL(LIST_CSS).href,
        ...tplData,
        viewport: { width: 1600, height: Math.ceil(operators.length / 8) * 220 + 250 }
      }

      const img = await puppeteer.screenshot(LIST_SCREENSHOT.name, screenshotData)
      if (img) {
        await this.e.reply(img)
      } else {
        await this.reply(getMessage('operator.list_failed'))
      }
      return true
    } catch (error) {
      logger.error(`[终末地干员列表]查询失败: ${error}`)
      await this.reply(getMessage('operator.query_failed', { error: error.message }))
      return true
    }
  }

  splitContent(content, maxLength = 2000) {
    if (!content) return []
    
    const messages = []
    let currentIndex = 0

    while (currentIndex < content.length) {
      let segment = content.slice(currentIndex, currentIndex + maxLength)
      
      if (currentIndex + maxLength < content.length) {
        const lastPunctuation = Math.max(
          segment.lastIndexOf('。'),
          segment.lastIndexOf('！'),
          segment.lastIndexOf('？'),
          segment.lastIndexOf('\n')
        )
        
        if (lastPunctuation > maxLength * 0.5) {
          segment = segment.slice(0, lastPunctuation + 1)
          currentIndex += lastPunctuation + 1
        } else {
          currentIndex += maxLength
        }
      } else {
        currentIndex = content.length
      }

      if (segment.trim()) {
        messages.push([segment])
      }
    }

    return messages
  }

  getCmdPrefix() {
    const mode = Number(this.common_setting?.prefix_mode) || 1
    return mode === 2 ? '#zmd' : ':'
  }
}
