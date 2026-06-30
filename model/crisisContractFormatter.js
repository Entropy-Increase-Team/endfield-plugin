import { formatCrisisText } from './crisisContractDisplay.js'
import { buildIndicatorDisplay, buildIndicators } from './crisisContractIndicators.js'

export { formatCrisisText }

const UNKNOWN = '未知'

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

function parseTs(value) {
  const num = Number(value || 0)
  return Number.isFinite(num) ? num : 0
}

function formatDate(ts) {
  const value = parseTs(ts)
  if (!value) return ''
  return new Date(value * 1000).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
}

function formatDateTime(ts) {
  const value = parseTs(ts)
  if (!value) return ''
  return new Date(value * 1000).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatRange(startTs, endTs) {
  const start = parseTs(startTs)
  const end = parseTs(endTs)
  if (!start && !end) return '长期'
  if (start && !end) return `${formatDate(start)} 起`
  if (!start && end) return `至 ${formatDate(end)}`
  return `${formatDate(start)} ~ ${formatDate(end)}`
}

function formatDuration(seconds) {
  const sec = Math.max(0, Number(seconds) || 0)
  const min = Math.floor(sec / 60)
  const rest = sec % 60
  return `${String(min).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
}

export function normalizeText(text) {
  return String(text || '').replace(/[“”"'\s]/g, '').toLowerCase()
}

export function extractContracts(cardDetailRes) {
  const detail = cardDetailRes?.data?.detail || cardDetailRes?.data || {}
  const rawList = detail.crisisContract || detail.crisis_contract || detail.crisisContracts || []
  return toArray(rawList).map((item) => {
    const raw = typeof item === 'object' ? item : { id: item }
    const status = raw.status || raw
    const id = String(pick(raw, ['id', 'contractId', 'contract_id', 'activityId', 'activity_id'], '')).trim()
    const name = pick(status, ['name', 'title', 'contractName', 'activityName', 'activity_name'], id || UNKNOWN)
    const startTs = pickNumber(status, ['startTs', 'start_ts', 'activityStartTs', 'activity_start_ts', 'startAtTs'], 0)
    const endTs = pickNumber(status, ['endTs', 'end_ts', 'activityEndTs', 'activity_end_ts', 'endAtTs'], 0)
    return { ...raw, id, name, startTs, endTs }
  }).filter((item) => item.id)
}

export function pickContract(contracts, keyword = '') {
  const list = Array.isArray(contracts) ? contracts : []
  const key = normalizeText(keyword)
  if (key) {
    const exact = list.find((item) => normalizeText(item.id) === key)
    if (exact) return exact
    const indexMatch = String(keyword).trim().match(/^第?(\d+)(?:个|期)?$/)
    const index = indexMatch ? Number(indexMatch[1]) : 0
    if (index > 0 && index <= list.length) return list[index - 1]
    return list.find((item) => [item.name, item.activityName, item.title, item.id]
      .some((text) => normalizeText(text).includes(key))) || null
  }
  const now = Math.floor(Date.now() / 1000)
  return list.find((item) => item.isInActivity || item.isActive || item.active)
    || list.find((item) => item.startTs && item.endTs && now >= item.startTs && now <= item.endTs)
    || list[0]
    || null
}

export function extractCrisisPayload(res) {
  const data = res?.data || {}
  return data.crisisContract || data.crisis_contract || data.detail?.crisisContract || data.detail?.crisis_contract || data
}

function buildRoleInfo(cardDetailRes) {
  const base = cardDetailRes?.data?.detail?.base || {}
  return {
    name: base.name || UNKNOWN,
    roleId: base.roleId || base.role_id || UNKNOWN,
    level: base.level ?? 0,
    avatarUrl: base.avatarUrl || base.avatar_url || ''
  }
}

function buildCharNameMap(cardDetailRes) {
  const map = {}
  const chars = cardDetailRes?.data?.detail?.chars || []
  for (const char of Array.isArray(chars) ? chars : []) {
    const data = char?.charData || char || {}
    const id = String(char?.id || char?.instId || data?.id || data?.charId || '').trim()
    const name = String(data?.name || char?.name || data?.template?.name_cn || '').trim()
    if (id && name) map[id] = name
  }
  return map
}

function buildMedal(status) {
  const achieve = status.achieve || status.medal || status.achievement || {}
  const raw = achieve.achievementData || achieve || {}
  const level = Number(achieve.level || raw.initLevel || 0)
  const isPlated = !!achieve.isPlated
  return {
    name: pick(raw, ['name', 'title'], pick(status, ['medalName', 'achievementName'], '奖章')),
    icon: isPlated ? (raw.platedIcon || raw.initIcon || '') : (raw.initIcon || raw.icon || raw.iconUrl || ''),
    status: level > 0 ? `Lv.${level}${isPlated ? ' · 镀层' : ''}` : '',
    isPlated
  }
}

function buildMissionCards(status) {
  const pairs = [
    ['挑战次数', { count: status.challengeCount, total: null }],
    ['周期任务', status.weeklyMission],
    ['指标任务', status.indicatorMission],
    ['阶段任务', status.stageMission]
  ]
  return pairs.map(([label, raw]) => {
    const count = raw?.count ?? raw?.current ?? raw?.progress ?? raw
    const total = raw?.total ?? raw?.max ?? null
    return {
      label,
      value: total !== null && total !== undefined ? `${count ?? 0}/${total}` : `${count ?? 0}`
    }
  })
}

function buildDungeon(raw) {
  const dungeon = raw || {}
  const featureRaw = dungeon.feature || dungeon.features || dungeon.dungeonFeature || dungeon.traits || ''
  const featureLines = (Array.isArray(featureRaw) ? featureRaw : String(featureRaw).split(/\n+/))
    .map((line) => cleanText(line).replace(/^[-•]\s*/, ''))
    .filter(Boolean)
    .slice(0, 5)
  const enemies = toArray(dungeon.enemies || dungeon.enemyList || dungeon.enemyInfos).slice(0, 8).map((enemy) => ({
    name: cleanText(pick(enemy, ['name', 'title'], UNKNOWN)),
    level: pick(enemy, ['level', 'lv'], '?'),
    imageUrl: pick(enemy, ['imageUrl', 'image_url', 'icon', 'avatar'], ''),
    ability: cleanText(pick(enemy, ['ability', 'desc', 'description'], ''))
  }))
  return {
    name: cleanText(pick(dungeon, ['name', 'title', 'dungeonName'], UNKNOWN)),
    desc: cleanText(pick(dungeon, ['desc', 'description'], '')),
    recommendLevel: pick(dungeon, ['recommendLevel', 'recommend_level'], UNKNOWN),
    featureLines,
    enemies
  }
}

function buildRecord(raw, charNameMap) {
  if (!raw || typeof raw !== 'object') return null
  const score = pickNumber(raw, ['indicatorCount', 'score', 'bestScore', 'totalScore', 'maxScore'], null)
  const ts = pickNumber(raw, ['ts', 'time', 'createTs', 'challengeTs', 'finishTs'], 0)
  const duration = pickNumber(raw, ['passTs', 'duration', 'costTime', 'clearTime'], 0)
  const chars = toArray(raw.chars || raw.team || raw.operators).slice(0, 4).map((char) => {
    const data = char?.charData || char || {}
    const id = String(pick(data, ['charId', 'char_id', 'id', 'instId'], '')).trim()
    return {
      name: pick(data, ['name'], charNameMap[id] || id || UNKNOWN),
      avatarUrl: pick(data, ['avatarUrl', 'avatarSqUrl', 'avatarRtUrl', 'icon'], ''),
      level: pick(data, ['level'], '?'),
      rarity: pick(data?.rarity || {}, ['value'], pick(data, ['rarity'], '?')),
      property: pick(data?.property || {}, ['value'], pick(data, ['property'], '')),
      potentialLevel: pick(data, ['potentialLevel', 'potential_level'], '')
    }
  })
  const passWave = pickNumber(raw, ['passWave', 'pass_wave', 'wave'], 0)
  const isPass = !!(raw.isPass || raw.is_pass)
  return {
    score: score ?? '—',
    indicatorCount: score ?? 0,
    time: ts ? formatDateTime(ts) : '',
    date: ts ? formatDate(ts).slice(5) : '',
    duration: duration ? formatDuration(duration) : '',
    isPass,
    isBest: !!raw.isBest,
    status: isPass ? '挑战成功' : '行动中断',
    passWave,
    waveText: passWave ? `第 ${passWave} 波` : '',
    chars
  }
}

function buildHistory(raw, charNameMap) {
  const records = toArray(raw.records || raw.challengeRecords || raw.histories || raw.list)
  const bestRaw = raw.bestRecord || raw.best || toArray(raw.bestRecords)[0] || records[0]
  return {
    best: buildRecord(bestRaw, charNameMap),
    records: records.slice(0, 12).map((item) => buildRecord(item, charNameMap)).filter(Boolean)
  }
}

export function buildCrisisRenderData(crisis, contract, cardDetailRes, options = {}) {
  const status = crisis?.status || {}
  const indicators = buildIndicators(crisis?.indicators || [])
  const charNameMap = buildCharNameMap(cardDetailRes)
  const startTs = pickNumber(status, ['startAtTs', 'startTs', 'start_ts', 'activityStartTs', 'activity_start_ts'], contract?.startTs || 0)
  const endTs = pickNumber(status, ['endAtTs', 'endTs', 'end_ts', 'activityEndTs', 'activity_end_ts'], contract?.endTs || 0)
  const gameplayEndTs = pickNumber(status, ['gameplayEndAtTs', 'gameplayEndTs'], 0)
  const score = pickNumber(status, ['highest', 'maxScore', 'highestScore', 'bestScore', 'score'], null)
  const unlockedCount = indicators.filter((item) => item.unlocked).length
  const indicatorDisplay = buildIndicatorDisplay(indicators, { full: !!options.indicatorOnly })
  return {
    title: '危机合约',
    isIndicatorView: !!options.indicatorOnly,
    showDungeon: !!options.showDungeon,
    role: buildRoleInfo(cardDetailRes),
    contract: {
      id: contract?.id || pick(status, ['id', 'contractId', 'contract_id'], ''),
      name: cleanText(pick(status, ['name', 'title', 'contractName', 'activityName'], contract?.name || UNKNOWN)),
      activityName: cleanText(pick(status, ['activityName', 'activity_name'], contract?.activityName || '')),
      cover: pick(status, ['kvImage', 'headerImage', 'kv', 'kvUrl', 'kvImg', 'pic', 'banner', 'bannerUrl'], pick(contract, ['pic', 'kv', 'bannerUrl'], '')),
      headerImage: pick(status, ['headerImage'], ''),
      timeRange: formatRange(startTs, endTs),
      gameplayTimeRange: gameplayEndTs ? formatRange(startTs, gameplayEndTs) : ''
    },
    summaryCards: [
      ...buildMissionCards(status),
      { label: '解锁指标', value: `${unlockedCount}/${indicators.length}` }
    ],
    highest: score ?? '—',
    medal: buildMedal(status),
    indicators,
    indicatorDisplay,
    selectedIndicators: indicators.filter((item) => item.selected).slice(0, 16),
    basicIndicators: indicators.filter((item) => Number(item.type || 1) === 1),
    advancedIndicators: indicators.filter((item) => Number(item.type || 1) === 2),
    otherIndicators: indicators.filter((item) => !item.selected).slice(0, 24),
    dungeon: buildDungeon(crisis?.dungeon || {}),
    history: buildHistory(crisis?.history || {}, charNameMap)
  }
}
