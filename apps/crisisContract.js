import { getUnbindMessage, getMessage } from '../utils/common.js'
import EndfieldUser from '../model/endfieldUser.js'
import common from '../../../lib/common/common.js'
import { getCopyright } from '../utils/copyright.js'
import {
  buildCrisisRenderData,
  extractContracts,
  extractCrisisPayload,
  formatCrisisText,
  pickContract
} from '../model/crisisContractFormatter.js'

export class EndfieldCrisisContract extends plugin {
  constructor() {
    super({
      name: '[endfield-plugin]危机合约',
      dsc: '终末地危机合约详情',
      event: 'message',
      priority: 50,
      rule: [
        {
          reg: '^(?:[:：]|[/#](?:zmd|终末地))(?:危机合约|危机|合约)\\s*(.*)$',
          fnc: 'getCrisisContract'
        }
      ]
    })
  }

  async getCrisisContract() {
    const { debugResponse, indicatorOnly, queryKeyword } = this.parseKeyword(this.getKeyword())
    const userId = this.e.at || this.e.user_id
    const sklUser = new EndfieldUser(userId)

    if (!await sklUser.getUser()) {
      await this.reply(getUnbindMessage())
      return true
    }

    await this.reply(getMessage('crisis_contract.loading'))

    try {
      const roleId = String(sklUser.endfield_uid || '')
      const serverId = Number(sklUser.server_id || 1)
      const cardDetailRes = await sklUser.sklReq.getData('endfield_card_detail', { roleId, serverId })
      const contracts = extractContracts(cardDetailRes)
      const matched = pickContract(contracts, queryKeyword)
      const contract = matched || this.buildContractFromKeyword(queryKeyword)

      if (!contract?.id) {
        await this.reply(queryKeyword
          ? getMessage('crisis_contract.no_match', { keyword: queryKeyword })
          : getMessage('crisis_contract.not_found_info'))
        return true
      }

      const res = await sklUser.sklReq.getData('crisis_contract', {
        contractId: contract.id,
        roleId,
        serverId
      })
      const backendResponseText = this.formatBackendResponse(res)
      logger.info(`[终末地危机合约][后端响应] ${backendResponseText}`)
      if (debugResponse) await this.sendBackendResponse(backendResponseText)

      if (!res || res.code !== 0) {
        logger.error(`[终末地危机合约]获取失败: ${JSON.stringify(res)}`)
        await this.reply(getMessage('crisis_contract.get_failed'))
        return true
      }

      const crisis = extractCrisisPayload(res)
      if (!crisis || typeof crisis !== 'object') {
        await this.reply(getMessage('crisis_contract.not_found_info'))
        return true
      }

      const renderData = buildCrisisRenderData(crisis, contract, cardDetailRes, { indicatorOnly })
      const rendered = await this.renderCrisis(renderData)
      if (rendered) {
        await this.reply(rendered)
        return true
      }

      const text = formatCrisisText(renderData)
      if (text.length > 1800) {
        await this.e.reply(common.makeForwardMsg(this.e, this.splitContent(text), getMessage('crisis_contract.title')))
      } else {
        await this.reply(text)
      }
      return true
    } catch (error) {
      logger.error(`[终末地危机合约]查询失败: ${error}`)
      await this.reply(getMessage('common.query_failed', { error: error.message }))
      return true
    }
  }

  getKeyword() {
    return String(this.e?.msg || '')
      .replace(/^(?:[:：]|[/#](?:zmd|终末地))(?:危机合约|危机|合约)\s*/u, '')
      .trim()
  }

  buildContractFromKeyword(keyword) {
    const id = String(keyword || '').trim()
    return id ? { id, name: id } : null
  }

  parseKeyword(keyword) {
    const raw = String(keyword || '')
    const debugResponse = /(?:原始|响应|debug|调试)/i.test(raw)
    let query = raw.replace(/(?:原始|响应|debug|调试)/ig, ' ')
    const indicatorOnly = /(^|[\s　])(?:指标|词条)(?=$|[\s　])/u.test(query)
    query = query.replace(/(^|[\s　])(?:指标|词条)(?=$|[\s　])/gu, ' ')
    return {
      debugResponse,
      indicatorOnly,
      queryKeyword: query.replace(/\s+/g, ' ').trim()
    }
  }

  formatBackendResponse(res) {
    try {
      return JSON.stringify(res, null, 2)
    } catch (err) {
      return String(res ?? '')
    }
  }

  async sendBackendResponse(text) {
    const content = `【危机合约后端响应】\n${text || '空响应'}`
    if (content.length > 1800) {
      await this.e.reply(common.makeForwardMsg(this.e, this.splitContent(content), '危机合约后端响应'))
      return
    }
    await this.reply(content)
  }

  async renderCrisis(renderData) {
    if (!this.e?.runtime?.render) return null
    try {
      const pluResPath = this.e?.runtime?.path?.plugin?.['endfield-plugin']?.res || ''
      return await this.e.runtime.render('endfield-plugin', 'crisis-contract/crisis-contract', {
        ...renderData,
        pluResPath,
        ...getCopyright()
      }, {
        scale: 1.7,
        retType: 'base64',
        viewport: { width: 760 }
      })
    } catch (err) {
      logger.error(`[终末地危机合约]渲染图失败: ${err?.message || err}`)
      return null
    }
  }

  splitContent(content, maxLength = 1800) {
    const messages = []
    let currentIndex = 0
    while (currentIndex < content.length) {
      const segment = content.slice(currentIndex, currentIndex + maxLength)
      if (segment.trim()) messages.push([segment])
      currentIndex += maxLength
    }
    return messages
  }
}
