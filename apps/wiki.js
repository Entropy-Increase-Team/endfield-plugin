// 官方 wiki 数据不全，后续可再补

import { getMessage } from '../utils/common.js'
import common from '../../../lib/common/common.js'
import EndfieldRequest from '../model/endfieldReq.js'
import setting from '../utils/setting.js'

/** Wiki 游戏百科：main_type_id=1，sub_type_id 与展示名/输入前缀映射 */
const WIKI = {
  MAIN_TYPE_GAME: '1',
  SUB_LABEL: { '1': '干员', '2': '武器', '3': '威胁', '4': '装备', '5': '设备', '6': '物品', '7': '武器基质', '8': '任务', '9': '活动' }
}
WIKI.SUB_TYPE_BY_LABEL = Object.fromEntries(Object.entries(WIKI.SUB_LABEL).map(([k, v]) => [v, k]))
WIKI.LABELS_SORTED = Object.entries(WIKI.SUB_TYPE_BY_LABEL).sort((a, b) => b[0].length - a[0].length)

export class EndfieldWiki extends plugin {
  constructor() {
    super({
      name: '[endfield-plugin]Wiki查询',
      dsc: '终末地Wiki数据查询（:wiki xxx / :wikixxx）',
      event: 'message',
      priority: 50,
      rule: [
        {
          reg: '^(?:[:：]|#zmd|#终末地)wiki\\s*(.+)$',
          fnc: 'queryWiki'
        }
      ]
    })
  }

  /**
   * 解析 :wiki [干员|武器|...] xxx，返回 { subTypeId, name }。
   * 无前缀时默认 subTypeId='1'（干员）；按标签长度降序匹配，避免短标签抢匹配。
   */
  getWikiQuery() {
    const msg = (this.e.msg || '').trim()
    const afterPrefix = msg.replace(/^([:：]|#zmd|#终末地)\s*/i, '').replace(/^wiki\s*/i, '').trim()
    if (!afterPrefix) return { subTypeId: '1', name: '' }
    for (const [label, subTypeId] of WIKI.LABELS_SORTED) {
      if (afterPrefix === label || afterPrefix.startsWith(label + ' ') || afterPrefix.startsWith(label)) {
        const name = afterPrefix === label ? '' : afterPrefix.slice(label.length).trim()
        return { subTypeId, name }
      }
    }
    return { subTypeId: '1', name: afterPrefix }
  }

  /** 在条目列表中按名称精确匹配，再模糊匹配（包含关系），无结果时返回首项 */
  findByName(items, name) {
    if (!Array.isArray(items) || !name) return null
    const n = String(name).trim()
    const exact = items.find((item) => (item.name || '') === n)
    if (exact) return exact
    const fuzzy = items.find((item) => {
      const itemName = item.name || ''
      return itemName && (itemName.includes(n) || n.includes(itemName))
    })
    return fuzzy || items[0] || null
  }

  /** 统一 Wiki 查询：:wiki [干员|武器] xxx / :wiki xxx（默认干员），GET /api/wiki/items?main_type_id=1&sub_type_id={sub_type_id} 后取详情 */
  async queryWiki() {
    const { subTypeId, name } = this.getWikiQuery()
    const typeLabel = WIKI.SUB_LABEL[subTypeId] || '百科'
    if (!name) {
      await this.reply(getMessage('wiki.provide_content'))
      return true
    }

    const commonConfig = setting.getConfig('common') || {}
    if (!commonConfig.api_key || String(commonConfig.api_key).trim() === '') {
      await this.reply(getMessage('wiki.need_api_key'))
      return true
    }

    const req = new EndfieldRequest(0, '', '')
    const listRes = await req.getWikiData('wiki_items', {
      main_type_id: WIKI.MAIN_TYPE_GAME,
      sub_type_id: subTypeId,
      page: 1,
      page_size: 100
    })

    if (!listRes || listRes.code !== 0) {
      logger.error(`[终末地Wiki] ${typeLabel}列表失败: ${JSON.stringify(listRes)}`)
      await this.reply(getMessage('wiki.query_failed', { name }))
      return true
    }

    const items = listRes.data?.items || []
    const item = this.findByName(items, name)
    if (!item) {
      await this.reply(getMessage('wiki.not_found', { name, type_label: typeLabel }))
      return true
    }

    const detailRes = await req.getWikiData('wiki_item_detail', { id: item.item_id })
    if (!detailRes || detailRes.code !== 0 || !detailRes.data) {
      await this.reply(getMessage('wiki.detail_failed', { name: item.name || item.item_id }))
      return true
    }

    const data = detailRes.data
    const dataSubTypeId = String(data.sub_type_id ?? data.subTypeId ?? '')
    const dataTypeLabel = WIKI.SUB_LABEL[dataSubTypeId] || typeLabel
    const cover = data.cover
    const seg = global.segment || (await import('oicq')).segment

    // 按【干员资料】【能力扩延】【干员潜能】等章节分段，合并转发每条一段
    const { header, sections } = this.getWikiSections(data, dataTypeLabel)
    const forwardParts = []
    if (sections.length === 0) {
      forwardParts.push([header || '暂无正文'])
      if (cover && seg?.image) {
        try {
          forwardParts[0].push(seg.image(cover))
        } catch (e) {}
      }
    } else {
      const firstBlock = header + '\n────────────\n' + sections[0].chapterTitle + '\n' + sections[0].content
      if (cover && seg?.image) {
        try {
          forwardParts.push([firstBlock, seg.image(cover)])
        } catch (e) {
          forwardParts.push([firstBlock])
        }
      } else {
        forwardParts.push([firstBlock])
      }
      for (let i = 1; i < sections.length; i++) {
        const block = '────────────\n' + sections[i].chapterTitle + '\n' + sections[i].content
        forwardParts.push([block])
      }
    }
    const forwardMsg = common.makeForwardMsg(this.e, forwardParts, `终末地Wiki-${dataTypeLabel}`)
    await this.e.reply(forwardMsg)
    return true
  }

  /**
   * 全局去重 + 连续空行合并：相同内容只保留首次出现，减少大量重复（如多处「基础数据」「技能数据」表头）。
   * 不硬编码文案，适用于任意 API 返回内容。
   */
  dedupLines(text) {
    if (!text || typeof text !== 'string') return text
    const lines = text.split('\n')
    const out = []
    const seen = new Set()
    let prevEmpty = false
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed === '') {
        if (!prevEmpty) out.push('')
        prevEmpty = true
        continue
      }
      prevEmpty = false
      if (seen.has(trimmed)) continue
      seen.add(trimmed)
      out.push(line)
    }
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  }

