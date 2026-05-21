import { getUnbindMessage, getMessage } from '../utils/common.js'
import EndfieldUser from '../model/endfieldUser.js'
import common from '../../../lib/common/common.js'
import { getCopyright } from '../utils/copyright.js'

const UNKNOWN = '未知'

export class EndfieldIndieHard extends plugin {
  constructor() {
    super({
      name: '[endfield-plugin]影拓丰碑',
      dsc: '终末地影拓丰碑数据',
      event: 'message',
      priority: 50,
      rule: [
        {
          reg: '^(?:[:：]|[/#](?:zmd|终末地))影拓丰碑\\s*(.*)$',
          fnc: 'getIndieHard'
        }
      ]
    })
  }

  async getIndieHard() {
    const keyword = this.getKeyword()
    const userId = this.e.at || this.e.user_id
    const sklUser = new EndfieldUser(userId)

    if (!await sklUser.getUser()) {
      await this.reply(getUnbindMessage())
      return true
    }

    await this.reply(getMessage('indie_hard.loading'))

    try {
      const roleId = String(sklUser.endfield_uid || '')
      const serverId = Number(sklUser.server_id || 1)
      const [res, cardDetailRes] = await Promise.all([
        sklUser.sklReq.getData('indie_hard', { roleId, serverId }),
        sklUser.sklReq.getData('endfield_card_detail', { roleId, serverId }).catch(() => null)
      ])
      if (!res || res.code !== 0) {
        logger.error(`[终末地影拓丰碑]获取失败: ${JSON.stringify(res)}`)
        await this.reply(getMessage('indie_hard.get_failed'))
        return true
      }
      const charNameMap = this.buildCharNameMap(cardDetailRes)

      const groups = Array.isArray(res?.data?.indieHard?.indieHardGroups)
        ? res.data.indieHard.indieHardGroups
        : []
      if (!groups.length) {
        await this.reply(getMessage('indie_hard.not_found_info'))
        return true
      }

      const matchedGroups = keyword
        ? groups.filter((group) => this.matchGroup(group, keyword))
        : groups
      if (!matchedGroups.length) {
        await this.reply(getMessage('indie_hard.no_match', { keyword }))
        return true
      }

      const renderedMessages = await this.renderGroupMessages(matchedGroups, charNameMap, cardDetailRes)
      const messages = renderedMessages.length
        ? renderedMessages.map((img) => [img])
        : matchedGroups.map((group, index) => [this.formatGroup(group, index, matchedGroups.length, charNameMap)])
      const forwardMsg = common.makeForwardMsg(this.e, messages)
      await this.e.reply(forwardMsg)
      return true
    } catch (error) {
      logger.error(`[终末地影拓丰碑]查询失败: ${error}`)
      await this.reply(getMessage('common.query_failed', { error: error.message }))
      return true
    }
  }

  async renderGroupMessages(groups, charNameMap, cardDetailRes) {
    if (!this.e?.runtime?.render) return []
    const rendered = []
    const role = this.buildRoleInfo(cardDetailRes)
    const pluResPath = this.e?.runtime?.path?.plugin?.['endfield-plugin']?.res || ''

    for (let i = 0; i < groups.length; i++) {
      try {
        const renderData = {
          title: '影拓丰碑',
          role,
          group: this.buildRenderGroup(groups[i], i, groups.length, charNameMap),
          pluResPath,
          ...getCopyright()
        }
        const img = await this.e.runtime.render('endfield-plugin', 'indie-hard/indie-hard', renderData, {
          scale: 1.4,
          retType: 'base64',
          viewport: { width: 1040 }
        })
        if (!img) return []
        rendered.push(img)
      } catch (err) {
        logger.error(`[终末地影拓丰碑]渲染图失败: ${err?.message || err}`)
        return []
      }
    }
    return rendered
  }

  buildRoleInfo(cardDetailRes) {
    const base = cardDetailRes?.data?.detail?.base || {}
    return {
      name: base.name || UNKNOWN,
      roleId: base.roleId || base.role_id || UNKNOWN,
      level: base.level ?? 0,
      avatarUrl: base.avatarUrl || base.avatar_url || ''
    }
  }

  buildCharNameMap(cardDetailRes) {
    const map = {}
    if (cardDetailRes?.code !== 0) return map
    const detailChars = cardDetailRes?.data?.detail?.chars || []
    if (!Array.isArray(detailChars)) return map
    for (const char of detailChars) {
      const c = char?.charData || char || {}
      const id = String(char?.id || char?.instId || c?.id || c?.charId || '').trim()
      const name = String(c?.name || char?.name || c?.template?.name_cn || char?.template?.name_cn || '').trim()
      if (id && name) map[id] = name
    }
    return map
  }

