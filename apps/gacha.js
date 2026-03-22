import { getUnbindMessage, getMessage } from '../utils/common.js'
import EndfieldUser from '../model/endfieldUser.js'
import { REDIS_KEY } from '../model/endfieldUser.js'
import EndfieldRequest from '../model/endfieldReq.js'
import hypergryphAPI from '../model/hypergryphApi.js'
import setting from '../utils/setting.js'
import { getCopyright } from '../utils/copyright.js'
import common from '../../../lib/common/common.js'
import fs from 'node:fs'
import path from 'node:path'

const GACHA_KEYS = {
  lastAnalysis: (userId) => `ENDFIELD:GACHA_LAST_ANALYSIS:${userId}`,
}
const SYNC_MS = { pollInterval: 1500, pollTimeout: Infinity }
const GACHA_CACHE_DIR = path.join(process.cwd(), 'plugins', 'endfield-plugin', 'data', 'gacha')
const GACHA_POOLS = ['limited', 'standard', 'beginner', 'weapon']

/**
 * 保底常量
 * - charSoft: 6星小保底（80抽触发硬保底）
 * - charProbBoost: 概率提升区起点（65抽后）
 * - charHard: UP大保底（120抽必出UP）
 * - charFiveStar: 5星保底（10抽）
 * - weaponSessionHard: 武器池6星硬保底（4次十连）
 * - weaponUpHard: 武器池UP硬保底（8次十连）
 * - specialMilestone60: 限定池60抽情报手册
 * - specialMilestone120: 限定池120抽UP大保底
 * - specialMilestone240: 限定池240抽代币
 */
const PITY = {
  charSoft: 80,
  charProbBoost: 65,
  charHard: 120,
  charFiveStar: 10,
  weaponSessionHard: 4,
  weaponUpHard: 8,
  specialMilestone60: 60,
  specialMilestone120: 120,
  specialMilestone240: 240,
}

export class EndfieldGacha extends plugin {
  constructor() {
    super({
      name: '[endfield-plugin]抽卡记录',
      dsc: '终末地抽卡记录同步',
      event: 'message',
      priority: 50,
      rule: [
        {
          reg: '^(?:[:：]|[/#](?:zmd|终末地))(?:(?:同步|更新))?抽卡记录(?:\\s*(.+))?$',
          fnc: 'viewGachaRecords'
        },
        {
          reg: '^(?:[:：]|[/#](?:zmd|终末地))抽卡分析(?:\\s+.*)?$',
          fnc: 'viewGachaAnalysis'
        }
      ]
    })
  }

  ensureGachaCacheDir() {
    if (!fs.existsSync(GACHA_CACHE_DIR)) {
      fs.mkdirSync(GACHA_CACHE_DIR, { recursive: true })
    }
  }

  getGachaCacheFile(userId, roleId) {
    const uid = String(userId || '0')
    const rid = String(roleId || '0')
    return path.join(GACHA_CACHE_DIR, `${uid}_${rid}.json`)
  }

  readLocalGachaCache(userId, roleId) {
    try {
      this.ensureGachaCacheDir()
      const file = this.getGachaCacheFile(userId, roleId)
      if (!fs.existsSync(file)) return null
      const raw = fs.readFileSync(file, 'utf8')
      if (!raw) return null
      const data = JSON.parse(raw)
      if (!data || typeof data !== 'object') return null
      const normalized = this.normalizeGachaCachePayload(data)
      if (normalized.changed) {
        fs.writeFileSync(file, JSON.stringify(normalized.data, null, 2), 'utf8')
      }
      return normalized.data
    } catch (err) {
      logger.error(`[终末地插件][抽卡缓存]读取失败: ${err?.message || err}`)
      return null
    }
  }

  writeLocalGachaCache(userId, roleId, payload) {
    try {
      this.ensureGachaCacheDir()
      const file = this.getGachaCacheFile(userId, roleId)
      const normalized = this.normalizeGachaCachePayload(payload)
      fs.writeFileSync(file, JSON.stringify(normalized.data, null, 2), 'utf8')
      return true
    } catch (err) {
      logger.error(`[终末地插件][抽卡缓存]写入失败: ${err?.message || err}`)
      return false
    }
  }

  hasNonEmptyValue(value) {
    if (value == null) return false
    if (typeof value === 'string') return value.trim() !== ''
    if (Array.isArray(value)) return value.length > 0
    return true
  }

  mergeDuplicateGachaRecord(base = {}, incoming = {}) {
    const merged = { ...base }
    for (const [key, value] of Object.entries(incoming || {})) {
      if (!Object.prototype.hasOwnProperty.call(merged, key) || !this.hasNonEmptyValue(merged[key])) {
        merged[key] = value
        continue
      }
      if (key === 'is_new' && value === true) {
        merged[key] = true
      }
    }
    return merged
  }

  deduplicateGachaRecords(records = []) {
    if (!Array.isArray(records) || records.length <= 1) return Array.isArray(records) ? records : []
    const deduped = []
    const seqIndexMap = new Map()
    for (const record of records) {
      if (!record || typeof record !== 'object') continue
      const seqId = String(record?.seq_id ?? '').trim()
      if (!seqId) {
        deduped.push({ ...record })
        continue
      }
      const existingIndex = seqIndexMap.get(seqId)
      if (existingIndex == null) {
        seqIndexMap.set(seqId, deduped.length)
        deduped.push({ ...record })
        continue
      }
      deduped[existingIndex] = this.mergeDuplicateGachaRecord(deduped[existingIndex], record)
    }
    return deduped
  }

  normalizeGachaCachePayload(payload) {
    if (!payload || typeof payload !== 'object') {
      return { data: payload, changed: false, removedCount: 0 }
    }
    const originalPools = payload?.records_by_pool || {}
    const normalizedPools = {}
    let changed = false
    let removedCount = 0

    for (const [poolKey, rows] of Object.entries(originalPools)) {
      if (!Array.isArray(rows)) {
        normalizedPools[poolKey] = rows
        continue
      }
      const dedupedRows = this.deduplicateGachaRecords(rows)
      normalizedPools[poolKey] = dedupedRows
      if (dedupedRows.length !== rows.length) {
        changed = true
        removedCount += rows.length - dedupedRows.length
      }
    }

    if (!changed) {
      return { data: payload, changed: false, removedCount: 0 }
    }

    return {
      data: {
        ...payload,
        records_by_pool: {
          ...originalPools,
          ...normalizedPools
        }
      },
      changed: true,
      removedCount
    }
  }

  getCachePoolRecords(cacheData, poolKey) {
    const pools = cacheData?.records_by_pool || {}
    const rows = Array.isArray(pools?.[poolKey]) ? pools[poolKey] : []
    return this.deduplicateGachaRecords(rows)
  }

  buildCacheRecordSummary(cacheData) {
    const summary = {
      totalCount: 0,
      star6: 0,
      star5: 0,
      star4: 0,
      pools: {}
    }

    for (const poolKey of GACHA_POOLS) {
      const rows = this.getCachePoolRecords(cacheData, poolKey)
      const poolSummary = {
        total: rows.length,
        star6: 0,
        star5: 0,
        star4: 0
      }

      for (const row of rows) {
        const rarity = Number(row?.rarity || 0)
        if (rarity === 6) {
          summary.star6++
          poolSummary.star6++
        } else if (rarity === 5) {
          summary.star5++
          poolSummary.star5++
        } else if (rarity === 4) {
          summary.star4++
          poolSummary.star4++
        }
      }

      summary.totalCount += rows.length
      summary.pools[poolKey] = poolSummary
    }

    return summary
  }

  getCachePoolPreview(cacheData, poolKey, limit = 10) {
    const rows = this.getCachePoolRecords(cacheData, poolKey)
    const sorted = [...rows].sort((a, b) => {
      const sa = Number(a?.seq_id)
      const sb = Number(b?.seq_id)
      if (Number.isFinite(sa) && Number.isFinite(sb) && sa !== sb) return sb - sa
      const ta = Number(a?.gacha_ts || 0)
      const tb = Number(b?.gacha_ts || 0)
      return tb - ta
    })
    return {
      records: sorted.slice(0, limit),
      total: sorted.length
    }
  }

