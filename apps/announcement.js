/**
 * 终末地公告：公告 / 公告最新 / 公告 <序号> / 订阅公告 群聊 等（前缀：: ： #zmd #终末地）
 * 调用公告 API（GET /api/announcements、/api/announcements/latest），需配置 api_key
 */
import { getMessage } from '../utils/common.js'
import { getCopyright } from '../utils/copyright.js'
import EndfieldRequest from '../model/endfieldReq.js'
import setting from '../utils/setting.js'
import Runtime from '../../../lib/plugins/runtime.js'

const REDIS_ANNOUNCE_SUB = 'ENDFIELD:ANNOUNCEMENT_SUBSCRIBE'

/** 从公告项中取封面图 URL（兼容 images 为字符串数组或对象数组） */
function getCoverUrl(item) {
  const imgs = item?.images
  if (!imgs || !imgs.length) return ''
  const first = imgs[0]
  if (typeof first === 'string') return first
  if (first?.url) return first.url
  const di = first?.display_infos?.[0] || first?.displayInfos?.[0]
  return di?.url || ''
}

/** 格式化发布时间（published_at_ts 为秒级时间戳） */
function formatPublishTime(ts) {
  if (ts == null) return ''
  const d = new Date(Number(ts) * 1000)
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

/** 从公告详情中提取正文（兼容 texts 数组或 content.blocks） */
function getContentText(data) {
  if (!data) return ''
  const texts = data.texts
  if (Array.isArray(texts) && texts.length) {
    return texts.map((t) => (t && t.content) || '').filter(Boolean).join('\n')
  }
  const blocks = data.content?.blocks
  if (Array.isArray(blocks)) {
    return blocks
      .filter((b) => b && b.kind === 'text' && b.text)
      .map((b) => (typeof b.text === 'string' ? b.text : b.text?.text) || '')
      .filter(Boolean)
      .join('\n')
  }
  return ''
}

/** 按 texts 数组顺序渲染所有文本内容（用于详情模板） */
function buildCaptionContent(item) {
  if (!item) return ''
  const { texts = [] } = item
  if (!Array.isArray(texts) || !texts.length) return ''
  
  const parts = []
  for (const text of texts) {
    if (text.content) {
      parts.push(`<div class="detail-text-block">${contentToDetailHtml(text.content)}</div>`)
    }
  }
  
  return parts.join('')
}

/** 正文转 HTML 用于详情模板（转义防止 XSS，保留换行由 CSS pre-wrap 展示） */
function contentToDetailHtml(text) {
  if (text == null || text === '') return ''
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const PAGE_WIDTH = 720

/** 构建单条公告详情的渲染数据与视口配置（推送与命令共用）；pluResPath 可选，不传时由 runtime 按路径计算 */
function buildDetailRenderData(item, pluResPath) {
  const coverUrl = getCoverUrl(item) || ''
  const viewportHeight = coverUrl ? 2200 : 1400
  const title = item.title || getMessage('announcement.title_unknown')
  const timeStr = formatPublishTime(item.published_at_ts)
  const timeLabel = getMessage('announcement.time_label')
  const contentHtml = contentToDetailHtml(getContentText(item)) || '（暂无正文）'
  const captionHtml = buildCaptionContent(item) || contentHtml
  const { copyright, sys } = getCopyright()
  const renderData = {
    title,
    timeStr,
    timeLabel,
    coverUrl: coverUrl || undefined,
    contentHtml,
    captionHtml,
    copyright,
    sys,
    pageWidth: PAGE_WIDTH,
    ...(pluResPath !== undefined && { pluResPath })
  }
  const baseOpt = { scale: 1.6, retType: 'base64', viewport: { width: PAGE_WIDTH, height: viewportHeight } }
  return { renderData, baseOpt }
}

/** 构建单条公告详情渲染并调用渲染；返回图片 segment 或 null */
async function renderAnnouncementDetail(e, item) {
  if (!e?.runtime?.render || !item) return null
  const pluResPath = e?.runtime?.path?.plugin?.['endfield-plugin']?.res || ''
  const { renderData, baseOpt } = buildDetailRenderData(item, pluResPath)
  try {
    return await e.runtime.render('endfield-plugin', 'announcement/detail', renderData, baseOpt)
  } catch (err) {
    logger.error(`[终末地插件][公告详情]渲染失败: ${err?.message || err}`)
    return null
  }
}

export class announcement extends plugin {
  constructor() {
    super({
      name: '[endfield-plugin]公告',
      dsc: '终末地官方公告',
      event: 'message',
      priority: 50,
      task: {
        name: '[endfield-plugin]公告推送',
        cron: '*/10 * * * *',
        fnc: () => this.pushNewAnnouncement()
      },
      rule: [
        {
          reg: '^(?:[:：]|#zmd|#终末地)公告最新$',
          fnc: 'latest'
        },
        {
          reg: '^(?:[:：]|#zmd|#终末地)公告\\s*(\\d+)$',
          fnc: 'detailByIndex'
        },
        {
          reg: '^(?:[:：]|#zmd|#终末地)公告$',
          fnc: 'list'
        },
        {
          reg: '^(?:[:：]|#zmd|#终末地)(订阅公告|公告订阅)\\s*群聊$',
          fnc: 'subscribeGroup'
        },
        {
          reg: '^(?:[:：]|#zmd|#终末地)(取消订阅公告|公告取消订阅)$',
          fnc: 'unsubscribeGroup'
        }
      ]
    })
  }

  /** 检查 api_key 并返回请求实例 */
  getReq() {
    const commonSetting = setting.getConfig('common') || {}
    if (!commonSetting.api_key || String(commonSetting.api_key).trim() === '') {
      return null
    }
    return new EndfieldRequest(0, null, '', { log: false })
  }

  async getSubList() {
    try {
      const raw = await redis.get(REDIS_ANNOUNCE_SUB)
      return raw ? JSON.parse(raw) : []
    } catch {
      return []
    }
  }

  async setSubList(list) {
    await redis.set(REDIS_ANNOUNCE_SUB, JSON.stringify(list || []))
  }

  /** 订阅公告（仅群聊）：当前群订阅新公告推送，仅推送订阅时间之后发布的公告 */
  async subscribeGroup() {
    if (!this.e.isGroup) {
      await this.reply(getMessage('announcement.subscribe_use_in_group'))
      return true
    }
    const req = this.getReq()
    if (!req) {
      await this.reply(getMessage('announcement.need_api_key'))
      return true
    }
    const groupId = String(this.e.group_id)
    const botId = String(this.e.self_id)
    const list = await this.getSubList()
    const exists = list.some((s) => s.group_id === groupId && s.bot_id === botId)
    if (exists) {
      await this.reply(getMessage('announcement.already_subscribed'))
      return true
    }
    let sinceTs = 0
    const latestRes = await req.getAnnouncementsData('announcements_latest', {})
    if (latestRes?.code === 0 && latestRes.data?.published_at_ts != null) {
      sinceTs = Number(latestRes.data.published_at_ts)
    }
    list.push({ group_id: groupId, bot_id: botId, since_ts: sinceTs })
    await this.setSubList(list)
    await this.reply(getMessage('announcement.subscribe_ok'))
    return true
  }

  /** 取消订阅公告 */
  async unsubscribeGroup() {
    if (!this.e.isGroup) {
      await this.reply(getMessage('announcement.unsubscribe_group_only'))
      return true
    }
    const groupId = String(this.e.group_id)
    const botId = String(this.e.self_id)
    const list = (await this.getSubList()).filter((s) => !(s.group_id === groupId && s.bot_id === botId))
    await this.setSubList(list)
    await this.reply(getMessage('announcement.unsubscribe_ok'))
    return true
  }

  /** 轮询最新公告，拉取详情后用详情图仅向订阅时间早于该公告的群推送 */
  async pushNewAnnouncement() {
    const req = this.getReq()
    if (!req) return
    const list = await this.getSubList()
    if (!list.length) return
    const res = await req.getAnnouncementsData('announcements_latest', {})
    if (!res || res.code !== 0 || !res.data) return
    const d = res.data
    const ts = d.published_at_ts != null ? Number(d.published_at_ts) : 0
    if (ts <= 0) return

    // 先判断是否有群需要推送，避免无意义渲染（一直生成不发送）
    const needPushIndexes = list
      .map((sub, i) => (ts > Number(sub.since_ts ?? 0) ? i : -1))
      .filter((i) => i >= 0)
    if (needPushIndexes.length === 0) return

    const bot = global.Bot || Bot
    if (!bot?.pickGroup) {
      logger.warn('[终末地插件][公告推送] Bot 不可用，跳过本次推送')
      return
    }

    const itemId = d.item_id
    let item = { ...d }
    if (itemId && (!getCoverUrl(d) || !getContentText(d))) {
      const detailRes = await req.getAnnouncementsData('announcement_detail', { id: itemId })
      if (detailRes?.code === 0 && detailRes.data) item = { ...d, ...detailRes.data }
    }
    let imgSegment = null
    try {
      const e = { runtime: new Runtime({}) }
      const { renderData, baseOpt } = buildDetailRenderData(item)
      imgSegment = await e.runtime.render('endfield-plugin', 'announcement/detail', renderData, baseOpt)
    } catch (err) {
      logger.error(`[终末地插件][公告推送]详情图渲染失败: ${err?.message || err}`)
      return
    }
    if (!imgSegment) return

    let updated = false
    for (const i of needPushIndexes) {
      const sub = list[i]
      try {
        await bot.pickGroup(sub.group_id).sendMsg(imgSegment)
        list[i] = { ...sub, since_ts: ts }
        updated = true
      } catch (e) {
        logger.error(`[终末地插件][公告推送] 群 ${sub.group_id} 发送失败: ${e?.message || e}`)
      }
    }
    if (updated) await this.setSubList(list)
  }

  /** :公告 <序号> — 显示列表中第 N 条公告的详情（优先渲染图片，失败则提示） */
  async detailByIndex() {
    const req = this.getReq()
    if (!req) {
      await this.reply(getMessage('announcement.need_api_key'))
      return true
    }
    const raw = (this.e.msg || '').trim()
    const numMatch = raw.match(/公告\s*(\d+)/)
    const index = numMatch ? Math.max(1, parseInt(numMatch[1], 10)) : 1
    const res = await req.getAnnouncementsData('announcements_list', { page: 1, page_size: Math.max(index, 20) })
    if (!res || res.code !== 0 || !res.data) {
      await this.reply(res?.message || getMessage('announcement.list_failed'))
      return true
    }
    const { list = [] } = res.data
    const listItem = list[index - 1]
    if (!listItem) {
      await this.reply(getMessage('announcement.detail_index_out', { count: list.length }))
      return true
    }
    // 使用 item_id 获取完整详情
    const itemId = listItem.item_id
    let item = listItem
    if (itemId) {
      const detailRes = await req.getAnnouncementsData('announcement_detail', { id: itemId })
      if (detailRes?.code === 0 && detailRes.data) {
        item = { ...listItem, ...detailRes.data }
      }
    }
    const imgSegment = await renderAnnouncementDetail(this.e, item)
    if (imgSegment) {
      await this.reply(imgSegment)
      return true
    }
    await this.reply(getMessage('announcement.render_failed'))
    return true
  }

  /** :公告最新 — 获取最新一条公告（优先渲染详情图，失败则提示） */
  async latest() {
    const req = this.getReq()
    if (!req) {
      await this.reply(getMessage('announcement.need_api_key'))
      return true
    }
    const res = await req.getAnnouncementsData('announcements_latest', {})
    if (!res || res.code !== 0 || !res.data) {
      await this.reply(res?.message || getMessage('announcement.latest_failed'))
      return true
    }
    const d = res.data
    const imgSegment = await renderAnnouncementDetail(this.e, d)
    if (imgSegment) {
      await this.reply(imgSegment)
      return true
    }
    await this.reply(getMessage('announcement.render_failed'))
    return true
  }

  /** :公告 — 获取公告列表，直接发送列表图片（最多显示前 5 条，无合并转发） */
  async list() {
    const req = this.getReq()
    if (!req) {
      await this.reply(getMessage('announcement.need_api_key'))
      return true
    }
    const res = await req.getAnnouncementsData('announcements_list', { page: 1, page_size: 5 })
    if (!res || res.code !== 0 || !res.data) {
      await this.reply(res?.message || getMessage('announcement.list_failed'))
      return true
    }
    const { list = [], total = 0 } = res.data
    if (!list.length) {
      await this.reply(getMessage('announcement.no_list'))
      return true
    }
    if (this.e?.runtime?.render) {
      try {
        const pluResPath = this.e?.runtime?.path?.plugin?.['endfield-plugin']?.res || ''
        const pageWidth = 560
        const listData = list.map((item, i) => ({
          index: i + 1,
          title: item.title || getMessage('announcement.title_unknown'),
          timeStr: formatPublishTime(item.published_at_ts) || '',
          coverUrl: getCoverUrl(item) || ''
        }))
        const listSubtitle = total > 5
          ? getMessage('announcement.list_total', { total, count: list.length })
          : getMessage('announcement.list_subtitle', { count: list.length })
        const listHeader = getMessage('announcement.list_header')
        const footerLine1 = getMessage('announcement.list_footer_line1')
        const { copyright, sys } = getCopyright()
        const renderData = {
          listHeader,
          listSubtitle,
          list: listData,
          footerLine1,
          copyright,
          sys,
          pageWidth,
          pluResPath
        }
        const baseOpt = { scale: 1.6, retType: 'base64', viewport: { width: pageWidth, height: 1200 } }
        const imgSegment = await this.e.runtime.render('endfield-plugin', 'announcement/list', renderData, baseOpt)
        if (imgSegment) {
          await this.reply(imgSegment)
          return true
        }
      } catch (err) {
        logger.error(`[终末地插件][公告列表]渲染失败: ${err?.message || err}`)
      }
    }
    await this.reply(getMessage('announcement.render_failed'))
    return true
  }
}
