import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { getUnbindMessage, getMessage } from '../utils/common.js'
import { getCopyright } from '../utils/copyright.js'
import EndfieldUser from '../model/endfieldUser.js'
import setting from '../utils/setting.js'

const _dir = path.dirname(fileURLToPath(import.meta.url))
const _res = path.join(_dir, '..', 'resources')
const _meta = path.join(_res, 'meta')

const META_CLASS_DIR = path.join(_meta, 'class')
const META_ATTRPANLE_DIR = path.join(_meta, 'attrpanle')
const LIST_BG_FILES = ['bg1.png', 'bg2.png']

function isApiSuccess(res) {
  if (!res || typeof res !== 'object') return false
  const code = res.code
  if (typeof code === 'number') return code === 0
  if (typeof code === 'string') return code.trim() === '0'
  return res.success === true
}

function pickPanelSyncFailedReason(statusRes) {
  const data = statusRes?.data || {}
  const candidates = [
    data?.error_message,
    data?.error,
    data?.reason,
    data?.fail_reason,
    data?.message,
    statusRes?.error,
    statusRes?.msg
  ]
  for (const item of candidates) {
    const text = String(item || '').trim()
    if (!text) continue
    const lower = text.toLowerCase()
    if (lower === '成功' || lower === 'success' || lower === 'ok') continue
    return text
  }
  const failedIds = Array.isArray(data?.failed_ids) ? data.failed_ids : []
  if (failedIds.length > 0) {
    return `同步失败，失败角色 ${failedIds.length} 个`
  }
  return '同步失败'
}

function normText(val) {
  return String(val || '').trim()
}

function isOperatorRawName(val) {
  return /^chr_\d{4}_[a-z0-9_]+$/i.test(normText(val))
}

function getOperatorNameMap() {
  return setting.getData('operatorMap') || {}
}