  buildRenderGroup(group, index, total, charNameMap = {}) {
    const achievement = group?.achieve || {}
    const achievementData = achievement?.achievementData || {}
    const dungeons = Array.isArray(group?.dungeonGroups) ? group.dungeonGroups : []
    const normalPass = dungeons.filter((item) => item?.normalDungeon?.isPass).length
    const hardPass = dungeons.filter((item) => item?.hardDungeon?.isPass).length

    return {
      index: index + 1,
      total,
      name: group?.name || group?.activityName || UNKNOWN,
      activityName: group?.activityName || UNKNOWN,
      isInActivity: !!group?.isInActivity,
      pic: group?.pic || '',
      timeRange: this.formatRange(group?.activityStartTs, group?.activityEndTs),
      achievement: {
        name: achievementData?.name || UNKNOWN,
        icon: achievement?.isPlated ? (achievementData?.platedIcon || achievementData?.initIcon || '') : (achievementData?.initIcon || ''),
        status: this.formatAchievement(achievement),
        isPlated: !!achievement?.isPlated,
        level: Number(achievement?.level || 0)
      },
      progress: {
        normalPass,
        hardPass,
        total: dungeons.length,
        normalPercent: this.percent(normalPass, dungeons.length),
        hardPercent: this.percent(hardPass, dungeons.length)
      },
      dungeons: dungeons.map((item, idx) => this.buildRenderDungeonGroup(item, idx, charNameMap))
    }
  }

  buildRenderDungeonGroup(item, index, charNameMap = {}) {
    const normal = item?.normalDungeon || {}
    const hard = item?.hardDungeon || {}
    return {
      index: index + 1,
      name: normal?.name || hard?.name || UNKNOWN,
      desc: normal?.desc || hard?.desc || '',
      normal: this.buildRenderDungeon('普通', normal, charNameMap),
      hard: this.buildRenderDungeon('苦难', hard, charNameMap)
    }
  }

  buildRenderDungeon(label, dungeon, charNameMap = {}) {
    const best = dungeon?.bestRecord ? this.formatBestRecord(dungeon.bestRecord, charNameMap) : null
    return {
      label,
      name: dungeon?.name || UNKNOWN,
      isPass: !!dungeon?.isPass,
      status: dungeon?.isPass ? '已通关' : '未通关',
      recommendLevel: dungeon?.recommendLevel ?? UNKNOWN,
      bestSummary: best?.summary || '无记录',
      team: best?.team || [],
      hasRecord: !!best,
      featureText: this.featureText(dungeon?.feature || ''),
      enemies: this.buildRenderEnemies(dungeon?.enemies)
    }
  }

  buildRenderEnemies(enemies) {
    if (!Array.isArray(enemies) || !enemies.length) return []
    return enemies.slice(0, 5).map((enemy) => ({
      name: enemy?.name || UNKNOWN,
      level: enemy?.level ?? '?',
      imageUrl: enemy?.imageUrl || '',
      ability: this.cleanRichText(enemy?.ability || '')
    }))
  }

