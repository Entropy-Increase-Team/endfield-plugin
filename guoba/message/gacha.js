/** 抽卡相关提示 */
export default [
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
    field: 'gacha.current_up_failed',
    label: '抽卡 - 本期 UP 获取失败',
    component: 'Input',
  },
  {
    field: 'gacha.current_up_empty',
    label: '抽卡 - 暂无本期 UP 数据',
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
    field: 'gacha.analysis_sync_start',
    label: '抽卡 - 分析开始同步',
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
    field: 'gacha.select_account_query',
    label: '抽卡 - 选择查询账号',
    component: 'Input',
  },
  {
    field: 'gacha.select_account_sync',
    label: '抽卡 - 选择同步账号',
    component: 'Input',
  },
  {
    field: 'gacha.reply_index',
    label: '抽卡 - 回复序号',
    component: 'Input',
  },
  {
    field: 'gacha.account_selected',
    label: '抽卡 - 已确认账号',
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
    field: 'gacha.sync_master_only',
    label: '抽卡 - 仅限主人操作',
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
    field: 'gacha.simulate_reset_all_ok',
    label: '抽卡 - 重置全员抽卡成功',
    component: 'Input',
  },
  {
    field: 'gacha.simulate_reset_all_no_auth',
    label: '抽卡 - 仅管理员可重置全员抽卡',
    component: 'Input',
  },
  {
    field: 'gacha.record_fallback_title',
    label: '抽卡 - 记录标题',
    component: 'Input',
  },
  {
    field: 'gacha.record_fallback_user',
    label: '抽卡 - 记录用户行',
    component: 'Input',
  },
  {
    field: 'gacha.record_fallback_stats',
    label: '抽卡 - 记录统计行',
    component: 'Input',
  },
  {
    field: 'gacha.record_section_header',
    label: '抽卡 - 记录分组标题',
    component: 'Input',
  },
  {
    field: 'gacha.record_item_line',
    label: '抽卡 - 记录条目',
    component: 'Input',
  },
  {
    field: 'gacha.record_empty',
    label: '抽卡 - 记录为空',
    component: 'Input',
  },
  {
    field: 'gacha.analysis_fallback_title',
    label: '抽卡 - 分析标题',
    component: 'Input',
  },
  {
    field: 'gacha.analysis_fallback_user',
    label: '抽卡 - 分析用户行',
    component: 'Input',
  },
  {
    field: 'gacha.analysis_fallback_line',
    label: '抽卡 - 分析条目',
    component: 'Input',
  },
  {
    field: 'gacha.analysis_fallback_recent_hint',
    label: '抽卡 - 分析查看记录提示',
    component: 'Input',
  },
  {
    field: 'gacha.global_stats_current_period',
    label: '抽卡 - 统计当前期',
    component: 'Input',
  },
  {
    field: 'gacha.global_stats_pool_not_found',
    label: '抽卡 - 统计卡池未找到',
    component: 'Input',
  },
  {
    field: 'gacha.global_stats_fallback_title',
    label: '抽卡 - 统计标题',
    component: 'Input',
  },
  {
    field: 'gacha.global_stats_fallback_summary',
    label: '抽卡 - 统计汇总',
    component: 'Input',
  },
  {
    field: 'gacha.global_stats_fallback_stars',
    label: '抽卡 - 统计星级汇总',
    component: 'Input',
  },
  {
    field: 'gacha.global_stats_fallback_up',
    label: '抽卡 - 统计当前UP',
    component: 'Input',
  },
  {
    field: 'gacha.global_stats_fallback_official',
    label: '抽卡 - 统计官服',
    component: 'Input',
  },
  {
    field: 'gacha.global_stats_fallback_bili',
    label: '抽卡 - 统计B服',
    component: 'Input',
  },
  {
    field: 'gacha.global_stats_fallback_hint',
    label: '抽卡 - 统计提示',
    component: 'Input',
  },
  {
    field: 'gacha.global_stats_fallback_cache',
    label: '抽卡 - 统计缓存提示',
    component: 'Input',
  },
  {
    field: 'gacha.global_stats_fallback_update',
    label: '抽卡 - 统计更新时间',
    component: 'Input',
  },
  {
    field: 'gacha.global_stats_cached_short',
    label: '抽卡 - 统计缓存短文本',
    component: 'Input',
  },
  {
    field: 'gacha.global_stats_just_now',
    label: '抽卡 - 统计刚刚',
    component: 'Input',
  },
  {
    field: 'gacha.sync_query_pool',
    label: '抽卡 - 同步查询池子',
    component: 'Input',
  },
  {
    field: 'gacha.sync_stage_grant',
    label: '抽卡 - 同步阶段授权',
    component: 'Input',
  },
  {
    field: 'gacha.sync_stage_bindings',
    label: '抽卡 - 同步阶段绑定',
    component: 'Input',
  },
  {
    field: 'gacha.sync_stage_u8token',
    label: '抽卡 - 同步阶段凭证',
    component: 'Input',
  },
  {
    field: 'gacha.sync_stage_records',
    label: '抽卡 - 同步阶段记录',
    component: 'Input',
  },
  {
    field: 'gacha.sync_stage_saving',
    label: '抽卡 - 同步阶段保存',
    component: 'Input',
  },
  {
    field: 'gacha.sync_progress_line',
    label: '抽卡 - 同步进度行',
    component: 'Input',
  },
  {
    field: 'gacha.sync_progress_pools',
    label: '抽卡 - 同步进度卡池',
    component: 'Input',
  },
  {
    field: 'gacha.sync_progress_records',
    label: '抽卡 - 同步进度记录数',
    component: 'Input',
  },
  {
    field: 'gacha.sync_progress_elapsed',
    label: '抽卡 - 同步进度耗时',
    component: 'Input',
  },
  {
    field: 'gacha.sync_progress_stage',
    label: '抽卡 - 同步进度阶段',
    component: 'Input',
  },
  {
    field: 'gacha.sync_done_pool_limited',
    label: '抽卡 - 同步结果限定池',
    component: 'Input',
  },
  {
    field: 'gacha.sync_done_pool_standard',
    label: '抽卡 - 同步结果常驻池',
    component: 'Input',
  },
  {
    field: 'gacha.sync_done_pool_beginner',
    label: '抽卡 - 同步结果新手池',
    component: 'Input',
  },
  {
    field: 'gacha.sync_done_pool_weapon',
    label: '抽卡 - 同步结果武器池',
    component: 'Input',
  },
]
