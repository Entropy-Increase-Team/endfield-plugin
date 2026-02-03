/**
 * 活动列表（日历）：:日历，调用 GET /api/wiki/activities，渲染 HTML 模板
 */
import { rulePrefix, getMessage } from '../utils/common.js'
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
    // 未开启的：标题后显示「X日后开启」
    const daysUntilStart = notStarted && a.startTs != null ? Math.max(0, Math.ceil((a.startTs - nowTs) / DAY_SEC)) : 0
    const opensInText = notStarted ? `${daysUntilStart}日后开启` : ''
    const startLabel = notStarted ? `${formatMonthDay(a.startTs)}开启` : `开始 ${shortStart}`
    const endLabel = `结束 ${shortEnd}`

    const overlaps = (a.startTs != null && a.endTs != null)
      ? (a.endTs >= startDayTs && a.startTs <= endDayTs)
      : true
    const item = { ...a, remainingText, opensInText, shortStart, shortEnd, startLabel, endLabel }

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
      dsc: '终末地活动日历（:日历）',
      event: 'message',
      priority: 50,
      rule: [
        { reg: `^${rulePrefix}日历$`, fnc: 'getActivityList' }
      ]
    })
    this.common_setting = setting.getConfig('common')
  }

  async getActivityList() {
    const config = this.common_setting || {}
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

    if (this.e?.runtime?.render) {
      try {
        const pluResPath = this.e?.runtime?.path?.plugin?.['endfield-plugin']?.res || ''
        // 20 天从当天前两天开始（如今天 3 号则 1 号～20 号）
        const { days, activitiesInRange, activitiesOutOfRange, dayCount, currentTimeStr } = buildCalendarData(activities, 20, 2)
        const pageWidth = 560
        const baseOpt = { scale: 1.6, retType: 'base64', viewport: { width: pageWidth, height: 1100 } }
        const renderData = {
          title: '活动列表',
          subtitle: `共 ${activities.length} 个活动`,
          days,
          dayCount,
          activitiesInRange,
          activitiesOutOfRange,
          currentTimeStr,
          pluResPath
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
