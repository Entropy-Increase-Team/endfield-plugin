/**
 * 活动列表（日历）：:日历，调用 GET /api/wiki/activities，渲染甘特图
 */
import { getMessage } from '../utils/common.js'
import EndfieldRequest from '../model/endfieldReq.js'
import setting from '../utils/setting.js'

const DAY_SEC = 86400
const PERM_THRESHOLD_DAYS = 300
const WINDOW_BEFORE_DAYS = 15
const WINDOW_AFTER_DAYS = 15
const MIN_BAR_WIDTH_PCT = 6.67
const AXIS_MIN_GAP_DAYS = 4
const THEMES = ['theme-red', 'theme-yellow', 'theme-dark']

const pad2 = (n) => String(n).padStart(2, '0')

/** 从 Wiki 条目里抓长条 banner；失败回退到 pic 贴纸 */
const bannerCache = new Map()
async function fetchBanner(req, raw) {
  const name = raw.name || ''
  if (bannerCache.has(name)) return bannerCache.get(name)
  if (bannerCache.size > 200) bannerCache.clear()

  const pcLink = raw.pc_link || raw.pcLink || ''
  const m = pcLink.match(/gameEntryId=(\d+)/)
  if (m) {
    try {
      const res = await req.getWikiData('wiki_item_detail', { id: m[1] })
      const docMap = res?.data?.content?.document_map
      if (docMap) {
        for (const doc of Object.values(docMap)) {
          const blockMap = doc?.block_map
          if (!blockMap) continue
          for (const block of Object.values(blockMap)) {
            if (block?.kind === 'image' && block.image?.url) {
              bannerCache.set(name, block.image.url)
              return block.image.url
            }
          }
        }
      }
    } catch (err) {
      logger.error(`[终末地插件][活动列表]抓 banner 失败 ${name}: ${err?.message || err}`)
    }
  }

  const pic = raw.pic || ''
  bannerCache.set(name, pic)
  return pic
}

