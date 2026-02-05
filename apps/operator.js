import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { getUnbindMessage, getMessage, getPrefixStripRegex, ruleReg } from '../utils/common.js'
import { getCopyright } from '../utils/copyright.js'
import EndfieldUser from '../model/endfieldUser.js'
import setting from '../utils/setting.js'

const _dir = path.dirname(fileURLToPath(import.meta.url))
const _res = path.join(_dir, '..', 'resources')
const _operator = path.join(_res, 'operator')
const _meta = path.join(_res, 'meta')

const OPERATOR_DIR = _operator
const META_CLASS_DIR = path.join(_meta, 'class')
const META_ATTRPANLE_DIR = path.join(_meta, 'attrpanle')
const META_PHASES_DIR = path.join(_meta, 'phases')
const LIST_BG_FILES = ['bg1.png', 'bg2.png']

/**
 * 获取并发送干员列表（可被 enduid 绑定成功后调用）
 * @param {object} e 消息事件对象
 * @param {string} [userId] 用户ID，不传则用 e.at || e.user_id
 * @param {{ skipLoadingReply?: boolean }} [options] skipLoadingReply 为 true 时不发送「正在获取干员列表」
 * @returns {Promise<boolean>}
 */
export async function sendOperatorList(e, userId, options = {}) {
  const uid = userId !== undefined && userId !== null ? userId : (e.at || e.user_id)
  const sklUser = new EndfieldUser(uid)

  if (!(await sklUser.getUser())) {
    await e.reply(getUnbindMessage())
    return true
  }

  if (!options.skipLoadingReply) {
    await e.reply(getMessage('operator.loading_list'))
  }

  try {
    const res = await sklUser.sklReq.getData('endfield_card_detail')
    if (!res || res.code !== 0) {
      logger.error(`[终末地干员列表]card/detail 失败: ${JSON.stringify(res)}`)
      await e.reply(getMessage('operator.get_role_failed'))
      return true
    }
    const detail = res.data?.detail || {}
    const base = detail.base || {}
    const chars = detail.chars || []

    if (!chars.length) {
      await e.reply(getMessage('operator.not_found_info'))
      return true
    }

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
      const evolvePhase = parseInt(char.evolvePhase ?? c.evolvePhase ?? '0', 10) || 0
      const potentialLevel = parseInt(char.potentialLevel ?? c.potentialLevel ?? '0', 10) || 0
      const phaseIcon = iconToDataUrl(META_PHASES_DIR, `phase-${evolvePhase}`)
      return {
        name,
        nameChars: Array.from(name),
        imageUrl: imageUrl,
        rarityClass,
        rarity,
        level,
        profession,
        professionIcon,
        property,
        propertyIcon,
        colorCode,
        evolvePhase,
        potentialLevel,
        phaseIcon
      }
    })

    // 按星级从高到低排序展示（六星 → 五星 → 四星）
    operators.sort((a, b) => (b.rarity - a.rarity))

    // 固定列宽、列数、间距，反算总宽；viewport 略大于内容宽避免裁切
    const LIST_COLUMN_COUNT = 6
    const LIST_CARD_WIDTH_PX = 300
    const LIST_GAP_PX = 12
    const LIST_CONTAINER_PADDING_PX = 48
    const listContentWidth =
      LIST_COLUMN_COUNT * LIST_CARD_WIDTH_PX + (LIST_COLUMN_COUNT - 1) * LIST_GAP_PX
    const listPageWidth = LIST_CONTAINER_PADDING_PX + listContentWidth
    const listCardScale = LIST_CARD_WIDTH_PX / 800
    const viewportWidth = listPageWidth + 40

    const userAvatar = base?.avatarUrl || ''
    const userNickname = base?.name || '未知'
    const userLevel = base?.level ?? 0
    const listBgFile = LIST_BG_FILES[Math.floor(Math.random() * LIST_BG_FILES.length)]

    const pluResPath = e?.runtime?.path?.plugin?.['endfield-plugin']?.res || ''
    const tplData = {
      totalCount: operators.length,
      operators,
      userAvatar,
      userNickname,
      userLevel,
      listBgFile,
      listCardScale,
      listColumnCount: LIST_COLUMN_COUNT,
      listCardWidthPx: LIST_CARD_WIDTH_PX,
      listGapPx: LIST_GAP_PX,
      listPageWidth,
      listContentWidth,
      pluResPath
    }

    if (!e.runtime?.render) {
      await e.reply(getMessage('operator.list_failed'))
      return true
    }
    const img = await e.runtime.render('endfield-plugin', 'operator/list', tplData, {
      retType: 'base64',
      viewport: { width: viewportWidth }
    })
    if (img) {
      await e.reply(img)
    } else {
      await e.reply(getMessage('operator.list_failed'))
    }
    return true
  } catch (error) {
    logger.error(`[终末地干员列表]查询失败: ${error}`)
    await e.reply(getMessage('operator.query_failed', { error: error.message }))
    return true
  }
}

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
        ruleReg('干员列表$', 'getOperatorList'),
        ruleReg('(.+?)面板$', 'getOperator')
      ]
    })
    this.common_setting = setting.getConfig('common')
  }

  getOperatorNameFromMsg() {
    let s = (this.e.msg || '').replace(/面板$/, '').trim()
    s = s.replace(getPrefixStripRegex(), '').trim()
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
      const base = res.data?.base || {}
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

      const panelData = this.buildPanelData(operator, charData, userSkills, container)
      const pluResPath = this.e?.runtime?.path?.plugin?.['endfield-plugin']?.res || ''
      const tplData = {
        ...panelData,
        userAvatar: base?.avatarUrl || '',
        userNickname: base?.name || '未知',
        userLevel: base?.level ?? 0,
        pluResPath,
        ...getCopyright()
      }
      // 使用 runtime.render 对接新渲染器（renderers/puppeteer），模板与资源路径由 runtime 注入
      if (!this.e.runtime?.render) {
        await this.reply(getMessage('operator.panel_failed'))
        return true
      }
      const img = await this.e.runtime.render('endfield-plugin', 'operator/operator', tplData, { retType: 'base64' })
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
    const profession = charData.profession?.value || ''
    const property = charData.property?.value || ''
    const potentialLevel = Math.min(5, Math.max(0, operator.potentialLevel ?? 0))
    const potentialStars = Array.from({ length: 5 }, (_, i) => i < potentialLevel)
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
        refineLevel: weaponRaw.potential ?? weaponRaw.refine ?? weaponRaw.potentialLevel ?? 1,
        iconUrl: w.iconUrl || '',
        stars: Array.from({ length: Math.min(6, Math.max(1, wr)) }, (_, i) => i + 1),
        gem
      }
      weapon.refineStars = Array.from({ length: 5 }, (_, i) => i < weapon.refineLevel)
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
      // 生成星级数组用于模板显示
      const equipStars = Array.from({ length: Math.min(6, Math.max(1, rarity)) }, (_, i) => i + 1)
      return { name: raw.name, iconUrl: raw.iconUrl || '', level: lv, rarity, rarityClass, stars: equipStars }
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
    const evolvePhase = container?.evolvePhase ?? operator?.evolvePhase ?? 1
    const weaponType = charData.weaponType?.value || ''
    return {
      name: charData.name || '未知',
      illustrationUrl: charData.illustrationUrl || charData.avatarRtUrl || 'https://bbs.hycdn.cn/image/2025/11/12/9d96cc859f508f7add6668fd9280df7b.png',
      level: operator.level ?? 0,
      stars,
      profession,
      property,
      professionIconUrl: iconToDataUrl(META_CLASS_DIR, profession),
      propertyIconUrl: iconToDataUrl(META_ATTRPANLE_DIR, property),
      potentialLevel,
      potentialStars,
      evolvePhase,
      weaponType,
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
    return sendOperatorList(this.e, this.e.at || this.e.user_id)
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
    return mode === 1 ? `#${this.common_setting?.keywords?.[0] || 'zmd'}` : ':'
  }
}