  /** 是否像小节标题（短、无冒号），用于在之前插入分隔线以分段 */
  looksLikeSectionTitle(s) {
    if (!s || typeof s !== 'string') return false
    const t = s.trim()
    return t.length > 0 && t.length <= 16 && !t.includes('：') && !t.includes(':')
  }

  /** 是否为纯数据表格（详细属性/RANK/技能专精/材料消耗/激活条件等），这类表格跳过不输出，避免刷屏 */
  isDataOnlyTable(cells) {
    if (!Array.isArray(cells) || cells.length < 6) return false
    const text = cells.join(' ')
    const dataMarkers = ['详细属性', 'RANK ', '技能专精', '材料消耗', '激活条件', '基础数据', '需求素材', '能力值', '详细数值']
    const matchCount = dataMarkers.filter((m) => text.includes(m)).length
    return matchCount >= 2
  }

  /** 格式化 Wiki 条目详情：标题 + caption + 正文（document_map 渲染） */
  formatItemDetail(data, typeLabel) {
    let out = `【${typeLabel}】${data.name || '未知'}\n`
    if (Array.isArray(data.caption) && data.caption.length > 0) {
      const cap = this.renderCaption(data.caption)
      if (cap) out += cap + '\n'
    }
    if (data.content?.document_map || data.content?.documentMap) {
      const body = this.renderWikiContent(data.content)
      if (body) out += body
    }
    if (!out.trim()) out += '暂无正文内容\n'
    return out.trim()
  }

  renderCaption(caption) {
    if (!Array.isArray(caption)) return ''
    return caption
      .map((c) => {
        if (c?.kind !== 'text') return ''
        if (typeof c.text === 'string') return c.text
        return c.text?.text || ''
      })
      .filter(Boolean)
      .join(' ')
  }

  /** 渲染时不展示的章节标题（与 extract-all-text 一致） */
  /** 渲染时不展示的章节（干员档案/特别提醒/武器档案等） */
  static EXCLUDED_CHAPTER_TITLES = ['干员档案', '特别提醒', '档案']

  /** 干员资料仅保留：代号、性别、身份认证、生日、种族 */
  static GANYUAN_ZILIAO_KEYS = /^【(代号|性别|身份认证|生日|种族)】/

  /** 统一取 content 的 chapter_group / widget_common_map，避免各处重复写 snake_case 与 camelCase */
  getContentMaps(content) {
    return {
      chapterGroup: content?.chapter_group || content?.chapterGroup || [],
      widgetMap: content?.widget_common_map || content?.widgetCommonMap || {}
    }
  }

  /** 从单个章节的 widgets 中收集 document id 列表（供 getDocumentIdsByChapter / getExcludedDocumentIds 复用） */
  getDocIdsFromChapter(chapter, widgetMap) {
    const docIds = []
    const widgets = chapter?.widgets || []
    for (const w of widgets) {
      const wid = w?.id
      if (!wid) continue
      const widgetData = widgetMap[wid]
      if (!widgetData) continue
      const tabDataMap = widgetData.tab_data_map || widgetData.tabDataMap || {}
      for (const key of Object.keys(tabDataMap)) {
        const c = tabDataMap[key]?.content
        if (c) docIds.push(c)
      }
    }
    return docIds
  }