  getKeyword() {
    return String(this.e?.msg || '')
      .replace(/^(?:[:：]|[/#](?:zmd|终末地))影拓丰碑\s*/u, '')
      .trim()
  }

  matchGroup(group, keyword) {
    const key = this.normalizeText(keyword)
    if (!key) return true
    const texts = [
      group?.name,
      group?.activityName,
      group?.achieve?.achievementData?.name,
      ...(Array.isArray(group?.dungeonGroups)
        ? group.dungeonGroups.flatMap((item) => [
            item?.normalDungeon?.name,
            item?.hardDungeon?.name
          ])
        : [])
    ]
    return texts.some((text) => this.normalizeText(text).includes(key))
  }

  normalizeText(text) {
    return String(text || '')
      .replace(/[“”"']/g, '')
      .replace(/\s+/g, '')
      .toLowerCase()
  }

  cleanRichText(text) {
    return String(text || '')
      .replace(/<@[^>]+>/g, '')
      .replace(/<\/>/g, '')
      .trim()
  }

  featureLines(text) {
    return this.cleanRichText(text)
      .split(/\n+/)
      .map((line) => line.replace(/^\s*-\s*/, '').trim())
      .filter(Boolean)
      .slice(0, 4)
  }

  featureText(text) {
    const lines = this.featureLines(text)
      .map((line) => line.replace(/[。；;，,、\s]+$/u, ''))
      .filter(Boolean)
    return lines.length ? `${lines.join('；')}。` : ''
  }

  formatGroup(group, index, total, charNameMap = {}) {
    const achievement = group?.achieve || {}
    const achievementData = achievement?.achievementData || {}
    const dungeons = Array.isArray(group?.dungeonGroups) ? group.dungeonGroups : []
    const normalPass = dungeons.filter((item) => item?.normalDungeon?.isPass).length
    const hardPass = dungeons.filter((item) => item?.hardDungeon?.isPass).length
    const titlePrefix = total > 1 ? `【影拓丰碑 ${index + 1}/${total}】` : '【影拓丰碑】'
    const lines = [
      `${titlePrefix}${group?.name || group?.activityName || UNKNOWN}`,
      `活动：${group?.activityName || UNKNOWN}${group?.isInActivity ? '（进行中）' : ''}`,
      `时间：${this.formatRange(group?.activityStartTs, group?.activityEndTs)}`,
      `奖章：${achievementData?.name || UNKNOWN}｜${this.formatAchievement(achievement)}`,
      `进度：普通 ${normalPass}/${dungeons.length}｜苦难 ${hardPass}/${dungeons.length}`,
      ''
    ]

    dungeons.forEach((item, idx) => {
      const normal = item?.normalDungeon || {}
      const hard = item?.hardDungeon || {}
      lines.push(`${idx + 1}. ${normal?.name || hard?.name || UNKNOWN}`)
      lines.push(...this.formatDungeonLines('普通', normal, charNameMap))
      lines.push(...this.formatDungeonLines('苦难', hard, charNameMap))
      lines.push(...this.formatEnemyLines(normal?.enemies || hard?.enemies))
      if (idx < dungeons.length - 1) lines.push('')
    })

    return lines.join('\n')
  }

  formatAchievement(achievement) {
    const level = Number(achievement?.level || 0)
    const obtainTs = Number(achievement?.obtainTs || 0)
    const plated = achievement?.isPlated ? '镀层' : '未镀层'
    if (level <= 0) return '未获得'
    const obtained = obtainTs > 0 ? `｜${this.formatDateTime(obtainTs)}` : ''
    return `Lv.${level}｜${plated}${obtained}`
  }

  formatDungeonLines(label, dungeon, charNameMap = {}) {
    if (!dungeon || typeof dungeon !== 'object') return [`   ${label}：暂无`]
    const pass = dungeon.isPass ? '已通关' : '未通关'
    const lines = [
      `   ${label}：${pass}｜推荐Lv.${dungeon.recommendLevel ?? UNKNOWN}`
    ]
    if (dungeon.bestRecord) {
      const best = this.formatBestRecord(dungeon.bestRecord, charNameMap)
      lines.push(`     最佳：${best.summary}`)
      if (best.team.length) {
        lines.push('     队伍：')
        for (const item of best.team) lines.push(`       - ${item.text || item}`)
      }
    } else {
      lines.push('     最佳：无记录')
    }
    return lines
  }

  formatBestRecord(record, charNameMap = {}) {
    const seconds = Number(record?.passTs || 0)
    const time = seconds > 0 ? this.formatDuration(seconds) : '耗时未知'
    const ts = Number(record?.ts || 0)
    const chars = Array.isArray(record?.chars) ? record.chars : []
    return {
      summary: ts > 0 ? `${time}｜${this.formatDateTime(ts)}` : time,
      team: this.formatTeam(chars, charNameMap)
    }
  }

  formatTeam(chars, charNameMap = {}) {
    return chars.slice(0, 4).map((char) => {
      const charId = String(char?.charId || char?.char_id || char?.id || '').trim()
      const name = charNameMap[charId] || ''
      const rarity = char?.rarity?.value ? `${char.rarity.value}星` : '?星'
      const property = char?.property?.value || UNKNOWN
      const level = char?.level != null ? `Lv.${char.level}` : 'Lv.?'
      const phase = char?.evolvePhase != null ? `精${char.evolvePhase}` : ''
      const text = `${name ? `${name} ` : ''}${rarity}${property}${level}${phase}`
      return {
        name: name || charId || UNKNOWN,
        text,
        avatarUrl: char?.avatarUrl || '',
        rarity: char?.rarity?.value || '?',
        property,
        level,
        phase
      }
    })
  }

  formatEnemyLines(enemies) {
    if (!Array.isArray(enemies) || !enemies.length) return []
    const lines = ['   敌人：']
    for (const enemy of enemies.slice(0, 5)) {
      lines.push(`     - ${enemy?.name || UNKNOWN} Lv.${enemy?.level ?? '?'}`)
    }
    if (enemies.length > 5) lines.push(`     - 另有 ${enemies.length - 5} 个敌人`)
    return lines
  }

  formatRange(startTs, endTs) {
    const start = Number(startTs || 0)
    const end = Number(endTs || 0)
    if (!start && !end) return '长期'
    if (start && !end) return `${this.formatDate(start)} 起`
    if (!start && end) return `至 ${this.formatDate(end)}`
    return `${this.formatDate(start)} ~ ${this.formatDate(end)}`
  }

  formatDateTime(ts) {
    return new Date(Number(ts) * 1000).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  formatDate(ts) {
    return new Date(Number(ts) * 1000).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })
  }

  formatDuration(seconds) {
    const sec = Math.max(0, Number(seconds) || 0)
    const min = Math.floor(sec / 60)
    const rest = sec % 60
    return min > 0 ? `${min}分${rest}秒` : `${rest}秒`
  }

  percent(value, total) {
    const max = Number(total) || 0
    if (max <= 0) return 0
    return Math.max(0, Math.min(100, Math.round((Number(value || 0) / max) * 100)))
  }
}
