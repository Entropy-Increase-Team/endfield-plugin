/** 锅巴配置：签到配置（需 groupList 用于群聊选择） */
export default function getSignSchemas(groupList) {
  return [
    {
      label: '签到配置',
      component: 'SOFT_GROUP_BEGIN'
    },
    {
      field: 'sign.auto_sign',
      label: '自动签到开关',
      bottomHelpMessage: '开启后自动执行签到任务',
      component: 'Switch',
    },
    {
      field: 'sign.auto_sign_cron',
      label: '自动签到时间',
      bottomHelpMessage: '可视化设置定时任务的执行时间，也可以直接编辑cron表达式',
      component: 'EasyCron',
    },
    {
      field: 'sign.notify_list.friend',
      label: '好友通知列表',
      bottomHelpMessage: '签到任务开始/完成时，向以下QQ号发送私聊通知',
      component: 'GTags',
      componentProps: {
        placeholder: '请输入QQ号后回车添加',
      },
    },
    {
      field: 'sign.notify_list.group',
      label: '群聊通知列表',
      bottomHelpMessage: '签到任务开始/完成消息推送至这些群；也可在群里使用 #终末地全部签到 触发任务',
      component: 'Select',
      componentProps: {
        allowAdd: true,
        allowDel: true,
        mode: 'multiple',
        options: groupList,
        placeholder: '选择要推送的群',
      },
    },
  ]
}
