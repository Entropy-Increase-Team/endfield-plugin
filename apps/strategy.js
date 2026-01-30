import { rulePrefix, getMessage } from '../utils/common.js'
import setting from '../utils/setting.js'
import common from '../../../lib/common/common.js'
import EndfieldUser from '../model/endfieldUser.js'
import EndfieldRequest from '../model/endfieldReq.js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export class EndfieldStrategy extends plugin {
  constructor() {
    super({
      name: '[endfield-plugin]攻略查询',
      dsc: '终末地攻略查询与资源管理',
      event: 'message',
      priority: 50,
      rule: [
        {
          reg: `^${rulePrefix}(.+?)攻略$`,
          fnc: 'queryStrategy'
        },
        {
          reg: `^${rulePrefix}攻略资源(下载|(强制)?更新)$`,
          fnc: 'downloadOrUpdateResources'
        },
        {
          reg: `^${rulePrefix}攻略上传\\s+(.+)$`,
          fnc: 'uploadStrategy'
        },
        {
          reg: `^${rulePrefix}攻略上传干员\\s+(.+)$`,
          fnc: 'receiveCharacterName'
        },
        {
          reg: `^${rulePrefix}攻略删除\\s+(.+)$`,
          fnc: 'deleteStrategy'
        }
      ]
    })

    this.common_setting = setting.getConfig('common')
    this.strategyDir = path.resolve(__dirname, '..', 'data', 'strategyimg')
    this.indexFile = path.join(this.strategyDir, 'index.json')
    this.characterNamesCache = null
  }

  async queryStrategy() {
    const strategyName = this.getStrategyName()
    if (!strategyName) {
      const prefix = this.getCmdPrefix()
      await this.reply(getMessage('strategy.provide_name', { prefix }))
      return true
    }

    if (!fs.existsSync(this.indexFile)) {
      await this.reply(getMessage('strategy.not_downloaded'))
      return true
    }

    try {
      const index = this.loadIndex()
      const strategies = this.findAllStrategies(index, strategyName)

      if (strategies.length === 0) {
        await this.reply(`${getMessage('strategy.not_found', { name: strategyName })}\n可用攻略列表：\n${this.getStrategyList(index)}`)
        return true
      }

      if (strategies.length === 1) {
        await this.sendStrategyImages(strategies[0])
        return true
      }

      const forwardMessages = []
      const seg = global.segment || (await import('oicq')).segment

      for (let i = 0; i < strategies.length; i++) {
        const strategy = strategies[i]
        const images = strategy.images || []
        
        if (images.length === 0) {
          forwardMessages.push([`[${i + 1}/${strategies.length}] ${strategy.title}\n⚠️ 该攻略没有图片`])
          continue
        }

        let infoMsg = `[${i + 1}/${strategies.length}] 标题：${strategy.title}\n`
        
        let authorName = strategy.author?.name || ''
        if (!authorName || authorName === '未知作者') {
          if (strategy.url) {
            authorName = await this.getAuthorFromUrl(strategy.url)
          }
        }
        
        if (authorName && authorName !== '未知作者') {
          infoMsg += `作者：${authorName}\n`
        }
        if (strategy.url) {
          infoMsg += `来源：${strategy.url}`
        }

        const base = this.strategyDir
        const availableImages = []

        for (const img of images) {
          const candidates = []

          if (img.relativePath && typeof img.relativePath === 'string') {
            const rp = img.relativePath.replace(/\\/g, '/')
            const parts = rp.split('/').filter(p => p)
            candidates.push(path.join(base, ...parts))
          }
          
          if (strategy.characterName && img.filename) {
            candidates.push(path.join(base, strategy.characterName, img.filename))
          }
          
          if (img.filename && candidates.length === 0) {
            candidates.push(path.join(base, img.filename))
          }

          let found = null
          for (const candidate of candidates) {
            const normalized = path.normalize(candidate)
            if (fs.existsSync(normalized)) {
              found = normalized
              break
            }
          }
          
          if (found) {
            availableImages.push(found)
          }
        }

        if (availableImages.length > 0) {
          const firstImagePath = availableImages[0]
          if (fs.existsSync(firstImagePath)) {
            try {
              // 检测文件格式，如果是 AVIF 则跳过（QQ 不支持）
              const { fileTypeFromFile } = await import('file-type')
              const fileType = await fileTypeFromFile(firstImagePath)
              if (fileType && fileType.mime === 'image/avif') {
                logger.warn(`[终末地攻略]跳过 AVIF 格式图片（QQ 不支持）: ${firstImagePath}`)
                forwardMessages.push([infoMsg + '\n⚠️ 图片格式不支持显示'])
              } else {
                const imageSeg = seg.image(firstImagePath)
                forwardMessages.push([infoMsg, imageSeg])
                
                for (let j = 1; j < availableImages.length; j++) {
                  const imgPath = availableImages[j]
                  if (fs.existsSync(imgPath)) {
                    const imgType = await fileTypeFromFile(imgPath)
                    if (imgType && imgType.mime === 'image/avif') {
                      logger.warn(`[终末地攻略]跳过 AVIF 格式图片（QQ 不支持）: ${imgPath}`)
                    } else {
                      forwardMessages.push([seg.image(imgPath)])
                    }
                  }
                }
              }
            } catch (error) {
              logger.error(`[终末地攻略]创建图片segment失败: ${error}`)
              forwardMessages.push([infoMsg])
            }
          } else {
            forwardMessages.push([infoMsg])
          }
        } else {
          forwardMessages.push([infoMsg])
        }
      }

      const characterName = strategies[0].characterName || '其他'
      const forwardMsg = common.makeForwardMsg(this.e, forwardMessages, `${characterName} - 攻略列表 - 共${strategies.length}个`)
      await this.e.reply(forwardMsg)
      return true
    } catch (error) {
      logger.error(`[终末地攻略]查询失败: ${error}`)
      await this.reply(getMessage('strategy.query_failed', { error: error.message }))
      return true
    }
  }

  /**
   * 从 GitHub 下载资源
   */
  async downloadOrUpdateResources() {
    const msg = this.e.msg || ''
    const isDownload = msg.includes('下载')
    const isForce = msg.includes('强制')

    if (isDownload) {
      await this.reply(getMessage('strategy.download_github'))
    } else {
      if (!fs.existsSync(this.indexFile)) {
        await this.reply(getMessage('strategy.not_downloaded'))
        return true
      }
      await this.reply(getMessage('strategy.update_github'))
    }

    const forwardMessages = []
    const startMsg = isDownload 
      ? getMessage('strategy.download_start')
      : (isForce ? '开始强制更新攻略资源...' : '开始检查攻略资源更新...')
    forwardMessages.push([startMsg])

    try {
      if (!fs.existsSync(this.strategyDir)) {
        fs.mkdirSync(this.strategyDir, { recursive: true })
      }

      const githubRepo = 'Entropy-Increase-Team/Endfield-Resource'
      
      let indexData = null

      try {
        forwardMessages.push(['正在从 GitHub 下载 index.json...'])
        indexData = await this.downloadFromGitHub(githubRepo, 'index.json')
      } catch (error) {
        logger.error(`[终末地攻略]GitHub 下载失败: ${error.message}`)
        forwardMessages.push(['GitHub 下载失败，请检查网络连接'])
        await this.e.reply(common.makeForwardMsg(this.e, forwardMessages, '攻略资源下载'))
        return true
      }

      if (!indexData || !indexData.strategies) {
        forwardMessages.push(['下载的 index.json 格式错误'])
        await this.e.reply(common.makeForwardMsg(this.e, forwardMessages, '攻略资源下载'))
        return true
      }

      forwardMessages.push([`成功从 GitHub 下载索引文件，共 ${indexData.strategies.length} 个攻略`])
      forwardMessages.push(['开始下载图片文件...'])

      let oldIndex = null
      if (!isDownload) {
        oldIndex = this.loadIndex()
      }

      const strategiesToProcess = isDownload || isForce
        ? indexData.strategies
        : (() => {
            const oldIds = new Set((oldIndex?.strategies || []).map(s => s.id))
            return indexData.strategies.filter(s => !oldIds.has(s.id))
          })()

      if (strategiesToProcess.length === 0 && !isDownload && !isForce) {
        const noNewMsg = getMessage('strategy.update_no_new')
        forwardMessages.push([noNewMsg])
        await this.e.reply(common.makeForwardMsg(this.e, forwardMessages, '攻略资源更新'))
        return true
      }

      let successCount = 0
      let failCount = 0

      for (let i = 0; i < strategiesToProcess.length; i++) {
        const strategy = strategiesToProcess[i]
        try {
          let downloadedCount = 0
          
          for (const img of strategy.images || []) {
            try {
              const relativePath = img.relativePath || `${strategy.characterName || '其他'}/${img.filename}`
              const localPath = path.join(this.strategyDir, relativePath)
              
              if (fs.existsSync(localPath) && !isForce) {
                downloadedCount++
                continue
              }

              const imageUrl = this.getImageUrlFromRepo(githubRepo, relativePath)
              if (imageUrl) {
                const response = await fetch(imageUrl, {
                  headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Referer': 'https://github.com/'
                  }
                })
                
                if (response.ok) {
                  const characterDir = path.dirname(localPath)
                  if (!fs.existsSync(characterDir)) {
                    fs.mkdirSync(characterDir, { recursive: true })
                  }
                  fs.writeFileSync(localPath, Buffer.from(await response.arrayBuffer()))
                  downloadedCount++
                }
              }
            } catch (error) {
              logger.warn(`[终末地攻略]下载图片失败 ${img.filename}: ${error.message}`)
            }
          }

          if (downloadedCount > 0) {
            successCount++
            const charName = strategy.characterName || '其他'
            const action = isDownload ? '下载' : '更新'
            forwardMessages.push([`[${i + 1}/${strategiesToProcess.length}] ✓ ${strategy.title} - ${action} ${downloadedCount} 张图片 (${charName})`])
          } else {
            failCount++
            forwardMessages.push([`[${i + 1}/${strategiesToProcess.length}] ✗ ${strategy.title} - 未下载到图片`])
          }
        } catch (error) {
          logger.error(`[终末地攻略]处理攻略失败 ${strategy.title}: ${error}`)
          failCount++
          forwardMessages.push([`[${i + 1}/${strategiesToProcess.length}] ✗ ${strategy.title} - 处理失败：${error.message}`])
        }
      }

      const finalIndex = isDownload || isForce
        ? indexData
        : {
            ...indexData,
            strategies: [
              ...(oldIndex?.strategies || []).filter(s => {
                const newIds = new Set(strategiesToProcess.map(s => s.id))
                return !newIds.has(s.id)
              }),
              ...strategiesToProcess
            ]
          }

      finalIndex.version = Date.now()
      finalIndex.updatedAt = new Date().toISOString()
      fs.writeFileSync(this.indexFile, JSON.stringify(finalIndex, null, 2), 'utf-8')

      const completeMsg = isDownload
        ? getMessage('strategy.download_complete', { success: successCount, fail: failCount })
        : getMessage('strategy.update_complete', { message: isForce ? '已强制更新所有攻略' : `已更新 ${successCount} 个新攻略` })
      forwardMessages.push([completeMsg])

      const actionName = isDownload ? '下载' : (isForce ? '强制更新' : '更新')
      await this.e.reply(common.makeForwardMsg(this.e, forwardMessages, `攻略资源${actionName} - 共${strategiesToProcess.length}个攻略`))
      return true
    } catch (error) {
      logger.error(`[终末地攻略]${isDownload ? '下载' : '更新'}失败: ${error}`)
      forwardMessages.push([isDownload 
        ? getMessage('strategy.download_failed', { error: error.message })
        : getMessage('strategy.update_failed', { error: error.message })])
      await this.e.reply(common.makeForwardMsg(this.e, forwardMessages, isDownload ? '攻略资源下载' : '攻略资源更新'))
      return true
    }
  }

  /**
   * 从消息中提取攻略名称
   */
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

  /**
   * 加载攻略索引
   */
  loadIndex() {
    try {
      const content = fs.readFileSync(this.indexFile, 'utf-8')
      return JSON.parse(content)
    } catch (error) {
      logger.error(`[终末地攻略]读取索引失败: ${error}`)
      return { strategies: [] }
    }
  }

  /**
   * 查找所有匹配的攻略（精确匹配优先，然后模糊匹配）
   * 支持匹配 title 和 characterName 字段，支持多种匹配方式
   */
  findAllStrategies(index, name) {
    const strategies = index.strategies || []
    if (strategies.length === 0) return []
    
    const normalizedName = name.trim().toLowerCase()
    if (!normalizedName) return []
    
    const results = []
    const matchedIds = new Set()
    
    const exact = strategies.filter(s => {
      const title = (s.title || '').trim().toLowerCase()
      return title === normalizedName
    })
    if (exact.length > 0) {
      exact.forEach(s => {
        if (!matchedIds.has(s.id)) {
          results.push(s)
          matchedIds.add(s.id)
        }
      })
      return results
    }

    const contains = strategies.filter(s => {
      const title = (s.title || '').trim().toLowerCase()
      const characterName = (s.characterName || '').trim().toLowerCase()
      return title.includes(normalizedName) || characterName.includes(normalizedName)
    })
    if (contains.length > 0) {
      contains.forEach(s => {
        if (!matchedIds.has(s.id)) {
          results.push(s)
          matchedIds.add(s.id)
        }
      })
      return results
    }

    const nameOnly = normalizedName.replace(/[一图流攻略，。、\s]+/g, '')
    if (nameOnly.length >= 2) {
      const nameMatches = strategies.filter(s => {
        const title = (s.title || '').trim().toLowerCase()
        const characterName = (s.characterName || '').trim().toLowerCase()
        const cleanTitle = title.replace(/[一图流攻略，。、\s]+/g, '')
        const cleanCharacterName = characterName.replace(/[一图流攻略，。、\s]+/g, '')
        return cleanTitle.includes(nameOnly) || nameOnly.includes(cleanTitle) || 
               cleanCharacterName.includes(nameOnly) || nameOnly.includes(cleanCharacterName)
      })
      nameMatches.forEach(s => {
        if (!matchedIds.has(s.id)) {
          results.push(s)
          matchedIds.add(s.id)
        }
      })
      if (results.length > 0) return results
    }

    const keywords = normalizedName.split(/[，。、\s]+/).filter(k => k.length >= 2)
    if (keywords.length > 0) {
      const keywordMatches = strategies.filter(s => {
        const title = (s.title || '').trim().toLowerCase()
        const characterName = (s.characterName || '').trim().toLowerCase()
        return keywords.every(keyword => title.includes(keyword) || characterName.includes(keyword))
      })
      keywordMatches.forEach(s => {
        if (!matchedIds.has(s.id)) {
          results.push(s)
          matchedIds.add(s.id)
        }
      })
      if (results.length > 0) return results
    }

    const fuzzy = strategies.filter(s => {
      const title = (s.title || '').trim().toLowerCase()
      const characterName = (s.characterName || '').trim().toLowerCase()
      const nameChars = normalizedName.split('').filter(c => c.trim() && c !== ' ')
      if (nameChars.length === 0) return false
      const titleMatchedChars = nameChars.filter(char => title.includes(char)).length
      const charMatchedChars = nameChars.filter(char => characterName.includes(char)).length
      return titleMatchedChars >= Math.ceil(nameChars.length * 0.8) || 
             charMatchedChars >= Math.ceil(nameChars.length * 0.8)
    })
    fuzzy.forEach(s => {
      if (!matchedIds.has(s.id)) {
        results.push(s)
        matchedIds.add(s.id)
      }
    })

    return results
  }

  /**
   * 获取攻略列表（用于提示）
   */
  getStrategyList(index) {
    const strategies = index.strategies || []
    const characterNames = [...new Set(strategies.map(s => s.characterName || '其他').filter(name => name))].sort()
    const list = characterNames.map(name => `  • ${name}`).join('\n')
    return list || '  暂无攻略'
  }

  /**
   * 获取命令前缀
   */
  getCmdPrefix() {
    const mode = Number(this.common_setting?.prefix_mode) || 1
    return mode === 2 ? '#zmd' : ':'
  }

  /**
   * 发送攻略图片（使用合并转发消息）
   */
  async sendStrategyImages(strategy) {
    const images = strategy.images || []
    if (images.length === 0) {
      await this.reply(getMessage('strategy.no_images', { title: strategy.title }))
      return
    }

    const seg = global.segment || (await import('oicq')).segment
    const forwardMessages = []

    let infoMsg = `标题：${strategy.title}\n`
    
    let authorName = strategy.author?.name || ''
    if (!authorName || authorName === '未知作者') {
      if (strategy.url) {
        authorName = await this.getAuthorFromUrl(strategy.url)
      }
    }
    
    if (authorName && authorName !== '未知作者') {
      infoMsg += `作者：${authorName}\n`
    }
    if (strategy.url) {
      infoMsg += `来源：${strategy.url}`
    }

    const base = this.strategyDir
    const availableImages = []

    logger.mark(`[终末地攻略]strategyDir: ${base}`)
    logger.mark(`[终末地攻略]base目录存在: ${fs.existsSync(base)}`)

    for (const img of images) {
      const candidates = []

      if (img.relativePath && typeof img.relativePath === 'string') {
        const rp = img.relativePath.replace(/\\/g, '/')
        const parts = rp.split('/').filter(p => p)
        const candidate1 = path.join(base, ...parts)
        candidates.push(candidate1)
      }
      
      if (strategy.characterName && img.filename) {
        const candidate2 = path.join(base, strategy.characterName, img.filename)
        candidates.push(candidate2)
      }
      
      if (img.filename && candidates.length === 0) {
        const candidate3 = path.join(base, img.filename)
        candidates.push(candidate3)
      }

      let found = null
      for (const candidate of candidates) {
        const normalized = path.normalize(candidate)
        const exists = fs.existsSync(normalized)
        logger.mark(`[终末地攻略]检查路径: ${normalized} -> ${exists ? '存在' : '不存在'}`)
        if (exists) {
          found = normalized
          break
        }
      }
      
      if (found) {
        availableImages.push(found)
        logger.mark(`[终末地攻略]找到图片: ${found}`)
      } else if (candidates.length > 0) {
        logger.warn(`[终末地攻略]图片不存在，已尝试: ${candidates.map(p => path.normalize(p)).join(' ; ')}`)
      }
    }
    
    logger.mark(`[终末地攻略]共找到 ${availableImages.length} 张可用图片`)

    if (availableImages.length > 0) {
      const firstImagePath = availableImages[0]
      logger.mark(`[终末地攻略]准备发送第一张图片: ${firstImagePath}`)
      
      if (!fs.existsSync(firstImagePath)) {
        logger.error(`[终末地攻略]图片文件在发送前消失: ${firstImagePath}`)
        forwardMessages.push([infoMsg])
      } else {
        try {
          const imageSeg = seg.image(firstImagePath)
          logger.mark(`[终末地攻略]图片segment创建成功: ${imageSeg ? '是' : '否'}`)
          forwardMessages.push([infoMsg, imageSeg])
          
          for (let i = 1; i < availableImages.length; i++) {
            const imgPath = availableImages[i]
            if (fs.existsSync(imgPath)) {
              forwardMessages.push([seg.image(imgPath)])
            }
          }
        } catch (error) {
          logger.error(`[终末地攻略]创建图片segment失败: ${error}`)
          forwardMessages.push([infoMsg])
        }
      }
    } else {
      forwardMessages.push([infoMsg])
    }

    logger.mark(`[终末地攻略]forwardMessages数量: ${forwardMessages.length}`)
    if (forwardMessages.length > 0) {
      logger.mark(`[终末地攻略]第一条消息内容: ${JSON.stringify(forwardMessages[0])}`)
    }

    if (forwardMessages.length > 1) {
      const characterName = strategy.characterName || '其他'
      const imageCount = images.length
      const forwardMsg = common.makeForwardMsg(this.e, forwardMessages, `${characterName} - 攻略图 - ${imageCount} 张`)
      await this.e.reply(forwardMsg)
    } else if (forwardMessages.length === 1) {
      const firstMsg = forwardMessages[0]
      const hasImage = Array.isArray(firstMsg) && firstMsg.length > 1 && firstMsg.some(item => item && typeof item === 'object' && item.type === 'image')
      
      if (hasImage) {
        const characterName = strategy.characterName || '其他'
        const imageCount = images.length
        const forwardMsg = common.makeForwardMsg(this.e, forwardMessages, `${characterName} - 攻略图 - ${imageCount} 张`)
        await this.e.reply(forwardMsg)
      } else {
        await this.reply(infoMsg)
        await this.reply(getMessage('strategy.redownload_hint'))
      }
    } else {
        await this.reply(getMessage('strategy.no_available_images', { title: strategy.title }))
    }
  }

  /**
   * 获取HTML内容
   */
  async fetchHtml(url) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://www.bilibili.com/'
        }
      })

      if (!response.ok) {
        logger.error(`[终末地攻略]获取HTML失败: ${response.status} ${response.statusText}`)
        return null
      }

      return await response.text()
    } catch (error) {
      logger.error(`[终末地攻略]fetchHtml错误: ${error}`)
      return null
    }
  }

  /**
   * 解析导航页中的攻略链接（包含作者信息）
   */
  parseGuideLinks(html) {
    const links = []
    const linkRegex = /<a[^>]*href="([^"]*\/opus\/(\d+))"[^>]*>([\s\S]*?)<\/a>/gi
    let match
    
    while ((match = linkRegex.exec(html)) !== null) {
      const cardHtml = match[3]
      const url = match[1].startsWith('http') ? match[1] : `https://www.bilibili.com${match[1]}`
      const id = match[2]
      
      const titleMatch = cardHtml.match(/<div[^>]*class="[^"]*opus-title[^"]*"[^>]*>([^<]+)<\/div>/i)
      const title = titleMatch ? titleMatch[1].trim() : ''
      
      if (!id || !title) continue
      
      let author = '未知作者'
      
      const authorMatch = cardHtml.match(/<span[^>]*class="[^"]*opus-author[^"]*"[^>]*>([^<]+)<\/span>/i)
      if (authorMatch) {
        author = authorMatch[1].trim().replace(/\u200B/g, '')
      }
      
      if (author === '未知作者') {
        const footerMatch = cardHtml.match(/<div[^>]*class="[^"]*opus-footer[^"]*"[^>]*>([^<]+)<\/div>/i)
        if (footerMatch) {
          const footer = footerMatch[1].trim()
          const authorFromFooter = this.extractAuthorFromFooter(footer)
          if (authorFromFooter) {
            author = authorFromFooter
          }
        }
      }
      
      links.push({
        id,
        url,
        title,
        author: {
          name: author
        }
      })
    }

    if (links.length === 0) {
      const looseRegex = /\/opus\/(\d+)/g
      const titleRegex = /opus-title[^>]*>([^<]+)</g
      const urlMatches = [...html.matchAll(looseRegex)]
      const titleMatches = [...html.matchAll(titleRegex)]
      
      for (let i = 0; i < Math.min(urlMatches.length, titleMatches.length); i++) {
        const id = urlMatches[i][1]
        const title = titleMatches[i][1].trim()
        if (id && title) {
          links.push({
            id,
            url: `https://www.bilibili.com/opus/${id}`,
            title,
            author: {
              name: '未知作者'
            }
          })
        }
      }
    }

    return links
  }

  /**
   * 从footer文本中提取作者信息
   */
  extractAuthorFromFooter(footerText) {
    if (!footerText) return null
    
    const parts = footerText.split('·')
    if (parts.length > 0) {
      let authorPart = parts[0].trim()
      authorPart = authorPart.replace(/^发布于\s*/, '').trim()
      if (!authorPart.includes('小站') && !authorPart.includes('社区') && authorPart.length > 0) {
        return authorPart
      }
    }
    return null
  }

  /**
   * 处理单个攻略页面
   * @param {object} link 攻略链接信息
   * @param {boolean} force 是否强制重新下载图片
   */
  async processGuidePage(link, force = false) {
    const guideHtml = await this.fetchHtml(link.url)
    if (!guideHtml) {
      logger.error(`[终末地攻略]获取攻略页失败: ${link.url}`)
      return null
    }

    let author = (link.author && link.author.name) ? link.author : { name: '未知作者' }
    const pageAuthor = this.extractAuthorFromPage(guideHtml)
    if (pageAuthor && pageAuthor.name && pageAuthor.name !== '未知作者' && pageAuthor.name.trim()) {
      author = pageAuthor
    }
    link.author = author

    const characterName = await this.extractCharacterName(link.title)
    const images = this.extractImages(guideHtml)
    
    if (images.length === 0) {
      return {
        id: link.id,
        title: link.title,
        url: link.url,
        author: author,
        characterName: characterName,
        images: [],
        crawledAt: new Date().toISOString()
      }
    }

    const downloadedImages = []
    for (const image of images) {
      try {
        const downloaded = await this.downloadImage(image, link, characterName, force)
        if (downloaded) {
          downloadedImages.push(downloaded)
        }
      } catch (error) {
        logger.error(`[终末地攻略]下载图片失败 ${image.url}: ${error}`)
      }
    }

    return {
      id: link.id,
      title: link.title,
      url: link.url,
      author: author,
      characterName: characterName,
      images: downloadedImages,
      crawledAt: new Date().toISOString()
    }
  }

  /**
   * 从攻略页面提取作者信息
   */
  extractAuthorFromPage(html) {
    try {
      const authorRegex = /<div[^>]*class="[^"]*opus-module-author__name[^"]*"[^>]*>([^<]+)<\/div>/i
      const authorMatch = html.match(authorRegex)
      if (authorMatch) {
        return {
          name: authorMatch[1].trim().replace(/\u200B/g, '')
        }
      }
      
      const atRegex = /<a[^>]*class="[^"]*opus-text-rich-hl\s+at[^"]*"[^>]*>@([^<\u200B]+)/i
      const atMatch = html.match(atRegex)
      if (atMatch) {
        const authorName = atMatch[1].trim().replace(/\u200B/g, '')
        if (authorName && !authorName.includes('尝试自律的酣睡猪')) {
          return {
            name: authorName
          }
        }
      }
      
      const userRegex = /<div[^>]*class="[^"]*user-name[^"]*"[^>]*>([^<]+)<\/div>/i
      const userMatch = html.match(userRegex)
      if (userMatch) {
        return {
          name: userMatch[1].trim().replace(/\u200B/g, '')
        }
      }
    } catch (error) {
      logger.error(`[终末地攻略]提取作者信息失败: ${error}`)
    }
    
    return null
  }

  /**
   * 提取攻略页中的图片
   */
  extractImages(html) {
    const images = []
    const imgRegex = /src="([^"]*\/bfs\/new_dyn\/[^"]*\.png(@1192w)?)"/gi
    let match
    
    while ((match = imgRegex.exec(html)) !== null) {
      const url = match[1].startsWith('http') ? match[1] : `https:${match[1]}`
      const imgIdMatch = url.match(/\/([a-f0-9]{32})\.png/)
      const imgId = imgIdMatch ? imgIdMatch[1] : `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      
      if (!images.find(img => img.id === imgId)) {
        images.push({
          id: imgId,
          url: url,
          filename: `${imgId}.png`,
          size: url.includes('@1192w') ? '1192w' : 'other'
        })
      }
    }

    return images
  }

  /**
   * 下载图片
   * @param {object} image 图片信息
   * @param {object} guideInfo 攻略信息
   * @param {string} characterName 角色名
   * @param {boolean} force 是否强制重新下载
   */
  async downloadImage(image, guideInfo, characterName, force = false) {
    try {
      const characterDir = path.join(this.strategyDir, characterName || '其他')
      if (!fs.existsSync(characterDir)) {
        fs.mkdirSync(characterDir, { recursive: true })
      }

      const authorName = (guideInfo.author && guideInfo.author.name) ? guideInfo.author.name.replace(/[^\w\u4e00-\u9fa5]/g, '_') : '未知作者'
      const safeCharacterName = (characterName || '其他').replace(/[^\w\u4e00-\u9fa5]/g, '_')
      const filename = `${safeCharacterName}_${authorName}_${image.id}.png`
      const filePath = path.join(characterDir, filename)
      
      const relativePath = `${characterName || '其他'}/${filename}`.replace(/\\/g, '/')
      if (fs.existsSync(filePath) && !force) {
        return {
          id: image.id,
          filename: filename,
          relativePath: relativePath,
          url: image.url,
          size: image.size
        }
      }

      const response = await fetch(image.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://www.bilibili.com/'
        }
      })
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      fs.writeFileSync(filePath, Buffer.from(await response.arrayBuffer()))
      
      return {
        id: image.id,
        filename: filename,
        relativePath: relativePath,
        url: image.url,
        size: image.size
      }
    } catch (error) {
      logger.error(`[终末地攻略]下载图片失败: ${image.url}`, error)
      return null
    }
  }


  /**
   * 从标题中提取角色名
   */
  async extractCharacterName(title) {
    const characterNames = await this.getCharacterNames()
    
    if (characterNames && characterNames.length > 0) {
      for (const charName of characterNames) {
        if (title.includes(charName)) {
          return charName
        }
      }
    }

    const commonNames = [
      '管理员', '别礼', '艾尔黛拉', '莱万汀', '骏卫', '黎风', '余烬', 
      '洁尔佩塔', '伊冯', '塞希', '秋栗', '本管'
    ]
    
    for (const name of commonNames) {
      if (title.includes(name)) {
        return name === '本管' ? '管理员' : name
      }
    }

    return '其他'
  }

  /**
   * 获取角色名列表（从API或缓存）
   */
  async getCharacterNames() {
    if (this.characterNamesCache) return this.characterNamesCache

    try {
      const userId = this.e?.user_id || 0
      const sklUser = new EndfieldUser(userId)
      
      if (await sklUser.getUser()) {
        const req = new EndfieldRequest(0, sklUser.cred, '')
        const data = await req.getData('endfield_search_chars')
        
        if (data?.code === 0 && data.data?.chars) {
          const names = data.data.chars.map(char => char.name).filter(Boolean)
          this.characterNamesCache = names
          return names
        }
      }
    } catch (error) {
      logger.warn(`[终末地攻略]获取角色列表失败: ${error}`)
    }

    return null
  }

  /**
   * 从 B站链接获取作者信息和标题
   * @param {string} url B站链接
   * @returns {Promise<{author: string, title: string}>} 作者名称和标题
   */
  async getAuthorAndTitleFromUrl(url) {
    try {
      let aid = null
      let bvid = null
      
      const bvMatch = url.match(/BV[a-zA-Z0-9]+/i)
      if (bvMatch) {
        bvid = bvMatch[0]
      }
      
      const avMatch = url.match(/av(\d+)/i)
      if (avMatch) {
        aid = avMatch[1]
      }
      
      if (!aid && !bvid) {
        return { author: '未知作者', title: '' }
      }
      
      let apiUrl = ''
      if (bvid) {
        apiUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`
      } else if (aid) {
        apiUrl = `https://api.bilibili.com/x/web-interface/view?aid=${aid}`
      }
      
      if (!apiUrl) {
        return { author: '未知作者', title: '' }
      }
      
      const response = await fetch(apiUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://www.bilibili.com/'
        }
      })
      
      if (!response.ok) {
        return { author: '未知作者', title: '' }
      }
      
      const data = await response.json()
      if (data?.code !== 0 || !data?.data) {
        return { author: '未知作者', title: '' }
      }

      const title = data.data.title || ''
      let authors = []
      
      if (data.data.staff && Array.isArray(data.data.staff) && data.data.staff.length > 0) {
        authors = data.data.staff.map(staff => staff.name).filter(Boolean)
      }
      
      if (authors.length === 0 && data.data.owner?.name) {
        authors = [data.data.owner.name]
      }
      
      const author = authors.length > 0 ? authors.join('、') : '未知作者'
      
      return { author, title }
    } catch (error) {
      logger.warn(`[终末地攻略]从链接获取信息失败: ${error}`)
      return { author: '未知作者', title: '' }
    }
  }

  /**
   * 从 B站链接获取作者信息（兼容旧方法）
   * @param {string} url B站链接
   * @returns {Promise<string>} 作者名称
   */
  async getAuthorFromUrl(url) {
    const result = await this.getAuthorAndTitleFromUrl(url)
    return result.author
  }

  /**
   * 上传攻略
   * 格式：:攻略上传 [干员名称（可选）] [标题（可选）] [作者（可选）] [链接] [图片链接]
   */
  async uploadStrategy() {
    if (!this.e.isMaster) {
      await this.reply(getMessage('strategy.admin_only'))
      return true
    }

    let imageUrl = null
    let imageBuffer = null
    
    const imageMsg = this.e.message?.find(m => m.type === 'image')
    if (imageMsg) {
      try {
        const imgUrl = imageMsg.url || imageMsg.file
        if (imgUrl) {
          const response = await fetch(imgUrl)
          if (response.ok) {
            imageBuffer = await response.arrayBuffer()
            imageUrl = imgUrl
          }
        }
      } catch (error) {
        logger.warn(`[终末地攻略]提取消息图片失败: ${error}`)
      }
    }

    const prefix = this.getCmdPrefix()
    const msg = this.e.msg.trim()
    const content = msg.replace(new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}攻略上传\\s*`), '').trim()
    
    const urlMatch = content.match(/https?:\/\/[^\s]+/)
    if (!urlMatch) {
      await this.reply(getMessage('strategy.upload_format_error'))
      return true
    }
    
    const url = urlMatch[0]
    const urlIndex = content.indexOf(url)
    
    const afterUrl = content.substring(urlIndex + url.length).trim()
    const imageUrlMatch = afterUrl.match(/https?:\/\/[^\s]+/)
    const imageUrlFromText = imageUrlMatch ? imageUrlMatch[0] : null
    
    const beforeUrl = content.substring(0, urlIndex).trim()
    const parts = beforeUrl.split(/\s+/).filter(p => p)
    
    let characterName = parts[0] || ''
    let title = parts[1] || ''
    let author = parts[2] || ''
    
    if (!characterName) {
      if (!title) {
        const urlInfo = await this.getAuthorAndTitleFromUrl(url)
        title = urlInfo.title
      }
      
      if (title) {
        characterName = await this.extractCharacterName(title)
      }
      
      if (!characterName || characterName === '其他') {
        const cacheData = {
          url,
          imageUrl: imageUrl || imageUrlFromText,
          title,
          author
        }
        
        if (imageBuffer) {
          cacheData.imageBuffer = Buffer.from(imageBuffer).toString('base64')
        }
        
        await redis.set(`ENDFIELD:UPLOAD_STRATEGY:${this.e.user_id}`, JSON.stringify(cacheData), { EX: 300 })
        
        await this.reply(getMessage('strategy.upload_need_character'))
        this.setContext('receiveCharacterName')
        return true
      }
    }

    if (!imageUrl && imageUrlFromText) {
      imageUrl = imageUrlFromText
    }

    if (!imageUrl) {
      await this.reply(getMessage('strategy.upload_need_image'))
      return true
    }

    if (!imageBuffer && imageUrl) {
      try {
        const response = await fetch(imageUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://www.bilibili.com/'
          }
        })
        if (response.ok) {
          imageBuffer = await response.arrayBuffer()
        }
      } catch (error) {
        logger.warn(`[终末地攻略]下载图片失败: ${error}`)
      }
    }

    try {
      if (!imageBuffer) {
        await this.reply(getMessage('strategy.image_download_failed'))
        return true
      }

      // 加载现有索引
      const index = this.loadIndex()

      // 链接允许重复；检查图片链接是否已存在（图片链接不可重复）
      const allImageUrls = new Set()
      for (const s of index.strategies || []) {
        for (const img of s.images || []) {
          if (img.url) allImageUrls.add(img.url)
        }
      }
      if (allImageUrls.has(imageUrl)) {
        await this.reply(getMessage('strategy.image_exists'))
        return true
      }

      let finalTitle = title
      let finalAuthor = author
      
      if (!finalTitle || finalTitle.trim() === '' || !finalAuthor || finalAuthor.trim() === '') {
        const urlInfo = await this.getAuthorAndTitleFromUrl(url)
        if (!finalTitle || finalTitle.trim() === '') {
          finalTitle = urlInfo.title
        }
        if (!finalAuthor || finalAuthor.trim() === '') {
          finalAuthor = urlInfo.author
        }
      }
      
      if (!finalTitle || finalTitle.trim() === '') {
        await this.reply(getMessage('strategy.upload_need_title'))
        return true
      }
      const imageId = `${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
      const safeCharacterName = (characterName || '其他').replace(/[^\w\u4e00-\u9fa5]/g, '_')
      const safeAuthorName = (finalAuthor || '未知作者').replace(/[^\w\u4e00-\u9fa5]/g, '_')
      const filename = `${safeCharacterName}_${safeAuthorName}_${imageId}.png`
      
      const characterDir = path.join(this.strategyDir, characterName || '其他')
      if (!fs.existsSync(characterDir)) {
        fs.mkdirSync(characterDir, { recursive: true })
      }

      const filePath = path.join(characterDir, filename)
      fs.writeFileSync(filePath, Buffer.from(imageBuffer))

      // 创建攻略对象
      const newStrategy = {
        id: url.match(/\d+$/)?.[0] || Date.now().toString(),
        title: finalTitle,
        url: url,
        author: {
          name: finalAuthor || '未知作者'
        },
        characterName: characterName || '其他',
        images: [
          {
            id: imageId,
            filename: filename,
            relativePath: `${characterName || '其他'}/${filename}`,
            url: imageUrl,
            size: 'unknown'
          }
        ],
        crawledAt: new Date().toISOString()
      }

      // 添加到索引
      index.strategies.push(newStrategy)
      index.version = Date.now()
      index.updatedAt = new Date().toISOString()

      // 保存索引
      fs.writeFileSync(this.indexFile, JSON.stringify(index, null, 2), 'utf-8')

      await this.reply(getMessage('strategy.upload_success', { characterName, finalTitle, finalAuthor: finalAuthor || '未知作者' }))
      return true
    } catch (error) {
      logger.error(`[终末地攻略]上传失败: ${error}`)
      await this.reply(getMessage('strategy.upload_failed', { error: error.message }))
      return true
    }
  }

  /**
   * 接收用户输入的干员名称（用于上传攻略时）
   */
  async receiveCharacterName() {
    if (!this.e.isMaster) {
      await this.reply(getMessage('strategy.admin_only'))
      return true
    }

    const cacheText = await redis.get(`ENDFIELD:UPLOAD_STRATEGY:${this.e.user_id}`)
    if (!cacheText) {
      await this.reply(getMessage('strategy.upload_expired'))
      this.finish('receiveCharacterName')
      return true
    }

    try {
      const cache = JSON.parse(cacheText)
      const { url, imageUrl, title, author, imageBuffer: imageBufferBase64 } = cache

      const prefix = this.getCmdPrefix()
      const msg = this.e.msg.trim()
      let characterName = ''
      
      if (msg.startsWith(prefix + '攻略上传干员')) {
        characterName = msg.replace(new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}攻略上传干员\\s*`), '').trim()
      } else {
        characterName = msg.trim()
      }

      if (!characterName) {
        await this.reply(getMessage('strategy.upload_character_example'))
        return true
      }

      let imageBuffer = null
      if (imageBufferBase64) {
        imageBuffer = Buffer.from(imageBufferBase64, 'base64')
      } else if (imageUrl) {
        try {
          const response = await fetch(imageUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Referer': 'https://www.bilibili.com/'
            }
          })
          if (response.ok) {
            imageBuffer = await response.arrayBuffer()
          }
        } catch (error) {
          logger.warn(`[终末地攻略]下载图片失败: ${error}`)
        }
      }

      if (!imageBuffer) {
        await this.reply(getMessage('strategy.image_download_failed'))
        await redis.del(`ENDFIELD:UPLOAD_STRATEGY:${this.e.user_id}`)
        this.finish('receiveCharacterName')
        return true
      }

      // 加载现有索引
      const index = this.loadIndex()

      // 链接允许重复；检查图片链接是否已存在（图片链接不可重复）
      const allImageUrls = new Set()
      for (const s of index.strategies || []) {
        for (const img of s.images || []) {
          if (img.url) allImageUrls.add(img.url)
        }
      }
      if (imageUrl && allImageUrls.has(imageUrl)) {
        await this.reply(getMessage('strategy.image_exists'))
        await redis.del(`ENDFIELD:UPLOAD_STRATEGY:${this.e.user_id}`)
        this.finish('receiveCharacterName')
        return true
      }

      let finalTitle = title
      let finalAuthor = author
      
      if (!finalTitle || finalTitle.trim() === '' || !finalAuthor || finalAuthor.trim() === '') {
        const urlInfo = await this.getAuthorAndTitleFromUrl(url)
        if (!finalTitle || finalTitle.trim() === '') {
          finalTitle = urlInfo.title
        }
        if (!finalAuthor || finalAuthor.trim() === '') {
          finalAuthor = urlInfo.author
        }
      }
      
      if (!finalTitle || finalTitle.trim() === '') {
        await this.reply(getMessage('strategy.upload_need_title'))
        await redis.del(`ENDFIELD:UPLOAD_STRATEGY:${this.e.user_id}`)
        this.finish('receiveCharacterName')
        return true
      }

      const imageId = `${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
      const safeCharacterName = (characterName || '其他').replace(/[^\w\u4e00-\u9fa5]/g, '_')
      const safeAuthorName = (finalAuthor || '未知作者').replace(/[^\w\u4e00-\u9fa5]/g, '_')
      const filename = `${safeCharacterName}_${safeAuthorName}_${imageId}.png`
      
      const characterDir = path.join(this.strategyDir, characterName || '其他')
      if (!fs.existsSync(characterDir)) {
        fs.mkdirSync(characterDir, { recursive: true })
      }

      const filePath = path.join(characterDir, filename)
      fs.writeFileSync(filePath, Buffer.from(imageBuffer))

      // 创建攻略对象
      const newStrategy = {
        id: url.match(/\d+$/)?.[0] || Date.now().toString(),
        title: finalTitle,
        url: url,
        author: {
          name: finalAuthor || '未知作者'
        },
        characterName: characterName || '其他',
        images: [
          {
            id: imageId,
            filename: filename,
            relativePath: `${characterName || '其他'}/${filename}`,
            url: imageUrl,
            size: 'unknown'
          }
        ],
        crawledAt: new Date().toISOString()
      }

      index.strategies.push(newStrategy)
      index.version = Date.now()
      index.updatedAt = new Date().toISOString()
      fs.writeFileSync(this.indexFile, JSON.stringify(index, null, 2), 'utf-8')

      await redis.del(`ENDFIELD:UPLOAD_STRATEGY:${this.e.user_id}`)
      this.finish('receiveCharacterName')

      await this.reply(getMessage('strategy.upload_success', { characterName, finalTitle, finalAuthor: finalAuthor || '未知作者' }))
      return true
    } catch (error) {
      logger.error(`[终末地攻略]上传失败: ${error}`)
      await this.reply(getMessage('strategy.upload_failed', { error: error.message }))
      await redis.del(`ENDFIELD:UPLOAD_STRATEGY:${this.e.user_id}`)
      this.finish('receiveCharacterName')
      return true
    }
  }

  /**
   * 删除攻略
   * 格式：:攻略删除 [链接]
   */
  async deleteStrategy() {
    if (!this.e.isMaster) {
      await this.reply(getMessage('strategy.admin_only'))
      return true
    }

    const prefix = this.getCmdPrefix()
    const msg = this.e.msg.trim()
    const content = msg.replace(new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}攻略删除\\s*`), '').trim()
    
    const urlMatch = content.match(/https?:\/\/[^\s]+/)
    const url = urlMatch ? urlMatch[0] : null
    
    if (!url) {
      await this.reply(getMessage('strategy.delete_format_error'))
      return true
    }

    try {
      const index = this.loadIndex()
      const strategyIndex = index.strategies.findIndex(s => s.url === url)
      
      if (strategyIndex < 0) {
        await this.reply(getMessage('strategy.delete_not_found'))
        return true
      }

      const strategy = index.strategies[strategyIndex]

      for (const img of strategy.images || []) {
        if (img.relativePath) {
          const imgPath = path.join(this.strategyDir, img.relativePath)
          if (fs.existsSync(imgPath)) {
            fs.unlinkSync(imgPath)
          }
        }
      }

      index.strategies.splice(strategyIndex, 1)
      index.version = Date.now()
      index.updatedAt = new Date().toISOString()
      fs.writeFileSync(this.indexFile, JSON.stringify(index, null, 2), 'utf-8')

      await this.reply(getMessage('strategy.delete_success', { title: strategy.title }))
      return true
    } catch (error) {
      logger.error(`[终末地攻略]删除失败: ${error}`)
      await this.reply(getMessage('strategy.delete_failed', { error: error.message }))
      return true
    }
  }

  /**
   * 从 GitHub 下载文件
   */
  async downloadFromGitHub(repo, filePath) {
    const apiUrl = `https://api.github.com/repos/${repo}/contents/${filePath}`
    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/vnd.github.v3.raw'
      }
    })

    if (!response.ok) {
      throw new Error(`GitHub API 错误: ${response.status} ${response.statusText}`)
    }

    const text = await response.text()
    try {
      return JSON.parse(text)
    } catch (error) {
      throw new Error(`解析 JSON 失败: ${error.message}`)
    }
  }

  /**
   * 获取图片文件的下载 URL
   */
  getImageUrlFromRepo(githubRepo, relativePath) {
    return `https://raw.githubusercontent.com/${githubRepo}/main/${relativePath}`
  }

}
