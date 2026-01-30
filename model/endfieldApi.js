import setting from '../utils/setting.js'

export default class EndfieldApi {
  constructor(uid, server = 'cn') {
    this.server = server
    this.uid = uid
    this.commonConfig = setting.getConfig('common') || {}
    this.unifiedBackendBaseUrl = this.commonConfig.unified_backend_base_url || 'https://end-api.shallow.ink'
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
      cultivate_zone: {
        url: `${baseUrl}/api/endfield/cultivate/zone`,
        query: (() => {
          const params = []
          const roleId = data.roleId || this.uid
          params.push(`roleId=${roleId}`)
          if (data.serverId) params.push(`serverId=${data.serverId}`)
          if (data.userId) params.push(`userId=${data.userId}`)
          return params.join('&')
        })()
      }
    }
  }
}
