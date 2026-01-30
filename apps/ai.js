import { rulePrefix, getMessage } from '../utils/common.js'
import setting from '../utils/setting.js'
import common from '../../../lib/common/common.js'

export class EndfieldAI extends plugin {
  constructor() {
    super({
      name: '[endfield-plugin]AI对话',
      dsc: '终末地AI对话',
      event: 'message',
      priority: 50,
      rule: [
        {
          reg: `^${rulePrefix}ai\\s+新(会|对)话\\s+(.+)$`,
          fnc: 'newChat'
        },
        {
          reg: `^${rulePrefix}ai\\s+(.+)$`,
          fnc: 'chat'
        }
      ]
    })

    this.config = setting.getConfig('ai')
    this.common_setting = setting.getConfig('common')
    this.apiBase = this.config?.api_base || 'https://endfield.prts.chat/api'
    this.appId = this.config?.app_id || '7cfe4336-8700-11f0-a3dd-02aa71c293e1'
    this.bearerToken = this.config?.bearer_token || ''
  }

  buildHeaders() {
    return {
      'accept': 'application/json, text/plain, */*',
      'accept-language': 'zh-CN,zh;q=0.9',
      'authorization': `Bearer ${this.bearerToken}`,
      'priority': 'u=1, i',
      'referer': 'https://endfield.prts.chat/',
      'sec-ch-ua': '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'content-type': 'application/json',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'
    }
  }

  checkConfig() {
    if (!this.bearerToken) {
      return { valid: false, msg: 'AI功能未配置，请在 config/ai.yaml 中设置 bearer_token' }
    }
    if (!this.appId) {
      return { valid: false, msg: 'AI功能未配置，请在 config/ai.yaml 中设置 app_id' }
    }
    return { valid: true }
  }

  async getOrCreateSession(userId) {
    const cachedChatId = await redis.get(`ENDFIELD:AI:CHAT:${userId}`)
    if (cachedChatId) {
      const isValid = await this.validateSession(cachedChatId)
      if (isValid) return cachedChatId
      await redis.del(`ENDFIELD:AI:CHAT:${userId}`)
    }
    return await this.createNewSession(userId)
  }

  async createNewSession(userId) {
    try {
      const openUrl = `${this.apiBase}/chat/open?app_id=${this.appId}`
      
      const response = await fetch(openUrl, {
        method: 'GET',
        headers: this.buildHeaders(),
        timeout: 10000
      })

      if (!response.ok) {
        const errorText = await response.text()
        logger.error(`[终末地AI]创建会话HTTP错误: ${response.status}, 响应: ${errorText}`)
        throw new Error(`创建会话失败: ${response.status} - ${errorText}`)
      }

      const data = await response.json()
      let chatId = null
      if (data.data) {
        if (typeof data.data === 'string') chatId = data.data
        else if (typeof data.data === 'object') chatId = data.data.id || data.data.chat_id || data.data.chatId
      }
      if (!chatId) chatId = data.id || data.chat_id || data.chatId

      if (!chatId) {
        logger.error(`[终末地AI]未找到会话ID字段，响应结构: ${JSON.stringify(data)}`)
        throw new Error(`未获取到会话ID，响应: ${JSON.stringify(data)}`)
      }

      await redis.set(`ENDFIELD:AI:CHAT:${userId}`, chatId)

      return chatId
    } catch (error) {
      logger.error(`[终末地AI]创建会话失败: ${error.message || error}`)
      if (error.stack) {
        logger.error(`[终末地AI]错误堆栈: ${error.stack}`)
      }
      return null
    }
  }

  async validateSession(chatId) {
    try {
      const historyUrl = `${this.apiBase}/chat_history/${chatId}?app_id=${this.appId}`
      const response = await fetch(historyUrl, {
        method: 'GET',
        headers: this.buildHeaders(),
        timeout: 5000
      })

      return response.ok
    } catch {
      return false
    }
  }

  async newChat() {
    const configCheck = this.checkConfig()
    if (!configCheck.valid) {
      await this.reply(configCheck.msg)
      return true
    }

    const message = this.e.msg.replace(new RegExp(`^${rulePrefix}ai\\s+新(会|对)话\\s+`), '').trim()

    if (!message) {
      await this.reply(getMessage('ai.provide_content_new', { prefix: this.getCmdPrefix() }))
      return true
    }

    const userId = String(this.e.user_id)

    await redis.del(`ENDFIELD:AI:CHAT:${userId}`)
    const chatId = await this.createNewSession(userId)

    if (!chatId) {
      await this.reply(getMessage('ai.create_new_failed'))
      return true
    }

    return await this.sendMessage(chatId, message)
  }

  async chat() {
    const configCheck = this.checkConfig()
    if (!configCheck.valid) {
      await this.reply(configCheck.msg)
      return true
    }

    const message = this.e.msg.replace(new RegExp(`^${rulePrefix}ai\\s+`), '').trim()

    if (!message) {
      await this.reply(getMessage('ai.provide_content', { prefix: this.getCmdPrefix() }))
      return true
    }

    const userId = String(this.e.user_id)

    const chatId = await this.getOrCreateSession(userId)

    if (!chatId) {
      await this.reply(getMessage('ai.create_failed'))
      return true
    }

    return await this.sendMessage(chatId, message)
  }

