import { rulePrefix, getMessage } from '../utils/common.js'
import setting from '../utils/setting.js'
import common from '../../../lib/common/common.js'
import EndfieldRequest from '../model/endfieldReq.js'

/** Wiki 干员攻略：main_type_id=2 游戏攻略辑，sub_type_id=11 干员攻略 */
const WIKI_STRATEGY_MAIN_TYPE_ID = '2'
const WIKI_STRATEGY_SUB_TYPE_ID = '11'

export class EndfieldStrategy extends plugin {
  constructor() {
    super({
      name: '[endfield-plugin]攻略查询',
      dsc: '终末地干员攻略（Wiki 百科 · 干员攻略）',
      event: 'message',
      priority: 50,
      rule: [
        {
          reg: `^${rulePrefix}(.+?)攻略$`,
          fnc: 'queryStrategy'
        }
      ]
    })

    this.common_setting = setting.getConfig('common')
  }

  /** 从消息中提取攻略名称（「攻略」前的关键词） */
  getStrategyName() {
    let msg = this.e.msg || ''
    const mode = Number(this.common_setting?.prefix_mode) || 1
    if (mode === 2) {
      msg = msg.replace(/^#(终末地|zmd)?\s*/, '')
    } else {
      msg = msg.replace(/^[:：]\s*/, '')
    }
    msg = msg.replace(/攻略$/, '').trim()
    return msg
  }

  getCmdPrefix() {
    const mode = Number(this.common_setting?.prefix_mode) || 1
    return mode === 2 ? '#zmd' : ':'
  }

  /** 在条目列表中按名称匹配（精确优先，再模糊） */
  filterItemsByName(items, name) {
    if (!Array.isArray(items) || !name) return []
    const n = String(name).trim()
    const exact = items.filter((item) => (item.name || '').trim() === n)
    if (exact.length > 0) return exact
    const fuzzy = items.filter(
      (item) =>
        (item.name || '').includes(n) || n.includes((item.name || '').trim())
    )
    return fuzzy.length > 0 ? fuzzy : []
  }

  async queryStrategy() {
    const name = this.getStrategyName()
    if (!name) {
      const prefix = this.getCmdPrefix()
      await this.reply(getMessage('strategy.provide_name', { prefix }))
      return true
    }

    const commonConfig = setting.getConfig('common') || {}
    if (!commonConfig.api_key || String(commonConfig.api_key).trim() === '') {
      await this.reply('攻略查询需要配置 api_key，请在 config/common.yaml 中填写（终末地协议终端获取）')
      return true
    }

    const req = new EndfieldRequest(0, '', '')
    // 攻略列表：GET /api/wiki/items?main_type_id=2&sub_type_id=11，只用到 name、item_id
    const listRes = await req.getWikiData('wiki_items', {
      main_type_id: WIKI_STRATEGY_MAIN_TYPE_ID,
      sub_type_id: WIKI_STRATEGY_SUB_TYPE_ID,
      page: 1,
      page_size: 100
    })

    if (!listRes || listRes.code !== 0) {
      logger.error(`[终末地攻略]列表失败: ${JSON.stringify(listRes)}`)
      await this.reply(getMessage('strategy.query_failed', { error: '接口异常' }))
      return true
    }

    const allItems = listRes.data?.items || []
    const items = this.filterItemsByName(allItems, name)

    if (items.length === 0) {
      await this.reply(`${getMessage('strategy.not_found', { name })}\n（当前仅支持 Wiki 干员攻略，可尝试其他干员名）`)
      return true
    }

    // 取第一个匹配条目的 item_id，查详情：GET /api/wiki/items/{item_id}
    const item = items[0]
    const detailRes = await req.getWikiData('wiki_item_detail', { id: item.item_id })
    if (!detailRes || detailRes.code !== 0 || !detailRes.data) {
      await this.reply(`未获取到「${item.name || item.item_id}」的攻略详情`)
      return true
    }

    // 兼容 data 直接为条目 或 data.item 为条目；兼容 snake_case / camelCase
    const data = detailRes.data?.item || detailRes.data
    const itemName = data.name || item.name || '攻略'
    const rawContent = data.content || {}
    const documentMap = rawContent.document_map || rawContent.documentMap || data.document?.documentMap || {}
    const widgetCommonMap = rawContent.widget_common_map || rawContent.widgetCommonMap || data.widgetCommonMap || {}

    const seg = global.segment || (await import('oicq')).segment
    const forwardMessages = []

    // 有 widget_common_map 时按作者分条；若该作者是「文字+图片」则单独发一次合并转发
    const authorMessages = this.buildMessagesByAuthors(widgetCommonMap, documentMap, seg)
    if (authorMessages.length > 0) {
      for (const { parts, hasTextAndImage } of authorMessages) {
        if (hasTextAndImage) {
          // 文字+图片的作者：单独发一个合并转发（仅此作者一条）
          const singleForward = common.makeForwardMsg(this.e, [parts], itemName)
          await this.e.reply(singleForward)
        } else {
          forwardMessages.push(parts)
        }
      }
    } else {
      // 无 tab 结构时：整条攻略一条消息（标题 + 所有图片）
      const text = `【${itemName}】\n`
      const imageUrls = this.extractImageUrlsFromDocumentMap(documentMap)
      if (imageUrls.length > 0 && seg?.image) {
        const parts = [text]
        for (const url of imageUrls) {
          parts.push(seg.image(url))
        }
        forwardMessages.push(parts)
      } else {
        forwardMessages.push([text + (data.cover ? '（暂无正文图片）' : '暂无内容')])
        if (data.cover && seg?.image) {
          forwardMessages.push([seg.image(data.cover)])
        }
      }
    }

    if (forwardMessages.length > 0) {
      const forwardMsg = common.makeForwardMsg(this.e, forwardMessages, itemName)
      await this.e.reply(forwardMsg)
    }
    return true
  }

  /**
   * 按 widget_common_map 的 tab 分出作者，每位作者一条消息内容 { parts, hasTextAndImage }
   * 兼容 snake_case / camelCase
   */
  buildMessagesByAuthors(widgetCommonMap, documentMap, seg) {
    const messages = []
    const widgetIds = Object.keys(widgetCommonMap || {})
    for (const widgetId of widgetIds) {
      const widget = widgetCommonMap[widgetId]
      const tabList = widget.tab_list || widget.tabList || []
      const tabDataMap = widget.tab_data_map || widget.tabDataMap || {}
      for (const tab of tabList) {
        const tabId = tab.tab_id || tab.tabId
        const authorName = (tab.title || '').trim() || '未知作者'
        const docId = tabDataMap[tabId]?.content
        if (!docId) continue
        const doc = documentMap[docId]
        if (!doc) continue
        const blockIds = doc.block_ids || doc.blockIds || []
        const blockMap = doc.block_map || doc.blockMap || {}
        const parts = [`【作者】${authorName}\n`]
        let hasText = false
        let hasImage = false
        for (const bid of blockIds) {
          const block = blockMap[bid]
          if (!block) continue
          if (block.kind === 'text') {
            const text = this.getBlockText(block)
            if (text) {
              parts.push(text)
              hasText = true
            }
          } else if (block.kind === 'image' && seg?.image) {
            const img = block.image
            const url = img?.url || img?.src
            if (url && typeof url === 'string' && url.startsWith('http')) {
              parts.push(seg.image(url))
              hasImage = true
            }
          }
        }
        if (!hasText && !hasImage) {
          parts[0] = parts[0].trimEnd() + '（暂无内容）\n'
        }
        messages.push({ parts, hasTextAndImage: hasText && hasImage })
      }
    }
    return messages
  }

  /** 从 text 块提取纯文本（inline_elements / inlineElements） */
  getBlockText(block) {
    const t = block.text
    if (!t) return ''
    const elements = t.inline_elements || t.inlineElements || []
    if (!Array.isArray(elements) || elements.length === 0) return ''
    return elements
      .map((el) => {
        if (el.kind === 'text') {
          // stra.json 中为直接字符串 "text": "配队参考"
          if (typeof el.text === 'string') return el.text
          if (el.text?.text != null) return el.text.text
          return ''
        }
        if (el.kind === 'entry' && el.entry?.name) return el.entry.name
        if (el.kind === 'link' && el.link?.text) return el.link.text
        return ''
      })
      .filter(Boolean)
      .join('') + '\n'
  }

  /** 从 document_map 中按顺序收集所有图片 URL（不区分作者） */
  extractImageUrlsFromDocumentMap(documentMap) {
    const urls = []
    const docMap = documentMap || {}
    for (const docId of Object.keys(docMap)) {
      const doc = docMap[docId]
      const blockIds = doc.block_ids || doc.blockIds || []
      const blockMap = doc.block_map || doc.blockMap || {}
      for (const bid of blockIds) {
        const block = blockMap[bid]
        if (!block || block.kind !== 'image') continue
        const img = block.image
        const url = img?.url || img?.src
        if (url && typeof url === 'string' && url.startsWith('http')) {
          urls.push(url)
        }
      }
    }
    return urls
  }
}