  /** 干员资料章节无 tab_data_map 时，取干员档案→档案(oAggkMLV)→基础档案对应文档 */
  getFallbackDocIdsForGanyuanZiliao(content) {
    const { chapterGroup, widgetMap } = this.getContentMaps(content)
    const archiveChapter = chapterGroup.find((ch) => (ch?.title || '') === '干员档案')
    if (!archiveChapter) return []
    const widgetData = widgetMap['oAggkMLV'] || {}
    if (!widgetData) return []
    const tabDataMap = widgetData.tab_data_map || widgetData.tabDataMap || {}
    const tabList = widgetData.tab_list || widgetData.tabList || []
    const firstTabId = tabList[0]?.tab_id || Object.keys(tabDataMap)[0]
    const docId = firstTabId ? tabDataMap[firstTabId]?.content : null
    return docId ? [docId] : []
  }

  /** 渲染单个文档，可选仅保留干员资料五项（代号/性别/身份认证/生日/种族） */
  renderDocument(content, docId, opts = {}) {
    const docMap = content?.document_map || content?.documentMap || {}
    const doc = docMap[docId]
    if (!doc) return []
    const blockIds = doc.block_ids || doc.blockIds || []
    const blockMap = doc.block_map || doc.blockMap || {}
    const ganyuanZiliaoOnly = opts.ganyuanZiliaoOnly === true
    const lines = []
    for (const bid of blockIds) {
      const block = blockMap[bid]
      if (!block) continue
      const line = this.renderBlock(block, blockMap)
      if (!line) continue
      if (ganyuanZiliaoOnly && !EndfieldWiki.GANYUAN_ZILIAO_KEYS.test(line.trim())) continue
      lines.push(line)
    }
    return lines
  }

  /**
   * 根据 content 结构收集需排除的文档 ID（上述章节下 widgets 对应的 document）。
   */
  getExcludedDocumentIds(content) {
    const excluded = new Set()
    const { chapterGroup, widgetMap } = this.getContentMaps(content)
    const excludeTitles = new Set(EndfieldWiki.EXCLUDED_CHAPTER_TITLES)
    for (const ch of chapterGroup) {
      if (!excludeTitles.has(ch?.title || '')) continue
      for (const docId of this.getDocIdsFromChapter(ch, widgetMap)) excluded.add(docId)
    }
    return excluded
  }

  /** 按 chapter_group 顺序收集某章节下的文档 ID */
  getDocumentIdsByChapter(content, chapter) {
    const { widgetMap } = this.getContentMaps(content)
    return this.getDocIdsFromChapter(chapter, widgetMap)
  }

  /** 将 content 按章节渲染为纯文本；干员资料无文档时用基础档案并只保留代号/性别/身份认证/生日/种族；排除特别提醒/干员档案 */
  renderWikiContent(content) {
    const docMap = content?.document_map || content?.documentMap || {}
    if (!docMap || typeof docMap !== 'object') return ''
    const excludedDocIds = this.getExcludedDocumentIds(content)
    const { chapterGroup } = this.getContentMaps(content)
    const excludeTitles = new Set(EndfieldWiki.EXCLUDED_CHAPTER_TITLES)

    const lines = []
    for (const ch of chapterGroup) {
      const title = ch?.title || ''
      if (excludeTitles.has(title)) continue
      const rawDocIds = this.getDocumentIdsByChapter(content, ch)
      let docIds = rawDocIds.filter((id) => docMap[id] && !excludedDocIds.has(id))
      if (docIds.length === 0 && title === '干员资料') docIds = this.getFallbackDocIdsForGanyuanZiliao(content)
      if (docIds.length === 0) continue

      if (lines.length > 0) {
        lines.push('────────────')
        lines.push('')
      }
      lines.push('【' + title + '】')
      lines.push('')

      const isGanyuanZiliaoFallback = title === '干员资料' && rawDocIds.length === 0
      const opts = isGanyuanZiliaoFallback ? { ganyuanZiliaoOnly: true } : {}
      for (const docId of docIds) {
        for (const line of this.renderDocument(content, docId, opts)) {
          if (this.looksLikeSectionTitle(line) && lines.length > 0) lines.push('')
          lines.push(line)
        }
      }
    }
    return lines.join('\n').replace(/\n{3,}/g, '\n\n')
  }