  async sendMessage(chatId, message) {
    try {
      const messageUrl = `${this.apiBase}/chat_message/${chatId}`
      const response = await fetch(messageUrl, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify({
          message: message,
          stream: true,
          chat_id: chatId,
          form_data: {}
        }),
        timeout: (this.config?.stream_timeout || 60) * 1000
      })

      if (!response.ok) {
        throw new Error(`发送消息失败: ${response.status}`)
      }

      const fullResponse = await this.handleStreamResponse(response)

      if (!fullResponse || !fullResponse.trim()) {
        await this.reply(getMessage('ai.empty_response'))
        return true
      }

      const formattedContent = this.formatContent(fullResponse)
      const messages = this.splitContent(formattedContent, 2000)

      if (messages.length === 0) {
        await this.reply(getMessage('ai.empty_response'))
        return true
      }

      const forwardMsg = common.makeForwardMsg(this.e, messages, '终末地AI回复')
      await this.e.reply(forwardMsg)

      return true
    } catch (error) {
      logger.error(`[终末地AI]发送消息失败: ${error}`)
      await this.reply(getMessage('ai.request_failed', { error: error.message }))
      return true
    }
  }

  async handleStreamResponse(response) {
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let fullContent = ''
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        buffer += chunk

        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim()
            if (data === '[DONE]') return fullContent
            try {
              const parsed = JSON.parse(data)
              if (parsed.content) fullContent += parsed.content
            } catch (e) {}
          }
        }
      }
      return fullContent
    } catch (error) {
      logger.error(`[终末地AI]处理流式响应失败: ${error}`)
      return fullContent
    } finally {
      reader.releaseLock()
    }
  }

  formatContent(content) {
    if (!content) return content
    let formatted = content
    formatted = formatted.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    formatted = formatted.replace(/([^\n])\n(###+ )/g, '$1\n\n$2')
    formatted = formatted.replace(/(###+ .+)\n([^\n#])/g, '$1\n\n$2')
    formatted = formatted.replace(/([^\n-*])\n([-*] )/g, '$1\n\n$2')
    formatted = formatted.replace(/([-*] .+)\n([^\n-*#])/g, '$1\n\n$2')
    const lines = formatted.split('\n')
    const processedLines = []
    let inList = false
    let inTitle = false
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const prevLine = lines[i - 1] || ''
      const nextLine = lines[i + 1] || ''
      const isEmpty = !line.trim()
      if (isEmpty) {
        if (processedLines.length > 0 && processedLines[processedLines.length - 1] === '') {
          continue
        }
        processedLines.push('')
        inList = false
        inTitle = false
        continue
      }
      if (line.match(/^###+ /)) {
        if (prevLine.trim() && !prevLine.match(/^###+ /)) {
          processedLines.push('')
        }
        processedLines.push(line)
        inTitle = true
        inList = false
        if (nextLine.trim() && !nextLine.match(/^[-*] /)) {
          processedLines.push('')
        }
        continue
      }
      if (line.match(/^[-*] /)) {
        if (!inList && prevLine.trim() && !prevLine.match(/^[-*] /)) {
          processedLines.push('')
        }
        processedLines.push(line)
        inList = true
        inTitle = false
        if (nextLine.trim() && !nextLine.match(/^[-*] /) && !nextLine.match(/^###+ /)) {
          processedLines.push('')
          inList = false
        }
        continue
      }
      if (inList || inTitle) {
        if (processedLines.length > 0 && processedLines[processedLines.length - 1] !== '') {
          processedLines.push('')
        }
        inList = false
        inTitle = false
      }
      
      processedLines.push(line)
      if (nextLine.match(/^###+ /) || (nextLine.match(/^[-*] /) && !line.match(/^[-*] /))) {
        processedLines.push('')
      }
    }
    
    formatted = processedLines.join('\n')
    formatted = formatted.replace(/\n{3,}/g, '\n\n').trim()

    return formatted
  }

  splitContent(content, maxLength = 2000) {
    if (!content) return []
    
    const messages = []
    let currentIndex = 0

    while (currentIndex < content.length) {
      let segment = content.slice(currentIndex, currentIndex + maxLength)
      if (currentIndex + maxLength < content.length) {
        const lastPunctuation = Math.max(
          segment.lastIndexOf('。'),
          segment.lastIndexOf('！'),
          segment.lastIndexOf('？'),
          segment.lastIndexOf('\n')
        )
        
        if (lastPunctuation > maxLength * 0.5) {
          segment = segment.slice(0, lastPunctuation + 1)
          currentIndex += lastPunctuation + 1
        } else {
          currentIndex += maxLength
        }
      } else {
        currentIndex = content.length
      }

      if (segment.trim()) {
        messages.push([segment])
      }
    }

    return messages
  }

  getCmdPrefix() {
    const mode = Number(this.common_setting?.prefix_mode) || 1
    return mode === 2 ? '#zmd' : ':'
  }
}
