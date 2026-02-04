import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { rulePrefix, getMessage } from '../utils/common.js'
import setting from '../utils/setting.js'
import common from '../../../lib/common/common.js'
import EndfieldRequest from '../model/endfieldReq.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** Wiki 干员攻略：main_type_id=2 游戏攻略辑，sub_type_id=11 干员攻略 */
const WIKI_STRATEGY_MAIN_TYPE_ID = '2'
const WIKI_STRATEGY_SUB_TYPE_ID = '11'

/** 攻略图片本地存储目录：data/strategy-img/名称/ 名称可为干员名（莱万汀）或队伍名（火队、x队） */
const STRATEGY_IMG_DIR = path.join(__dirname, '..', 'data', 'strategy-img')

export class EndfieldStrategy extends plugin {
  constructor() {
    super({
      name: '[endfield-plugin]攻略查询',
      dsc: '终末地干员攻略（Wiki 百科 · 干员攻略）',
      event: 'message',
      priority: 50,
      rule: [
        {
          reg: `^${rulePrefix}攻略列表$`,
          fnc: 'listStrategy'
        },
        {
          reg: `^${rulePrefix}(.+?)攻略$`,
          fnc: 'queryStrategy'
        },
        {
          reg: `^${rulePrefix}(上传攻略|攻略上传)\\s*(\\S+)\\s*(\\S+)(?:\\s*(图片|https?://\\S+))?$`,
          fnc: 'uploadStrategyImage',
          permission: 'master'
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

  /** 攻略列表：本地 data/strategy-img 子目录 + Wiki 干员攻略名称 */
  async listStrategy() {
    const prefix = this.getCmdPrefix()
    const localNames = []
    try {
      if (fs.existsSync(STRATEGY_IMG_DIR) && fs.statSync(STRATEGY_IMG_DIR).isDirectory()) {
        const dirs = fs.readdirSync(STRATEGY_IMG_DIR)
        for (const d of dirs) {
          const full = path.join(STRATEGY_IMG_DIR, d)
          if (fs.statSync(full).isDirectory()) localNames.push(d)
        }
        localNames.sort((a, b) => a.localeCompare(b))
      }
    } catch (e) {
      logger.error('[终末地攻略] 读取本地攻略目录失败', e)
    }
    let wikiNames = []
    const commonConfig = setting.getConfig('common') || {}
    if (commonConfig.api_key && String(commonConfig.api_key).trim()) {
      try {
        const req = new EndfieldRequest(0, '', '')
        const listRes = await req.getWikiData('wiki_items', {
          main_type_id: WIKI_STRATEGY_MAIN_TYPE_ID,
          sub_type_id: WIKI_STRATEGY_SUB_TYPE_ID,
          page: 1,
          page_size: 200
        })
        if (listRes?.code === 0 && Array.isArray(listRes.data?.items)) {
          wikiNames = (listRes.data.items || [])
            .map((item) => (item.name || '').replace(/^【玩家攻略】/, '').trim())
            .filter(Boolean)
        }
      } catch (e) {
        logger.error('[终末地攻略] 获取 Wiki 攻略列表失败', e)
      }
    }
    const lines = []
    if (localNames.length > 0) {
      lines.push('【本地攻略】\n' + localNames.join('、'))
    }
    if (wikiNames.length > 0) {
      lines.push('【Wiki 干员攻略】\n' + wikiNames.join('、'))
    }
    if (lines.length === 0) {
      await this.reply(getMessage('strategy.list_empty'))
      return true
    }
    await this.reply(getMessage('strategy.list_header') + '\n\n' + lines.join('\n\n'))
    return true
  }

  /** 路径/文件名安全：替换非法字符为下划线 */
  sanitizeName(name) {
    if (!name || typeof name !== 'string') return 'unknown'
    return name.replace(/[/\\:*?"<>|]/g, '_').trim() || 'unknown'
  }

  /**
   * 上传攻略图片：:上传攻略 [干员/队伍名] [作者] [图片/链接]
   * 存储：data/strategy-img/名称/作者_时间戳.扩展名
   */
  async uploadStrategyImage() {
    if (!this.e?.isMaster) return false
    const msg = (this.e.msg || '').trim()
    const mode = Number(this.common_setting?.prefix_mode) || 1
    const prefix = mode === 2 ? /^#(终末地|zmd)?\s*/ : /^[:：]\s*/
    const after = msg
      .replace(prefix, '')
      .replace(/^上传队伍攻略\s*/i, '')
      .replace(/^(?:上传攻略|攻略上传)\s*/i, '')
      .trim()
    const match = after.match(/^(\S+)\s*(\S+)(?:\s*(图片|https?:\/\/\S+))?$/)
    if (!match) {
      await this.reply(getMessage('strategy.upload_format'))
      return true
    }
    const [, nameOrTeam, author, third] = match
    let imageUrl = null
    let imageBuf = null
    if (third && third.startsWith('http')) {
      imageUrl = third
    } else {
      const imgSeg = this.getFirstImageFromMessage()
      if (imgSeg?.url) {
        imageUrl = imgSeg.url
      } else if (imgSeg?.file) {
        imageBuf = this.readImageFromSegment(imgSeg)
      }
    }
    if (!imageUrl && !imageBuf) {
      await this.reply(getMessage('strategy.upload_need_image'))
      return true
    }
    const dirName = this.sanitizeName(nameOrTeam)
    const authorName = this.sanitizeName(author)
    const dir = path.join(STRATEGY_IMG_DIR, dirName)
    try {
      fs.mkdirSync(dir, { recursive: true })
    } catch (err) {
      logger.error(`[终末地攻略] 创建目录失败: ${dir}`, err)
      await this.reply(getMessage('strategy.upload_mkdir_failed'))
      return true
    }
    let safeExt = '.png'
    if (imageUrl) {
      try {
        const ext = path.extname(new URL(imageUrl).pathname) || '.png'
        safeExt = /^\.(png|jpe?g|gif|webp)$/i.test(ext) ? ext : '.png'
      } catch (e) {}
    }
    const filename = `${authorName}_${Date.now()}${safeExt}`
    const filepath = path.join(dir, filename)
    try {
      if (imageBuf) {
        fs.writeFileSync(filepath, imageBuf)
      } else {
        const res = await fetch(imageUrl, { method: 'GET' })
        if (!res.ok) {
          await this.reply(getMessage('strategy.upload_download_failed', { status: res.status }))
          return true
        }
        const buf = Buffer.from(await res.arrayBuffer())
        fs.writeFileSync(filepath, buf)
      }
      await this.reply(getMessage('strategy.upload_saved', { path: `${dirName}/${filename}` }))
    } catch (err) {
      logger.error(`[终末地攻略] 下载/保存图片失败`, err)
      await this.reply(getMessage('strategy.upload_save_failed'))
    }
    return true
  }

  /** 从 this.e.message 中取第一张图片 segment（支持 icqq/oicq 消息数组） */
  getFirstImageFromMessage() {
    const msg = this.e.message || this.e.msg
    if (!msg) return null
    const arr = Array.isArray(msg) ? msg : (msg && msg.data ? [msg] : [])
    for (const seg of arr) {
      if (seg?.type === 'image' || seg?.type === 2) {
        const url = seg.url ?? seg.data?.url
        const file = seg.file ?? seg.data?.file
        if (url || file) return { url, file }
      }
    }
    return null
  }

  /** 从 segment 的 file（base64 或 path）读取为 Buffer */
  readImageFromSegment(imgSeg) {
    const file = imgSeg?.file ?? imgSeg?.data?.file
    if (!file || typeof file !== 'string') return null
    if (file.startsWith('base64://')) {
      return Buffer.from(file.slice(9), 'base64')
    }
    if (file.startsWith('file://')) {
      const p = file.slice(7)
      try {
        return fs.readFileSync(path.isAbsolute(p) ? p : path.join(process.cwd(), p))
      } catch (e) {
      return null
    }
  }
    try {
      return fs.readFileSync(file)
    } catch (e) {
    return null
  }
  }

  /** 从文件名解析作者：格式 作者_时间戳.ext，返回作者名或空串 */
  getAuthorFromStrategyFilename(filename) {
    const base = path.basename(filename, path.extname(filename))
    const m = base.match(/^(.+)_(\d+)$/)
    return m ? m[1] : base
  }

  /** 获取本地用户上传的攻略图片：data/strategy-img/名称/ 下的图片（名称可为干员名或队伍名如火队），返回 { path, author }[] */
  getLocalStrategyImages(nameOrTeam) {
    const dirName = this.sanitizeName(nameOrTeam)
    const dir = path.join(STRATEGY_IMG_DIR, dirName)
    try {
      if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return []
      const files = fs.readdirSync(dir)
      const imageExt = /\.(png|jpe?g|gif|webp)$/i
      return files
        .filter((f) => imageExt.test(f))
        .map((f) => {
          const fullPath = path.join(dir, f)
          return { path: fullPath, author: this.getAuthorFromStrategyFilename(f) }
        })
        .sort((a, b) => fs.statSync(a.path).mtimeMs - fs.statSync(b.path).mtimeMs)
    } catch (e) {
      return []
    }
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
      await this.reply(getMessage('strategy.need_api_key'))
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
    const localImages = this.getLocalStrategyImages(name)
    const seg = global.segment || (await import('oicq')).segment

    if (items.length === 0) {
      if (localImages.length > 0) {
        const parts = []
        for (const img of localImages) {
          parts.push(`【作者】${img.author}\n`)
          if (seg?.image) parts.push(seg.image(`file://${img.path}`))
        }
        const forwardMsg = common.makeForwardMsg(this.e, [parts], `${name}攻略`)
        await this.e.reply(forwardMsg)
      } else {
        await this.reply(getMessage('strategy.not_found', { name }) + '\n' + getMessage('strategy.not_found_suffix'))
      }
        return true
      }

    // 取第一个匹配条目的 item_id，查详情：GET /api/wiki/items/{item_id}
    const item = items[0]
    const detailRes = await req.getWikiData('wiki_item_detail', { id: item.item_id })
    if (!detailRes || detailRes.code !== 0 || !detailRes.data) {
      await this.reply(getMessage('strategy.detail_failed', { name: item.name || item.item_id }))
        return true
      }

    // 兼容 data 直接为条目 或 data.item 为条目；兼容 snake_case / camelCase
    const data = detailRes.data?.item || detailRes.data
    const itemName = data.name || item.name || '攻略'
    const rawContent = data.content || {}
    const documentMap = rawContent.document_map || rawContent.documentMap || data.document?.documentMap || {}
    const widgetCommonMap = rawContent.widget_common_map || rawContent.widgetCommonMap || data.widgetCommonMap || {}

    const wikiParts = []

    // 有 widget_common_map 时按作者分条；若该作者是「文字+图片」则单独发一次合并转发
    const authorMessages = this.buildMessagesByAuthors(widgetCommonMap, documentMap, seg)
    if (authorMessages.length > 0) {
      for (const { parts, hasTextAndImage } of authorMessages) {
        if (hasTextAndImage) {
          // 文字+图片的作者：单独发一个合并转发（仅此作者一条）
          const singleForward = common.makeForwardMsg(this.e, [parts], itemName)
          await this.e.reply(singleForward)
        } else {
          wikiParts.push(parts)
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
        wikiParts.push(parts)
      } else {
        wikiParts.push([text + (data.cover ? '（暂无正文图片）' : '暂无内容')])
        if (data.cover && seg?.image) {
          wikiParts.push([seg.image(data.cover)])
        }
      }
    }

    const userParts = []
    if (localImages.length > 0) {
      for (const img of localImages) {
        userParts.push(`【作者】${img.author}\n`)
        if (seg?.image) userParts.push(seg.image(`file://${img.path}`))
      }
    }
    const forwardMessages = userParts.length > 0 ? [userParts, ...wikiParts] : wikiParts

    if (forwardMessages.length > 0) {
      const forwardMsg = common.makeForwardMsg(this.e, forwardMessages, `${itemName}攻略`)
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
