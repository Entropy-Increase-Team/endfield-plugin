import setting from '../utils/setting.js'

export default class EndfieldApi {
  constructor(uid, server = 'cn') {
    this.server = server
    this.uid = uid
    this.commonConfig = setting.getConfig('common') || {}
    this.unifiedBackendBaseUrl = 'https://end-api.shallow.ink'
  }

  getUrlMap = (data = {}) => {
    const baseUrl = this.unifiedBackendBaseUrl
    return {
      user_info: {
        url: `${baseUrl}/api/endfield/user`
      },
      binding: {
        url: `${baseUrl}/api/endfield/binding`
      },
      endfield_attendance: {
        url: `${baseUrl}/api/endfield/attendance`,
        method: 'post'
      },
      endfield_card_detail: {
        url: `${baseUrl}/api/endfield/card/detail`,
        query: `roleId=${data.roleId || this.uid}&serverId=${data.serverId || 1}&userId=${data.userId || this.uid}`
      },
      endfield_card_char: {
        url: `${baseUrl}/api/endfield/card/char`,
        query: (() => {
          const params = []
          if (data.instId) params.push(`instId=${data.instId}`)
          else {
            if (data.operatorId) params.push(`operatorId=${data.operatorId}`)
            if (data.charId) params.push(`charId=${data.charId}`)
          }
          if (data.roleId) params.push(`roleId=${data.roleId}`)
          if (data.serverId) params.push(`serverId=${data.serverId}`)
          return params.join('&')
        })()
      },
      endfield_search_chars: {
        url: `${baseUrl}/api/endfield/search/chars`
      },
      endfield_search_weapons: {
        url: `${baseUrl}/api/endfield/search/weapons`
      },
      endfield_search_equipments: {
        url: `${baseUrl}/api/endfield/search/equipments`
      },
      endfield_search_tactical_items: {
        url: `${baseUrl}/api/endfield/search/tactical-items`
      },
      stamina: {
        url: `${baseUrl}/api/endfield/stamina`,
        query: data.roleId ? `roleId=${data.roleId}&serverId=${data.serverId || 1}` : ''
      },
      spaceship: {
        url: `${baseUrl}/api/endfield/spaceship`,
        query: data.roleId ? `roleId=${data.roleId}&serverId=${data.serverId || 1}` : ''
      },
      note: {
        url: `${baseUrl}/api/endfield/note`,
        query: data.roleId ? `roleId=${data.roleId}&serverId=${data.serverId || 1}` : ''
      },
      // 地区建设：与 API 文档一致，GET /api/endfield/domain
      cultivate_zone: {
        url: `${baseUrl}/api/endfield/domain`,
        query: data.roleId ? `roleId=${data.roleId}&serverId=${data.serverId || 1}` : ''
      }
    }
  }

  /**
   * Wiki 百科 API 地址映射（认证仅需 X-API-Key）
   * 对应：/api/wiki/search、/api/wiki/items（列表）、/api/wiki/items/:id（详情）
   */
  getWikiUrlMap = (data = {}) => {
    const baseUrl = this.unifiedBackendBaseUrl
    const q = encodeURIComponent(data.q || data.keyword || '')
    const mainTypeId = data.main_type_id || ''
    const subTypeId = data.sub_type_id || ''
    const page = data.page ?? 1
    const pageSize = data.page_size ?? 20
    const searchQuery = [
      q ? `q=${q}` : '',
      mainTypeId ? `main_type_id=${mainTypeId}` : '',
      subTypeId ? `sub_type_id=${subTypeId}` : '',
      `page=${page}`,
      `page_size=${pageSize}`
    ].filter(Boolean).join('&')
    const itemsListQuery = [
      mainTypeId ? `main_type_id=${mainTypeId}` : '',
      subTypeId ? `sub_type_id=${subTypeId}` : '',
      `page=${page}`,
      `page_size=${pageSize}`
    ].filter(Boolean).join('&')
    return {
      wiki_search: {
        url: `${baseUrl}/api/wiki/search`,
        query: searchQuery
      },
      wiki_items: {
        url: `${baseUrl}/api/wiki/items`,
        query: itemsListQuery
      },
      wiki_item_detail: {
        url: `${baseUrl}/api/wiki/items/${data.id || ''}`
      },
      wiki_activities: {
        url: `${baseUrl}/api/wiki/activities`
      },
      /** 哔哩 Wiki 活动列表：本期 UP/武库等，GET /api/bili-wiki/activities，响应 data.activities */
      bili_wiki_activities: {
        url: `${baseUrl}/api/bili-wiki/activities`
      }
    }
  }

  /**
   * 公告 API 地址映射（认证仅需 X-API-Key，见 API 文档 公告 API）
   * 对应：/api/announcements 列表、/api/announcements/latest、/api/announcements/:id 详情
   */
  getAnnouncementsUrlMap = (data = {}) => {
    const baseUrl = this.unifiedBackendBaseUrl
    const page = data.page ?? 1
    const pageSize = Math.min(100, Math.max(1, data.page_size ?? 20))
    const listQuery = `page=${page}&page_size=${pageSize}`
    return {
      announcements_list: {
        url: `${baseUrl}/api/announcements`,
        query: listQuery
      },
      announcements_latest: {
        url: `${baseUrl}/api/announcements/latest`
      },
      announcement_detail: {
        url: `${baseUrl}/api/announcements/${encodeURIComponent(data.id || data.item_id || '')}`
      }
    }
  }
}
