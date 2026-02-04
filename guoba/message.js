/** 锅巴配置：消息配置（各功能提示文案） */
export default function getMessageSchemas() {
  return [
    {
      label: '消息配置',
      component: 'SOFT_GROUP_BEGIN'
    },
    {
      component: 'Alert',
      componentProps: {
        type: 'info',
        message: '提示：消息配置支持占位符 {prefix} 和 {name}。配置保存到 config/message.yaml，defSet/message.yaml 为默认配置不可修改。',
      },
    },
    {
      component: 'Divider',
      label: '基础配置',
    },
    {
      field: 'bluemap_help_doc',
      label: '蓝图文档链接',
      component: 'Input',
      componentProps: {
        placeholder: 'https://www.kdocs.cn/l/caI2H6e4APLS',
      },
    },
    {
      field: 'official_website',
      label: '官网链接',
      component: 'Input',
      componentProps: {
        placeholder: 'https://end.shallow.ink',
      },
    },
    {
      field: 'prefix_tips_mode1',
      label: '前缀提示（模式1）',
      component: 'Input',
      componentProps: {
        placeholder: '前缀：: / ：',
      },
    },
    {
      field: 'prefix_tips_mode2',
      label: '前缀提示（模式2）',
      component: 'Input',
      componentProps: {
        placeholder: '前缀：#终末地 / #zmd',
      },
    },
    {
      field: 'unbind_message',
      label: '未绑定账号提示',
      component: 'InputTextArea',
      componentProps: {
        rows: 4,
        placeholder: '未绑定终末地森空岛账号...',
      },
    },
    {
      component: 'Divider',
      label: '公告',
    },
    {
      field: 'announcement.need_api_key',
      label: '公告 - 需要 api_key',
      component: 'Input',
    },
    {
      field: 'announcement.subscribe_use_in_group',
      label: '公告 - 订阅请在群聊',
      component: 'Input',
    },
    {
      field: 'announcement.subscribe_ok',
      label: '公告 - 订阅成功',
      component: 'Input',
    },
    {
      field: 'announcement.already_subscribed',
      label: '公告 - 已订阅',
      component: 'Input',
    },
    {
      field: 'announcement.unsubscribe_group_only',
      label: '公告 - 仅群聊取消订阅',
      component: 'Input',
    },
    {
      field: 'announcement.unsubscribe_ok',
      label: '公告 - 取消订阅成功',
      component: 'Input',
    },
    {
      field: 'announcement.list_header',
      label: '公告 - 列表标题',
      component: 'Input',
    },
    {
      field: 'announcement.list_subtitle',
      label: '公告 - 列表副标题',
      component: 'Input',
    },
    {
      field: 'announcement.list_footer_line1',
      label: '公告 - 列表页脚行1',
      component: 'Input',
    },
    {
      field: 'announcement.no_list',
      label: '公告 - 暂无公告',
      component: 'Input',
    },
    {
      field: 'announcement.list_failed',
      label: '公告 - 列表获取失败',
      component: 'Input',
    },
    {
      field: 'announcement.latest_failed',
      label: '公告 - 最新获取失败',
      component: 'Input',
    },
    {
      field: 'announcement.detail_index_out',
      label: '公告 - 详情序号越界',
      component: 'Input',
    },
    {
      field: 'announcement.title_unknown',
      label: '公告 - 无标题',
      component: 'Input',
    },
    {
      field: 'announcement.time_label',
      label: '公告 - 时间标签',
      component: 'Input',
    },
    {
      field: 'announcement.render_failed',
      label: '公告 - 渲染失败',
      component: 'Input',
    },
    {
      component: 'Divider',
      label: '活动日历',
    },
    {
      field: 'activity.need_api_key',
      label: '活动 - 需要 api_key',
      component: 'Input',
    },
    {
      field: 'activity.query_failed',
      label: '活动 - 查询失败',
      component: 'Input',
    },
    {
      field: 'activity.no_records',
      label: '活动 - 无记录',
      component: 'Input',
    },
    {
      component: 'Divider',
      label: 'Wiki 查询提示',
    },
    {
      field: 'wiki.provide_content',
      label: 'Wiki - 请提供查询内容',
      component: 'Input',
    },
    {
      field: 'wiki.need_api_key',
      label: 'Wiki - 需要 api_key',
      component: 'Input',
    },
    {
      field: 'wiki.query_failed',
      label: 'Wiki - 查询失败',
      component: 'Input',
    },
    {
      field: 'wiki.not_found',
      label: 'Wiki - 未找到',
      component: 'Input',
    },
    {
      field: 'wiki.detail_failed',
      label: 'Wiki - 详情获取失败',
      component: 'Input',
    },
    {
      component: 'Divider',
      label: '干员相关提示',
    },
    {
      field: 'operator.provide_name',
      label: '干员 - 请提供名称',
      component: 'Input',
    },
    {
      field: 'operator.loading_detail',
      label: '干员 - 正在获取信息',
      component: 'Input',
    },
    {
      field: 'operator.no_operator_id',
      label: '干员 - 未获取到ID',
      component: 'Input',
    },
    {
      field: 'operator.panel_failed',
      label: '干员 - 生成面板失败',
      component: 'Input',
    },
    {
      field: 'operator.loading_list',
      label: '干员 - 正在获取列表',
      component: 'Input',
    },
    {
      field: 'operator.list_failed',
      label: '干员 - 生成列表失败',
      component: 'Input',
    },
    {
      field: 'operator.not_found_info',
      label: '干员 - 未找到信息',
      component: 'Input',
    },
    {
      field: 'operator.not_found',
      label: '干员 - 未找到',
      component: 'Input',
    },
    {
      field: 'operator.get_detail_failed',
      label: '干员 - 获取详情失败',
      component: 'Input',
    },
    {
      field: 'operator.query_failed',
      label: '干员 - 查询失败',
      component: 'Input',
    },
    {
      field: 'operator.get_bind_failed',
      label: '干员 - 获取绑定失败',
      component: 'Input',
    },
    {
      field: 'operator.get_user_failed',
      label: '干员 - 获取用户失败',
      component: 'Input',
    },
    {
      field: 'operator.get_role_failed',
      label: '干员 - 获取角色失败',
      component: 'Input',
    },
    {
      component: 'Divider',
      label: '通用错误提示',
    },
    {
      field: 'common.not_found_bind_info',
      label: '通用 - 未找到绑定信息',
      component: 'Input',
    },
    {
      field: 'common.not_found_role_id',
      label: '通用 - 未找到角色ID',
      component: 'Input',
    },
    {
      field: 'common.not_found_role_info',
      label: '通用 - 未找到角色信息',
      component: 'Input',
    },
    {
      field: 'common.not_found_login_info',
      label: '通用 - 未找到登陆信息',
      component: 'Input',
    },
    {
      field: 'common.not_found_skland_user_id',
      label: '通用 - 未找到森空岛用户ID',
      component: 'Input',
    },
    {
      field: 'common.not_found_cred',
      label: '通用 - 未找到cred',
      component: 'Input',
    },
    {
      field: 'common.switch_failed',
      label: '通用 - 切换失败',
      component: 'Input',
    },
    {
      field: 'common.query_failed',
      label: '通用 - 查询失败',
      component: 'Input',
    },
    {
      field: 'common.get_bind_failed',
      label: '通用 - 获取绑定失败',
      component: 'Input',
    },
    {
      field: 'common.get_user_failed',
      label: '通用 - 获取用户失败',
      component: 'Input',
    },
    {
      field: 'common.get_role_failed',
      label: '通用 - 获取角色失败',
      component: 'Input',
    },
    {
      field: 'common.read_info_failed',
      label: '通用 - 读取信息失败',
      component: 'Input',
    },
    {
      field: 'common.parse_info_failed',
      label: '通用 - 解析信息失败',
      component: 'Input',
    },
    {
      field: 'common.delete_failed',
      label: '通用 - 删除失败',
      component: 'Input',
    },
    {
      field: 'common.login_failed',
      label: '通用 - 登陆失败',
      component: 'Input',
    },
    {
      field: 'common.login_failed_no_cred',
      label: '通用 - 登陆失败（无cred）',
      component: 'Input',
    },
    {
      field: 'common.login_failed_no_cred_phone',
      label: '通用 - 登陆失败（无cred-手机）',
      component: 'Input',
    },
    {
      component: 'Divider',
      label: '功能模块提示',
    },
    {
      field: 'spaceship.loading',
      label: '帝江号 - 加载中',
      component: 'Input',
    },
    {
      field: 'spaceship.not_found_info',
      label: '帝江号 - 未找到信息',
      component: 'Input',
    },
    {
      field: 'spaceship.get_bind_failed',
      label: '帝江号 - 获取绑定失败',
      component: 'Input',
    },
    {
      field: 'spaceship.get_user_failed',
      label: '帝江号 - 获取用户失败',
      component: 'Input',
    },
    {
      field: 'spaceship.get_role_failed',
      label: '帝江号 - 获取角色失败',
      component: 'Input',
    },
    {
      field: 'spaceship.query_failed',
      label: '帝江号 - 查询失败',
      component: 'Input',
    },
    {
      field: 'area.loading',
      label: '地区建设 - 加载中',
      component: 'Input',
    },
    {
      field: 'area.not_found_info',
      label: '地区建设 - 未找到信息',
      component: 'Input',
    },
    {
      field: 'area.get_bind_failed',
      label: '地区建设 - 获取绑定失败',
      component: 'Input',
    },
    {
      field: 'area.get_user_failed',
      label: '地区建设 - 获取用户失败',
      component: 'Input',
    },
    {
      field: 'area.get_role_failed',
      label: '地区建设 - 获取角色失败',
      component: 'Input',
    },
    {
      field: 'area.get_zone_failed',
      label: '地区建设 - 获取地区失败',
      component: 'Input',
    },
    {
      field: 'area.query_failed',
      label: '地区建设 - 查询失败',
      component: 'Input',
    },
    {
      field: 'note.loading',
      label: '便签 - 加载中',
      component: 'Input',
    },
    {
      field: 'note.get_bind_failed',
      label: '便签 - 获取绑定失败',
      component: 'Input',
    },
    {
      field: 'note.get_user_failed',
      label: '便签 - 获取用户失败',
      component: 'Input',
    },
    {
      field: 'note.get_role_failed',
      label: '便签 - 获取角色失败',
      component: 'Input',
    },
    {
      field: 'note.query_failed',
      label: '便签 - 查询失败',
      component: 'Input',
    },
    {
      field: 'stamina.subscribed',
      label: '理智 - 已订阅',
      component: 'Input',
    },
    {
      field: 'stamina.subscribe_ok',
      label: '理智 - 订阅成功',
      component: 'Input',
    },
    {
      field: 'stamina.subscribe_ok_full',
      label: '理智 - 订阅成功（回满推送）',
      component: 'Input',
    },
    {
      field: 'stamina.subscribe_ok_threshold',
      label: '理智 - 订阅成功（阈值）',
      component: 'Input',
    },
    {
      field: 'stamina.push_msg',
      label: '理智 - 推送消息',
      component: 'Input',
    },
    {
      field: 'stamina.push_setting_example',
      label: '理智 - 推送设置示例',
      component: 'Input',
    },
    {
      field: 'stamina.unsubscribe_ok',
      label: '理智 - 取消订阅成功',
      component: 'Input',
    },
    {
      field: 'stamina.not_subscribed',
      label: '理智 - 未订阅',
      component: 'Input',
    },
    {
      field: 'stamina.loading',
      label: '理智 - 加载中',
      component: 'Input',
    },
    {
      field: 'stamina.get_role_failed',
      label: '理智 - 获取角色失败',
      component: 'Input',
    },
    {
      field: 'stamina.query_failed',
      label: '理智 - 查询失败',
      component: 'Input',
    },
    {
      field: 'attendance.sign_failed',
      label: '签到 - 签到失败',
      component: 'Input',
    },
    {
      field: 'attendance.already_signed',
      label: '签到 - 已签到',
      component: 'Input',
    },
    {
      field: 'attendance.task_start',
      label: '签到 - 任务开始',
      component: 'Input',
    },
    {
      field: 'attendance.task_start_broadcast',
      label: '签到 - 任务开始广播',
      component: 'InputTextArea',
      componentProps: {
        rows: 2,
      },
    },
    {
      field: 'attendance.task_complete',
      label: '签到 - 任务完成',
      component: 'InputTextArea',
      componentProps: {
        rows: 3,
      },
    },
    {
      field: 'attendance.task_complete_fail_users',
      label: '签到 - 失败用户列表',
      component: 'InputTextArea',
      componentProps: {
        rows: 2,
      },
    },
    {
      component: 'Divider',
      label: '抽卡',
    },
    {
      field: 'gacha.global_stats_failed',
      label: '抽卡 - 全服统计失败',
      component: 'Input',
    },
    {
      field: 'gacha.no_accounts',
      label: '抽卡 - 无可用账号',
      component: 'Input',
    },
    {
      field: 'gacha.no_records',
      label: '抽卡 - 暂无记录',
      component: 'Input',
    },
    {
      field: 'gacha.records_sync_hint',
      label: '抽卡 - 同步提示',
      component: 'Input',
    },
    {
      field: 'gacha.analysis_need_sync',
      label: '抽卡 - 分析需先同步',
      component: 'Input',
    },
    {
      field: 'gacha.analysis_auto_sync_hint',
      label: '抽卡 - 分析自动同步提示',
      component: 'Input',
    },
    {
      field: 'gacha.analysis_incremental_hint',
      label: '抽卡 - 分析增量提示',
      component: 'Input',
    },
    {
      field: 'gacha.select_account',
      label: '抽卡 - 选择账号',
      component: 'Input',
    },
    {
      field: 'gacha.reply_index',
      label: '抽卡 - 回复序号',
      component: 'Input',
    },
    {
      field: 'gacha.invalid_index',
      label: '抽卡 - 序号无效',
      component: 'Input',
    },
    {
      field: 'gacha.sync_start',
      label: '抽卡 - 开始同步',
      component: 'Input',
    },
    {
      field: 'gacha.sync_busy',
      label: '抽卡 - 同步进行中',
      component: 'Input',
    },
    {
      field: 'gacha.sync_start_failed',
      label: '抽卡 - 启动同步失败',
      component: 'Input',
    },
    {
      field: 'gacha.sync_done',
      label: '抽卡 - 同步完成',
      component: 'InputTextArea',
      componentProps: { rows: 5 },
    },
    {
      field: 'gacha.sync_done_pools',
      label: '抽卡 - 同步涉及卡池',
      component: 'Input',
    },
    {
      field: 'gacha.sync_in_progress',
      label: '抽卡 - 同步进度',
      component: 'Input',
    },
    {
      field: 'gacha.auth_incremental_sync',
      label: '抽卡 - 增量同步',
      component: 'Input',
    },
    {
      field: 'gacha.auth_full_sync',
      label: '抽卡 - 首次全量同步',
      component: 'Input',
    },
    {
      field: 'gacha.sync_failed',
      label: '抽卡 - 同步失败',
      component: 'Input',
    },
    {
      field: 'gacha.sync_timeout',
      label: '抽卡 - 同步超时',
      component: 'Input',
    },
    {
      field: 'gacha.simulate_failed',
      label: '抽卡 - 模拟失败',
      component: 'Input',
    },
    {
      field: 'gacha.simulate_count_hint',
      label: '抽卡 - 模拟次数提示',
      component: 'Input',
    },
    {
      field: 'gacha.simulate_disabled',
      label: '抽卡 - 模拟未开启',
      component: 'Input',
    },
    {
      field: 'gacha.simulate_group_not_allowed',
      label: '抽卡 - 本群未开放模拟',
      component: 'Input',
    },
    {
      field: 'gacha.simulate_daily_limit_reached',
      label: '抽卡 - 今日模拟次数已用完',
      component: 'Input',
    },
    {
      component: 'Divider',
      label: '登陆相关提示',
    },
    {
      field: 'enduid.bind_help',
      label: '登陆 - 绑定帮助',
      component: 'InputTextArea',
      componentProps: {
        rows: 4,
      },
    },
    {
      field: 'enduid.auth_link_intro',
      label: '登陆 - 授权链接介绍',
      component: 'Input',
    },
    {
      field: 'enduid.auth_link_expiry',
      label: '登陆 - 授权链接过期',
      component: 'Input',
    },
    {
      field: 'enduid.auth_link_wait',
      label: '登陆 - 授权等待',
      component: 'Input',
    },
    {
      field: 'enduid.please_private',
      label: '登陆 - 请私聊',
      component: 'Input',
    },
    {
      field: 'enduid.cred_please',
      label: '登陆 - 请发送cred',
      component: 'Input',
    },
    {
      field: 'enduid.cred_no_token',
      label: '登陆 - cred无token',
      component: 'Input',
    },
    {
      field: 'enduid.cred_invalid',
      label: '登陆 - cred无效',
      component: 'Input',
    },
    {
      field: 'enduid.cred_checking',
      label: '登陆 - cred校验中',
      component: 'Input',
    },
    {
      field: 'enduid.binding_ok',
      label: '登陆 - 绑定成功',
      component: 'InputTextArea',
      componentProps: {
        rows: 3,
      },
    },
    {
      field: 'enduid.login_ok',
      label: '登陆 - 登陆成功',
      component: 'InputTextArea',
      componentProps: {
        rows: 4,
      },
    },
    {
      field: 'enduid.auth_please_private',
      label: '登陆 - 授权请私聊',
      component: 'Input',
    },
    {
      field: 'enduid.auth_need_api_key',
      label: '登陆 - 授权需要api_key',
      component: 'Input',
    },
    {
      field: 'enduid.auth_create_failed',
      label: '登陆 - 创建授权失败',
      component: 'Input',
    },
    {
      field: 'enduid.auth_rejected',
      label: '登陆 - 授权被拒绝',
      component: 'Input',
    },
    {
      field: 'enduid.auth_expired',
      label: '登陆 - 授权过期',
      component: 'Input',
    },
    {
      field: 'enduid.auth_timeout',
      label: '登陆 - 授权超时',
      component: 'Input',
    },
    {
      field: 'enduid.auth_success',
      label: '登陆 - 授权成功',
      component: 'Input',
    },
    {
      field: 'enduid.bind_create_failed',
      label: '登陆 - 创建绑定失败',
      component: 'Input',
    },
    {
      field: 'enduid.auth_error',
      label: '登陆 - 授权错误',
      component: 'Input',
    },
    {
      field: 'enduid.qr_please_private',
      label: '登陆 - 扫码请私聊',
      component: 'Input',
    },
    {
      field: 'enduid.qr_generating',
      label: '登陆 - 生成二维码',
      component: 'Input',
    },
    {
      field: 'enduid.get_qrcode_failed',
      label: '登陆 - 获取二维码失败',
      component: 'Input',
    },
    {
      field: 'enduid.qr_expired',
      label: '登陆 - 二维码过期',
      component: 'Input',
    },
    {
      field: 'enduid.qr_login_failed',
      label: '登陆 - 扫码登录失败',
      component: 'Input',
    },
    {
      field: 'enduid.qr_confirm',
      label: '登陆 - 扫码确认',
      component: 'Input',
    },
    {
      field: 'enduid.qr_authed',
      label: '登陆 - 扫码已授权',
      component: 'Input',
    },
    {
      field: 'enduid.qr_timeout',
      label: '登陆 - 二维码超时',
      component: 'Input',
    },
    {
      field: 'enduid.qr_login_ok',
      label: '登陆 - 扫码登录成功',
      component: 'Input',
    },
    {
      field: 'enduid.qr_error',
      label: '登陆 - 扫码错误',
      component: 'Input',
    },
    {
      field: 'enduid.please_private_op',
      label: '登陆 - 请私聊操作',
      component: 'Input',
    },
    {
      field: 'enduid.unbind_hint',
      label: '登陆 - 未绑定提示',
      component: 'Input',
    },
    {
      field: 'enduid.token_show',
      label: '登陆 - Token显示',
      component: 'InputTextArea',
      componentProps: {
        rows: 2,
      },
    },
    {
      field: 'enduid.token_not_found',
      label: '登陆 - Token未找到',
      component: 'Input',
    },
    {
      field: 'enduid.read_bind_failed',
      label: '登陆 - 读取绑定失败',
      component: 'Input',
    },
    {
      field: 'enduid.delete_ok',
      label: '登陆 - 删除成功',
      component: 'Input',
    },
    {
      field: 'enduid.not_logged_in',
      label: '登陆 - 未登陆',
      component: 'Input',
    },
    {
      field: 'enduid.delete_index_hint',
      label: '登陆 - 删除序号提示',
      component: 'Input',
    },
    {
      field: 'enduid.index_out_of_range',
      label: '登陆 - 序号超出范围',
      component: 'Input',
    },
    {
      field: 'enduid.deleted_role',
      label: '登陆 - 已删除角色',
      component: 'Input',
    },
    {
      field: 'enduid.unbind_auth_hint',
      label: '登陆 - 网页授权解除提示',
      component: 'Input',
    },
    {
      field: 'enduid.unbind_auth_polling',
      label: '登陆 - 网页授权轮询中',
      component: 'Input',
    },
    {
      field: 'enduid.unbind_auth_revoked',
      label: '登陆 - 授权已解除已删',
      component: 'Input',
    },
    {
      field: 'enduid.unbind_auth_poll_timeout',
      label: '登陆 - 轮询超时',
      component: 'Input',
    },
    {
      field: 'enduid.unbind_auth_auto',
      label: '登陆 - 网页授权自动解除说明',
      component: 'InputTextArea',
      componentProps: { rows: 6 },
    },
    {
      field: 'enduid.auth_auto_revoked',
      label: '登陆 - 授权被撤销通知',
      component: 'Input',
    },
    {
      field: 'enduid.sync_result',
      label: '登陆 - 同步结果',
      component: 'Input',
    },
    {
      field: 'enduid.sync_result_all',
      label: '登陆 - 全用户同步结果',
      component: 'Input',
    },
    {
      field: 'enduid.sync_confirm',
      label: '登陆 - 同步确认',
      component: 'Input',
    },
    {
      field: 'enduid.sync_confirm_all',
      label: '登陆 - 同步确认（全部）',
      component: 'InputTextArea',
      componentProps: { rows: 5 },
    },
    {
      field: 'enduid.sync_no_pending',
      label: '登陆 - 无待确认同步',
      component: 'Input',
    },
    {
      field: 'enduid.delete_failed',
      label: '登陆 - 删除失败',
      component: 'Input',
    },
    {
      field: 'enduid.switch_index_hint',
      label: '登陆 - 切换序号提示',
      component: 'Input',
    },
    {
      field: 'enduid.switched',
      label: '登陆 - 已切换',
      component: 'InputTextArea',
      componentProps: {
        rows: 2,
      },
    },
    {
      field: 'enduid.switch_failed',
      label: '登陆 - 切换失败',
      component: 'Input',
    },
    {
      field: 'enduid.phone_please_private',
      label: '登陆 - 手机请私聊',
      component: 'Input',
    },
    {
      field: 'enduid.phone_ask',
      label: '登陆 - 手机号询问',
      component: 'Input',
    },
    {
      field: 'enduid.phone_ask_example',
      label: '登陆 - 手机号示例',
      component: 'Input',
    },
    {
      field: 'enduid.phone_code_verify_example',
      label: '登陆 - 验证码示例',
      component: 'Input',
    },
    {
      field: 'enduid.phone_invalid',
      label: '登陆 - 手机号无效',
      component: 'Input',
    },
    {
      field: 'enduid.phone_send_failed',
      label: '登陆 - 发送验证码失败',
      component: 'Input',
    },
    {
      field: 'enduid.phone_code_sent',
      label: '登陆 - 验证码已发送',
      component: 'InputTextArea',
      componentProps: {
        rows: 2,
      },
    },
    {
      field: 'enduid.phone_code_digit',
      label: '登陆 - 验证码位数',
      component: 'Input',
    },
    {
      field: 'enduid.phone_code_expired',
      label: '登陆 - 验证码过期',
      component: 'Input',
    },
    {
      field: 'enduid.phone_cache_error',
      label: '登陆 - 缓存错误',
      component: 'Input',
    },
    {
      field: 'enduid.phone_code_wrong',
      label: '登陆 - 验证码错误',
      component: 'Input',
    },
    {
      field: 'enduid.phone_login_ok',
      label: '登陆 - 手机登录成功',
      component: 'Input',
    },
    {
      field: 'enduid.phone_login_error',
      label: '登陆 - 手机登录错误',
      component: 'Input',
    },
    {
      field: 'enduid.get_token_failed',
      label: '登陆 - 获取token失败',
      component: 'Input',
    },
    {
      component: 'Divider',
      label: '攻略相关提示',
    },
    {
      field: 'strategy.provide_name',
      label: '攻略 - 请提供名称',
      component: 'Input',
    },
    {
      field: 'strategy.not_found',
      label: '攻略 - 未找到',
      component: 'Input',
    },
    {
      field: 'strategy.not_found_suffix',
      label: '攻略 - 未找到后缀说明',
      component: 'Input',
    },
    {
      field: 'strategy.query_failed',
      label: '攻略 - 查询失败',
      component: 'Input',
    },
    {
      field: 'strategy.need_api_key',
      label: '攻略 - 需要 api_key',
      component: 'Input',
    },
    {
      field: 'strategy.detail_failed',
      label: '攻略 - 详情获取失败',
      component: 'Input',
    },
    {
      field: 'strategy.list_empty',
      label: '攻略 - 列表为空',
      component: 'Input',
    },
    {
      field: 'strategy.list_header',
      label: '攻略 - 列表标题',
      component: 'Input',
    },
    {
      field: 'strategy.upload_format',
      label: '攻略 - 上传格式',
      component: 'Input',
    },
    {
      field: 'strategy.upload_need_image',
      label: '攻略 - 上传需要图片',
      component: 'Input',
    },
    {
      field: 'strategy.upload_mkdir_failed',
      label: '攻略 - 创建目录失败',
      component: 'Input',
    },
    {
      field: 'strategy.upload_download_failed',
      label: '攻略 - 图片下载失败',
      component: 'Input',
    },
    {
      field: 'strategy.upload_saved',
      label: '攻略 - 已保存',
      component: 'Input',
    },
    {
      field: 'strategy.upload_save_failed',
      label: '攻略 - 保存失败',
      component: 'Input',
    },
    {
      component: 'Divider',
      label: '蓝图文档',
    },
    {
      field: 'bluemap.not_configured',
      label: '蓝图 - 未配置',
      component: 'Input',
    },
    {
      field: 'bluemap.doc_url',
      label: '蓝图 - 文档链接文案',
      component: 'Input',
    },
    {
      component: 'Divider',
      label: '插件更新',
    },
    {
      field: 'update.starting',
      label: '更新 - 开始',
      component: 'Input',
    },
    {
      field: 'update.done',
      label: '更新 - 完成',
      component: 'Input',
    },
    {
      field: 'update.already_latest',
      label: '更新 - 已是最新',
      component: 'Input',
    },
    {
      field: 'update.failed',
      label: '更新 - 失败',
      component: 'Input',
    },
  ]
}
