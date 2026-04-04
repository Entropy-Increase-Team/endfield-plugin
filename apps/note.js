import { getUnbindMessage, getMessage } from '../utils/common.js'
import common from '../../../lib/common/common.js'
import EndfieldUser from '../model/endfieldUser.js'
import setting from '../utils/setting.js'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const _dir = path.dirname(fileURLToPath(import.meta.url))
const _res = path.join(_dir, '..', 'resources')
const _meta = path.join(_res, 'meta')
const META_CLASS_DIR = path.join(_meta, 'class')
const META_ATTRPANLE_DIR = path.join(_meta, 'attrpanle')
const META_NOTEBG_DIR = path.join(_meta, 'notebg')
const META_HEADFRAME_DIR = path.join(_meta, 'headframeicon')

function iconToDataUrl(dir, chineseName) {
  if (!chineseName || typeof chineseName !== 'string') return ''
  const exts = ['.jpg', '.jpeg', '.png', '.webp']
  const name = chineseName.trim()
  for (const ext of exts) {
    const p = path.join(dir, name + ext)
    if (fs.existsSync(p)) {
      const buf = fs.readFileSync(p)
      const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg'
      return `data:${mime};base64,${buf.toString('base64')}`
    }
  }
  return ''
}

function fileToDataUrl(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return ''
  const ext = path.extname(filePath).toLowerCase()
  const mimeMap = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp'
  }
  const mime = mimeMap[ext]
  if (!mime) return ''
  const buf = fs.readFileSync(filePath)
  return `data:${mime};base64,${buf.toString('base64')}`
}

function pickRandomImageDataUrl(dir) {
  if (!dir || !fs.existsSync(dir)) return ''
  const files = fs.readdirSync(dir)
    .filter((name) => /\.(png|jpg|jpeg|webp)$/i.test(name))
  if (files.length === 0) return ''
  const pick = files[Math.floor(Math.random() * files.length)]
  return fileToDataUrl(path.join(dir, pick))
}

export class EndfieldNote extends plugin {
  constructor() {
    super({
      name: '[endfield-plugin]账号便签',
      dsc: '终末地账号便签与角色列表',
      event: 'message',
      priority: 50,
      rule: [
        {
          reg: '^(?:[:：]|[/#](?:zmd|终末地))(?:账号)?便签$',
          fnc: 'getNote'
        },
        {
          reg: '^(?:[:：]|[/#](?:zmd|终末地))角色$',
          fnc: 'getRoleList'
        }
      ]
    })
    this.common_setting = setting.getConfig('common')
  }

  async getRoleList() {
    return this.getNote('chars')
  }