function fmtDateTime(ts) {
  const d = new Date(ts * 1000)
  return `${pad2(d.getMonth() + 1)}.${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

function fmtMonthDay(ts) {
  const d = new Date(ts * 1000)
  return `${pad2(d.getMonth() + 1)}.${pad2(d.getDate())}`
}

function fmtNow(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

function normalizeRaw(rawData) {
  if (rawData?.activities && Array.isArray(rawData.activities)) return rawData.activities
  if (Array.isArray(rawData)) return rawData
  if (rawData?.list && Array.isArray(rawData.list)) return rawData.list
  return []
}

function parseAct(raw) {
  const stTs = Number(raw.activity_start_at_ts ?? raw.activityStartAtTs ?? raw.start_at_ts ?? 0)
  const etTs = Number(raw.activity_end_at_ts ?? raw.activityEndAtTs ?? raw.end_at_ts ?? 0)
  if (!stTs || !etTs) return null

  const durationDays = (etTs - stTs) / DAY_SEC
  const isPerm = durationDays >= PERM_THRESHOLD_DAYS
  let desc = (raw.description || '').trim() || '活动'
  if (isPerm && ['', '玩法说明', '新手活动', '活动'].includes(desc)) desc = '常驻活动'

  return {
    name: raw.name || '未知活动',
    desc,
    start: fmtDateTime(stTs),
    end: fmtDateTime(etTs),
    stTs,
    etTs,
    cover: raw.pic || raw.cover || '',
    isPerm
  }
}

/** 贪心车道打包：活动按开始时间升序放入首个不重叠的车道（含 1 天缓冲） */
function packLanes(acts) {
  const lanes = []
  for (const act of acts) {
    let placed = false
    for (const lane of lanes) {
      const last = lane[lane.length - 1]
      if (act.stTs >= last.etTs + DAY_SEC) {
        lane.push(act)
        placed = true
        break
      }
    }
    if (!placed) lanes.push([act])
  }
  return lanes
}

function assignTheme(lanes) {
  for (const lane of lanes) {
    lane.forEach((act, idx) => {
      act.themeClass = THEMES[idx % THEMES.length]
    })
  }
}

function buildGanttData(rawList) {
  const now = new Date()
  const nowTs = Math.floor(now.getTime() / 1000)
  const todayMidnight = new Date(now)
  todayMidnight.setHours(0, 0, 0, 0)
  const minTs = Math.floor(todayMidnight.getTime() / 1000) - WINDOW_BEFORE_DAYS * DAY_SEC
  const maxTs = Math.floor(todayMidnight.getTime() / 1000) + WINDOW_AFTER_DAYS * DAY_SEC
  const totalDuration = maxTs - minTs

  const parsed = rawList.map(parseAct).filter(Boolean)
  const normal = []
  const perm = []
  for (const a of parsed) {
    (a.isPerm ? perm : normal).push(a)
  }
  normal.sort((x, y) => x.stTs - y.stTs)
  perm.sort((x, y) => x.stTs - y.stTs)

  const clipPct = (v) => Math.max(0, Math.min(100, v))
  const keyDates = new Set()

  const positionAct = (act) => {
    let leftPct = (act.stTs - minTs) / totalDuration * 100
    let rightPct = act.isPerm ? 100 : (act.etTs - minTs) / totalDuration * 100
    leftPct = clipPct(leftPct)
    rightPct = clipPct(rightPct)
    let widthPct = rightPct - leftPct
    if (widthPct < MIN_BAR_WIDTH_PCT) {
      widthPct = MIN_BAR_WIDTH_PCT
      if (leftPct + widthPct > 100) leftPct = 100 - widthPct
    }
    act.leftPct = leftPct
    act.widthPct = widthPct
    act.hideStart = act.stTs < minTs
    if (!act.isPerm && leftPct >= 0 && leftPct <= 100) keyDates.add(act.stTs)
  }
  normal.forEach(positionAct)
  perm.forEach(positionAct)

  // 过滤已结束 + 完全在窗口外的活动
  const inWindow = (a) => a.etTs >= nowTs && a.stTs <= maxTs
  const normalIn = normal.filter(inWindow)
  const permIn = perm.filter(inWindow)

  const lanes = packLanes(normalIn).concat(packLanes(permIn))
  assignTheme(lanes)

  const axisDates = []
  let lastTs = 0
  const minGap = AXIS_MIN_GAP_DAYS * DAY_SEC
  for (const ts of [...keyDates].sort((a, b) => a - b)) {
    if (ts - lastTs < minGap) continue
    lastTs = ts
    axisDates.push({ label: fmtMonthDay(ts), leftPct: (ts - minTs) / totalDuration * 100 })
  }

  let nowLine = null
  const nowPct = (nowTs - minTs) / totalDuration * 100
  if (nowPct >= 0 && nowPct <= 100) nowLine = { label: 'TODAY', leftPct: nowPct }

  return { lanes, axisDates, nowLine, currentTimeStr: fmtNow(now) }
}

export class EndfieldActivity extends plugin {
  constructor() {
    super({
      name: '[endfield-plugin]活动列表',
      dsc: '终末地活动日历',
      event: 'message',
      priority: 50,
      rule: [
        {
          reg: '^(?:[:：]|[/#](?:zmd|终末地))日历$',
          fnc: 'getActivityList'
        }
      ]
    })
  }

  async getActivityList() {
    const config = setting.getConfig('common') || {}
    if (!config.api_key || String(config.api_key).trim() === '') {
      await this.reply(getMessage('common.need_api_key'))
      return true
    }

    const req = new EndfieldRequest(0, '', '')
    const res = await req.getWikiData('wiki_activities')
    if (!res || res.code !== 0) {
      logger.error(`[终末地插件][活动列表]请求失败: ${JSON.stringify(res)}`)
      await this.reply(getMessage('activity.query_failed', { name: '日历' }))
      return true
    }

    const rawList = normalizeRaw(res.data)
    if (rawList.length === 0) {
      await this.reply(getMessage('activity.no_records'))
      return true
    }

    if (this.e?.runtime?.render) {
      try {
        const pluResPath = this.e?.runtime?.path?.plugin?.['endfield-plugin']?.res || ''
        // 并发抓长条 banner 写回 raw.pic
        await Promise.all(rawList.map(async (raw) => {
          const url = await fetchBanner(req, raw)
          if (url) raw.pic = url
        }))
        const { lanes, axisDates, nowLine, currentTimeStr } = buildGanttData(rawList)
        if (lanes.length === 0) {
          await this.reply('当前时间窗口内暂无活动。')
          return true
        }
        const pageWidth = 1500
        const renderData = {
          title: getMessage('activity.text_title'),
          lanes,
          axisDates,
          nowLine,
          currentTimeStr,
          pluResPath,
          pageWidth
        }
        const baseOpt = { scale: 1, retType: 'base64', viewport: { width: pageWidth, height: 900 } }
        const imgSegment = await this.e.runtime.render('endfield-plugin', 'calendar/calendar', renderData, baseOpt)
        if (imgSegment) {
          await this.reply(imgSegment)
          return true
        }
      } catch (err) {
        logger.error(`[终末地插件][活动列表]渲染图失败: ${err?.message || err}`)
      }
    }

    // 文本兜底
    let msg = getMessage('activity.text_title_wrapped') + '\n\n'
    rawList.forEach((a, i) => {
      msg += getMessage('activity.text_item_line', { index: i + 1, name: a.name || '未知活动' }) + '\n'
      if (a.description) msg += getMessage('activity.text_item_desc', { desc: a.description }) + '\n'
      const st = Number(a.activity_start_at_ts ?? a.activityStartAtTs ?? 0)
      const et = Number(a.activity_end_at_ts ?? a.activityEndAtTs ?? 0)
      if (st) msg += getMessage('activity.text_item_start', { time: new Date(st * 1000).toLocaleString('zh-CN') }) + '\n'
      if (et) msg += getMessage('activity.text_item_end', { time: new Date(et * 1000).toLocaleString('zh-CN') }) + '\n'
      msg += '\n'
    })
    await this.reply(msg.trim())
    return true
  }
}