  async refreshLocalGachaCacheFromCloud(token, userId, roleId, serverId = '1') {
    // 后端 completed 后可能存在短暂可见性延迟，这里做小次数重试，确保 records 能落本地
    const query = {
      role_id: String(roleId || ''),
      server_id: String(serverId || '1')
    }
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const [statsData, ...poolDataList] = await Promise.all([
          hypergryphAPI.getGachaStats(token, query),
          ...GACHA_POOLS.map((pool) => hypergryphAPI.getGachaRecordsAllPages(token, { pools: pool, limit: 500, ...query }))
        ])
        if (!statsData) {
          if (attempt < 3) {
            await this.sleep(1500)
            continue
          }
          return false
        }

        const recordsByPool = {}
        let recordsTotal = 0
        GACHA_POOLS.forEach((pool, idx) => {
          const r = poolDataList[idx]
          recordsByPool[pool] = this.deduplicateGachaRecords(Array.isArray(r?.records) ? r.records : [])
          recordsTotal += recordsByPool[pool].length
        })

        const payload = {
          version: 1,
          user_id: String(userId || ''),
          role_id: String(roleId || ''),
          updated_at: Date.now(),
          stats_data: statsData,
          records_by_pool: recordsByPool
        }
        const written = this.writeLocalGachaCache(userId, roleId, payload)
        if (!written) return false

        const statsTotal = Number(statsData?.stats?.total_count ?? 0)
        if (recordsTotal === 0 && statsTotal === 0 && attempt < 3) {
          await this.sleep(1500)
          continue
        }
        return true
      } catch (err) {
        logger.error(`[终末地插件][抽卡缓存]云端刷新失败(第${attempt}次): ${err?.message || err}`)
        if (attempt < 3) {
          await this.sleep(1500)
          continue
        }
        return false
      }
    }
  }

  getAccountServerId(account) {
    const sid = account?.server_id ?? account?.serverId ?? account?.game_server_id ?? 1
    return String(sid || 1)
  }

  getAccountRoleId(account) {
    const rid = account?.role_id ?? account?.roleId ?? account?.game_uid ?? account?.gameUid ?? ''
    return String(rid || '')
  }

  getBannerInfoSource() {
    const gachaCfg = setting.getConfig('gacha') || {}
    const source = String(gachaCfg.banner_info?.source || 'backend_api').trim().toLowerCase()
    return source === 'local_file' ? 'local_file' : 'backend_api'
  }

  parseBannerTime(input) {
    if (input == null) return 0
    if (typeof input === 'number' && Number.isFinite(input)) {
      // 兼容秒级时间戳
      return input < 10000000000 ? input * 1000 : input
    }
    const raw = String(input || '').trim()
    if (!raw) return 0

    // 优先手动解析，避免 "03.29 12:00" 被 Date 误判为 2001 年
    const withYear = raw.match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})(?:\s+(\d{1,2}):(\d{1,2}))?$/)
    if (withYear) {
      const year = Number(withYear[1])
      const month = Number(withYear[2])
      const day = Number(withYear[3])
      const hour = Number(withYear[4] ?? 0)
      const minute = Number(withYear[5] ?? 0)
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
        const ts = new Date(year, month - 1, day, hour, minute, 0, 0).getTime()
        if (Number.isFinite(ts)) return ts
      }
      return 0
    }

    // 兼容本地 game_banners.yaml 的 "03.29 12:00" / "3-29 12:00" 格式（无年份）
    const m = raw.match(/^(\d{1,2})[.\-/](\d{1,2})(?:\s+(\d{1,2}):(\d{1,2}))?$/)
    if (m) {
      const month = Number(m[1])
      const day = Number(m[2])
      const hour = Number(m[3] ?? 0)
      const minute = Number(m[4] ?? 0)
      if (!Number.isFinite(month) || !Number.isFinite(day)) return 0
      if (month < 1 || month > 12 || day < 1 || day > 31 || hour < 0 || hour > 23 || minute < 0 || minute > 59) return 0

      const now = new Date()
      const y = now.getFullYear()
      const candidates = [y - 1, y, y + 1]
        .map((year) => new Date(year, month - 1, day, hour, minute, 0, 0).getTime())
        .filter((t) => Number.isFinite(t))
      if (candidates.length === 0) return 0
      return candidates.reduce((best, cur) => {
        if (best == null) return cur
        return Math.abs(cur - now.getTime()) < Math.abs(best - now.getTime()) ? cur : best
      }, null) || 0
    }

    const normalized = raw.replace(/\//g, '-')
    const directTs = new Date(normalized).getTime()
    return Number.isFinite(directTs) ? directTs : 0
  }

  normalizePoolName(name) {
    const n = String(name || '').trim()
    if (!n) return ''
    const idx = n.indexOf('·')
    return idx !== -1 ? n.slice(idx + 1).trim() : n
  }

  parseBiliWikiUpResult(listRaw) {
    const list = Array.isArray(listRaw) ? listRaw : []
    const activeOnly = list.filter((a) => a?.is_active === true)
    let upCharNames = []
    let upWeaponName = ''
    let activeCharPoolName = ''
    let activeWeaponPoolName = ''

    const charActivity = activeOnly.find((a) => (a?.type || '') === '特许寻访')
    if (charActivity?.up && String(charActivity.up).trim()) {
      const upStr = String(charActivity.up).trim()
      upCharNames = [upStr]
    }
    activeCharPoolName = this.normalizePoolName(charActivity?.name)

    const weaponActivity = activeOnly.find((a) => (a?.type || '') === '武库申领')
    if (weaponActivity?.up && String(weaponActivity.up).trim()) {
      upWeaponName = String(weaponActivity.up).trim()
      activeWeaponPoolName = upWeaponName
    } else {
      activeWeaponPoolName = this.normalizePoolName(weaponActivity?.name)
    }

    const poolUpMap = {}
    for (const a of list) {
      if (!a?.name || !a?.up) continue
      const pName = this.normalizePoolName(a.name)
      const upStr = String(a.up).trim()
      if (pName && upStr) poolUpMap[pName] = upStr
    }

    const charActivities = list.filter((a) => (a?.type || '') === '特许寻访')
    const charPoolOrderByTime = charActivities
      .map((a) => ({
        pName: this.normalizePoolName(a?.name),
        start_time: this.parseBannerTime(a?.start_ts ?? a?.start_time)
      }))
      .filter((x) => x.pName)
      .sort((a, b) => a.start_time - b.start_time)
      .map((x) => x.pName)

    const upCharName = upCharNames.length > 0 ? upCharNames.join('、') : ''
    return { upCharNames, upCharName, upWeaponName, activeCharPoolName, activeWeaponPoolName, poolUpMap, charPoolOrderByTime }
  }

  async getCurrentUpFromBackendApi() {
    const commonCfg = setting.getConfig('common') || {}
    if (!commonCfg.api_key || String(commonCfg.api_key).trim() === '') return null
    try {
      const req = new EndfieldRequest(0, '', '')
      const res = await req.getWikiData('bili_wiki_activities')
      if (!res || res.code !== 0) return null
      const list = Array.isArray(res.data?.items) ? res.data.items : (Array.isArray(res.data?.activities) ? res.data.activities : [])
      return this.parseBiliWikiUpResult(list)
    } catch (e) {
      logger.error(`[终末地插件][抽卡] getCurrentUpFromBackendApi 失败: ${e?.message || e}`)
      return null
    }
  }

  getCurrentUpFromLocalBannerData() {
    try {
      const bannerData = setting.getData('game_banners') || {}
      const upChars = Array.isArray(bannerData.up_characters) ? bannerData.up_characters : []
      const upWeapons = Array.isArray(bannerData.up_weapons) ? bannerData.up_weapons : []
      const permanentWeapons = Array.isArray(bannerData.permanent_weapons) ? bannerData.permanent_weapons : []
      const nowTs = Date.now()

      const rows = []
      for (const item of upChars) {
        const poolName = String(item?.pool_name || '').trim()
        const charName = String(item?.character_name || '').trim()
        if (!poolName || !charName) continue
        const startTs = this.parseBannerTime(item?.start_time)
        const endTs = this.parseBannerTime(item?.end_time)
        const isActive = startTs > 0 && endTs > 0 ? (nowTs >= startTs && nowTs <= endTs) : false
        rows.push({
          type: '特许寻访',
          name: `特许寻访·${poolName}`,
          up: charName,
          start_time: item?.start_time || '',
          start_ts: startTs,
          end_ts: endTs,
          is_active: isActive
        })
      }
      for (const item of upWeapons) {
        const poolName = String(item?.pool_name || '').trim()
        const weaponName = String(item?.weapon_name || '').trim()
        if (!poolName || !weaponName) continue
        const startTs = this.parseBannerTime(item?.start_time)
        const endTs = this.parseBannerTime(item?.end_time)
        const isActive = startTs > 0 && endTs > 0 ? (nowTs >= startTs && nowTs <= endTs) : false
        rows.push({
          type: '武库申领',
          name: `武库申领·${poolName}`,
          up: weaponName,
          start_time: item?.start_time || '',
          start_ts: startTs,
          end_ts: endTs,
          is_active: isActive
        })
      }
      for (const item of permanentWeapons) {
        const poolName = String(item?.pool_name || '').trim()
        const weaponName = String(item?.weapon_name || '').trim()
        if (!poolName || !weaponName) continue
        rows.push({
          type: '武库申领',
          name: `武库申领·${poolName}`,
          up: weaponName,
          start_time: '',
          start_ts: 0,
          end_ts: 0,
          is_active: true
        })
      }

      if (rows.length === 0) return null
      return this.parseBiliWikiUpResult(rows)
    } catch (e) {
      logger.error(`[终末地插件][抽卡] getCurrentUpFromLocalBannerData 失败: ${e?.message || e}`)
      return null
    }
  }

  async getCurrentUpFromBiliWiki() {
    const source = this.getBannerInfoSource()
    if (source === 'local_file') {
      const localRes = this.getCurrentUpFromLocalBannerData()
      if (localRes) return localRes
      return await this.getCurrentUpFromBackendApi()
    }

    const apiRes = await this.getCurrentUpFromBackendApi()
    if (apiRes) return apiRes
    return this.getCurrentUpFromLocalBannerData()
  }

  async getNoteDataSafe(sklUser, roleId, serverId, scene) {
    try {
      return await sklUser.sklReq.getData('note', { roleId, serverId })
    } catch (e) {
      logger.error(`[终末地插件][note]${scene}获取失败: ${e?.message || e}`)
      return null
    }
  }

  getNoteCharAvatarUrl(charData) {
    return charData?.avatarSqUrl ||
      charData?.avatar_sq_url ||
      charData?.avatarRtUrl ||
      charData?.avatar_rt_url ||
      charData?.avatarUrl ||
      charData?.avatar_url ||
      ''
  }

  parseNoteAvatarData(noteRes) {
    const chars = Array.isArray(noteRes?.data?.chars) ? noteRes.data.chars : []
    const byName = {}
    const byIdAndName = {}
    for (const c of chars) {
      const id = c.id || c.char_id || c.charId || c.template_id || c.templateId || ''
      const name = (c.name || c.name_cn || c.char_name || '').trim()
      const url = this.getNoteCharAvatarUrl(c)
      if (!url) continue
      if (name) byName[name] = url
      if (id) byIdAndName[id] = { name: name || id, url }
      if (name) byIdAndName[name] = { name, url }
    }
    return {
      base: noteRes?.code === 0 ? (noteRes.data?.base || {}) : {},
      byName,
      byIdAndName
    }
  }

  hasAnyGachaRecord(statsData) {
    return statsData?.has_records === true ||
      (statsData?.last_fetch != null && String(statsData.last_fetch).trim() !== '') ||
      ((statsData?.stats?.total_count ?? 0) > 0)
  }

  /** 查看抽卡记录：四个卡池合并到一张图中展示；带「同步」则先同步再展示，支持管理员指定平台 ID */
  async viewGachaRecords() {
    const rawMsg = String(this.e.msg || '')
    const wantsSync = /(同步|更新)\s*抽卡记录/.test(rawMsg)

    // 仅 "同步抽卡记录 / 更新抽卡记录" 使用云端同步
    if (wantsSync) {
      return await this.syncGacha({
        afterSyncShowRecords: true,
        fromSync: true,
        selectPrompt: getMessage('gacha.select_account_sync')
      })
    }

    const sklUser = new EndfieldUser(this.e.user_id)
    if (!(await sklUser.getUser())) {
      await this.reply(getUnbindMessage())
      return true
    }
    const roleId = String(sklUser.endfield_uid || '')
    const serverId = Number(sklUser.server_id || 1)
    const cacheData = this.readLocalGachaCache(this.e.user_id, roleId)
    const cacheSummary = this.buildCacheRecordSummary(cacheData)
    const recordStatsData = cacheData?.stats_data || null
    const hasRecord = this.hasAnyGachaRecord(recordStatsData)

    if (!cacheData || !hasRecord) {
      await this.reply(getMessage('gacha.no_records'))
      return await this.syncGacha({
        afterSyncShowRecords: true,
        fromSync: true,
        isFirstSync: true,
        selectPrompt: getMessage('gacha.select_account_sync')
      })
    }

    const limit = 10
    const pluResPath = this.e?.runtime?.path?.plugin?.['endfield-plugin']?.res || ''

    const noteRes = await this.getNoteDataSafe(sklUser, roleId, serverId, '抽卡记录')
    const noteAvatarData = this.parseNoteAvatarData(noteRes)
    const charAvatarMap = noteAvatarData.byName
    const noteBase = noteAvatarData.base
    let upCharNames = []
    let upWeaponName = ''
    const biliUp = await this.getCurrentUpFromBiliWiki()
    if (biliUp?.upCharNames?.length) {
      upCharNames = biliUp.upCharNames
      if (biliUp.upWeaponName) upWeaponName = biliUp.upWeaponName
    }


    const poolList = [
      { key: 'standard', label: '常驻角色' },
      { key: 'beginner', label: '新手池' },
      { key: 'weapon', label: '武器池' },
      { key: 'limited', label: '限定角色' }
    ]
    const poolResults = poolList.map(({ key }) => this.getCachePoolPreview(cacheData, key, limit))

    const userInfo = recordStatsData.user_info || {}

    // 判断是否为 UP 角色/武器
    const isUpItem = (name, poolKey) => {
      const n = String(name || '').trim()
      if (!n) return false
      if (poolKey === 'limited' && upCharNames.length > 0) {
        return upCharNames.some((u) => n === u || n.includes(u) || u.includes(n))
      }
      if (poolKey === 'weapon' && upWeaponName) {
        return n === upWeaponName || n.includes(upWeaponName) || upWeaponName.includes(n)
      }
      return false
    }

    // 构建每个池子的数据
    const poolSections = poolList.map(({ key, label }, idx) => {
      const rd = poolResults[idx]
      const records = rd?.records || []
      const total = rd?.total ?? 0
      return {
        label,
        total,
        hasRecords: total > 0,
        records: records.map((r, i) => {
          const name = r.char_name || r.item_name || '未知'
          const isUp = r.rarity >= 5 && isUpItem(name, key)
          return {
            index: i + 1,
            rarity: r.rarity,
            starClass: r.rarity === 6 ? 'star6' : r.rarity === 5 ? 'star5' : 'star4',
            name,
            avatar: charAvatarMap[name] || '',
            isUp
          }
        })
      }
    })

    // 渲染模板
    if (this.e?.runtime?.render) {
      try {
        const renderData = {
          title: '抽卡记录',
          totalCount: cacheSummary.totalCount,
          star6: cacheSummary.star6,
          star5: cacheSummary.star5,
          star4: cacheSummary.star4,
          userAvatar: noteBase.avatarUrl || '',
          userNickname: noteBase.name || userInfo.nickname || userInfo.game_uid || '未知',
          userLevel: noteBase.level ?? 0,
          userUid: userInfo.game_uid || noteBase.roleId || '',
          poolSections,
          pluResPath,
          ...getCopyright()
        }
        const imgSegment = await this.e.runtime.render('endfield-plugin', 'gacha/gacha-record', renderData, { scale: 1.6, retType: 'base64' })
        if (imgSegment) {
          await this.reply(imgSegment)
          return true
        }
      } catch (err) {
        logger.error(`[终末地插件][抽卡记录]渲染图失败: ${err?.message || err}`)
      }
    }

    // 降级纯文本
    const unknown = getMessage('common.unknown')
    let msg = getMessage('gacha.record_fallback_title') + '\n'
    msg += getMessage('gacha.record_fallback_user', {
      name: userInfo.nickname || userInfo.game_uid || unknown,
      channel: userInfo.channel_name ? ` | ${userInfo.channel_name}` : ''
    }) + '\n'
    msg += getMessage('gacha.record_fallback_stats', {
      total: cacheSummary.totalCount,
      star6: cacheSummary.star6,
      star5: cacheSummary.star5,
      star4: cacheSummary.star4
    }) + '\n'
    for (const sec of poolSections) {
      msg += '\n' + getMessage('gacha.record_section_header', { label: sec.label, total: sec.total }) + '\n'
      if (sec.hasRecords) {
        sec.records.forEach((r) => {
          msg += getMessage('gacha.record_item_line', { index: r.index, rarity: r.rarity, name: r.name }) + '\n'
        })
      } else {
        msg += getMessage('gacha.record_empty') + '\n'
      }
    }
    await this.reply(msg)
    return true
  }

  /** 抽卡分析：支持管理员指定平台 ID 读取目标用户缓存；无数据时自动同步 */
  async viewGachaAnalysis() {
    const targetInfo = await this.resolveSyncTarget()
    if (!targetInfo) return true
    if (targetInfo.error) {
      await this.reply(targetInfo.error)
      return true
    }

    const targetUserId = String(targetInfo.userId || this.e.user_id)
    const sklUser = new EndfieldUser(targetUserId)
    if (!(await sklUser.getUser())) {
      await this.reply(getUnbindMessage())
      return true
    }

    const roleId = String(sklUser.endfield_uid || '')
    const cacheData = this.readLocalGachaCache(targetUserId, roleId)
    const statsData = cacheData?.stats_data || null
    const hasRecord = this.hasAnyGachaRecord(statsData)

    // 无本地记录时自动开始同步
    if (!statsData || !hasRecord) {
      await this.reply(getMessage('gacha.no_records'))
      return await this.syncGacha({
        afterSyncSendAnalysis: true,
        fromAnalysis: true,
        isFirstSync: true,
        selectPrompt: getMessage('gacha.select_account_sync'),
        targetUserId
      })
    }
    
    // 有数据则直接出图
    await this.renderGachaAnalysisAndReply(statsData, { cacheData, targetUserId })
    return true
  }

  /** 根据 statsData 拉取 note/wiki/records 并制图或文字回复（抽卡分析用；同步完成后也会调用）；options.syncMsg 时将文字与图片合并为一条消息；options.targetUserId 指定查询目标用户 */
  async renderGachaAnalysisAndReply(statsData, options = {}) {
    const targetUserId = options.targetUserId || this.e.user_id
    const sklUser = new EndfieldUser(targetUserId)
    if (!(await sklUser.getUser())) {
      await this.reply(getUnbindMessage())
      return true
    }
    const roleId = String(sklUser.endfield_uid || '')
    const serverId = Number(sklUser.server_id || 1)
    const cacheData = options.cacheData || this.readLocalGachaCache(targetUserId, roleId) || {}
    const cacheSummary = this.buildCacheRecordSummary(cacheData)
    const userInfo = statsData.user_info || {}
    const fmtCost = (total, star6) => {
      if (star6 == null || star6 <= 0) return '-'
      const t = Number(total) || 0
      return t > 0 ? Math.round(t / star6) + '抽' : '-'
    }

    const noteRes = await this.getNoteDataSafe(sklUser, roleId, serverId, '抽卡分析')
    const noteAvatarData = this.parseNoteAvatarData(noteRes)
    const noteCharMap = noteAvatarData.byIdAndName
    const userAvatar = noteAvatarData.base.avatarUrl || ''
    const userNickname = noteAvatarData.base.name || userInfo.nickname || userInfo.game_uid || '未知'
    const userUid = userInfo.game_uid || ''
    const syncTargetUserId = String(targetUserId || '').trim()
    const syncHintCommand = syncTargetUserId && syncTargetUserId !== String(this.e.user_id)
      ? `:同步抽卡记录 ${syncTargetUserId}`
      : ':同步抽卡记录'


    let charCoverMap = {}
    let weaponCoverMap = {}
    try {
      const [charWikiRes, weaponWikiRes] = await Promise.all([
        sklUser.sklReq.getWikiData('wiki_items', { main_type_id: '1', sub_type_id: '1', page: 1, page_size: 100 }).catch(() => null),
        sklUser.sklReq.getWikiData('wiki_items', { main_type_id: '1', sub_type_id: '2', page: 1, page_size: 100 }).catch(() => null)
      ])
      const charItems = charWikiRes?.data?.items || []
      for (const it of charItems) {
        const name = (it.brief?.name || it.name || '').trim()
        const cover = it.brief?.cover || it.cover || ''
        if (name && cover) charCoverMap[name] = cover
      }
      const weaponItems = weaponWikiRes?.data?.items || []
      for (const it of weaponItems) {
        const name = (it.brief?.name || it.name || '').trim()
        const cover = it.brief?.cover || it.cover || ''
        if (name && cover) weaponCoverMap[name] = cover
      }
    } catch (e) {
      logger.error(`[终末地插件][抽卡分析]获取 wiki 封面图失败: ${e?.message || e}`)
    }

    const getCharHeaderCover = (name) => {
      const key = String(name || '').trim()
      if (!key) return ''
      return charCoverMap[key] || noteCharMap[key]?.url || ''
    }
    const getWeaponHeaderCover = (name) => {
      const key = String(name || '').trim()
      if (!key) return ''
      return weaponCoverMap[key] || ''
    }
    const getFallbackHeaderCover = (images = []) => {
      const firstWithUrl = Array.isArray(images) ? images.find((item) => item?.url) : null
      return {
        url: firstWithUrl?.url || '',
        name: firstWithUrl?.name || ''
      }
    }


    let upCharName = ''
    let upCharNames = []
    let upWeaponName = ''
    const biliUp = await this.getCurrentUpFromBiliWiki()
    if (biliUp?.upCharNames?.length) {
      upCharNames = biliUp.upCharNames
      upCharName = biliUp.upCharName || upCharNames.join('、')
      if (biliUp.upWeaponName) upWeaponName = biliUp.upWeaponName
    }
    if (!upCharName && upCharNames.length > 0) upCharName = upCharNames.join('、')


    const buildPoolEntry = (records, opts) => {
      const { isChar, isLimited, noWaiTag, metric2Label, metric2Default, showNotWaiRate, poolUpCharNames, poolUpWeaponName } = opts
      const images = []
      const poolName = records.length > 0 ? (records[0].pool_name || '').trim() || '未知' : '未知'
      const effectiveUpCharNames = (poolUpCharNames && poolUpCharNames.length > 0) ? poolUpCharNames : (upCharNames.length > 0 ? upCharNames : (upCharName ? [upCharName] : []))
      const effectiveUpWeaponName = (poolUpWeaponName !== undefined && poolUpWeaponName !== null) ? poolUpWeaponName : upWeaponName
      const isLimitedPool = isLimited || (isChar && effectiveUpCharNames.length > 0)
      const total = records.length
      const isWeapon = !isChar
      const hasUpTarget = isWeapon
        ? Boolean(String(effectiveUpWeaponName || '').trim())
        : (!noWaiTag && effectiveUpCharNames.length > 0)
      const sorted = [...records].sort((a, b) => {
        const na = Number(a.seq_id)
        const nb = Number(b.seq_id)
        if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb
        return String(a.seq_id || '').localeCompare(String(b.seq_id || ''), undefined, { numeric: true })
      })
      const countsByRarity = { 6: 0, '6_std': 0, 5: 0, 4: 0 }
      const upSixStarPullsDetail = []
      let analysisPity = 0
      let analysisCumulative = 0
      let analysisHasGotUpBefore120 = false
      let paidTotal = 0
      for (const r of sorted) {
        const isFree = r.is_free === true
        if (!isFree) {
          analysisPity++
          analysisCumulative++
          paidTotal++
        }
        if (r.rarity === 6) {
          const cname = String(r.char_name || r.item_name || '').trim()
          let isUp = false
          if (isLimitedPool && !noWaiTag && effectiveUpCharNames.length > 0) {
            isUp = effectiveUpCharNames.some((n) => cname === n || cname.includes(n) || n.includes(cname))
          } else if (isWeapon && effectiveUpWeaponName) {
            isUp = cname === effectiveUpWeaponName || cname.includes(effectiveUpWeaponName) || effectiveUpWeaponName.includes(cname)
          }
          let isSpark = false
          if (isLimited && !isFree && isUp && analysisCumulative >= PITY.charHard && !analysisHasGotUpBefore120) {
            isSpark = true
          }
          if (!isFree && isUp && analysisCumulative < PITY.charHard) {
            analysisHasGotUpBefore120 = true
          }
          if (isUp) countsByRarity[6]++
          else           countsByRarity['6_std']++
          if (isUp && !isFree) upSixStarPullsDetail.push({ count: analysisPity, isSpark, name: cname })
          if (!isFree) {
            analysisPity = 0
            if (isUp) analysisCumulative = 0
          }
        } else if (r.rarity === 5) {
          countsByRarity[5]++
        } else {
          countsByRarity[4]++
        }
      }
      const totalStar6 = countsByRarity[6] + countsByRarity['6_std']
      const star6 = totalStar6
      const sparkCount = upSixStarPullsDetail.filter(p => p.isSpark).length
      const analysisWinRate = (hasUpTarget && totalStar6 > 0) ? ((countsByRarity[6] / totalStar6) * 100).toFixed(1) + '%' : '-'
      const upPullsExcludingSpark = upSixStarPullsDetail.filter(p => !p.isSpark)
      const avgUpCost = upPullsExcludingSpark.length > 0
        ? Math.round(upPullsExcludingSpark.reduce((s, p) => s + p.count, 0) / upPullsExcludingSpark.length) + '抽'
        : '-'
      const avgAllCost = totalStar6 > 0 ? Math.round(paidTotal / totalStar6) + '抽' : '-'
      let metric2 = metric2Default !== undefined ? (metric2Default ?? totalStar6) : totalStar6
      if (showNotWaiRate && hasUpTarget && totalStar6 > 0) {
        metric2 = analysisWinRate
      }
      let pullsSinceLast6 = 0
      for (const r of sorted) {
        if (r.is_free !== true) pullsSinceLast6 += 1
        if (r.rarity === 6) {
          const id = r.char_id || ''
          const name = (r.char_name || r.item_name || '').trim() || id
          const pullCount = pullsSinceLast6
          let tag = ''
          let badgeColor = 'normal'
          if (isLimitedPool && !noWaiTag && effectiveUpCharNames.length > 0) {
            const charName = String(r.char_name ?? r.item_name ?? '').trim()
            const isUp = effectiveUpCharNames.some((n) => charName === n || charName.includes(n) || n.includes(charName))
            if (!isUp) {
              tag = '歪'
              badgeColor = 'wai'
            } else {
              tag = 'UP'
              badgeColor = 'up'
            }
            if (pullCount >= PITY.charSoft + 1 && pullCount <= PITY.charHard) {
              tag = '保底'
              badgeColor = 'baodi'
            }
          } else if (isWeapon && (effectiveUpWeaponName || !noWaiTag)) {
            const isStarlightPool = poolName && poolName.includes('星声申领')
            if (!isStarlightPool) {
              const sessionCount = Math.ceil(pullCount / 10)
              const isUp = effectiveUpWeaponName && String(name).trim() === effectiveUpWeaponName
              if (sessionCount >= PITY.weaponSessionHard) {
                tag = '保底'
                badgeColor = 'baodi'
              } else if (effectiveUpWeaponName && !isUp) {
                tag = '歪'
                badgeColor = 'wai'
              } else if (isUp) {
                tag = 'UP'
                badgeColor = 'up'
              }
            }
          }
          const maxPity = isLimited ? PITY.charHard : (isWeapon ? PITY.weaponSessionHard * 10 : PITY.charSoft)
          const barPercent = Math.min(100, Math.round((pullCount / maxPity) * 100))
          const colorScale = isWeapon ? PITY.weaponSessionHard * 10 : PITY.charProbBoost
          const colorPercent = Math.min(100, (pullCount / colorScale) * 100)
          const barColorLevel = colorPercent < 50 ? 'green' : colorPercent < 80 ? 'yellow' : 'red'
          if (isChar) {
            const info = noteCharMap[id] || noteCharMap[name]
            images.push({
              name: info?.name || name,
              url: info?.url || '',
              seqId: r.seq_id != null ? String(r.seq_id) : '',
              pullCount,
              tag,
              badgeColor,
              barPercent,
              barColorLevel,
              refLinePercent: null
            })
          } else {
            const cover = weaponCoverMap[name]
            images.push({
              name,
              url: cover || '',
              seqId: r.seq_id != null ? String(r.seq_id) : '',
              pullCount,
              tag,
              badgeColor,
              barPercent,
              barColorLevel,
              refLinePercent: null
            })
          }
          pullsSinceLast6 = 0
        }
      }
      const paidSorted = sorted.filter(r => r.is_free !== true)
      let pitySinceLast6 = null
      const lastPaid6Idx = paidSorted.map((r, i) => (r.rarity === 6 ? i : -1)).filter((i) => i >= 0).pop()
      if (lastPaid6Idx != null) {
        pitySinceLast6 = paidSorted.length - lastPaid6Idx - 1
      } else {
        pitySinceLast6 = paidSorted.length
      }
      const effectiveTotal = (star6 > 0 && pitySinceLast6 != null) ? paidTotal - pitySinceLast6 : paidTotal
      images.reverse()
      return { poolName, total, star6, effectiveTotal, metric2, images, pitySinceLast6, counts: countsByRarity, winRate: analysisWinRate, avgUpCost, avgAllCost, sparkCount }
    }


    const buildFreeStarImages = (freeRecords, isChar) => {
      const imgs = []
      const sorted = [...freeRecords].sort((a, b) => Number(a.seq_id) - Number(b.seq_id))
      let pullsSinceLast6 = 0
      for (const r of sorted) {
        pullsSinceLast6++
        if (r.rarity !== 6) continue
        const pullCount = pullsSinceLast6
        pullsSinceLast6 = 0
        const id = r.char_id || ''
        const name = (r.char_name || r.item_name || '').trim() || id
        const barPercent = Math.min(100, Math.round((pullCount / 10) * 100))
        if (isChar) {
          const info = noteCharMap[id] || noteCharMap[name]
          imgs.push({
            name: info?.name || name,
            url: info?.url || '',
            pullCount,
            tag: '免费',
            badgeColor: 'free',
            barPercent,
            barColorLevel: 'green'
          })
        } else {
          const cover = weaponCoverMap[name]
          imgs.push({ name, url: cover || '', pullCount, tag: '免费', badgeColor: 'free', barPercent, barColorLevel: 'green' })
        }
      }
      return imgs.reverse()
    }


    const charPoolKeys = ['limited', 'standard', 'beginner']
    let charRecords = []
    for (const key of charPoolKeys) {
      charRecords = charRecords.concat(this.getCachePoolRecords(cacheData, key))
    }
    const charByPoolName = {}
    const charFreeByPoolName = {}
    for (const r of charRecords) {
      const name = (r.pool_name || '').trim() || '未知'
      if (r.is_free === true) {
        if (!charFreeByPoolName[name]) charFreeByPoolName[name] = []
        charFreeByPoolName[name].push(r)
        continue
      }
      if (!charByPoolName[name]) charByPoolName[name] = []
      charByPoolName[name].push(r)
    }
    const charPoolEntries = []
    const charPoolNames = Object.keys(charByPoolName).sort()
    const matchActivePool = (poolName, activeName) =>
      activeName && (poolName === activeName || poolName.includes(activeName) || activeName.includes(poolName))
    const poolUpMap = biliUp?.poolUpMap || {}
    const isLimitedPoolName = (poolName) => {
      const recs = charByPoolName[poolName] || []
      const hasLimitedId = recs.some((r) => (r?.pool_id || '').toLowerCase().includes('limited'))
      return hasLimitedId || !!poolUpMap[poolName]
    }
    for (const subPoolName of charPoolNames) {
      const groupRecords = charByPoolName[subPoolName]
      const firstPoolId = (groupRecords[0]?.pool_id || '').toLowerCase()
      const isLimited = isLimitedPoolName(subPoolName)
      const noWaiTag = firstPoolId.includes('standard') || firstPoolId.includes('beginner')
      // 从 poolUpMap 获取该池子的 UP 角色名（支持历史池子）
      const poolSpecificUp = poolUpMap[subPoolName]
      const poolUpChars = poolSpecificUp ? [poolSpecificUp] : null
      const metric1Label = (isLimited || poolUpChars) ? '平均UP花费' : '每红花费'
      const showNotWaiRate = isLimited
      const metric2Label = showNotWaiRate ? '不歪率' : '出红数'
      const metric2Default = showNotWaiRate ? '-' : null
      const entry = buildPoolEntry(groupRecords, {
        isChar: true,
        isLimited,
        noWaiTag,
        metric2Label,
        metric2Default,
        showNotWaiRate,
        poolUpCharNames: poolUpChars
      })
      const pityPct = entry.pitySinceLast6 != null ? Math.min(100, (entry.pitySinceLast6 / PITY.charSoft) * 100) : 0
      const pityBarColorLevel = pityPct < 50 ? 'green' : pityPct < 80 ? 'yellow' : 'red'
      // 获取该池子的免费记录（卡池隔离），按 seq_id 倒序排序（新→旧，与付费 6 星顺序一致）
      const freeRecords = (charFreeByPoolName[subPoolName] || []).sort((a, b) => Number(b.seq_id) - Number(a.seq_id))
      // 限定池不在 images 中显示免费出货，只在底部显示"免费 - x抽"
      const freeStarImgs = isLimited ? [] : buildFreeStarImages(freeRecords, true)
      const mergedImages = [...entry.images, ...freeStarImgs]
      // 限定池里程碑
      // 免费十连不计入：60抽情报手册、120抽UP大保底、每240抽代币
      const paidCount = groupRecords.length
      const specialMilestones = isLimited ? (() => {
        const hasUp6 = entry.counts[6] > 0
        const pullsToUp120 = hasUp6 ? 0 : Math.max(0, PITY.specialMilestone120 - paidCount)
        const hasInfoBook60 = paidCount >= PITY.specialMilestone60
        const pullsToInfoBook60 = hasInfoBook60 ? 0 : Math.max(0, PITY.specialMilestone60 - paidCount)
        const token240Times = Math.floor(paidCount / PITY.specialMilestone240)
        const nextTokenAt = (token240Times + 1) * PITY.specialMilestone240
        const pullsToNextToken240 = Math.max(0, nextTokenAt - paidCount)
        return { paidCount, hasUp6, pullsToUp120, hasInfoBook60, pullsToInfoBook60, token240Times, pullsToNextToken240 }
      })() : undefined
      // 5星保底：10抽内必出5星
      const paidSortedForFive = [...groupRecords].filter(r => r.is_free !== true).sort((a, b) => Number(a.seq_id) - Number(b.seq_id))
      let pityTo5Star = 0
      for (const r of paidSortedForFive) {
        pityTo5Star++
        if (r.rarity >= 5) pityTo5Star = 0
      }
      // 合计抽数 + 垫抽展示文案，例如「合计 60 抽 - 垫 30」
      const totalSummary = (() => {
        const totalPulls = entry.total ?? 0
        const pity = entry.pitySinceLast6
        if (typeof pity === 'number' && pity >= 0) {
          return `合计 ${totalPulls} 抽 - 垫 ${pity}`
        }
        return `合计 ${totalPulls} 抽`
      })()
      // 限定池免费抽数显示逻辑：
      // - 如果第7抽出货，显示"免费 - 7抽"（出货时的抽数），头像显示出货角色
      // - 如果10抽都没出货，显示"免费 - 10抽"（总抽数），头像显示 X
      // - 只有限定池才显示这个，其他池子不显示
      let freePityCount = 0
      let freeCharAvatar = null
      let freeCharName = null
      if (isLimited && freeRecords.length > 0) {
        const freeSorted = [...freeRecords].sort((a, b) => Number(a.seq_id) - Number(b.seq_id))
        const lastFree6Idx = freeSorted.findLastIndex((r) => r.rarity === 6)
        // 如果出货了，显示出货时的抽数；如果没出货，显示总抽数
        freePityCount = lastFree6Idx >= 0 ? (lastFree6Idx + 1) : freeSorted.length
        // 如果出货了，获取出货角色的头像
        if (lastFree6Idx >= 0) {
          const char6 = freeSorted[lastFree6Idx]
          const charId = char6.char_id || ''
          const charName = (char6.char_name || char6.item_name || '').trim() || charId
          const charInfo = noteCharMap[charId] || noteCharMap[charName]
          if (charInfo) {
            freeCharAvatar = charInfo.url
            freeCharName = charInfo.name
          }
        }
      }
      const headerCharName = String(poolSpecificUp || '').trim()
      const headerCharCover = getCharHeaderCover(headerCharName)
      const fallbackCharCover = getFallbackHeaderCover(mergedImages)
      charPoolEntries.push({
        poolName: entry.poolName,
        total: entry.total,
        totalSummary,
        star6: entry.star6,
        metric1: (isLimited || poolUpChars) ? entry.avgUpCost : fmtCost(entry.effectiveTotal ?? entry.total, entry.star6),
        metric1Label,
        metric2: entry.metric2,
        metric2Label,
        images: mergedImages,
        pitySinceLast6: entry.pitySinceLast6,
        pityTo5Star,
        isInProbBoostZone: (entry.pitySinceLast6 ?? 0) >= PITY.charProbBoost,
        isHardPity: (entry.pitySinceLast6 ?? 0) >= PITY.charSoft,
        pityBarPercent: entry.pitySinceLast6 != null ? Math.min(100, Math.round((entry.pitySinceLast6 / PITY.charSoft) * 100)) : 0,
        pityBarColorLevel,
        freeTotal: freePityCount,
        freeBarPercent: freePityCount > 0 ? Math.min(100, Math.round((freePityCount / 10) * 100)) : 0,
        freeCharAvatar,
        freeCharName,
        counts: entry.counts,
        winRate: entry.winRate,
        sparkCount: entry.sparkCount,
        showHeaderCover: isLimited,
        headerCoverUrl: headerCharCover || fallbackCharCover.url,
        headerCoverName: headerCharName || fallbackCharCover.name || entry.poolName,
        ...(specialMilestones ? { specialMilestones } : {})
      })
    }

    // 限定角色池继承（对齐 EndfieldGachaHelper / endfield-gacha）：
    // 小保底(80) 与 大保底(120) 跨所有期数共享；免费十连不计入；按全局时间序合并后单次遍历
    const limitedPoolNames = charPoolNames.filter((pn) => isLimitedPoolName(pn))
    if (limitedPoolNames.length > 0) {
      // 1) 合并所有限定池的付费记录，并打上池名
      const allLimitedPaid = []
      for (const pn of limitedPoolNames) {
        const list = (charByPoolName[pn] || []).filter((r) => r.is_free !== true)
        for (const r of list) allLimitedPaid.push({ ...r, _poolName: pn })
      }
      // 2) 排序：与 poolUtils.sortRecordsByTimeAndSeq 一致——时间升序，再 seq_id 升序（参考 endfield-gacha 的 chronological 遍历）
      const getTsMs = (r) => {
        const v = r.gacha_ts ?? r.gachaTs
        if (v == null || v === '') return 0
        const n = Number(v)
        if (!Number.isFinite(n)) return 0
        // 10位数以下视为秒级时间戳，转为毫秒；10位数及以上视为毫秒级时间戳
        return n < 10000000000 ? n * 1000 : n
      }
      const parseSeqId = (r) => {
        const n = Number(r.seq_id)
        return Number.isFinite(n) ? n : NaN
      }
      allLimitedPaid.sort((a, b) => {
        const ta = getTsMs(a)
        const tb = getTsMs(b)
        if (ta !== tb) return ta - tb
        const sa = parseSeqId(a)
        const sb = parseSeqId(b)
        if (Number.isFinite(sa) && Number.isFinite(sb) && sa !== sb) return sa - sb
        return String(a.seq_id || '').localeCompare(String(b.seq_id || ''), undefined, { numeric: true })
      })
      // 3) 计算跨池共享保底
      // 小保底(80抽)：出任何6星都清零
      // 大保底(120抽)：只有出UP才清零，出歪继续累计
      let sharedPityTo6Star = 0
      let sharedPityToUp6Star = 0
      let lastLimitedSixStarWasUp = undefined
      const activeCharPoolName = biliUp?.activeCharPoolName || ''
      const fallbackUpNames = (biliUp?.upCharNames?.length ? biliUp.upCharNames : (biliUp?.upCharName ? [biliUp.upCharName] : []))
      const seqIdToSharedPity = {}

      for (const r of allLimitedPaid) {
        sharedPityTo6Star += 1
        sharedPityToUp6Star += 1
        
        if (r.rarity === 6) {
          const name = String(r.char_name || r.item_name || '').trim()
          const poolUpName = poolUpMap[r._poolName]
          const upNames = poolUpName ? [poolUpName] : (activeCharPoolName && (r._poolName === activeCharPoolName || r._poolName.includes(activeCharPoolName) || activeCharPoolName.includes(r._poolName)) ? fallbackUpNames : [])
          const isUp = upNames.length > 0 && upNames.some((u) => (u && (name === u || name.includes(u) || u.includes(name))))

          const seqKey = String(r.seq_id ?? '').trim()
          if (seqKey) {
            seqIdToSharedPity[seqKey] = sharedPityTo6Star
          }
          
          lastLimitedSixStarWasUp = isUp
          // 出任何6星：小保底清零
          sharedPityTo6Star = 0
          // 出UP：大保底也清零；出歪：大保底继续累计
          if (isUp) {
            sharedPityToUp6Star = 0
          }
        }
      }
      // 4) 当前限定池 = 合并时间线中最后一条记录所在池（与 endfield-gacha 的 isCurrentPool 一致）
      const currentLimitedPoolName = allLimitedPaid.length > 0 ? allLimitedPaid[allLimitedPaid.length - 1]._poolName : limitedPoolNames[0]
      // 5) 所有限定池清空单池垫抽显示，仅当前限定池展示共享保底
      for (let i = 0; i < charPoolEntries.length; i++) {
        const e = charPoolEntries[i]
        if (!isLimitedPoolName(e.poolName)) continue
        e.pitySinceLast6 = null
        e.pityBarPercent = 0
      }
      const currentEntry = charPoolEntries.find((e) => e.poolName === currentLimitedPoolName)
      if (currentEntry) {
        // 更新当前池的垫抽显示（使用跨池共享的垫抽数）
        currentEntry.pitySinceLast6 = sharedPityTo6Star
        currentEntry.pityToUp6Star = sharedPityToUp6Star
        currentEntry.pityBarPercent = Math.min(100, Math.round((sharedPityTo6Star / PITY.charSoft) * 100))
        const pityPct = (sharedPityTo6Star / PITY.charSoft) * 100
        currentEntry.pityBarColorLevel = pityPct < 50 ? 'green' : pityPct < 80 ? 'yellow' : 'red'
        currentEntry.isInProbBoostZone = sharedPityTo6Star >= PITY.charProbBoost
        currentEntry.isHardPity = sharedPityTo6Star >= PITY.charSoft
        
        // 更新限定池中6星角色的跨池垫抽数显示（按 seq_id 匹配）
        if (Object.keys(seqIdToSharedPity).length > 0) {
          for (const entry of charPoolEntries) {
            if (!isLimitedPoolName(entry.poolName)) continue
            if (!Array.isArray(entry.images)) continue
            for (const img of entry.images) {
              if (!img || img.tag === '免费') continue
              const seqKey = String(img.seqId ?? '').trim()
              const crossPoolPity = seqKey ? seqIdToSharedPity[seqKey] : undefined
              if (typeof crossPoolPity === 'number') {
                img.pullCount = crossPoolPity
                const maxPity = PITY.charSoft
                img.barPercent = Math.min(100, Math.round((crossPoolPity / maxPity) * 100))
                const colorScale = PITY.charProbBoost
                const colorPercent = Math.min(100, (crossPoolPity / colorScale) * 100)
                img.barColorLevel = colorPercent < 50 ? 'green' : colorPercent < 80 ? 'yellow' : 'red'
              }
            }
          }
        }
        
        if (currentEntry.specialMilestones) {
          currentEntry.specialMilestones.pityToUp6Star = sharedPityToUp6Star
          currentEntry.specialMilestones.lastSixStarWasUp = lastLimitedSixStarWasUp
          currentEntry.specialMilestones.pullsToUp120 = (lastLimitedSixStarWasUp === true)
            ? 0
            : Math.max(0, PITY.specialMilestone120 - sharedPityToUp6Star)
        }
      }
    }
    // 角色池展示顺序：UP 池按 /api/bili-wiki/activities 的 start_time 升序（熔火灼痕 → 轻飘飘的信使 → 热烈色彩），非限定池随后
    const charPoolOrderByTime = biliUp?.charPoolOrderByTime || []
    const limitedOrderMap = {}
    charPoolOrderByTime.forEach((name, i) => { limitedOrderMap[name] = i })
    charPoolEntries.sort((a, b) => {
      const aLimited = isLimitedPoolName(a.poolName)
      const bLimited = isLimitedPoolName(b.poolName)
      if (aLimited && !bLimited) return -1
      if (!aLimited && bLimited) return 1
      if (aLimited && bLimited) {
        const ai = limitedOrderMap[a.poolName] ?? 9999
        const bi = limitedOrderMap[b.poolName] ?? 9999
        return ai - bi
      }
      return (a.poolName || '').localeCompare(b.poolName || '')
    })
    // 拆分为限定特许寻访 / 常驻寻访；常驻内 基础寻访 在上、启程寻访 在下
    const charPoolEntriesLimited = charPoolEntries.filter((e) => isLimitedPoolName(e.poolName))
    const charPoolEntriesNormal = charPoolEntries.filter((e) => !isLimitedPoolName(e.poolName))
    const normalOrder = ['基础寻访', '启程寻访']
    charPoolEntriesNormal.sort((a, b) => {
      const ai = normalOrder.indexOf(a.poolName)
      const bi = normalOrder.indexOf(b.poolName)
      if (ai !== -1 && bi !== -1) return ai - bi
      if (ai !== -1) return -1
      if (bi !== -1) return 1
      return (a.poolName || '').localeCompare(b.poolName || '')
    })

    // 武器池：按 pool_name 分开展示（星声申领、熔铸申领等）
    const weaponRecords = this.getCachePoolRecords(cacheData, 'weapon')
    const weaponByPoolName = {}
    const weaponFreeByPoolName = {}
    for (const r of weaponRecords) {
      const name = (r.pool_name || '').trim() || '未知'
      if (r.is_free === true) {
        if (!weaponFreeByPoolName[name]) weaponFreeByPoolName[name] = []
        weaponFreeByPoolName[name].push(r)
        continue
      }
      if (!weaponByPoolName[name]) weaponByPoolName[name] = []
      weaponByPoolName[name].push(r)
    }
    const weaponPoolEntries = []
    // 武器池排序：非星声申领按时间倒序（最新在上），星声申领固定在最后
    const weaponPoolNames = Object.keys(weaponByPoolName).sort((a, b) => {
      const isStarlightA = a.includes('星声申领')
      const isStarlightB = b.includes('星声申领')
      // 星声申领排到最后
      if (isStarlightA && !isStarlightB) return 1
      if (!isStarlightA && isStarlightB) return -1
      // 其他池子按最大 seq_id 降序（最新在上）
      const getMax = (pn) => {
        let max = -Infinity
        for (const r of (weaponByPoolName[pn] || [])) {
          const n = Number(r.seq_id)
          if (Number.isFinite(n) && n > max) max = n
        }
        return max
      }
      return getMax(b) - getMax(a)
    })
    for (const subPoolName of weaponPoolNames) {
      const groupRecords = weaponByPoolName[subPoolName]
      const showNotWaiRate = true
      const metric2Label = '不歪率'
      // 从 poolUpMap 获取该池子的 UP 武器名（支持历史池子）
      const poolSpecificWeaponUp = poolUpMap[subPoolName] || null
      const entry = buildPoolEntry(groupRecords, {
        isChar: false,
        isLimited: false,
        noWaiTag: false,
        metric2Label,
        metric2Default: '-',
        showNotWaiRate,
        poolUpWeaponName: poolSpecificWeaponUp
      })
      // 获取该池子的免费记录（卡池隔离），按 seq_id 倒序排序（新→旧）
      const wFreeRecords = (weaponFreeByPoolName[subPoolName] || []).sort((a, b) => Number(b.seq_id) - Number(a.seq_id))
      const wFreeStarImgs = buildFreeStarImages(wFreeRecords, false)
      const wMergedImages = [...entry.images, ...wFreeStarImgs]
      // 计算免费垫抽数：只有当最后一次免费抽卡不是6星时才显示垫抽行
      // 如果最后一条免费记录是6星，则垫抽数为0（不显示底部垫抽行，因为已经在 images 中显示了出货记录）
      const wFreeSorted = [...wFreeRecords].sort((a, b) => Number(a.seq_id) - Number(b.seq_id))
      const wLastFree6Idx = wFreeSorted.findLastIndex((r) => r.rarity === 6)
      const wFreePityCount = wLastFree6Idx >= 0 ? (wFreeSorted.length - wLastFree6Idx - 1) : wFreeSorted.length
      // 武器池按"申领次数"（十连）计数
      // 累计奖励节奏：第10次给武库箱，第18次给UP武器，之后每16次循环
      const weaponSessions = Math.floor(groupRecords.length / 10)
      // 计算当前垫抽数（单抽数）
      const pullsSinceLast6 = (() => {
        const sorted6 = [...groupRecords].sort((a, b) => Number(b.seq_id) - Number(a.seq_id))
        let count = 0
        for (const r of sorted6) {
          if (r.rarity === 6) break
          count++
        }
        return count
      })()
      const sessionsSinceLast6 = Math.floor(pullsSinceLast6 / 10)
      const sessionsToHardPity = Math.max(0, PITY.weaponSessionHard - sessionsSinceLast6)
      const hasUp6 = entry.counts[6] > 0
      const sessionsToUp6 = hasUp6 ? 0 : Math.max(0, PITY.weaponUpHard - weaponSessions)
      // 下一个累计奖励节点
      const nextBox = weaponSessions < 10 ? 10 : 10 + Math.ceil((weaponSessions + 1 - 10) / 16) * 16
      const nextUp = weaponSessions < 18 ? 18 : 18 + Math.ceil((weaponSessions + 1 - 18) / 16) * 16
      const nextRewardAt = Math.min(nextBox, nextUp)
      const nextRewardType = nextRewardAt === nextBox ? '武库箱' : 'UP武器'
      const weaponStatus = {
        totalSessions: weaponSessions,
        sessionsSinceLast6,
        sessionsToHardPity,
        hasUp6,
        sessionsToUp6,
        nextRewardAt,
        nextRewardType,
        remainingSessions: Math.max(0, nextRewardAt - weaponSessions)
      }
      // 武器池垫抽进度条：按单抽数显示，进度条按40抽为满计算（4次十连保底）
      const weaponPityBarPercent = pullsSinceLast6 > 0 ? Math.min(100, Math.round((pullsSinceLast6 / 40) * 100)) : 0
      const weaponPityBarColorLevel = pullsSinceLast6 < 20 ? 'green' : pullsSinceLast6 < 30 ? 'yellow' : 'red'
      // 合计抽数 + 垫抽展示文案（武器池按单抽数统计），例如「合计 60 抽 - 垫 20」
      const weaponTotalSummary = (() => {
        const totalPulls = groupRecords.length ?? 0
        const pity = pullsSinceLast6
        if (typeof pity === 'number' && pity > 0) {
          return `合计 ${totalPulls} 抽 - 垫 ${pity}`
        }
        return `合计 ${totalPulls} 抽`
      })()
      const headerWeaponName = String(poolSpecificWeaponUp || '').trim()
      const headerWeaponCover = getWeaponHeaderCover(headerWeaponName)
      const fallbackWeaponCover = getFallbackHeaderCover(wMergedImages)
      weaponPoolEntries.push({
        poolName: entry.poolName,
        total: groupRecords.length,
        totalPulls: groupRecords.length,
        totalSummary: weaponTotalSummary,
        star6: entry.star6,
        metric1: entry.avgUpCost,
        metric1Label: '平均UP花费',
        metric2: entry.metric2,
        metric2Label,
        images: wMergedImages,
        pitySinceLast6: pullsSinceLast6 > 0 ? pullsSinceLast6 : null,
        pityBarPercent: weaponPityBarPercent,
        pityBarColorLevel: weaponPityBarColorLevel,
        freeTotal: wFreePityCount,
        freeBarPercent: wFreePityCount > 0 ? Math.min(100, Math.round((wFreePityCount / 10) * 100)) : 0,
        counts: entry.counts,
        winRate: entry.winRate,
        sparkCount: entry.sparkCount,
        showHeaderCover: true,
        headerCoverUrl: headerWeaponCover || fallbackWeaponCover.url,
        headerCoverName: headerWeaponName || fallbackWeaponCover.name || entry.poolName,
        weaponStatus
      })
    }

    // 限定特许寻访倒序展示：最新在最上面，最老在最下面
    const poolGroups = [
      { label: '特许寻访', pools: charPoolEntriesLimited.slice().reverse() },
      { label: '武库交易所', pools: weaponPoolEntries },
      { label: '基础寻访', pools: charPoolEntriesNormal }
    ]


    // 顶部显示时间（替代「按池统计」）
    const now = new Date()
    const analysisTime =
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ` +
      `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

    const prefix = this.getCmdPrefix()
    const pluResPath = this.e?.runtime?.path?.plugin?.['endfield-plugin']?.res || ''

    if (this.e?.runtime?.render) {
      try {
        // 计算特许寻访平均出红（限定池）
        const limitedTotalPulls = charPoolEntriesLimited.reduce((sum, pool) => sum + (pool.total ?? 0), 0)
        const limitedTotal6Stars = charPoolEntriesLimited.reduce((sum, pool) => sum + (pool.star6 ?? 0), 0)
        const limitedAvgCost = limitedTotal6Stars > 0 ? Math.round(limitedTotalPulls / limitedTotal6Stars) : 0
        
        // 计算武器池平均出红
        const weaponTotalPulls = weaponPoolEntries.reduce((sum, pool) => sum + (pool.total ?? 0), 0)
        const weaponTotal6Stars = weaponPoolEntries.reduce((sum, pool) => sum + (pool.star6 ?? 0), 0)
        const weaponAvgCost = weaponTotal6Stars > 0 ? Math.round(weaponTotalPulls / weaponTotal6Stars) : 0
        
        // 计算常驻寻访平均出红
        const standardTotalPulls = charPoolEntriesNormal.reduce((sum, pool) => sum + (pool.total ?? 0), 0)
        const standardTotal6Stars = charPoolEntriesNormal.reduce((sum, pool) => sum + (pool.star6 ?? 0), 0)
        const standardAvgCost = standardTotal6Stars > 0 ? Math.round(standardTotalPulls / standardTotal6Stars) : 0

        const totalPulls = cacheSummary.totalCount
        const total6Stars = cacheSummary.star6
        const baseOpt = { scale: 1.6, retType: 'base64' }
        const renderDataBase = {
          title: '抽卡分析',
          subtitle: `${userNickname} · ${userInfo.channel_name || ''}`,
          userAvatar,
          userNickname,
          userUid,
          analysisTime,
          totalCount: totalPulls,
          star6: total6Stars,
          star5: cacheSummary.star5,
          star4: cacheSummary.star4,
          limitedAvgCost,
          weaponAvgCost,
          standardAvgCost,
          limitedTotal: cacheSummary.pools.limited?.total ?? 0,
          standardTotal: cacheSummary.pools.standard?.total ?? 0,
          beginnerTotal: cacheSummary.pools.beginner?.total ?? 0,
          weaponTotal: cacheSummary.pools.weapon?.total ?? 0,
          syncHint: `若需要刷新，发送 ${syncHintCommand}`,
          pluResPath,
          ...getCopyright()
        }

        const renderedGroups = []
        for (const group of poolGroups) {
          const imgSegment = await this.e.runtime.render('endfield-plugin', 'gacha/gacha-analysis', {
            ...renderDataBase,
            poolGroups: [group],
            poolGroupCount: 1,
            singleGroupMode: true
          }, baseOpt)
          if (imgSegment) {
            renderedGroups.push({ label: group.label, img: imgSegment })
          }
        }

        if (renderedGroups.length > 0) {
          const forwardParts = []
          if (options.syncMsg) {
            forwardParts.push([options.syncMsg])
          }
          for (const group of renderedGroups) {
            forwardParts.push([group.img])
          }
          const forwardMsg = common.makeForwardMsg(this.e, forwardParts, '抽卡分析')
          await this.e.reply(forwardMsg)
          await redis.set(GACHA_KEYS.lastAnalysis(this.e.user_id), String(Date.now()), { EX: 900 })
          return true
        }
      } catch (err) {
        logger.error(`[终末地插件][抽卡分析]渲染图失败: ${err?.message || err}`)
      }
    }

    let msg = options.syncMsg ? options.syncMsg + '\n\n' : ''
    msg += getMessage('gacha.analysis_fallback_title') + '\n'
    msg += getMessage('gacha.analysis_fallback_user', {
      name: userInfo.nickname || userInfo.game_uid || getMessage('common.unknown'),
      channel: userInfo.channel_name ? ` · ${userInfo.channel_name}` : ''
    }) + '\n'
    for (const group of poolGroups) {
      for (const p of group.pools) {
        msg += getMessage('gacha.analysis_fallback_line', {
          group: group.label,
          pool: p.poolName,
          total: p.total,
          metric1Label: p.metric1Label,
          metric1: p.metric1,
          metric2Label: p.metric2Label,
          metric2: p.metric2
        }) + '\n'
      }
    }
    msg += getMessage('gacha.analysis_fallback_recent_hint', { prefix })
    await this.reply(msg, false, options.syncMsg ? { at: !!this.e.isGroup } : {})
    await redis.set(GACHA_KEYS.lastAnalysis(this.e.user_id), String(Date.now()), { EX: 900 })
    return true
  }

  /** 同步完成后调用：拉取最新 stats 并制图发送抽卡分析；syncMsg 非空时与图片合并为一条消息；targetUserId 指定查询目标用户 */
  async renderAndSendGachaAnalysis(syncMsg, targetUserId) {
    const uid = targetUserId || this.e.user_id
    const sklUser = new EndfieldUser(uid)
    if (!(await sklUser.getUser())) {
      if (syncMsg) await this.reply(syncMsg, false, { at: !!this.e.isGroup })
      return
    }
    const roleId = String(sklUser.endfield_uid || '')
    const cacheData = this.readLocalGachaCache(uid, roleId)
    const statsData = cacheData?.stats_data || null
    if (!statsData) {
      if (syncMsg) await this.reply(syncMsg, false, { at: !!this.e.isGroup })
      return
    }
    const opts = { targetUserId: uid, cacheData }
    if (syncMsg) opts.syncMsg = syncMsg
    await this.renderGachaAnalysisAndReply(statsData, opts)
  }

  getCmdPrefix() {
    return ':'
  }

  /** 将后端返回的 {qqname}、{qq号} 替换为当前用户昵称与 QQ 号，用于控制台日志 */
  formatProgressMsg(msg, userId, qqName) {
    if (!msg || typeof msg !== 'string') return msg
    const uid = userId != null ? String(userId) : ''
    const name = qqName != null && qqName !== '' ? String(qqName) : uid || getMessage('common.user')
    return msg.replace(/\{qq号\}/g, uid).replace(/\{qqname\}/g, name)
  }

  /** 抽卡记录同步入口：直接使用当前激活绑定的角色（role_id/server_id）启动同步并轮询 */
  async syncGacha(options = {}) {
    const targetInfo = await this.resolveSyncTarget(options)
    if (!targetInfo) return true
    if (targetInfo.error) {
      await this.reply(targetInfo.error)
      return true
    }
    if (targetInfo.requiresMaster && !this.e?.isMaster) {
      return false
    }
    const targetUserId = targetInfo.userId
    const sklUser = new EndfieldUser(targetUserId)
    if (!(await sklUser.getUser())) {
      await this.reply(getUnbindMessage())
      return true
    }

    const token = sklUser.framework_token
    const roleId = String(sklUser.endfield_uid || '')
    const serverId = String(sklUser.server_id || '1')
    const query = { role_id: roleId, server_id: serverId }

    const statusData = await hypergryphAPI.getGachaSyncStatus(token, query)
    if (statusData?.status === 'syncing') {
      const { message, progress, stage, current_pool, records_found, completed_pools, total_pools, elapsed_seconds } = statusData
      const rawMsg = message || (current_pool ? getMessage('gacha.sync_query_pool', { pool: current_pool }) : '')
      const progressMsg = this.formatProgressMsg(rawMsg, this.e.user_id, this.e.sender?.nickname || this.e.sender?.card)
      const stageLabel = {
        grant: getMessage('gacha.sync_stage_grant'),
        bindings: getMessage('gacha.sync_stage_bindings'),
        u8token: getMessage('gacha.sync_stage_u8token'),
        records: getMessage('gacha.sync_stage_records'),
        saving: getMessage('gacha.sync_stage_saving')
      }[stage] || stage || ''
      let msg = getMessage('gacha.sync_in_progress') + '\n'
      msg += getMessage('gacha.sync_progress_line', {
        progress: progress ?? 0,
        pools: (total_pools != null && completed_pools != null)
          ? getMessage('gacha.sync_progress_pools', { completed: completed_pools, total: total_pools })
          : '',
        records: records_found != null ? getMessage('gacha.sync_progress_records', { records: records_found }) : '',
        elapsed: elapsed_seconds != null ? getMessage('gacha.sync_progress_elapsed', { seconds: Math.round(elapsed_seconds) }) : ''
      })
      if (stageLabel) msg += '\n' + getMessage('gacha.sync_progress_stage', { stage: stageLabel })
      await this.reply(msg)
      return true
    }
    const qqName = this.e.sender?.nickname || this.e.sender?.card || String(this.e.user_id)
    
    // 只有一个账号时，在开始同步前发送提示
    if (options?.fromSync || options?.fromAnalysis) {
      const isFirstSync = options?.isFirstSync ?? false
      if (options?.fromAnalysis) {
        await this.reply(getMessage('gacha.analysis_sync_start'))
      } else {
        await this.reply(getMessage(isFirstSync ? 'gacha.auth_full_sync' : 'gacha.sync_start'))
      }
    }
    
    await this.startFetchAndPoll(token, null, roleId, serverId, targetUserId, qqName, {
      afterSyncSendAnalysis: options?.afterSyncSendAnalysis,
      fromAnalysis: options?.fromAnalysis,
      fromSync: options?.fromSync
    })
    return true
  }

  extractTargetPlatformUserId(msg = '') {
    const text = String(msg || '').trim()
    const patterns = [
      /^(?:[:：]|[/#](?:zmd|终末地))\s*(?:同步|更新)抽卡记录(?:\s+(\S+))?\s*$/i,
      /^(?:[:：]|[/#](?:zmd|终末地))\s*抽卡分析(?:\s+(\S+))?\s*$/i
    ]
    for (const pattern of patterns) {
      const match = text.match(pattern)
      if (match) return String(match[1] || '').trim()
    }
    return ''
  }

  async resolveSyncTarget(options = {}) {
    if (options?.targetUserId) {
      const requestedUserId = String(options.targetUserId).trim()
      if (!requestedUserId) return { userId: String(this.e.user_id), requiresMaster: false }
      if (requestedUserId === String(this.e.user_id)) {
        return { userId: requestedUserId, requiresMaster: false }
      }
      if (!this.e?.isMaster) {
        return { error: getMessage('gacha.sync_master_only') }
      }
      return { userId: requestedUserId, requiresMaster: true }
    }
    const atUser = this.e?.at
    const msg = (this.e.msg || '').trim()
    const platformUserId = this.extractTargetPlatformUserId(msg)
    if (!atUser && !platformUserId) {
      return { userId: String(this.e.user_id), requiresMaster: false }
    }
    if (!this.e?.isMaster) {
      return { error: getMessage('gacha.sync_master_only') }
    }
    if (atUser) {
      return { userId: String(atUser), requiresMaster: true }
    }
    const requestedUserId = String(platformUserId || '').trim()
    if (!requestedUserId) {
      return { userId: String(this.e.user_id), requiresMaster: false }
    }
    if (!redis) return { error: getMessage('gacha.no_accounts') }
    try {
      const raw = await redis.get(REDIS_KEY(requestedUserId))
      if (raw) {
        return { userId: requestedUserId, requiresMaster: true }
      }
    } catch (err) {
      logger.error(`[终末地插件][抽卡同步] 解析平台用户ID失败: ${err}`)
    }
    return { error: getMessage('gacha.no_accounts') }
  }

  /**
   * 启动同步任务并轮询直到 completed / failed
   * 同步流程：当前激活绑定 -> fetch(role_id/server_id) -> status 轮询 -> records 落本地缓存
   * @param {string} token 用户 framework_token
   * @param {string|null} accountUid 多账号时选中的 uid
   * @param {string|null} roleId 游戏角色 ID（绑定中的 role_id）
   * @param {string|null} serverId 服务器 ID（默认 1）
   * @param {string|number} [userId] 当前 QQ 号，用于日志占位符 {qq号}
   * @param {string} [qqName] 当前 QQ 昵称，用于日志占位符 {qqname}
   * @param {{ afterSyncSendAnalysis?: boolean, fromAnalysis?: boolean }} [options] 同步完成后发抽卡分析图；fromAnalysis 为 true 时不发「开始同步」类提示（由抽卡分析已发过）
   */
  async startFetchAndPoll(token, accountUid, roleId, serverId, userId, qqName, options = {}) {
    const afterSyncSendAnalysis = options?.afterSyncSendAnalysis ?? false
    const fromAnalysis = options?.fromAnalysis ?? false
    const fromSync = options?.fromSync ?? false
    const query = {
      role_id: String(roleId || ''),
      server_id: String(serverId || '1')
    }
    // 先判断是否首次同步，只发一条开始提示（首次→首次同步，否则→开始同步）
    const statsData = await hypergryphAPI.getGachaStats(token, query)
    const hasSyncRecord = this.hasAnyGachaRecord(statsData)
    const isFirstSync = !hasSyncRecord

    const body = {}
    if (accountUid) body.account_uid = accountUid
    if (roleId) body.role_id = String(roleId)
    body.server_id = String(serverId || '1')
    const fetchRes = await hypergryphAPI.postGachaFetch(token, body)
    if (fetchRes && fetchRes.status === 'conflict') {
      await this.reply(getMessage('gacha.sync_busy'))
      return
    }
    if (!fetchRes || !fetchRes.status) {
      await this.reply(getMessage('gacha.sync_start_failed'))
      return
    }

    // 由抽卡分析或同步抽卡记录触发的同步已发过提示，此处不再重复发开始提示
    if (!fromAnalysis && !fromSync) {
      await this.reply(getMessage(isFirstSync ? 'gacha.auth_full_sync' : 'gacha.sync_start'))
    }

    let lastProgressMessage = ''
    let timeoutRetryUsed = false
    while (true) {
      const start = Date.now()
      while (Date.now() - start < SYNC_MS.pollTimeout) {
        await this.sleep(SYNC_MS.pollInterval)
        const statusData = await hypergryphAPI.getGachaSyncStatus(token, query)
        if (!statusData) continue
        const { status, message, records_found, new_records, error, current_pool } = statusData
        if (status === 'syncing' && (message || current_pool)) {
          const rawMsg = message || (current_pool ? getMessage('gacha.sync_query_pool', { pool: current_pool }) : '')
          const progressMsg = this.formatProgressMsg(rawMsg, userId, qqName)
          if (progressMsg && progressMsg !== lastProgressMessage) {
            lastProgressMessage = progressMsg
          }
        }
        if (status === 'completed') {
          const total = records_found ?? 0
          const added = new_records ?? 0
          let poolLine = ''
          const statsData = await hypergryphAPI.getGachaStats(token, query)
          const stats = statsData?.stats || {}
          if (stats.limited_char_count != null || stats.standard_char_count != null || stats.beginner_char_count != null || stats.weapon_count != null) {
            const parts = []
            if (stats.limited_char_count != null) parts.push(getMessage('gacha.sync_done_pool_limited', { count: stats.limited_char_count }))
            if (stats.standard_char_count != null) parts.push(getMessage('gacha.sync_done_pool_standard', { count: stats.standard_char_count }))
            if (stats.beginner_char_count != null) parts.push(getMessage('gacha.sync_done_pool_beginner', { count: stats.beginner_char_count }))
            if (stats.weapon_count != null) parts.push(getMessage('gacha.sync_done_pool_weapon', { count: stats.weapon_count }))
            if (parts.length) poolLine = '\n' + getMessage('gacha.sync_done_pools', { pools: parts.join(' | ') }).trim()
          }
          const syncDoneMsg = getMessage('gacha.sync_done', {
            records_found: total,
            new_records: added,
            pool_detail: poolLine
          })
          let cacheRoleId = String(roleId || '')
          let cacheServerId = String(serverId || '1')
          if (!cacheRoleId) {
            const cacheUser = new EndfieldUser(userId)
            if (await cacheUser.getUser()) {
              cacheRoleId = String(cacheUser.endfield_uid || '')
              cacheServerId = String(cacheUser.server_id || '1')
            }
          }
          await this.refreshLocalGachaCacheFromCloud(token, userId, cacheRoleId, cacheServerId)
          // 同步完成文字 + 分析图始终合并为一条消息发送
          await this.renderAndSendGachaAnalysis(syncDoneMsg, userId)
          return
        }
        if (status === 'failed') {
          await this.reply(getMessage('gacha.sync_failed', { error: error || message || '未知错误' }))
          return
        }
      }
      if (Number.isFinite(SYNC_MS.pollTimeout)) {
        // 本轮超时：首次则等待 5 秒后继续轮询（不提醒用户），再次超时再提醒
        if (!timeoutRetryUsed) {
          timeoutRetryUsed = true
          await this.sleep(5000)
          continue
        }
        await this.reply(getMessage('gacha.sync_timeout'))
        return
      }
    }
  }

  sleep(ms) {
    return new Promise((r) => setTimeout(r, ms))
  }
}
