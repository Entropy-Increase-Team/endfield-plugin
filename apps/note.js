import { getUnbindMessage, getMessage } from '../utils/common.js'
import common from '../../../lib/common/common.js'
import EndfieldUser from '../model/endfieldUser.js'
import setting from '../utils/setting.js'

export class EndfieldNote extends plugin {
  constructor() {
    super({
      name: '[endfield-plugin]便签',
      dsc: '终末地角色便签',
      event: 'message',
      priority: 50,
      rule: [
        {
          reg: '^(?:[:：]|[/#](?:zmd|终末地))便签$',
          fnc: 'getNote'
        }
      ]
    })
    this.common_setting = setting.getConfig('common')
  }

  async getNote() {
    const userId = this.e.at || this.e.user_id
    const sklUser = new EndfieldUser(userId)

    if (!await sklUser.getUser()) {
      await this.reply(getUnbindMessage())
      return true
    }

    await this.reply(getMessage('note.loading'))

    try {
      const detailData = await this.fetchCharacterDetail(sklUser)
      if (!detailData) return true

      const { base, chars, serverName, charCount, achieve, bpSystem } = detailData

      // 渲染模板所需数据
      const unknown = getMessage('common.unknown')
      const createTimeStr = base.createTime ? new Date(parseInt(base.createTime) * 1000).toLocaleString('zh-CN') : unknown
      const lastLoginTimeStr = base.lastLoginTime ? new Date(parseInt(base.lastLoginTime) * 1000).toLocaleString('zh-CN') : unknown
      const mainMissionDesc = base.mainMission?.description || unknown
      const awakeningDateStr = base.createTime
        ? new Date(parseInt(base.createTime) * 1000).toISOString().slice(0, 10).replace(/-/g, '-')
        : ''
      // 干员：方形图 SqUrl + 仅显示 name
      const charsList = (chars || []).map((char) => ({
        name: char.name || unknown,
        sqUrl: char.avatarSqUrl || char.avatar_sq_url || ''
      }))
      const totalCharNum = base.charNum ?? charCount ?? charsList.length
      const placeholder = getMessage('note.placeholder')
      const achieveCount = Number.isFinite(Number(achieve?.count)) ? Number(achieve.count) : null
      const bpCur = Number.isFinite(Number(bpSystem?.curLevel)) ? Number(bpSystem.curLevel) : null
      const bpMax = Number.isFinite(Number(bpSystem?.maxLevel)) ? Number(bpSystem.maxLevel) : null

      if (this.e?.runtime?.render) {
        try {
          const pluResPath = this.e?.runtime?.path?.plugin?.['endfield-plugin']?.res || ''
          const pageWidth = 360
          const renderData = {
            title: getMessage('note.title'),
            subtitle: getMessage('note.subtitle', { name: base.name || unknown, server: serverName }),
            base: {
              name: base.name || unknown,
              roleId: base.roleId || unknown,
              level: base.level ?? 0,
              exp: base.exp ?? 0,
              worldLevel: base.worldLevel ?? 0,
              serverName,
              createTimeStr,
              lastLoginTimeStr,
              mainMissionDesc,
              avatarUrl: base.avatarUrl || '',
              awakeningDateStr
            },
            stats: {
              charNum: totalCharNum ?? 0,
              weaponNum: base.weaponNum ?? 0,
              docNum: base.docNum ?? 0,
              achieveCount: achieveCount ?? placeholder,
              bpCur: bpCur ?? placeholder,
              bpMax: bpMax ?? placeholder
            },
            achieve: {
              count: achieveCount ?? placeholder,
              medals: achieve?.medals || []
            },
            chars: charsList,
            pluResPath
          }
          const baseOpt = { scale: 1.6, retType: 'base64', viewport: { width: pageWidth, height: 1100 } }
          const imgSegment = await this.e.runtime.render('endfield-plugin', 'note/note', renderData, baseOpt)
          if (imgSegment) {
            await this.reply(imgSegment)
            return true
          }
        } catch (err) {
          logger.error(`[终末地便签]渲染图失败: ${err?.message || err}`)
        }
      }

      let msg = ''
      msg += getMessage('note.text_base', {
        name: base.name || unknown,
        role_id: base.roleId || unknown,
        level: base.level ?? 0,
        exp: base.exp ?? 0,
        world_level: base.worldLevel ?? 0,
        server: serverName,
        create_time: createTimeStr,
        last_login: lastLoginTimeStr,
        main_mission: mainMissionDesc
      })
      msg += '\n\n'
      msg += getMessage('note.text_stats', {
        char_num: totalCharNum || 0,
        weapon_num: base.weaponNum || 0,
        doc_num: base.docNum || 0,
        achieve_count: achieveCount ?? placeholder,
        bp_cur: bpCur ?? placeholder,
        bp_max: bpMax ?? placeholder
      })
      msg += '\n\n'
      msg += getMessage('note.text_owned_header', { count: charsList.length }) + '\n'
      if (charsList.length > 0) {
        for (const char of charsList) {
          msg += getMessage('note.text_owned_item', { name: char.name }) + '\n'
        }
      }

      const segments = this.splitContent(msg, 2000)
      const forwardMsg = common.makeForwardMsg(this.e, segments, getMessage('note.title'))
      await this.e.reply(forwardMsg)
      return true
    } catch (error) {
      logger.error(`[终末地便签]查询失败: ${error}`)
      await this.reply(getMessage('common.query_failed', { error: error.message }))
      return true
    }
  }

  async fetchCharacterDetail(sklUser) {
    const roleId = String(sklUser.endfield_uid || '')
    const serverId = Number(sklUser.server_id || 1)
    const res = await sklUser.sklReq.getData('note', { roleId, serverId })

    if (!res || res.code !== 0) {
      logger.error(`[终末地便签]获取角色信息失败: ${JSON.stringify(res)}`)
      await this.reply(getMessage('common.get_role_failed'))
      return null
    }
    const data = res.data || {}
    const base = data.base || {}
    const serverName = base.serverName?.trim() || getMessage('common.unknown')

    const chars = Array.isArray(data.chars) ? data.chars : []
    const charCount = Number(data.charCount ?? base.charNum ?? chars.length ?? 0)

    const achieve = data.achieve || {}
    const bpSystem = data.bpSystem || {}
    const achieveMedals = Array.isArray(achieve.achieveMedals) ? achieve.achieveMedals : []
    const medalMap = new Map()
    for (const item of achieveMedals) {
      const id = String(item?.achievementData?.id || '')
      if (id) medalMap.set(id, item)
    }
    const displayIds = Object.keys(achieve.display || {})
      .sort((a, b) => Number(a) - Number(b))
      .map((key) => String(achieve.display[key] || ''))
      .filter(Boolean)
    const fallbackMedals = achieveMedals
      .slice()
      .sort((a, b) => Number(b?.obtainTs || 0) - Number(a?.obtainTs || 0))
      .slice(0, 10)
    const medalsSource = displayIds.length > 0
      ? displayIds.map((id) => medalMap.get(id)).filter(Boolean)
      : fallbackMedals

    const medals = medalsSource.map((item) => {
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
        icon,
        isPlated,
        level: Number.isFinite(level) ? level : 0
      }
    })

    return { base, chars, serverName, charCount, achieve: { count: achieve.count, medals }, bpSystem }
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
