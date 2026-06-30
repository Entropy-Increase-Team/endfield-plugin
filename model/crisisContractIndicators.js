import {
  getIndicatorId,
  renderIndicatorDescription
} from './crisisContractDisplay.js'

const NUMBER_TOKEN = /[+-]?\d+(?:\.\d+)?%?/g

function pick(obj, keys, fallback = '') {
  for (const key of keys) {
    const value = obj?.[key]
    if (value !== undefined && value !== null && value !== '') return value
  }
  return fallback
}

function pickNumber(obj, keys, fallback = null) {
  const value = pick(obj, keys, null)
  if (value === null) return fallback
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

function toArray(value) {
  if (Array.isArray(value)) return value
  if (!value || typeof value !== 'object') return []
  for (const key of ['list', 'items', 'tasks', 'missions', 'records', 'data']) {
    if (Array.isArray(value[key])) return value[key]
  }
  return Object.values(value).filter((item) => item && typeof item === 'object')
}

function cleanText(text) {
  return String(text || '')
    .replace(/<@[^>]+>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/<\/>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeName(text) {
  return cleanText(text).toLowerCase()
}

function uniqueSortedNumbers(values) {
  return [...new Set(values.map((value) => Number(value)).filter(Number.isFinite))]
    .sort((a, b) => a - b)
}

function getDescSkeleton(text) {
  return cleanText(text).replace(NUMBER_TOKEN, '{}')
}

function getDescTokens(text) {
  return cleanText(text).match(NUMBER_TOKEN) || []
}

function compactSameSkeleton(descs) {
  const skeleton = getDescSkeleton(descs[0])
  if (!skeleton || !descs.every((desc) => getDescSkeleton(desc) === skeleton)) return ''
  const tokenRows = descs.map(getDescTokens)
  const tokenCount = tokenRows[0]?.length || 0
  if (!tokenCount || !tokenRows.every((row) => row.length === tokenCount)) return ''
  const mergedTokens = Array.from({ length: tokenCount }, (_, index) => {
    const values = [...new Set(tokenRows.map((row) => row[index]).filter(Boolean))]
    return values.join('/')
  })
  let offset = 0
  return skeleton.replace(/\{\}/g, () => mergedTokens[offset++] || '')
}

function compactDescriptions(items) {
  const descs = [...new Set(items.map((item) => cleanText(item.desc)).filter(Boolean))]
  if (!descs.length) return ''
  if (descs.length === 1) return descs[0]
  const compact = compactSameSkeleton(descs)
  if (compact) return compact
  return `${descs[0]} 等 ${descs.length} 条效果`
}

function buildDependsText(items) {
  const depends = []
  for (const item of items) {
    const values = Array.isArray(item.depends) ? item.depends : []
    values.forEach((value) => {
      const text = cleanText(value)
      if (text && !depends.includes(text)) depends.push(text)
    })
  }
  return depends.slice(0, 3).join(' / ')
}

function createGroup(item) {
  return {
    key: `${Number(item.type || 1)}:${normalizeName(item.name)}`,
    name: cleanText(item.name) || '未知指标',
    type: Number(item.type || 1),
    icon: item.icon || '',
    items: []
  }
}

function finalizeGroup(group) {
  const scores = uniqueSortedNumbers(group.items.map((item) => item.score))
  const unlockedCount = group.items.filter((item) => item.unlocked).length
  const awardCount = group.items.filter((item) => item.hasAward).length
  const selectedCount = group.items.filter((item) => item.selected).length
  return {
    name: group.name,
    type: group.type,
    icon: group.icon,
    count: group.items.length,
    scores,
    scoreText: scores.map((score) => `+${score}`).join('/'),
    scoreTags: scores.map((score) => `+${score}`),
    descPreview: compactDescriptions(group.items),
    unlockedCount,
    unlockedText: `${unlockedCount}/${group.items.length}`,
    awardCount,
    selectedCount,
    dependsText: buildDependsText(group.items),
    hasAward: awardCount > 0,
    selected: selectedCount > 0
  }
}

function groupIndicators(indicators) {
  const map = new Map()
  for (const item of Array.isArray(indicators) ? indicators : []) {
    const group = createGroup(item)
    const current = map.get(group.key) || group
    if (!current.icon && item.icon) current.icon = item.icon
    current.items.push(item)
    map.set(group.key, current)
  }
  return [...map.values()]
    .map(finalizeGroup)
    .sort((a, b) => a.type - b.type || (a.scores[0] || 0) - (b.scores[0] || 0) || a.name.localeCompare(b.name, 'zh-CN'))
}

function sliceGroups(groups, limit) {
  if (!limit || groups.length <= limit) return groups
  return groups.slice(0, limit)
}

function makeStatCards(stats) {
  return [
    { label: '指标总数', value: String(stats.total) },
    { label: '已解锁', value: `${stats.unlocked}/${stats.total}` },
    { label: '基础/综合', value: `${stats.basic}/${stats.advanced}` },
    { label: '带奖励', value: String(stats.award) }
  ]
}

function flattenIndicators(raw) {
  const list = []
  for (const item of toArray(raw)) {
    const children = toArray(item?.indicators || item?.indicatorList || item?.risks)
    if (children.length) {
      children.forEach((child) => list.push({ ...child, groupName: item.name || item.title || '' }))
    } else {
      list.push(item)
    }
  }
  return list
}

export function buildIndicators(raw) {
  const source = flattenIndicators(raw)
  const itemMap = new Map()
  for (const item of source) {
    const id = getIndicatorId(item)
    if (id) itemMap.set(id, item)
  }
  return source.map((item) => {
    const selected = !!(item.isSelected || item.selected || item.checked || item.isChosen)
    const unlocked = item.isUnlock === undefined && item.unlock === undefined && item.locked === undefined
      ? true
      : !!(item.isUnlock ?? item.unlock ?? !item.locked)
    const depends = toArray(item.depends || item.dependencies || item.dependIds || item.depend_ids)
      .map((dep) => typeof dep === 'object' ? pick(dep, ['name', 'id'], '') : dep)
      .filter(Boolean)
    return {
      id: pick(item, ['id', 'indicatorId', 'indicator_id'], ''),
      name: cleanText(pick(item, ['name', 'title'], '未知')),
      groupName: item.groupName || '',
      desc: renderIndicatorDescription(item, itemMap),
      score: pickNumber(item, ['score', 'point', 'riskScore', 'value'], 0),
      type: pickNumber(item, ['type'], 1),
      icon: pick(item, ['icon', 'iconUrl', 'imageUrl'], ''),
      hasAward: !!item.hasAward,
      selected,
      unlocked,
      depends,
      dependsText: depends.join(' / ')
    }
  })
}

export function buildIndicatorDisplay(indicators, options = {}) {
  const list = Array.isArray(indicators) ? indicators : []
  const basicLimit = options.full ? 0 : 8
  const advancedLimit = options.full ? 0 : 6
  const groups = groupIndicators(list)
  const basicGroups = groups.filter((item) => item.type === 1)
  const advancedGroups = groups.filter((item) => item.type === 2)
  const stats = {
    total: list.length,
    unlocked: list.filter((item) => item.unlocked).length,
    award: list.filter((item) => item.hasAward).length,
    selected: list.filter((item) => item.selected).length,
    basic: list.filter((item) => Number(item.type || 1) === 1).length,
    advanced: list.filter((item) => Number(item.type || 1) === 2).length,
    basicGroups: basicGroups.length,
    advancedGroups: advancedGroups.length
  }
  const basic = sliceGroups(basicGroups, basicLimit)
  const advanced = sliceGroups(advancedGroups, advancedLimit)
  return {
    stats,
    statCards: makeStatCards(stats),
    basic,
    advanced,
    basicTotal: basicGroups.length,
    advancedTotal: advancedGroups.length,
    basicHidden: Math.max(0, basicGroups.length - basic.length),
    advancedHidden: Math.max(0, advancedGroups.length - advanced.length),
    hint: options.full ? '' : '发送「:危机 指标」查看完整指标列表'
  }
}
