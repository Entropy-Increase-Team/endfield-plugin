/** 锅巴配置：基础配置（授权请求、API 认证） */
export default function getCommonSchemas() {
  return [
    {
      label: '基础配置',
      component: 'SOFT_GROUP_BEGIN'
    },
    {
      component: 'Divider',
      label: '授权请求配置',
    },
    {
      field: 'auth_client_name',
      label: '客户端名称',
      bottomHelpMessage: '授权登陆时展示的客户端名称',
      component: 'Input',
      componentProps: {
        placeholder: '终末地机器人',
      },
    },
    {
      field: 'auth_client_type',
      label: '客户端类型',
      bottomHelpMessage: '授权请求的客户端类型（如 bot）',
      component: 'Input',
      componentProps: {
        placeholder: 'bot',
      },
    },
    {
      field: 'auth_scopes',
      label: '授权范围',
      bottomHelpMessage: '授权请求的权限范围列表',
      component: 'GTags',
      componentProps: {
        placeholder: '请输入授权范围后回车',
      },
    },
    {
      component: 'Divider',
      label: 'API 认证',
    },
    {
      field: 'api_key',
      label: 'API 密钥',
      bottomHelpMessage: '用于第三方客户端认证的 API 密钥，在 https://end.shallow.ink 获取',
      component: 'Input',
      required: true,
      componentProps: {
        placeholder: '请输入 API 密钥',
        type: 'password',
      },
    },
  ]
}
