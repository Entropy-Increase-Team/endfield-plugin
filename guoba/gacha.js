/** 锅巴配置：模拟抽卡配置（需 groupList 用于群白名单） */
export default function getGachaSchemas(groupList) {
  return [
    {
      label: '模拟抽卡配置',
      component: 'SOFT_GROUP_BEGIN'
    },
    {
      field: 'gacha.simulate.enable',
      label: '模拟抽卡功能开关',
      bottomHelpMessage: '关闭后所有人无法使用 :单抽 / :十连 / :模拟抽卡；好友仅受此开关影响',
      component: 'Switch',
    },
    {
      field: 'gacha.simulate.group_whitelist',
      label: '模拟抽卡群聊白名单',
      bottomHelpMessage: '不填则所有群可用；仅影响群聊，好友不受白名单限制',
      component: 'Select',
      componentProps: {
        allowAdd: true,
        allowDel: true,
        mode: 'multiple',
        options: groupList,
        placeholder: '选择允许使用模拟抽卡的群（不选=不限制）',
      },
    },
    {
      field: 'gacha.simulate.daily_limit.limited',
      label: '限定池每日使用次数',
      bottomHelpMessage: '单抽/十连/模拟抽卡均计 1 次；0 表示不限制',
      component: 'InputNumber',
      componentProps: { min: 0, placeholder: '0 不限制' },
    },
    {
      field: 'gacha.simulate.daily_limit.standard',
      label: '常驻池每日使用次数',
      bottomHelpMessage: '0 表示不限制',
      component: 'InputNumber',
      componentProps: { min: 0, placeholder: '0 不限制' },
    },
    {
      field: 'gacha.simulate.daily_limit.weapon',
      label: '武器池每日使用次数',
      bottomHelpMessage: '0 表示不限制',
      component: 'InputNumber',
      componentProps: { min: 0, placeholder: '0 不限制' },
    },
  ]
}
