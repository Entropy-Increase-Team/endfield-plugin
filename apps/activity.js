/**
 * 活动列表（日历）：:日历，调用 GET /api/wiki/activities，渲染 HTML 模板
 */
import { getMessage } from '../utils/common.js'
import EndfieldRequest from '../model/endfieldReq.js'
import setting from '../utils/setting.js'

const DAY_SEC = 86400
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

/** 格式化为 年-月-日 时:分 */
function formatShortTs(ts) {
  const d = new Date(ts * 1000)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${day} ${h}:${min}`
}

/** 格式化为 x月x日（用于「x月x日开启」） */
function formatMonthDay(ts) {
  const d = new Date(ts * 1000)
  const month = d.getMonth() + 1
  const date = d.getDate()
  return `${month}月${date}日`
}

/** 将 bili-wiki 的 start_time/end_time 字符串解析为秒级时间戳 */
function parseBiliWikiTime(str) {
  if (!str || typeof str !== 'string') return null
  const s = str.trim().replace(/\//g, '-')
  const ts = Date.parse(s)
  return Number.isFinite(ts) ? Math.floor(ts / 1000) : null
}

/** 根据 startTs/endTs 与当前时间计算「xx后结束」或「xx日后开启」 */
function getRemainingOrOpensText(nowTs, startTs, endTs) {
  let remainingText = ''
  let opensInText = ''
  if (startTs != null && nowTs < startTs) {
    const daysUntil = Math.max(0, Math.ceil((startTs - nowTs) / DAY_SEC))
    opensInText = daysUntil < 30 ? `${daysUntil}日后开启` : daysUntil < 60 ? '1个月后开启' : `${Math.floor(daysUntil / 30)}个月后开启`
  } else if (endTs != null) {
    const diff = endTs - nowTs
    if (diff <= 0) remainingText = '已结束'
    else {
      const daysLeft = Math.floor(diff / DAY_SEC)
      if (daysLeft <= 0) remainingText = '即将结束'
      else if (daysLeft < 30) remainingText = `${daysLeft}天后结束`
      else if (daysLeft < 60) remainingText = '1个月后结束'
      else remainingText = `${Math.floor(daysLeft / 30)}个月后结束`
    }
  } else remainingText = '长期有效'
  return { remainingText, opensInText }
}

/**
 * 将 API 返回的活动列表统一为模板所需结构，并计算日历用 startCol/endCol、剩余时间文案
 * 响应格式以 1s.json 为准：data.activities，项含 pic、activity_start_at_ts、activity_end_at_ts 等（snake_case）
 */
function normalizeActivities(rawData) {
  let list = []
  if (rawData?.activities && Array.isArray(rawData.activities)) list = rawData.activities
  else if (Array.isArray(rawData)) list = rawData
  else if (rawData?.list && Array.isArray(rawData.list)) list = rawData.list
  return list.map((item, index) => {
    const startTs = item.activity_start_at_ts != null ? Number(item.activity_start_at_ts) : (item.activityStartAtTs != null ? Number(item.activityStartAtTs) : null)
    const endTs = item.activity_end_at_ts != null ? Number(item.activity_end_at_ts) : (item.activityEndAtTs != null ? Number(item.activityEndAtTs) : null)
    let startTime = ''
    let endTime = ''
    if (startTs != null) startTime = new Date(startTs * 1000).toLocaleString('zh-CN')
    else if (item.start_time) startTime = new Date(item.start_time).toLocaleString('zh-CN')
    if (endTs != null) endTime = new Date(endTs * 1000).toLocaleString('zh-CN')
    else if (item.end_time) endTime = new Date(item.end_time).toLocaleString('zh-CN')
    return {
      index: index + 1,
      name: item.name || '未知',
      description: item.description || '',
      cover: item.pic || item.cover || '',
      startTime,
      endTime,
      startTs: startTs ?? 0,
      endTs: endTs ?? 0
    }
  })
}

/** 生成日历用：20 天时间轴、在范围内的活动条、不在范围内的活动卡片、未开始显示 x月x日开启 */
function buildCalendarData(activities, dayCount = 20, daysBefore = 0) {
  const now = new Date()
  const nowTs = Math.floor(now.getTime() / 1000)
  const startDate = new Date(now)
  startDate.setDate(startDate.getDate() - daysBefore)
  startDate.setHours(0, 0, 0, 0)
  const startDayTs = Math.floor(startDate.getTime() / 1000)
  const endDayTs = startDayTs + dayCount * DAY_SEC

  const days = []
  for (let i = 0; i < dayCount; i++) {
    const d = new Date((startDayTs + i * DAY_SEC) * 1000)
    const month = d.getMonth() + 1
    const date = d.getDate()
    const weekday = WEEKDAYS[d.getDay()]
    const isToday = d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    days.push({
      month: `${month}月`,
      date: `${date}日`,
      weekday,
      isToday
    })
  }

  const inRange = []
  const outOfRange = []

  for (const a of activities) {
    let remainingText = ''
    if (a.endTs) {
      const diff = a.endTs - nowTs
      if (diff <= 0) remainingText = '已结束'
      else {
        const daysLeft = Math.floor(diff / DAY_SEC)
        if (daysLeft <= 0) remainingText = '即将结束'
        else if (daysLeft < 30) remainingText = `${daysLeft}天后结束`
        else if (daysLeft < 60) remainingText = '1个月后结束'
        else remainingText = `${Math.floor(daysLeft / 30)}个月后结束`
      }
    } else remainingText = '长期有效'

    const shortStart = (a.startTs != null) ? formatShortTs(a.startTs) : a.startTime || '-'
    const shortEnd = (a.endTs != null) ? formatShortTs(a.endTs) : a.endTime || '-'
    const notStarted = a.startTs != null && a.startTs > nowTs
    const daysUntilStart = notStarted && a.startTs != null ? Math.max(0, Math.ceil((a.startTs - nowTs) / DAY_SEC)) : 0
    const opensInText = notStarted ? `${daysUntilStart}日后开启` : ''
    const startLabel = notStarted ? `${formatMonthDay(a.startTs)}开启` : `开始 ${shortStart}`
    const endLabel = `结束 ${shortEnd}`
    const timeLine = `${startLabel} ～ ${endLabel}`

    const overlaps = (a.startTs != null && a.endTs != null)
      ? (a.endTs >= startDayTs && a.startTs <= endDayTs)
      : true
    const item = { ...a, remainingText, opensInText, shortStart, shortEnd, startLabel, endLabel, timeLine }

    if (overlaps) {
      let startCol = 0
      let endCol = 1
      if (a.startTs != null && a.endTs != null) {
        startCol = Math.floor((a.startTs - startDayTs) / DAY_SEC)
        endCol = Math.ceil((a.endTs - startDayTs) / DAY_SEC)
        if (startCol < 0) startCol = 0
        if (endCol > dayCount) endCol = dayCount
        if (endCol <= startCol) endCol = startCol + 1
      }
      inRange.push({ ...item, startCol, endCol, span: endCol - startCol })
    } else {
      outOfRange.push(item)
    }
  }

  // 按开启时间（startTs）升序排序，无开始时间的排到最后
  const sortByStart = (x, y) => (x.startTs ?? 1e12) - (y.startTs ?? 1e12)
  inRange.sort(sortByStart)
  outOfRange.sort(sortByStart)

  const currentTimeStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  return { days, activitiesInRange: inRange, activitiesOutOfRange: outOfRange, dayCount, currentTimeStr }
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
          reg: '^(?:[:：]|#zmd|#终末地)日历$',
          fnc: 'getActivityList'
        }
      ]
    })
  }

  async getActivityList() {
    const config = setting.getConfig('common') || {}
    if (!config.api_key || String(config.api_key).trim() === '') {
      await this.reply(getMessage('activity.need_api_key'))
      return true
    }

    const req = new EndfieldRequest(0, '', '')
    const res = await req.getWikiData('wiki_activities')

    if (!res || res.code !== 0) {
      logger.error(`[终末地插件][活动列表]请求失败: ${JSON.stringify(res)}`)
      await this.reply(getMessage('activity.query_failed', { name: '日历' }))
      return true
    }

    const rawData = res.data
    const activities = normalizeActivities(rawData)

    if (activities.length === 0) {
      await this.reply(getMessage('activity.no_records'))
      return true
    }

    // 本期 UP（特许寻访 / 武库申领）：并入日历展示，按 is_active 分为进行中/即将开始，并计算 xx后结束/xx日后开启
    let currentUpActive = []
    let currentUpUpcoming = []
    if (config.api_key && String(config.api_key).trim() !== '') {
      try {
        const upRes = await req.getWikiData('bili_wiki_activities')
        if (upRes?.code === 0 && Array.isArray(upRes.data?.activities)) {
          const nowTs = Math.floor(Date.now() / 1000)
          const upTypes = ['特许寻访', '武库申领']
          const upItems = upRes.data.activities
            .filter((a) => upTypes.includes(a?.type || ''))
            .map((a) => {
              const startTs = parseBiliWikiTime(a.start_time)
              const endTs = parseBiliWikiTime(a.end_time)
              const { remainingText, opensInText } = getRemainingOrOpensText(nowTs, startTs, endTs)
              const timeStr = a.end_time ? `${a.start_time || ''} ~ ${a.end_time}` : (a.start_time || '')
              const shortStart = startTs != null ? formatShortTs(startTs) : (a.start_time || '-')
              const shortEnd = endTs != null ? formatShortTs(endTs) : (a.end_time || '-')
              const notStarted = startTs != null && startTs > nowTs
              const startLabel = notStarted && startTs != null ? `${formatMonthDay(startTs)}开启` : `开始 ${shortStart}`
              const endLabel = `结束 ${shortEnd}`
              const timeLine = `${startLabel} ～ ${endLabel}`
              return {
                name: a.name || '未知',
                type: a.type || '',
                timeStr,
                description: (a.description || '').trim(),
                is_active: !!a.is_active,
                remainingText,
                opensInText,
                startTs,
                endTs,
                timeLine,
                isUpPool: true
              }
            })
            .sort((a, b) => {
              if (a.is_active !== b.is_active) return a.is_active ? -1 : 1
              return 0
            })
          currentUpActive = upItems.filter((a) => a.is_active)
          currentUpUpcoming = upItems.filter((a) => !a.is_active)
        }
      } catch (e) {
        logger.error(`[终末地插件][活动列表]获取本期UP失败: ${e?.message || e}`)
      }
    }
    const currentUpList = currentUpActive.concat(currentUpUpcoming)

    if (this.e?.runtime?.render) {
      try {
        const pluResPath = this.e?.runtime?.path?.plugin?.['endfield-plugin']?.res || ''
        // 31 天：往前 15、当天、往后 15
        const daysBefore = 15
        const dayCount = 31
        const { days, activitiesInRange: calendarInRange, activitiesOutOfRange: calendarOutOfRange, currentTimeStr } = buildCalendarData(activities, dayCount, daysBefore)
        const todayColIndex = days.findIndex(d => d.isToday)

        const now = new Date()
        const startDate = new Date(now)
        startDate.setDate(startDate.getDate() - daysBefore)
        startDate.setHours(0, 0, 0, 0)
        const startDayTs = Math.floor(startDate.getTime() / 1000)
        const endDayTs = startDayTs + dayCount * DAY_SEC

        const upToBarItem = (up) => {
          const overlaps = (up.startTs != null && up.endTs != null)
            ? (up.endTs >= startDayTs && up.startTs <= endDayTs)
            : false
          let startCol = 0
          let endCol = 1
          if (up.startTs != null && up.endTs != null) {
            startCol = Math.floor((up.startTs - startDayTs) / DAY_SEC)
            endCol = Math.ceil((up.endTs - startDayTs) / DAY_SEC)
            if (startCol < 0) startCol = 0
            if (endCol > dayCount) endCol = dayCount
            if (endCol <= startCol) endCol = startCol + 1
          }
          const span = endCol - startCol
          return { ...up, startCol, endCol, span, overlaps }
        }

        const upInRange = currentUpList.filter((up) => upToBarItem(up).overlaps).map(upToBarItem)
        const upOutOfRange = currentUpList.filter((up) => !upToBarItem(up).overlaps)

        const sortByStart = (x, y) => (x.startTs ?? 1e12) - (y.startTs ?? 1e12)
        const activitiesInRange = [...upInRange.map(({ overlaps, ...u }) => u), ...calendarInRange].sort(sortByStart)
        const activitiesOutOfRange = [...upOutOfRange, ...calendarOutOfRange].sort(sortByStart)

        const pageWidth = 1400
        const viewportHeight = 800
        const baseOpt = { scale: 1.6, retType: 'base64' }
        const renderData = {
          title: '活动列表',
          subtitle: `共 ${activities.length} 个活动`,
          days,
          dayCount,
          todayColIndex: todayColIndex >= 0 ? todayColIndex : 15,
          activitiesInRange,
          activitiesOutOfRange,
          currentTimeStr,
          pluResPath,
          pageWidth,
          viewport: { width: pageWidth, height: viewportHeight }
        }
        const imgSegment = await this.e.runtime.render('endfield-plugin', 'wiki/activity-list', renderData, baseOpt)
        if (imgSegment) {
          await this.reply(imgSegment)
          return true
        }
      } catch (err) {
        logger.error(`[终末地插件][活动列表]渲染图失败: ${err?.message || err}`)
      }
    }

    let msg = '【活动列表】\n\n'
    if (currentUpList.length > 0) {
      msg += '【本期 UP】\n'
      currentUpList.forEach((a) => {
        const timeLabel = a.opensInText || a.remainingText || ''
        msg += `${a.is_active ? '▶ ' : ''}${a.name}${timeLabel ? ` ${timeLabel}` : ''}\n`
        msg += `类型：${a.type}${a.timeStr ? ` | ${a.timeStr}` : ''}\n`
        if (a.description) msg += `${a.description}\n`
        msg += '\n'
      })
      msg += '────────────\n\n'
    }
    activities.forEach((a) => {
      msg += `[${a.index}] ${a.name}\n`
      if (a.description) msg += `    ${a.description}\n`
      if (a.startTime) msg += `    开始：${a.startTime}\n`
      if (a.endTime) msg += `    结束：${a.endTime}\n`
      msg += '\n'
    })
    await this.reply(msg.trim())
    return true
  }
}