function pickOperatorCnName(templateId, ...vals) {
  const normalizedTemplateId = normText(templateId)
  const mappedName = normText(getOperatorNameMap()?.[normalizedTemplateId])
  const candidates = [...vals, mappedName]
  for (const v of candidates) {
    const text = normText(v)
    if (!text || isOperatorRawName(text)) continue
    return text
  }
  return mappedName
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
        {
          reg: '^(?:[:：]|[/#](?:zmd|终末地))(?:同步|更新)面板$',
          fnc: 'getOperatorList'
        },
        {
          reg: '^(?:[:：]|[/#](?:zmd|终末地))练度统计$',
          fnc: 'getTrainingStats'
        },
        {
          reg: '^(?:[:：]|[/#](?:zmd|终末地))(.+?)面板$',
          fnc: 'getOperator'
        }
      ]
    })
  }

  buildFriendPanelData(friendCharData) {
    if (!friendCharData || typeof friendCharData !== 'object') return null
    const data = friendCharData?.data || friendCharData
    const char = data?.char || {}
    const processed = data?.processed || {}
    const template = char?.template || {}
    const templateId = template?.id || template?.raw_name || char?.template_id || data?.template_id || ''

    const rarity = 6
    const stars = Array.from({ length: Math.min(6, Math.max(1, rarity)) }, (_, i) => i + 1)

    const coreStats = processed?.core_stats || {}
    const panelSummary = data?.panel?.summary || {}
    const agg = processed?.aggregated_attributes || []
    const findAgg = (rawName) => {
      const hit = Array.isArray(agg) ? agg.find((x) => x?.attr_type?.raw_name === rawName) : null
      return hit || null
    }

    const hp = Math.round(coreStats?.hp ?? 0)
    const atk = Math.round(coreStats?.atk ?? 0)
    const def = Math.round(coreStats?.def ?? 0)

    const hpAgg = findAgg('MaxHp')
    const atkAgg = findAgg('Atk')
    const defAgg = findAgg('Def')

    const mini = {
      agi: Math.round(findAgg('Agi')?.final ?? 0),
      str: Math.round(findAgg('Str')?.final ?? 0),
      wisd: Math.round(findAgg('Wisd')?.final ?? 0),
      will: Math.round(findAgg('Will')?.final ?? 0),
      crt: (() => {
        const v = findAgg('CriticalRate')?.final
        if (typeof v !== 'number') return ''
        return `${(v * 100).toFixed(1)}%`
      })(),
      cdmg: (() => {
        const derived = processed?.derived_stats || processed?.summary_stats || processed?.ui || {}
        const v = derived?.critical_damage_pct ?? derived?.critical_damage ?? panelSummary?.critical_damage_pct
        if (typeof v !== 'number') return ''
        return `${v.toFixed(1)}%`
      })()
    }

    const chargeEfficiency = (() => {
      const v = findAgg('UltimateSpGainScalar')?.final
      if (typeof v !== 'number') return ''
      return `${this.formatPanelNumber(v * 100, 1)}%`
    })()

    const artsStrength = (() => {
      const v = findAgg('PhysicalAndSpellInflictionEnhance')?.final
      if (typeof v !== 'number') return ''
      return this.formatPanelNumber(v, 1)
    })()

    let matrix = null
    try {
      const gems = Array.isArray(char?.gems) ? char.gems : []
      const g = gems[0]
      const gemNameCn = g?.template?.name_cn || g?.template?.name || ''
      const termsRaw = Array.isArray(g?.terms) ? g.terms : []
      const terms = termsRaw.map((t) => {
        const nameCn = t?.term?.name_cn || t?.term?.name || ''
        const cost = t?.cost
        return {
          nameCn,
          cost: (typeof cost === 'number' || typeof cost === 'string') ? String(cost) : ''
        }
      }).filter((t) => t.nameCn)
      if (gemNameCn || terms.length) {
        matrix = { gemNameCn, terms }
      }
    } catch (err) {
      matrix = null
    }

    const formatAffixValue = (mod, rawName = '') => {
      const v = mod?.value
      if (typeof v !== 'number') return ''

      const raw = String(rawName || mod?.attr_name || '').trim()
      const looksLikePercent = /Scalar|Rate|Ratio|Multiplier/i.test(raw)
      if (mod?.mode === 'ratio' || (looksLikePercent && v > 0 && v <= 1)) {
        return `${(v * 100).toFixed(1)}%`
      }
      return `${Math.round(v)}`
    }
    const equipAffixesBySlot = { 0: [], 1: [], 2: [], 3: [] }
    try {
      const attrCnMap = {}
      try {
        const sources = [
          processed?.aggregated_attributes,
          processed?.base_attributes?.attributes
        ]
        for (const src of sources) {
          if (!Array.isArray(src)) continue
          for (const it of src) {
            const raw = it?.attr_type?.raw_name
            const cn = it?.attr_type?.name_cn
            if (raw && cn) attrCnMap[String(raw)] = String(cn)
          }
        }
      } catch (e) {
        // ignore
      }

      const mods = Array.isArray(processed?.runtime_modifiers) ? processed.runtime_modifiers : []
      for (const m of mods) {
        const slot = m?.slot
        if (slot === 0 || slot === 1 || slot === 2 || slot === 3) {
          const rawName = m?.attr_name || ''
          const displayName = String(attrCnMap[String(rawName)] || rawName || '').trim()
          const valueText = formatAffixValue(m, rawName)
          if (!displayName || !valueText) continue
          equipAffixesBySlot[slot].push({ name: displayName, value: valueText })
        }
      }
      for (const k of Object.keys(equipAffixesBySlot)) {
        const list = equipAffixesBySlot[k]
        const seen = new Set()
        const filtered = list.filter((x) => {
          const key = `${x.name}:${x.value}`
          if (seen.has(key)) return false
          seen.add(key)
          return true
        }).slice(0, 4)

        while (filtered.length < 4) filtered.push({ empty: true })
        equipAffixesBySlot[k] = filtered
      }
    } catch (err) {
      // ignore
    }

    const equipAffixesBySlotArr = [
      equipAffixesBySlot[0] || [],
      equipAffixesBySlot[1] || [],
      equipAffixesBySlot[2] || [],
      equipAffixesBySlot[3] || []
    ]

    const potentialLevel = Math.min(5, Math.max(0, char?.potential_level ?? 0))
    const potentialStars = Array.from({ length: 5 }, (_, i) => i < potentialLevel)

    return {
      nameCn: pickOperatorCnName(templateId, template?.name_cn, template?.name),
      level: char?.level ?? 0,
      stars,
      potentialLevel,
      potentialStars,
      promotionName: char?.talent?.latest_break_node_named?.name_cn || '',
      core: {
        hp,
        atk,
        def,
        hpSub: hpAgg ? `${Math.round(hpAgg.base ?? 0)} + ${Math.round(hpAgg.flat ?? 0)}` : '',
        atkSub: atkAgg ? `${Math.round(atkAgg.base ?? 0)} + ${Math.round((atkAgg.final ?? 0) - (atkAgg.base ?? 0))}` : '',
        defSub: defAgg ? `${Math.round(defAgg.base ?? 0)} + ${Math.round(defAgg.flat ?? 0)}` : ''
      },
      mini,
      resist: {
        physical: this.formatPanelNumber(panelSummary?.physical_resist, 1),
        spell: this.formatPanelNumber(panelSummary?.spell_resist, 1),
        healTaken: this.formatPanelNumber(panelSummary?.heal_taken_bonus_pct, 1)
      },
      chargeEfficiency,
      artsStrength,
      matrix,
      equipAffixesBySlotArr
    }
  }

  buildOperatorRenderBlocks(panelData, friendPanel, gearCards = [], friendCharData = null) {
    const weaponStats = Array.isArray(friendPanel?.matrix?.terms)
      ? friendPanel.matrix.terms
        .map((term) => ({
          name: term?.nameCn || '',
          value: term?.cost ? `+${term.cost}` : ''
        }))
        .filter((term) => term.name)
      : []

    const weaponCard = friendPanel
      ? (gearCards.find((card) => card?.type === 'weapon') || null)
      : (panelData?.weapon
          ? {
              type: 'weapon',
              slotLabel: '武器',
              name: panelData.weapon.name || '武器',
              level: panelData.weapon.level ?? '',
              iconUrl: panelData.weapon.iconUrl || '',
              stars: panelData.weapon.stars || [],
              meta: panelData.weapon.typeLabel || '',
              note: panelData.weapon.gem?.name || '',
              affixes: (panelData.weapon.skills || []).slice(0, 3).map((skill) => ({
                name: skill,
                value: ''
              }))
            }
          : null)

    if (weaponCard && weaponStats.length > 0) {
      weaponCard.affixes = weaponStats
    }

    const equipmentCards = friendPanel
      ? gearCards.filter((card) => card?.type && !['weapon', 'tacticalItem'].includes(card.type))
      : (panelData?.basicGearCards || [])
        .filter((card) => !['武器', '战术物品'].includes(card?.slotLabel))
        .map((card) => ({
          type: 'equip',
          slotLabel: card?.slotLabel || '',
          name: card?.name || '未装备',
          level: card?.level ?? '',
          iconUrl: card?.iconUrl || '',
          stars: card?.stars || [],
          rarity: Number(card?.rarity || (Array.isArray(card?.stars) ? card.stars.length : 0) || 0),
          rarityClass: card?.rarityClass || '',
          meta: [card?.metaPrimary, card?.metaSecondary].filter(Boolean).join(' · '),
          note: '',
          affixes: Array.isArray(card?.chips)
            ? card.chips.slice(0, 4).map((chip) => ({ name: chip, value: '' }))
            : []
        }))

    const rawFriend = friendCharData?.data || friendCharData || {}
    const equipMedicine = rawFriend?.char?.equip_medicine || {}
    const tacticalItem = panelData?.tacticalItem || null
    const recoveryItem = {
      name: equipMedicine?.name_cn || equipMedicine?.name || tacticalItem?.name || '',
      iconUrl: tacticalItem?.iconUrl || '',
      tag: tacticalItem?.typeLabel || '恢复',
      desc: tacticalItem?.desc || tacticalItem?.effectText || '',
      rawName: equipMedicine?.raw_name || ''
    }

    const renderSkills = (panelData?.displaySkills || []).filter((skill) => !skill?.empty)

    return {
      weaponCard,
      equipmentCards,
      recoveryItem,
      renderSkills
    }
  }

  buildGearCards(panelData, friendPanel) {
    const cards = []
    const padAffixes = (arr) => {
      const list = Array.isArray(arr) ? arr.slice(0, 4) : []
      while (list.length < 4) list.push({ empty: true })
      return list
    }

    const weapon = panelData?.weapon || null
    const weaponAffixes = (() => {
      const terms = friendPanel?.matrix?.terms || []
      const mapped = Array.isArray(terms)
        ? terms.map((t) => ({ name: t?.nameCn || '', value: t?.cost ? `+${t.cost}` : '' })).filter((t) => t.name && t.value)
        : []
      return padAffixes(mapped)
    })()

    cards.push({
      type: 'weapon',
      slotLabel: '武器',
      name: weapon?.name || '武器',
      level: weapon?.level ?? '',
      iconUrl: weapon?.iconUrl || '',
      stars: weapon?.stars || [],
      rarity: Number(weapon?.rarity || (Array.isArray(weapon?.stars) ? weapon.stars.length : 0) || 0),
      rarityClass: weapon?.rarityClass || '',
      meta: weapon?.typeLabel || '',
      note: weapon?.gem?.name || '',
      affixes: weaponAffixes
    })

    const equipEntries = [
      { key: 'bodyEquip', slot: 1 },
      { key: 'armEquip', slot: 0 },
      { key: 'firstAccessory', slot: 2 },
      { key: 'secondAccessory', slot: 3 },
      { key: 'tacticalItem', slot: -1 }
    ]

    for (const e of equipEntries) {
      const raw = panelData?.[e.key] || null
      const aff = e.slot >= 0 ? (friendPanel?.equipAffixesBySlotArr?.[e.slot] || []) : []
      cards.push({
        type: e.key,
        slotLabel: raw?.slotLabel || raw?.typeLabel || e.key,
        name: raw?.name || '—',
        level: raw?.level ?? '',
        iconUrl: raw?.iconUrl || '',
        stars: raw?.stars || [],
        rarity: Number(raw?.rarity || (Array.isArray(raw?.stars) ? raw.stars.length : 0) || 0),
        rarityClass: raw?.rarityClass || '',
        meta: raw?.suitName || raw?.typeLabel || '',
        note: raw?.effectTag || '',
        affixes: padAffixes(aff)
      })
    }

    return cards
  }

  getOperatorNameFromMsg() {
    let s = (this.e.msg || '').replace(/面板$/, '').trim()
    s = s.replace(/^(?:[:：]|[/#](?:zmd|终末地))\s*/i, '').trim()
    return s
  }

  hasApiKey() {
    const apiKey = setting.getConfig('common')?.api_key
    return String(apiKey || '').trim() !== ''
  }

  normalizeTrainingLevel(value, fallback = '-') {
    if (value == null || value === '') return fallback
    const num = Number(value)
    if (Number.isFinite(num)) {
      return String(Math.max(0, Math.floor(num)))
    }
    const text = String(value).trim()
    return text || fallback
  }

  extractTrainingSkillLevels(panelData = {}, operator = {}, userSkills = {}, container = {}) {
    const levels = []
    const pushLevel = (raw) => {
      if (levels.length >= 4) return
      const text = this.normalizeTrainingLevel(raw, '')
      if (!text) return
      levels.push(text)
    }

    const panelSkills = Array.isArray(panelData?.displaySkills)
      ? panelData.displaySkills.filter((item) => !item?.empty)
      : (Array.isArray(panelData?.skills) ? panelData.skills : [])
    for (const skill of panelSkills) {
      pushLevel(skill?.level ?? skill?.skillLevel ?? userSkills?.[skill?.id]?.level)
    }

    const skillSources = [
      operator?.skills,
      operator?.charData?.skills,
      container?.skills,
      container?.charData?.skills
    ]
    for (const source of skillSources) {
      if (levels.length >= 4) break
      if (!Array.isArray(source)) continue
      for (const skill of source) {
        const skillId = skill?.id || skill?.skillId || skill?.skill_id
        const level = skill?.level ?? skill?.skillLevel ?? skill?.skill_level ?? userSkills?.[skillId]?.level
        pushLevel(level)
        if (levels.length >= 4) break
      }
    }

    while (levels.length < 4) levels.push('-')
    return levels.slice(0, 4)
  }

  extractTrainingMatrixInfo(panelData = {}, operator = {}, container = {}) {
    const matrix = panelData?.gem
      || panelData?.weapon?.gem
      || operator?.weapon?.gem
      || container?.weapon?.gem
      || null

    const name = String(
      matrix?.name
      || matrix?.gemData?.name
      || matrix?.template?.name_cn
      || matrix?.template?.name
      || ''
    ).trim() || '-'

    const levelCandidates = [
      matrix?.level,
      matrix?.lv,
      matrix?.rank,
      matrix?.tier,
      matrix?.phase,
      matrix?.breakthroughLevel,
      matrix?.refineLevel,
      matrix?.intensifyLevel,
      matrix?.enhanceLevel,
      matrix?.gemData?.level,
      matrix?.gemData?.lv
    ]
    let level = '-'
    for (const candidate of levelCandidates) {
      const text = this.normalizeTrainingLevel(candidate, '')
      if (text) {
        level = text
        break
      }
    }

    return { name, level }
  }

  extractTrainingItemName(rawDetailData = {}, panelData = {}) {
    const data = rawDetailData?.detail || rawDetailData || {}
    const char = data?.char || {}
    const equipMedicine = char?.equip_medicine || char?.equipMedicine || {}
    const name = equipMedicine?.name_cn || equipMedicine?.name || panelData?.tacticalItem?.name || ''
    return String(name || '').trim() || '-'
  }

  buildTrainingFallbackRow(seed = {}) {
    return {
      name: seed?.name || '未知',
      rarity: Number(seed?.rarity || 0),
      level: this.normalizeTrainingLevel(seed?.level, '-'),
      skillLevels: ['-', '-', '-', '-'],
      weaponName: String(seed?.weaponName || '-').trim() || '-',
      weaponLevel: this.normalizeTrainingLevel(seed?.weaponLevel, '-'),
      matrixName: String(seed?.matrixName || '-').trim() || '-',
      matrixLevel: this.normalizeTrainingLevel(seed?.matrixLevel, '-'),
      equipLevels: [
        this.normalizeTrainingLevel(seed?.equipLevels?.[0], '-'),
        this.normalizeTrainingLevel(seed?.equipLevels?.[1], '-'),
        this.normalizeTrainingLevel(seed?.equipLevels?.[2], '-'),
        this.normalizeTrainingLevel(seed?.equipLevels?.[3], '-')
      ],
      itemName: String(seed?.itemName || '-').trim() || '-'
    }
  }

  parseTrainingNumber(value) {
    const num = Number(value)
    return Number.isFinite(num) ? Math.max(0, Math.floor(num)) : 0
  }

  calcTrainingSortMetrics(row = {}) {
    const rarity = this.parseTrainingNumber(row.rarity)
    const level = this.parseTrainingNumber(row.level)
    const skillTotal = Array.isArray(row.skillLevels)
      ? row.skillLevels.reduce((sum, val) => sum + this.parseTrainingNumber(val), 0)
      : 0
    const weaponLevel = this.parseTrainingNumber(row.weaponLevel)
    const equipTotal = Array.isArray(row.equipLevels)
      ? row.equipLevels.reduce((sum, val) => sum + this.parseTrainingNumber(val), 0)
      : 0
    const matrixLevel = this.parseTrainingNumber(row.matrixLevel)
    return { rarity, level, skillTotal, weaponLevel, equipTotal, matrixLevel }
  }

  sortTrainingRows(rows = []) {
    return rows.slice().sort((a, b) => {
      const am = this.calcTrainingSortMetrics(a)
      const bm = this.calcTrainingSortMetrics(b)
      // 优先按角色星级：6 > 5 > 4 > ...
      if (bm.rarity !== am.rarity) return bm.rarity - am.rarity
      // 同星级内按综合练度高到低
      if (bm.level !== am.level) return bm.level - am.level
      if (bm.skillTotal !== am.skillTotal) return bm.skillTotal - am.skillTotal
      if (bm.weaponLevel !== am.weaponLevel) return bm.weaponLevel - am.weaponLevel
      if (bm.equipTotal !== am.equipTotal) return bm.equipTotal - am.equipTotal
      if (bm.matrixLevel !== am.matrixLevel) return bm.matrixLevel - am.matrixLevel
      return String(a?.name || '').localeCompare(String(b?.name || ''), 'zh-CN')
    })
  }

  formatPanelNumber(value, digits = 1) {
    const num = Number(value)
    if (!Number.isFinite(num)) return ''
    if (Math.abs(num - Math.round(num)) < 1e-6) return String(Math.round(num))
    return num.toFixed(digits).replace(/\.?0+$/, '')
  }

  resolveDescExpr(expr, params = {}) {
    const parts = String(expr || '').split('*').map((item) => item.trim()).filter(Boolean)
    if (parts.length === 0) return null
    let result = 1
    let hasValue = false
    for (const part of parts) {
      let value = null
      if (/^-?\d+(?:\.\d+)?$/.test(part)) {
        value = Number(part)
      } else {
        const raw = params?.[part]
        const parsed = Number(raw)
        if (Number.isFinite(parsed)) value = parsed
      }
      if (!Number.isFinite(value)) return null
      result *= value
      hasValue = true
    }
    return hasValue ? result : null
  }

  renderPanelText(text, params = {}) {
    if (!text) return ''
    let out = String(text)
    out = out.replace(/\{([^}:]+):([^}]+)\}/g, (_, expr, fmt) => {
      const resolved = this.resolveDescExpr(expr, params)
      if (!Number.isFinite(resolved)) return ''
      const needsPercent = String(fmt || '').includes('%')
      const value = needsPercent && Math.abs(resolved) <= 1 ? resolved * 100 : resolved
      return `${this.formatPanelNumber(value, Math.abs(value) < 10 ? 1 : 0)}${needsPercent ? '%' : ''}`
    })
    out = out.replace(/<[^>]+>/g, '')
    out = out.replace(/[ \t]+\n/g, '\n')
    out = out.replace(/\n{3,}/g, '\n\n')
    return out.trim()
  }

  buildTalentCards(items = [], categoryLabel = '') {
    const list = Array.isArray(items) ? items : []
    return list.map((item, index) => ({
      name: item?.name || `${categoryLabel}${index + 1}`,
      iconUrl: item?.iconUrl || item?.lockedIconUrl || '',
      desc: this.renderPanelText(
        item?.desc || item?.activeEffect || item?.passiveEffect || '',
        item?.descParams || item?.activeEffectParams || item?.passiveEffectParams || {}
      ),
      categoryLabel
    })).filter((item) => item.name || item.desc)
  }

  buildSkillCards(charData, userSkills = {}) {
    const list = Array.isArray(charData?.skills) ? charData.skills : []
    return list.map((skill) => {
      const userInfo = userSkills?.[skill?.id] || {}
      const desc = this.renderPanelText(skill?.desc || '', skill?.descParams || {})
      return {
        id: skill?.id || '',
        name: skill?.name || '未知技能',
        type: skill?.type?.value || '',
        property: skill?.property?.value || '',
        iconUrl: skill?.iconUrl || '',
        level: userInfo?.level ?? 1,
        maxLevel: userInfo?.maxLevel ?? '',
        desc,
        descCompact: desc.replace(/\n+/g, ' ').trim()
      }
    })
  }

  buildEquipSuits(equipList = []) {
    const suitMap = new Map()
    for (const equip of equipList) {
      if (!equip?.suitName) continue
      const key = String(equip.suitName).trim()
      if (!key) continue
      if (!suitMap.has(key)) {
        suitMap.set(key, {
          name: key,
          count: 0,
          effect: equip?.suitEffect || ''
        })
      }
      const current = suitMap.get(key)
      current.count += 1
      if (!current.effect && equip?.suitEffect) current.effect = equip.suitEffect
    }
    return Array.from(suitMap.values())
  }

  buildBasicGearCards(panelData) {
    const cards = []
    const pushEmpty = (slotLabel) => {
      cards.push({
        empty: true,
        slotLabel,
        name: '未装备',
        metaPrimary: '',
        metaSecondary: '',
        desc: ''
      })
    }

    const weapon = panelData?.weapon
    if (weapon) {
      cards.push({
        slotLabel: '武器',
        name: weapon.name || '武器',
        iconUrl: weapon.iconUrl || '',
        level: weapon.level ?? '',
        stars: weapon.stars || [],
        rarity: Number(weapon.rarity || (Array.isArray(weapon.stars) ? weapon.stars.length : 0) || 0),
        rarityClass: weapon.rarityClass || '',
        metaPrimary: weapon.typeLabel || '主武器',
        metaSecondary: weapon.breakthroughLevel > 0 ? `潜能 ${weapon.breakthroughLevel}` : '',
        desc: weapon.desc || '',
        chips: [
          weapon.gem?.name || '',
          ...(Array.isArray(weapon.skills) ? weapon.skills.slice(0, 2) : [])
        ].filter(Boolean)
      })
    } else {
      pushEmpty('武器')
    }

    const equipDefs = [
      { key: 'bodyEquip', slotLabel: '躯干装备' },
      { key: 'armEquip', slotLabel: '手部装备' },
      { key: 'firstAccessory', slotLabel: '配件一' },
      { key: 'secondAccessory', slotLabel: '配件二' },
      { key: 'tacticalItem', slotLabel: '战术物品' }
    ]

    for (const def of equipDefs) {
      const equip = panelData?.[def.key]
      if (!equip) {
        pushEmpty(def.slotLabel)
        continue
      }
      cards.push({
        slotLabel: equip.slotLabel || def.slotLabel,
        name: equip.name || '未装备',
        iconUrl: equip.iconUrl || '',
        level: equip.level ?? '',
        stars: equip.stars || [],
        rarity: Number(equip.rarity || (Array.isArray(equip.stars) ? equip.stars.length : 0) || 0),
        rarityClass: equip.rarityClass || '',
        metaPrimary: equip.typeLabel || '',
        metaSecondary: equip.suitName || '',
        desc: equip.desc || equip.effectText || '',
        chips: [
          equip.effectTag || '',
          equip.suitName ? `${equip.suitName}套装` : ''
        ].filter(Boolean)
      })
    }

    return cards
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
      await this.reply(getMessage('operator.provide_name', { prefix: ':' }))
      return true
    }

    await this.reply(getMessage('operator.loading_detail'))

    try {
      const hasApiKey = this.hasApiKey()
      const roleId = String(sklUser.endfield_uid || '')
      const serverId = Number(sklUser.server_id || 1)
      const res = await sklUser.sklReq.getData('note', { roleId, serverId })
      
      if (!isApiSuccess(res)) {
        logger.error(`[终末地干员]获取干员列表失败: ${JSON.stringify(res)}`)
        await this.reply(getMessage('common.get_role_failed'))
        return true
      }

      const base = res.data?.base || {}
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

      const norm = (val) => String(val || '').trim()
      let templateId = norm(matched.templateId || matched.template_id || '')

      let panelTemplateId = ''
      let friendCharData = null

      if (hasApiKey) {
        try {
          const panelListRes = await sklUser.sklReq.getData('panel_chars', { page: 1, page_size: 50 }).catch(() => false)
          if (isApiSuccess(panelListRes)) {
            const rows = Array.isArray(panelListRes?.data?.synced_chars) ? panelListRes.data.synced_chars : []
            const targetName = norm(matched.name || operatorName)
            const targetTemplate = norm(templateId)
            const hit = rows.find((r) => {
              const tid = norm(r?.template_id || r?.templateId)
              const nameCn = norm(r?.name_cn || r?.name)
              return (targetTemplate && tid === targetTemplate) || (nameCn && nameCn === targetName)
            })
            panelTemplateId = norm(hit?.template_id || hit?.templateId || targetTemplate)
          }
        } catch (err) {
          panelTemplateId = ''
        }
      }

      if (hasApiKey && panelTemplateId) {
        const panelCharResRaw = await sklUser.sklReq.getData('panel_char_detail', { template_id: panelTemplateId }).catch(() => false)
        try {
          if (panelCharResRaw) {
            const payload = panelCharResRaw?.data || {}
            friendCharData = isApiSuccess(panelCharResRaw) ? payload : (payload?.data || payload)
          }
        } catch (err) {
          friendCharData = null
        }
      }

      let friendRoleId = ''
      let friendCharTemplateId = ''
      if (!friendCharData && hasApiKey) {
        const friendDetailRes = await sklUser.sklReq.getData('friend_detail').catch(() => false)
        try {
          const payload = friendDetailRes?.data || {}
          const friendData = isApiSuccess(friendDetailRes) ? payload : (payload?.data || payload)
          friendRoleId = norm(friendData?.role_profile?.role_id || friendData?.role_profile?.roleId || '')

          const friendChars = friendData?.role_profile?.char_data || []
          if (Array.isArray(friendChars) && friendChars.length) {
            const targetName = norm(matched.name || operatorName)
            const hit = friendChars.find((x) => {
              const tid = norm(x?.template_id || x?.template?.id || x?.template?.raw_name)
              const nameCn = norm(pickOperatorCnName(tid, x?.template?.name_cn, x?.template?.name))
              return (templateId && tid === templateId) || (nameCn && nameCn === targetName)
            })
            friendCharTemplateId = norm(hit?.template_id || hit?.template?.id || '')
          }
        } catch (err) {
          friendRoleId = ''
          friendCharTemplateId = ''
        }
      }

      const enableFriendPanel = Boolean(friendCharData || (friendRoleId && friendCharTemplateId))

      const friendTemplateId = panelTemplateId || friendCharTemplateId || templateId

      const [operatorRes, friendCharResRaw] = await Promise.all([
        sklUser.sklReq.getData('endfield_card_char', { instId, roleId, serverId }),
        (!friendCharData && hasApiKey && enableFriendPanel && friendTemplateId && friendRoleId)
          ? sklUser.sklReq.getData('friend_char', { role_id: friendRoleId, template_id: friendTemplateId }).catch(() => false)
          : Promise.resolve(false)
      ])

      if (!friendCharData) {
        try {
          if (friendCharResRaw) {
            const payload = friendCharResRaw?.data || {}
            friendCharData = isApiSuccess(friendCharResRaw) ? payload : (payload?.data || payload)
          }
        } catch (err) {
          friendCharData = null
        }
      }

      if (!isApiSuccess(operatorRes)) {
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
      const friendPanel = enableFriendPanel ? this.buildFriendPanelData(friendCharData) : null
      const gearCards = friendPanel ? this.buildGearCards(panelData, friendPanel) : []
      const renderBlocks = this.buildOperatorRenderBlocks(panelData, friendPanel, gearCards, friendCharData)
      const pluResPath = this.e?.runtime?.path?.plugin?.['endfield-plugin']?.res || ''
      const tplData = {
        ...panelData,
        friendChar: friendCharData,
        friendPanel,
        gearCards,
        ...renderBlocks,
        friendTemplateId: friendTemplateId || '',
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
      await this.reply(getMessage('common.query_failed', { error: error.message }))
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

    const skillCards = this.buildSkillCards(charData, userSkills)
    const skills = skillCards.map((skill) => ({
      name: skill.name,
      iconUrl: skill.iconUrl,
      level: skill.level,
      maxLevel: skill.maxLevel,
      type: skill.type,
      property: skill.property,
      desc: skill.desc
    }))

    const weaponRaw = operator.weapon || container?.weapon
    let weapon = null
    let gem = null
    if (weaponRaw?.weaponData) {
      const w = weaponRaw.weaponData
      const wr = parseInt(w.rarity?.value || '1', 10) || 1
      const gemRaw = weaponRaw.gem
      const gemData = gemRaw?.gemData || gemRaw
      if (gemData && (gemData.icon || gemRaw?.id)) {
        gem = {
          name: gemData.name || gemRaw?.name || '基质',
          iconUrl: gemData.icon || gemRaw?.icon || ''
        }
      }
      weapon = {
        name: w.name || '未知',
        level: weaponRaw.level ?? 0,
        rarity: wr,
        rarityClass: `equip_rarity_${Math.min(6, Math.max(1, wr))}`,
        refineLevel: weaponRaw.refineLevel ?? weaponRaw.refine ?? weaponRaw.potential ?? weaponRaw.potentialLevel ?? 0,
        breakthroughLevel: weaponRaw.breakthroughLevel ?? weaponRaw.breakthrough ?? 0,
        iconUrl: w.iconUrl || '',
        typeLabel: w.type?.value || '',
        desc: this.renderPanelText(w.description || w.function || '', {}),
        skills: Array.isArray(w.skills) ? w.skills.map((item) => item?.value || '').filter(Boolean) : [],
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
      return {
        name: raw.name,
        iconUrl: raw.iconUrl || '',
        level: lv,
        rarity,
        rarityClass,
        stars: equipStars,
        typeLabel: raw.type?.value || '',
        slotLabel: raw.type?.value || '',
        suitName: raw.suit?.name || '',
        suitEffect: this.renderPanelText(raw.suit?.skillDesc || '', raw.suit?.skillDescParams || {}),
        desc: this.renderPanelText(raw.pkg || raw.function || '', {}),
        effectTag: Array.isArray(raw.properties) && raw.properties.length > 0 ? `${raw.properties.length}词条` : ''
      }
    }
    const bodyEquip = pickEquip(operator.bodyEquip || container?.bodyEquip)
    const armEquip = pickEquip(operator.armEquip || container?.armEquip)
    const firstAccessory = pickEquip(operator.firstAccessory || container?.firstAccessory)
    const secondAccessory = pickEquip(operator.secondAccessory || container?.secondAccessory)

    const tactRaw = (operator.tacticalItem || container?.tacticalItem)?.tacticalItemData
    let tacticalItem = null
    if (tactRaw?.name) {
      const { rarity, rarityClass } = parseRarity(tactRaw.rarity)
      const activeEffect = this.renderPanelText(tactRaw.activeEffect || '', tactRaw.activeEffectParams || {})
      const passiveEffect = this.renderPanelText(tactRaw.passiveEffect || '', tactRaw.passiveEffectParams || {})
      tacticalItem = {
        name: tactRaw.name,
        iconUrl: tactRaw.iconUrl || '',
        level: '',
        rarity,
        rarityClass,
        typeLabel: tactRaw.activeEffectType?.value || '战术物品',
        slotLabel: '战术物品',
        effectTag: tactRaw.activeEffectType?.value || '',
        activeEffect,
        passiveEffect,
        effectText: passiveEffect || activeEffect,
        desc: passiveEffect || activeEffect
      }
    }

    const displaySkills = skills.slice(0, 4)
    while (displaySkills.length < 4) displaySkills.push({ empty: true })
    const evolvePhase = container?.evolvePhase ?? operator?.evolvePhase ?? 1
    const weaponType = charData.weaponType?.value || ''
    const combatTalentCards = this.buildTalentCards(charData.combatTalents, '作战天赋')
    const abilityTalentCards = this.buildTalentCards(charData.abilityTalents, '能力扩延')
    const cultivationTalentCards = this.buildTalentCards(charData.cultivationTalents, '驻舰天赋')
    const equipSuits = this.buildEquipSuits([bodyEquip, armEquip, firstAccessory, secondAccessory])
    const basicGearCards = this.buildBasicGearCards({
      weapon,
      bodyEquip,
      armEquip,
      firstAccessory,
      secondAccessory,
      tacticalItem
    })
    const identityChips = [
      { label: '职业', value: profession, iconUrl: iconToDataUrl(META_CLASS_DIR, profession) },
      { label: '属性', value: property, iconUrl: iconToDataUrl(META_ATTRPANLE_DIR, property) },
      { label: '武器', value: weaponType, iconUrl: '' },
      { label: '阶段', value: `精英化 ${evolvePhase}`, iconUrl: '' }
    ].filter((item) => item.value)
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
      skillCards,
      displaySkills,
      weapon,
      gem,
      bodyEquip,
      armEquip,
      firstAccessory,
      secondAccessory,
      tacticalItem,
      combatTalentCards,
      abilityTalentCards,
      cultivationTalentCards,
      equipSuits,
      basicGearCards,
      identityChips
    }
  }

  extractOperatorDetail(data = {}) {
    const container = data?.detail || data || {}
    let operator = container.char || container.operator || container || {}
    let charData = operator.charData || container.charData || operator?.char?.charData || {}
    let userSkills = operator.userSkills || container.userSkills || operator?.char?.userSkills || {}
    return { operator, charData, userSkills, container }
  }

  async getTrainingStats() {
    const uid = this.e.at || this.e.user_id
    const sklUser = new EndfieldUser(uid)

    if (!(await sklUser.getUser())) {
      await this.reply(getUnbindMessage())
      return true
    }

    await this.reply(getMessage('operator.training_loading'))

    try {
      const roleId = String(sklUser.endfield_uid || '')
      const serverId = Number(sklUser.server_id || 1)
      const detailRes = await sklUser.sklReq.getData('endfield_card_detail', { roleId, serverId })
      if (!isApiSuccess(detailRes)) {
        logger.error(`[终末地练度统计] 获取角色列表失败: ${JSON.stringify(detailRes)}`)
        await this.reply(getMessage('common.get_role_failed'))
        return true
      }

      const detail = detailRes?.data?.detail || {}
      const base = detail?.base || {}
      const chars = Array.isArray(detail?.chars) ? detail.chars : []
      if (!chars.length) {
        await this.reply(getMessage('operator.training_empty'))
        return true
      }

      const seeds = chars.map((char, index) => {
        const c = char?.charData || char || {}
        const instId = String(char?.id || char?.instId || c?.id || '').trim()
        const name = String(
          c?.name || char?.name || c?.template?.name_cn || char?.template?.name_cn || `角色${index + 1}`
        ).trim()
        const rarity = Number.parseInt(c?.rarity?.value || c?.rarity || '0', 10) || 0
        const level = c?.level ?? char?.level ?? 0
        const weapon = c?.weapon || char?.weapon || {}
        return {
          instId,
          index,
          name: name || `角色${index + 1}`,
          rarity,
          level,
          weaponName: weapon?.name || '-',
          weaponLevel: weapon?.level ?? '-',
          matrixName: weapon?.gem?.gemData?.name || '-'
        }
      })
        .sort((a, b) => {
          if (b.rarity !== a.rarity) return b.rarity - a.rarity
          const lvDiff = (Number(b.level) || 0) - (Number(a.level) || 0)
          if (lvDiff !== 0) return lvDiff
          return a.index - b.index
        })

      const rows = await this.collectTrainingRows(sklUser, seeds, roleId, serverId)
      if (!rows.length) {
        await this.reply(getMessage('operator.training_failed'))
        return true
      }

      const sortedRows = this.sortTrainingRows(rows)
      const renderRows = sortedRows.map((row, i) => ({
        ...row,
        index: i + 1
      }))
      const updatedAt = new Date().toLocaleString('zh-CN')

      if (this.e.runtime?.render) {
        const pluResPath = this.e?.runtime?.path?.plugin?.['endfield-plugin']?.res || ''
        const renderData = {
          userAvatar: base?.avatarUrl || '',
          userNickname: base?.name || '未知',
          userLevel: base?.level ?? 0,
          totalCount: renderRows.length,
          updatedAt,
          rows: renderRows,
          pluResPath,
          ...getCopyright()
        }
        const img = await this.e.runtime.render('endfield-plugin', 'operator/training', renderData, {
          retType: 'base64'
        })
        if (img) {
          await this.e.reply(img)
          return true
        }
      }

      const lines = renderRows.map((row) => {
        const skillText = row.skillLevels.join('/')
        const equipText = row.equipLevels.join('/')
        return `${row.index}. ${row.name} Lv.${row.level} | 技能 ${skillText} | 武器 ${row.weaponName} Lv.${row.weaponLevel} | 基质 ${row.matrixName} Lv.${row.matrixLevel} | 装备 ${equipText} | 物品 ${row.itemName}`
      })
      await this.reply([
        `练度统计（共 ${renderRows.length} 名）`,
        ...lines
      ].join('\n'))
      return true
    } catch (error) {
      logger.error(`[终末地练度统计] 查询失败: ${error}`)
      await this.reply(getMessage('common.query_failed', { error: error?.message || error }))
      return true
    }
  }

  async collectTrainingRows(sklUser, seeds = [], roleId, serverId) {
    if (!Array.isArray(seeds) || seeds.length === 0) return []
    const rows = new Array(seeds.length)
    let cursor = 0
    const concurrency = Math.min(4, seeds.length)

    const worker = async () => {
      while (true) {
        const idx = cursor++
        if (idx >= seeds.length) return

        const seed = seeds[idx]
        const fallback = this.buildTrainingFallbackRow(seed)
        if (!seed?.instId) {
          rows[idx] = fallback
          continue
        }

        try {
          const detailRes = await sklUser.sklReq.getData('endfield_card_char', {
            instId: seed.instId,
            roleId,
            serverId
          })
          if (!isApiSuccess(detailRes)) {
            rows[idx] = fallback
            continue
          }

          const { operator, charData, userSkills, container } = this.extractOperatorDetail(detailRes.data)
          if (!operator || !charData) {
            rows[idx] = fallback
            continue
          }
          const panelData = this.buildPanelData(operator, charData, userSkills, container)
          const skillLevels = this.extractTrainingSkillLevels(panelData, operator, userSkills, container)
          const matrix = this.extractTrainingMatrixInfo(panelData, operator, container)

          rows[idx] = {
            name: String(panelData?.name || seed?.name || '未知').trim() || '未知',
            rarity: Number(seed?.rarity || 0),
            level: this.normalizeTrainingLevel(panelData?.level ?? seed?.level, '-'),
            skillLevels,
            weaponName: String(panelData?.weapon?.name || seed?.weaponName || '-').trim() || '-',
            weaponLevel: this.normalizeTrainingLevel(panelData?.weapon?.level ?? seed?.weaponLevel, '-'),
            matrixName: matrix.name || String(seed?.matrixName || '-').trim() || '-',
            matrixLevel: matrix.level,
            equipLevels: [
              this.normalizeTrainingLevel(panelData?.bodyEquip?.level, '-'),
              this.normalizeTrainingLevel(panelData?.armEquip?.level, '-'),
              this.normalizeTrainingLevel(panelData?.firstAccessory?.level, '-'),
              this.normalizeTrainingLevel(panelData?.secondAccessory?.level, '-')
            ],
            itemName: this.extractTrainingItemName(detailRes?.data, panelData)
          }
        } catch (err) {
          rows[idx] = fallback
        }
      }
    }

    await Promise.all(Array.from({ length: concurrency }, () => worker()))
    return rows.filter(Boolean)
  }

  async getOperatorList(options = {}) {
    const uid = this.e.at || this.e.user_id
    const sklUser = new EndfieldUser(uid)

    if (!(await sklUser.getUser())) {
      if (!options.silent) await this.reply(getUnbindMessage())
      return options.retImage ? null : true
    }

    if (!options.silent) await this.reply(getMessage('operator.loading_list'))

    try {
      const hasApiKey = this.hasApiKey()
      if (options.frameworkToken && sklUser.sklReq) {
        sklUser.framework_token = String(options.frameworkToken)
        sklUser.sklReq.setFrameworkToken(String(options.frameworkToken))
      }
      // 1) 尝试触发面板同步（失败时降级到实时数据，不中断命令）
      const allSyncedChars = []
      let syncCompleted = false
      let syncFailedReason = ''
      let friendRoleId = ''

      if (hasApiKey) {
        const syncRes = await sklUser.sklReq.getData('panel_sync')
        if (!isApiSuccess(syncRes)) {
          syncFailedReason = syncRes?.message || '触发同步失败'
          logger.warn(`[终末地面板同步][${uid}] 触发失败，已降级实时数据：${syncFailedReason}`)
        } else {
          // 2) 轮询同步状态
          const maxPoll = 90
          for (let i = 0; i < maxPoll; i++) {
            await this.sleep(2000)
            const statusRes = await sklUser.sklReq.getData('panel_sync_status')
            if (!isApiSuccess(statusRes)) continue
            const status = String(statusRes?.data?.status || '').trim()
            if (status === 'completed' || status === 'idle') {
              syncCompleted = true
              break
            }
            if (status === 'failed') {
              syncFailedReason = pickPanelSyncFailedReason(statusRes)
              logger.error(`[终末地面板同步][${uid}] 状态失败，已降级实时数据: ${JSON.stringify(statusRes)}`)
              break
            }
          }

          if (!syncCompleted && !syncFailedReason) {
            syncFailedReason = '同步超时'
            logger.warn(`[终末地面板同步][${uid}] 轮询超时，已降级实时数据`)
          }
        }
      } else {
        logger.warn(`[终末地面板同步][${uid}] 未配置 api_key，跳过 panel_sync 同步`)
      }

      // 3) 拉取已同步角色列表（分页，允许在同步未完成时读取缓存）
      if (hasApiKey) {
        const pageSize = 50
        let page = 1
        let total = 0
        while (true) {
          const listRes = await sklUser.sklReq.getData('panel_chars', { page, page_size: pageSize })
          if (!isApiSuccess(listRes)) {
            const msg = listRes?.message || '获取同步角色列表失败'
            logger.warn(`[终末地面板同步][${uid}] 读取同步列表失败：${msg}`)
            break
          }
          const data = listRes.data || {}
          const rows = Array.isArray(data.synced_chars) ? data.synced_chars : []
          if (!friendRoleId) {
            const candidate = data.game_role_id || data.role_profile?.role_id || ''
            friendRoleId = String(candidate || '').trim()
          }
          total = Number(data.total ?? total ?? 0)
          allSyncedChars.push(...rows)
          if (allSyncedChars.length >= total || rows.length < pageSize) break
          page++
        }
      }
      if (!syncCompleted && syncFailedReason) {
        logger.warn(`[终末地面板同步][${uid}] 同步未完成，原因: ${syncFailedReason}`)
      }

      // 4) 获取全量干员列表，使用同步角色覆盖展示数据
      const roleId = String(options.roleId || sklUser.endfield_uid || '')
      const serverId = Number(options.serverId || sklUser.server_id || 1)
      const friendDetailRoleId = friendRoleId || roleId
      const [res, friendDetailRes] = await Promise.all([
        sklUser.sklReq.getData('endfield_card_detail', { roleId, serverId }),
        hasApiKey ? sklUser.sklReq.getData('friend_detail', { role_id: friendDetailRoleId }).catch(() => false) : Promise.resolve(false)
      ])

      if (!isApiSuccess(res)) {
        logger.error(`[终末地干员列表]card/detail 失败: ${JSON.stringify(res)}`)
        if (!options.silent) await this.reply(getMessage('common.get_role_failed'))
        return options.retImage ? null : true
      }
      const detail = res.data?.detail || {}
      const base = detail.base || {}
      const chars = detail.chars || []

      if (!chars.length) {
        if (!options.silent) await this.reply(getMessage('operator.not_found_info'))
        return options.retImage ? null : true
      }

      const norm = (val) => String(val || '').trim()
      const pickCnName = (templateId, ...vals) => {
        for (const v of vals) {
          const text = norm(v)
          if (!text || isOperatorRawName(text)) continue
          return text
        }
        return pickOperatorCnName(templateId)
      }

      // friend_detail 展示标记 / 名称映射
      let friendTemplateCnSet = new Set()
      let friendTemplateIdSet = new Set()
      const friendNameById = new Map()
      try {
        const friendPayload = friendDetailRes?.data || {}
        const friendData = isApiSuccess(friendDetailRes) ? friendPayload : (friendPayload?.data || friendPayload)
        const friendList = friendData?.role_profile?.char_data || []
        if (Array.isArray(friendList)) {
          friendTemplateCnSet = new Set(friendList.map((x) => {
            const tid = norm(x?.template_id || x?.template?.id || x?.template?.raw_name)
            return norm(pickOperatorCnName(tid, x?.template?.name_cn, x?.template?.name))
          }).filter(Boolean))
          friendTemplateIdSet = new Set(friendList.map((x) => norm(x?.template_id || x?.template?.id)).filter(Boolean))
          for (const item of friendList) {
            const tid = norm(item?.template_id || item?.template?.id || item?.template?.raw_name)
            const cn = norm(pickOperatorCnName(tid, item?.template?.name_cn, item?.template?.name))
            if (tid && cn && !friendNameById.has(tid)) friendNameById.set(tid, cn)
          }
        }
      } catch (err) {
        friendTemplateCnSet = new Set()
        friendTemplateIdSet = new Set()
      }

      // 同步角色索引：
      const syncedMap = new Map()
      const syncedOrderMap = new Map()
      allSyncedChars.forEach((item, idx) => {
        const tid = String(item?.template_id || '').trim()
        if (!tid) return
        if (!syncedOrderMap.has(tid)) syncedOrderMap.set(tid, idx)
        syncedMap.set(tid, item)
      })

      const operators = chars.map((char) => {
        const c = char.charData || char
        const imageUrl = c.avatarSqUrl || c.avatar_sq_url || c.avatarRtUrl || c.avatar_rt_url || ''
        const templateId = norm(
          char?.template_id ||
          char?.templateId ||
          char?.template?.id ||
          char?.template?.raw_name ||
          c?.template_id ||
          c?.templateId ||
          c?.template?.id ||
          c?.template?.raw_name ||
          ''
        )
        const synced = syncedMap.get(templateId)
        const rarity = parseInt(c.rarity?.value || '1', 10) || 1
        const name = pickCnName(
          templateId,
          c?.name,
          char?.name,
          friendNameById.get(templateId),
          synced?.name_cn,
          c?.name_cn,
          c?.template?.name_cn,
          char?.name_cn,
          char?.template?.name_cn
        ) || '未知'
        const isSynced = syncedOrderMap.has(templateId)
        const isFriendShowcase = isSynced
          || friendTemplateIdSet.has(templateId)
          || friendTemplateCnSet.has(name)
        return {
          templateId,
          name,
          imageUrl,
          rarity,
          isFriendShowcase,
          syncOrder: isSynced ? syncedOrderMap.get(templateId) : Number.MAX_SAFE_INTEGER
        }
      })

      // 同步角色在前（按同步列表顺序），其余按星级从高到低
      operators.sort((a, b) => {
        const aSynced = Number.isFinite(a.syncOrder) && a.syncOrder !== Number.MAX_SAFE_INTEGER
        const bSynced = Number.isFinite(b.syncOrder) && b.syncOrder !== Number.MAX_SAFE_INTEGER
        if (aSynced && bSynced) return a.syncOrder - b.syncOrder
        if (aSynced && !bSynced) return -1
        if (!aSynced && bSynced) return 1
        return b.rarity - a.rarity
      })

      const LIST_COLUMN_COUNT = 6
      const LIST_CARD_WIDTH_PX = 180
      const LIST_GAP_PX = 14
      const LIST_CONTAINER_PADDING_PX = 40
      const listContentWidth =
        LIST_COLUMN_COUNT * LIST_CARD_WIDTH_PX + (LIST_COLUMN_COUNT - 1) * LIST_GAP_PX
      const listPageWidth = LIST_CONTAINER_PADDING_PX + listContentWidth
      const viewportWidth = listPageWidth + 40

      const userAvatar = base?.avatarUrl || ''
      const userNickname = base?.name || '未知'
      const userLevel = base?.level ?? 0
      const listBgFile = LIST_BG_FILES[Math.floor(Math.random() * LIST_BG_FILES.length)]

      const pluResPath = this.e?.runtime?.path?.plugin?.['endfield-plugin']?.res || ''
      const tplData = {
        totalCount: operators.length,
        operators,
        userAvatar,
        userNickname,
        userLevel,
        listBgFile,
        listColumnCount: LIST_COLUMN_COUNT,
        listCardWidthPx: LIST_CARD_WIDTH_PX,
        listGapPx: LIST_GAP_PX,
        listPageWidth,
        listContentWidth,
        pluResPath
      }

      if (!this.e.runtime?.render) {
        if (!options.silent) await this.reply(getMessage('operator.list_failed'))
        return options.retImage ? null : true
      }
      const img = await this.e.runtime.render('endfield-plugin', 'operator/list', tplData, {
        retType: 'base64',
        viewport: { width: viewportWidth }
      })
      if (img) {
        if (options.retImage) return img
        await this.e.reply(img)
      } else {
        if (!options.silent) await this.reply(getMessage('operator.list_failed'))
        return options.retImage ? null : true
      }
      return options.retImage ? img : true
    } catch (error) {
      logger.error(`[终末地面板同步]查询失败: ${error}`)
      if (!options.silent) await this.reply(getMessage('common.query_failed', { error: error.message }))
      return options.retImage ? null : true
    }
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
