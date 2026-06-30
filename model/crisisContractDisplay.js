const UNKNOWN = '未知'

function toArray(value) {
  if (Array.isArray(value)) return value
  if (!value || typeof value !== 'object') return []
  for (const key of ['list', 'items', 'data', 'values']) {
    if (Array.isArray(value[key])) return value[key]
  }
  return []
}

function pick(obj, keys, fallback = '') {
  for (const key of keys) {
    const value = obj?.[key]
    if (value !== undefined && value !== null && value !== '') return value
  }
  return fallback
}

function cleanText(text) {
  return String(text || '')
    .replace(/<@[^>]+>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/<\/>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseParamValue(value) {
  const raw = value && typeof value === 'object'
    ? pick(value, ['value', 'val', 'v', 'num', 'count', 'raw'], null)
    : value
  if (raw && typeof raw === 'object') return parseParamValue(raw)
  if (raw === undefined || raw === null || raw === '') return null
  const text = String(raw).trim()
  const percent = text.endsWith('%')
  const num = Number(percent ? text.slice(0, -1) : text)
  if (!Number.isFinite(num)) return null
  return percent ? num / 100 : num
}

function putParam(params, key, value) {
  const name = String(key || '').trim()
  const parsed = parseParamValue(value)
  if (name && Number.isFinite(parsed)) params[name] = parsed
}

function mergeParamSource(params, source) {
  if (!source) return
  if (Array.isArray(source)) {
    for (const item of source) {
      if (!item || typeof item !== 'object') continue
      const key = pick(item, ['key', 'name', 'id', 'param', 'paramKey', 'param_key', 'attr', 'attribute'], '')
      putParam(params, key, item)
    }
    return
  }
  if (typeof source !== 'object') return
  for (const [key, value] of Object.entries(source)) putParam(params, key, value)
}

function readParams(item = {}) {
  const params = {}
  const sources = [
    item.descParams,
    item.descParam,
    item.desc_params,
    item.descParamList,
    item.desc_param_list,
    item.descParamMap,
    item.desc_param_map,
    item.descriptionParamMap,
    item.description_param_map,
    item.descriptionParams,
    item.descriptionParam,
    item.description_params,
    item.templateParams,
    item.template_params,
    item.paramList,
    item.param_list,
    item.paramMap,
    item.param_map,
    item.params,
    item.param,
    item.parameters,
    item.blackboard,
    item.attrs,
    item.attr,
    item.attrMap,
    item.attributeMap,
    item.values,
    item.valueMap
  ]
  for (const source of sources) mergeParamSource(params, source)
  return params
}

function getParam(params, name) {
  if (Object.prototype.hasOwnProperty.call(params, name)) return params[name]
  return null
}

function evalExpr(expr, params) {
  const raw = String(expr || '').trim()
  const direct = getParam(params, raw)
  if (Number.isFinite(direct)) return direct
  const reduction = raw.match(/^-(?<name>[A-Za-z_][A-Za-z0-9_]*)$/)
  if (reduction) {
    const base = getParam(params, reduction.groups.name)
    if (Number.isFinite(base) && base < 0) return Math.abs(base)
    if (Number.isFinite(base) && base >= 0 && base <= 1) return base > 0.5 ? 1 - base : base
  }
  let missed = false
  const replaced = raw.replace(/[A-Za-z_][A-Za-z0-9_]*/g, (name) => {
    const value = getParam(params, name)
    if (!Number.isFinite(value)) missed = true
    return Number.isFinite(value) ? String(value) : '0'
  })
  if (missed || !/^[\d+\-*/().\s]+$/.test(replaced)) return null
  try {
    const value = Function(`"use strict";return (${replaced})`)()
    return Number.isFinite(value) ? value : null
  } catch {
    return null
  }
}

function formatNumber(value, digits = 0) {
  const num = Number(value)
  if (!Number.isFinite(num)) return ''
  if (digits <= 0) return String(Math.round(num))
  return num.toFixed(digits).replace(/\.?0+$/, '')
}

function formatValue(value, fmt) {
  const percent = String(fmt || '').includes('%')
  const digitsMatch = String(fmt || '').match(/0\.(0+)/)
  const digits = digitsMatch ? digitsMatch[1].length : 0
  const scaled = percent && Math.abs(value) <= 1 ? value * 100 : value
  return `${formatNumber(scaled, digits)}${percent ? '%' : ''}`
}

export function getIndicatorId(item = {}) {
  return String(pick(item, ['id', 'indicatorId', 'indicator_id', 'riskId', 'risk_id'], '')).trim()
}

export function renderIndicatorDescription(item = {}, itemMap = new Map()) {
  const rawText = pick(item, ['desc', 'description', 'content', 'effect'], '')
  if (!rawText) return ''
  const rendered = String(rawText).replace(/\{(?:@([^@{}]+)@)?([^{}:]+):([^{}]+)\}/g, (_, refId, expr, fmt) => {
    const source = refId ? (itemMap.get(String(refId)) || {}) : item
    const value = evalExpr(expr, readParams(source))
    return Number.isFinite(value) ? formatValue(value, fmt) : ''
  })
  return cleanText(rendered)
    .replace(/\+\s*-/g, '-')
    .replace(/--/g, '-')
    .replace(/(?:\/[+-]?)+$/g, '')
}

export function formatCrisisText(data) {
  const lines = [
    `【${data.title}】${data.contract.name}`,
    `账号：${data.role.name} Lv.${data.role.level} UID ${data.role.roleId}`,
    `时间：${data.contract.timeRange}`,
    ...data.summaryCards.map((card) => `${card.label}：${card.value}`)
  ]
  if (data.medal?.name) lines.push(`奖章：${data.medal.name}${data.medal.status ? `｜${data.medal.status}` : ''}`)
  if (data.isIndicatorView) {
    const display = data.indicatorDisplay || {}
    const stat = display.stats || {}
    lines.push('', `【指标信息】总数 ${stat.total ?? 0}｜解锁 ${stat.unlocked ?? 0}/${stat.total ?? 0}`)
    if (display.basic?.length) {
      lines.push(`基础指标（${display.basicTotal} 组）`)
      display.basic.forEach((item, index) => lines.push(`${index + 1}. ${item.name} ${item.scoreText}${item.descPreview ? `｜${item.descPreview}` : ''}`))
    }
    if (display.advanced?.length) {
      lines.push(`综合指标（${display.advancedTotal} 组）`)
      display.advanced.forEach((item, index) => lines.push(`${index + 1}. ${item.name} ${item.scoreText}${item.descPreview ? `｜${item.descPreview}` : ''}`))
    }
    return lines.join('\n')
  }
  if (data.history.best) lines.push(`最佳记录：评分 ${data.history.best.score}${data.history.best.duration ? `｜${data.history.best.duration}` : ''}${data.history.best.time ? `｜${data.history.best.time}` : ''}`)
  if (data.selectedIndicators.length) {
    lines.push('', '【已选词条】')
    data.selectedIndicators.slice(0, 10).forEach((item, index) => lines.push(`${index + 1}. ${item.name} +${item.score}${item.desc ? `｜${item.desc}` : ''}`))
  }
  if (data.showDungeon && data.dungeon.name && data.dungeon.name !== UNKNOWN) {
    lines.push('', `【关卡】${data.dungeon.name} 推荐Lv.${data.dungeon.recommendLevel}`)
    if (data.dungeon.desc) lines.push(data.dungeon.desc)
    data.dungeon.featureLines.forEach((line) => lines.push(`- ${line}`))
  }
  if (data.showDungeon && data.dungeon.enemies.length) {
    lines.push('', '【敌对生物】')
    data.dungeon.enemies.slice(0, 6).forEach((enemy) => lines.push(`- ${enemy.name} Lv.${enemy.level}`))
  }
  return lines.join('\n')
}