  /**
   * 按章节返回内容，用于合并转发按【干员资料】等标题分段。
   * 返回 { header, sections }，header=【干员】name+caption，sections=[{ chapterTitle, content }]。
   */
  getWikiSections(data, typeLabel) {
    const content = data?.content
    const docMap = content?.document_map || content?.documentMap || {}
    if (!docMap || typeof docMap !== 'object') {
      return { header: `【${typeLabel}】${data?.name || '未知'}\n暂无正文`, sections: [] }
    }
    const excludedDocIds = this.getExcludedDocumentIds(content)
    const { chapterGroup } = this.getContentMaps(content)
    const excludeTitles = new Set(EndfieldWiki.EXCLUDED_CHAPTER_TITLES)

    let header = `【${typeLabel}】${data?.name || '未知'}\n`
    if (Array.isArray(data.caption) && data.caption.length > 0) {
      const cap = this.renderCaption(data.caption)
      if (cap) header += cap + '\n'
    }
    header = header.trim()

    const sections = []
    for (const ch of chapterGroup) {
      const title = ch?.title || ''
      if (excludeTitles.has(title)) continue
      const rawDocIds = this.getDocumentIdsByChapter(content, ch)
      let docIds = rawDocIds.filter((id) => docMap[id] && !excludedDocIds.has(id))
      if (docIds.length === 0 && title === '干员资料') docIds = this.getFallbackDocIdsForGanyuanZiliao(content)
      if (docIds.length === 0) continue

      const isGanyuanZiliaoFallback = title === '干员资料' && rawDocIds.length === 0
      const opts = isGanyuanZiliaoFallback ? { ganyuanZiliaoOnly: true } : {}
      const lines = []
      for (const docId of docIds) {
        for (const line of this.renderDocument(content, docId, opts)) {
          if (this.looksLikeSectionTitle(line) && lines.length > 0) lines.push('')
          lines.push(line)
        }
      }
      const chapterContent = this.dedupLines(lines.join('\n').replace(/\n{3,}/g, '\n\n')).trim()
      sections.push({ chapterTitle: '【' + title + '】', content: chapterContent })
    }
    return { header, sections }
  }

  renderBlock(block, blockMap) {
    if (!block) return ''
    switch (block.kind) {
      case 'text': {
        const t = block.text
        const elements = t?.inline_elements || t?.inlineElements || []
        if (!Array.isArray(elements) || elements.length === 0) return ''
        return elements
          .map((el) => {
            if (el.kind === 'text') {
              if (typeof el.text === 'string') return el.text
              if (el.text?.text != null) return el.text.text
              return ''
            }
            if (el.kind === 'entry' && el.entry?.name) return el.entry.name
            if (el.kind === 'link' && el.link?.text) return el.link.text
            return ''
          })
          .filter(Boolean)
          .join('')
      }
      case 'table': {
        const table = block.table
        const cellMap = table?.cell_map || table?.cellMap || {}
        const rowIds = table?.row_ids || table?.rowIds || []
        const columnIds = table?.column_ids || table?.columnIds || []
        if (!Object.keys(cellMap).length) return ''
        const renderCell = (cell) => {
          const childIds = cell?.child_ids || cell?.childIds || []
          const parts = []
          for (const childId of childIds) {
            const child = blockMap[childId]
            if (child) parts.push(this.renderBlock(child, blockMap))
          }
          return parts.filter(Boolean).join(' ').trim() || ''
        }
        if (rowIds.length > 0 && columnIds.length > 0) {
          const rows = []
          const allCells = []
          for (const rowId of rowIds) {
            const rowCells = []
            for (const colId of columnIds) {
              const key = `${rowId}_${colId}`
              const cell = cellMap[key]
              const text = cell ? renderCell(cell) : ''
              rowCells.push(text)
              allCells.push(text)
            }
            rows.push('| ' + rowCells.join(' | ') + ' |')
          }
          if (this.isDataOnlyTable(allCells)) return ''
          const sep = '| ' + columnIds.map(() => '---').join(' | ') + ' |'
          return rows[0] + '\n' + sep + '\n' + rows.slice(1).join('\n')
        }
        const cells = []
        for (const cid of Object.keys(cellMap)) {
          const cell = cellMap[cid]
          cells.push(renderCell(cell))
        }
        const filtered = cells.filter(Boolean)
        if (this.isDataOnlyTable(filtered)) return ''
        return filtered.join('\n')
      }
      case 'list': {
        const list = block.list
        const itemMap = list?.item_map || list?.itemMap || {}
        const itemIds = list?.item_ids || list?.itemIds || []
        if (!Object.keys(itemMap).length) return ''
        const items = []
        for (const iid of itemIds) {
          const item = itemMap[iid]
          const childIds = item?.child_ids || item?.childIds || []
          for (const cid of childIds) {
            const c = blockMap[cid]
            if (c) items.push(this.renderBlock(c, blockMap))
          }
        }
        return items.filter(Boolean).map((s) => '· ' + s).join('\n')
      }
      case 'horizontalLine':
        return '────────────'
      default:
        return ''
    }
  }

}
