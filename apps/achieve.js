import { getUnbindMessage, getMessage } from '../utils/common.js'
import EndfieldUser from '../model/endfieldUser.js'
import common from '../../../lib/common/common.js'
import { getCopyright } from '../utils/copyright.js'

export class EndfieldAchieve extends plugin {
  constructor() {
    super({
      name: '[endfield-plugin]成就',
      dsc: '终末地成就列表',
      event: 'message',
      priority: 50,
      rule: [
        {
          reg: '^(?:[:：]|[/#](?:zmd|终末地))成就列表$',
          fnc: 'getAchieve'
        }
      ]
    })
  }

  async getAchieve() {
    const userId = this.e.at || this.e.user_id
    const sklUser = new EndfieldUser(userId)

    if (!await sklUser.getUser()) {
      await this.reply(getUnbindMessage())
      return true
    }

    await this.reply(getMessage('achieve.loading'))

    try {
      const roleId = String(sklUser.endfield_uid || '')
      const serverId = Number(sklUser.server_id || 1)
      const res = await sklUser.sklReq.getData('achieve', { roleId, serverId })
      if (!res || res.code !== 0) {
        logger.error(`[终末地成就]获取失败: ${JSON.stringify(res)}`)
        await this.reply(getMessage('achieve.get_failed'))
        return true
      }
      const data = res.data || {}

      const role = data?.role || {}
      const achieve = data?.achieve || {}
      const medals = this.buildAllMedals(achieve)
      const categories = this.groupByCategory(medals)

      if (!medals.length) {
        await this.reply(getMessage('achieve.not_found_info'))
        return true
      }

      if (this.e?.runtime?.render) {
        try {
          const pluResPath = this.e?.runtime?.path?.plugin?.['endfield-plugin']?.res || ''
          const columns = 3
          const rows = categories.reduce((sum, group) => sum + Math.max(1, Math.ceil(group.items.length / columns)), 0)
          const headerHeight = categories.length * 34
          const viewportHeight = 240 + rows * 120 + headerHeight + 80
          const renderData = {
            title: getMessage('achieve.title'),
            role: {
              name: role.name || getMessage('common.unknown'),
              roleId: role.roleId || getMessage('common.unknown'),
              level: role.level ?? 0,
              serverId: role.serverId ?? 1
            },
            count: achieve.count ?? medals.length,
            categories,
            pluResPath,
            ...getCopyright()
          }
          const baseOpt = { scale: 1.6, retType: 'base64', viewport: { width: 720, height: viewportHeight } }
          const imgSegment = await this.e.runtime.render('endfield-plugin', 'achieve/achieve', renderData, baseOpt)
          if (imgSegment) {
            await this.reply(imgSegment)
            return true
          }
        } catch (err) {
          logger.error(`[终末地成就]渲染图失败: ${err?.message || err}`)
        }
      }

      const lines = categories.flatMap((group) => {
        const header = `【${group.cateName}】(${group.items.length})`
        const items = group.items.map((m, idx) => {
          const plated = m.isPlated ? '（镀层）' : ''
          const level = m.level ? ` Lv.${m.level}` : ''
          return `${idx + 1}. ${m.name}${level}${plated}`
        })
        return [header, ...items, '']
      })
      if (lines.length && lines[lines.length - 1] === '') lines.pop()
      const msg = [
        getMessage('achieve.text_header', { name: role.name || getMessage('common.unknown') }),
        ...lines
      ].join('\n')
      const segments = this.splitContent(msg, 2000)
      const forwardMsg = common.makeForwardMsg(this.e, segments, getMessage('achieve.title'))
      await this.e.reply(forwardMsg)
      return true
    } catch (error) {
      logger.error(`[终末地成就]查询失败: ${error}`)
      await this.reply(getMessage('common.query_failed', { error: error.message }))
      return true
    }
  }

  buildAllMedals(achieve) {
    const achieveMedals = Array.isArray(achieve?.achieveMedals) ? achieve.achieveMedals : []
    const medalsSource = achieveMedals
      .slice()
      .sort((a, b) => Number(b?.obtainTs || 0) - Number(a?.obtainTs || 0))

    return medalsSource.map((item) => {
      const data = item?.achievementData || {}
      const level = Number(item?.level ?? data.initLevel ?? 0)
      const isPlated = !!item?.isPlated
      const icon = (level >= 3 && data.reforge3Icon)
        || (level >= 2 && data.reforge2Icon)
        || (isPlated && data.platedIcon)
        || data.initIcon
        || ''
      return {
        id: data.id || '',
        name: data.name || '',
        cate: data.cate || '',
        cateName: data.cateName || '',
        icon,
        isPlated,
        level: Number.isFinite(level) ? level : 0,
        levelClass: Number.isFinite(level) ? `level-${Math.max(1, Math.min(3, Number(level)))}` : ''
      }
    })
  }

  groupByCategory(medals) {
    const columns = 3
    const order = [
      'achv_type_quest',
      'achv_type_battle',
      'achv_type_factory',
      'achv_type_growth',
      'achv_type_adventure',
      'achv_type_social',
      'achv_type_hide'
    ]
    const orderMap = new Map(order.map((c, i) => [c, i]))
    const groups = new Map()

    for (const medal of medals) {
      const cateName = medal.cateName || '未分类'
      const cate = medal.cate || ''
      const key = cateName
      if (!groups.has(key)) {
        groups.set(key, { cateName, cate, items: [] })
      }
      groups.get(key).items.push(medal)
    }

    const result = Array.from(groups.values())
    for (const group of result) {
      group.items.sort((a, b) => {
        const lv = (b.level || 0) - (a.level || 0)
        if (lv !== 0) return lv
        return String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN')
      })
      // 如果最后一行只剩 2 个卡片，让它们各占 1.5 列
      if (columns > 1 && group.items.length % columns === 2) {
        const a = group.items[group.items.length - 2]
        const b = group.items[group.items.length - 1]
        if (a) a.spanHalf = true
        if (b) b.spanHalf = true
      }
    }

    result.sort((a, b) => {
      const ia = orderMap.has(a.cate) ? orderMap.get(a.cate) : 999
      const ib = orderMap.has(b.cate) ? orderMap.get(b.cate) : 999
      if (ia !== ib) return ia - ib
      return String(a.cateName || '').localeCompare(String(b.cateName || ''), 'zh-CN')
    })

    return result
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
}