  async getNote(viewMode = 'account') {
    const isCharsView = viewMode === 'chars'
    const pageTitle = isCharsView ? '角色' : '账号便签'
    const loadingMessage = isCharsView ? '正在获取角色列表...' : '正在获取账号便签...'
    const sectionTitle = isCharsView ? '角色' : '已拥有干员'
    const userId = this.e.at || this.e.user_id
    const sklUser = new EndfieldUser(userId)

    if (!await sklUser.getUser()) {
      await this.reply(getUnbindMessage())
      return true
    }

    await this.reply(loadingMessage)

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
      // 干员：优先使用矩形图 RtUrl，缺失时回退到方形图 SqUrl
      const colorCodeMapByKey = {
        char_property_physical: 'PHY',
        char_property_fire: 'FIRE',
        char_property_electric: 'ELEC',
        char_property_pulse: 'ELEC',
        char_property_ice: 'ICE',
        char_property_cryst: 'ICE',
        char_property_nature: 'NATURE'
      }
      const colorCodeMapByValue = {
        物理: 'PHY',
        灼热: 'FIRE',
        电磁: 'ELEC',
        脉冲: 'ELEC',
        寒冷: 'ICE',
        晶体: 'ICE',
        自然: 'NATURE'
      }
      const charsList = (chars || []).map((char) => {
        const rtUrl = char.avatarRtUrl || char.avatar_rt_url || ''
        const sqUrl = char.avatarSqUrl || char.avatar_sq_url || ''
        const imageUrl = rtUrl || sqUrl
        const profession = char?.profession?.value || char?.profession || ''
        const property = char?.property?.value || char?.property || ''
        const propertyKey = char?.property?.key || ''
        const rarity = Math.max(1, Math.min(6, parseInt(char?.rarity?.value || char?.rarity || 1, 10) || 1))
        const potentialLevel = Math.max(0, Math.min(5, parseInt(char?.potentialLevel || 0, 10) || 0))
        const rawEvolvePhase = char?.evolvePhase ?? char?.evolve_phase ?? char?.eliteLevel ?? char?.elite_level
        const evolvePhase = Number.isFinite(Number(rawEvolvePhase))
          ? Math.max(0, parseInt(rawEvolvePhase, 10) || 0)
          : null
        const level = Math.max(1, parseInt(char?.level || 1, 10) || 1)
        const name = char.name || unknown
        const weaponRaw = char?.weapon || {}
        const weaponName = weaponRaw?.name || ''
        const weaponIconUrl = weaponRaw?.iconUrl || weaponRaw?.icon_url || ''
        const weaponLevel = Math.max(0, parseInt(weaponRaw?.level || 0, 10) || 0)
        const weaponBreakthroughLevel = Math.max(0, parseInt(weaponRaw?.breakthroughLevel || weaponRaw?.breakthrough_level || 0, 10) || 0)
        const weaponType = weaponRaw?.type?.value || weaponRaw?.type || ''
        const weaponGemIcon = weaponRaw?.gem?.gemData?.icon || ''
        const weaponGemName = weaponRaw?.gem?.gemData?.name || ''
        const weapon = weaponName || weaponIconUrl
          ? {
              name: weaponName || unknown,
              iconUrl: weaponIconUrl,
              level: weaponLevel,
              breakthroughLevel: weaponBreakthroughLevel,
              type: weaponType,
              gemIcon: weaponGemIcon,
              gemName: weaponGemName
            }
          : null
        const colorCode = (colorCodeMapByKey[propertyKey] || colorCodeMapByValue[property] || 'PHY').toUpperCase()
        return {
          name,
          nameChars: Array.from(name),
          rtUrl,
          sqUrl,
          imageUrl,
          level,
          rarity,
          potentialLevel,
          evolvePhase,
          elitePhase: evolvePhase ?? weaponBreakthroughLevel,
          colorCode,
          profession,
          property,
          weapon,
          professionIcon: iconToDataUrl(META_CLASS_DIR, profession),
          propertyIcon: iconToDataUrl(META_ATTRPANLE_DIR, property)
        }
      })
      const totalCharNum = base.charNum ?? charCount ?? charsList.length
      const placeholder = getMessage('note.placeholder')
      const achieveCount = Number.isFinite(Number(achieve?.count)) ? Number(achieve.count) : null
      const bpCur = Number.isFinite(Number(bpSystem?.curLevel)) ? Number(bpSystem.curLevel) : null
      const bpMax = Number.isFinite(Number(bpSystem?.maxLevel)) ? Number(bpSystem.maxLevel) : null
      const noteBgUrl = pickRandomImageDataUrl(META_NOTEBG_DIR)
      const headFrameUrl = pickRandomImageDataUrl(META_HEADFRAME_DIR)
      const topChars = charsList.slice(0, 4)
      const isAccountView = !isCharsView

      if (this.e?.runtime?.render) {
        try {
          const pluResPath = this.e?.runtime?.path?.plugin?.['endfield-plugin']?.res || ''
          const pageWidth = 980
          const charRows = Math.max(1, Math.ceil(charsList.length / 6))
          const viewportHeight = isCharsView
            ? Math.min(5200, 190 + charRows * 152)
            : 420
          const renderData = {
            title: pageTitle,
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
            topChars,
            isCharsView,
            isAccountView,
            sectionTitle,
            theme: {
              noteBgUrl,
              headFrameUrl
            },
            pluResPath
          }
          const baseOpt = { scale: 1.3, retType: 'base64', viewport: { width: pageWidth, height: viewportHeight } }
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
      if (!isCharsView) {
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
      }
      msg += `【${sectionTitle}】(${charsList.length}个)\n`
      if (charsList.length > 0) {
        for (const char of charsList) {
          const eliteText = Number.isFinite(Number(char?.elitePhase)) ? ` 精英化${char.elitePhase}` : ''
          if (isCharsView && char.weapon) {
            msg += `• ${char.name}${eliteText} - ${char.weapon.name} Lv.${char.weapon.level}\n`
          } else {
            msg += getMessage('note.text_owned_item', { name: `${char.name}${eliteText}` }) + '\n'
          }
        }
      }

      const segments = this.splitContent(msg, 2000)
      const forwardMsg = common.makeForwardMsg(this.e, segments, pageTitle)
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
