import setting from './utils/setting.js'
import lodash from 'lodash'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'node:fs'
import YAML from 'yaml'

const _path = process.cwd().replace(/\\/g, '/')
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const pluginRoot = path.join(_path, 'plugins', 'endfield-plugin')

export function supportGuoba() {
  // 群列表供签到通知群聊选择
  const groupList = (() => {
    try {
      if (global.Bot?.gl) {
        return Array.from(Bot.gl.values()).map((item) => ({
          label: `${item.group_name || item.group_id}-${item.group_id}`,
          value: String(item.group_id)
        }))
      }
    } catch (e) {}
    return []
  })()

  return {
    pluginInfo: {
      name: 'endfield-plugin',
      title: 'Endfield-Plugin',
      author: ['@Entropy-Increase-Team'],
      authorLink: ['https://github.com/Entropy-Increase-Team'],
      link: 'https://github.com/Entropy-Increase-Team/endfield-plugin',
      isV3: true,
      isV2: false,
      showInMenu: true,
      description: '基于森空岛 API 的 Yunzai-Bot 终末地插件',
      iconPath: path.join(pluginRoot, 'resources/img/ET logo.svg'),
    },
    configInfo: {
      schemas: [
        {
          label: '基础配置',
          component: 'SOFT_GROUP_BEGIN'
        },
        {
          component: 'Divider',
          label: '命令前缀',
        },
        {
          field: 'prefix_mode',
          label: '命令前缀模式',
          bottomHelpMessage: '1: 符号前缀（: 或 ：）| 2: 关键词前缀（#终末地 / #zmd）',
          component: 'Select',
          componentProps: {
            placeholder: '请选择前缀模式',
            options: [
              { label: '符号前缀（: 或 ：）', value: 1 },
              { label: '关键词前缀（#终末地 / #zmd）', value: 2 },
            ],
          },
        },
        {
          field: 'keywords',
          label: '关键词列表',
          bottomHelpMessage: '命令需要匹配其中任意一个关键词（仅在关键词前缀模式下生效）',
          component: 'GTags',
          componentProps: {
            placeholder: '请输入关键词后回车',
          },
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
          label: 'Wiki 查询提示',
        },
        {
          field: 'wiki.provide_operator',
          label: 'Wiki - 请提供干员名称',
          component: 'Input',
        },
        {
          field: 'wiki.provide_weapon',
          label: 'Wiki - 请提供武器名称',
          component: 'Input',
        },
        {
          field: 'wiki.provide_equip',
          label: 'Wiki - 请提供装备名称',
          component: 'Input',
        },
        {
          field: 'wiki.provide_tactical',
          label: 'Wiki - 请提供战术物品名称',
          component: 'Input',
        },
        {
          field: 'wiki.not_found_operator',
          label: 'Wiki - 未找到干员',
          component: 'Input',
        },
        {
          field: 'wiki.not_found_weapon',
          label: 'Wiki - 未找到武器',
          component: 'Input',
        },
        {
          field: 'wiki.not_found_equip',
          label: 'Wiki - 未找到装备',
          component: 'Input',
        },
        {
          field: 'wiki.not_found_tactical',
          label: 'Wiki - 未找到战术物品',
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
          field: 'attendance.not_found_role_id',
          label: '签到 - 未找到角色ID',
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
          field: 'strategy.not_downloaded',
          label: '攻略 - 未下载',
          component: 'Input',
        },
        {
          field: 'strategy.download_github',
          label: '攻略 - 从GitHub下载',
          component: 'Input',
        },
        {
          field: 'strategy.update_github',
          label: '攻略 - 从GitHub更新',
          component: 'Input',
        },
        {
          field: 'strategy.download_start',
          label: '攻略 - 开始下载',
          component: 'Input',
        },
        {
          field: 'strategy.download_complete',
          label: '攻略 - 下载完成',
          component: 'Input',
        },
        {
          field: 'strategy.update_no_new',
          label: '攻略 - 无新内容',
          component: 'Input',
        },
        {
          field: 'strategy.update_complete',
          label: '攻略 - 更新完成',
          component: 'Input',
        },
        {
          field: 'strategy.query_failed',
          label: '攻略 - 查询失败',
          component: 'Input',
        },
        {
          field: 'strategy.download_failed',
          label: '攻略 - 下载失败',
          component: 'Input',
        },
        {
          field: 'strategy.update_failed',
          label: '攻略 - 更新失败',
          component: 'Input',
        },
        {
          field: 'strategy.no_images',
          label: '攻略 - 无图片',
          component: 'Input',
        },
        {
          field: 'strategy.admin_only',
          label: '攻略 - 仅管理员',
          component: 'Input',
        },
        {
          field: 'strategy.upload_format_error',
          label: '攻略 - 上传格式错误',
          component: 'Input',
        },
        {
          field: 'strategy.upload_need_character',
          label: '攻略 - 上传需要角色',
          component: 'Input',
        },
        {
          field: 'strategy.upload_need_image',
          label: '攻略 - 上传需要图片',
          component: 'InputTextArea',
          componentProps: {
            rows: 2,
          },
        },
        {
          field: 'strategy.image_download_failed',
          label: '攻略 - 图片下载失败',
          component: 'Input',
        },
        {
          field: 'strategy.image_exists',
          label: '攻略 - 图片已存在',
          component: 'Input',
        },
        {
          field: 'strategy.upload_need_title',
          label: '攻略 - 上传需要标题',
          component: 'Input',
        },
        {
          field: 'strategy.upload_success',
          label: '攻略 - 上传成功',
          component: 'InputTextArea',
          componentProps: {
            rows: 3,
          },
        },
        {
          field: 'strategy.upload_failed',
          label: '攻略 - 上传失败',
          component: 'Input',
        },
        {
          field: 'strategy.upload_expired',
          label: '攻略 - 上传过期',
          component: 'Input',
        },
        {
          field: 'strategy.upload_character_example',
          label: '攻略 - 上传角色示例',
          component: 'Input',
        },
        {
          field: 'strategy.delete_format_error',
          label: '攻略 - 删除格式错误',
          component: 'Input',
        },
        {
          field: 'strategy.delete_not_found',
          label: '攻略 - 删除未找到',
          component: 'Input',
        },
        {
          field: 'strategy.delete_success',
          label: '攻略 - 删除成功',
          component: 'InputTextArea',
          componentProps: {
            rows: 2,
          },
        },
        {
          field: 'strategy.delete_failed',
          label: '攻略 - 删除失败',
          component: 'Input',
        },
        {
          field: 'strategy.no_available_images',
          label: '攻略 - 无可用图片',
          component: 'Input',
        },
        {
          field: 'strategy.redownload_hint',
          label: '攻略 - 重新下载提示',
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
          label: '蓝图 - 文档链接',
          component: 'Input',
        }
      ],
      getConfigData() {
        const commonConfig = setting.getConfig('common') || {}
        const aiConfig = setting.getConfig('ai') || {}
        const signConfig = setting.getConfig('sign') || {}
        
        // message.yaml 特殊处理：如果存在 config/message.yaml 则使用它，否则使用 defSet/message.yaml
        const configPath = `${_path}/plugins/endfield-plugin/config/message.yaml`
        const defSetPath = `${_path}/plugins/endfield-plugin/defSet/message.yaml`
        let messageConfig = {}
        if (fs.existsSync(configPath)) {
          try {
            messageConfig = YAML.parse(fs.readFileSync(configPath, 'utf8')) || {}
          } catch (error) {
            logger.error('[终末地插件] 读取 config/message.yaml 失败:', error)
          }
        } else if (fs.existsSync(defSetPath)) {
          try {
            messageConfig = YAML.parse(fs.readFileSync(defSetPath, 'utf8')) || {}
          } catch (error) {
            logger.error('[终末地插件] 读取 defSet/message.yaml 失败:', error)
          }
        }
        
        const common = lodash.merge(
          {
            prefix_mode: 1,
            keywords: ['终末地', 'zmd'],
            auth_client_name: '终末地机器人',
            auth_client_type: 'bot',
            auth_scopes: ['user_info', 'binding_info', 'game_data', 'attendance'],
            api_key: '',
          },
          commonConfig
        )
        
        if (!Array.isArray(common.keywords)) {
          common.keywords = ['终末地', 'zmd']
        }
        if (!Array.isArray(common.auth_scopes)) {
          common.auth_scopes = ['user_info', 'binding_info', 'game_data', 'attendance']
        }
        
        const ai = lodash.merge(
          {
            app_id: '',
            bearer_token: '',
            api_base: 'https://endfield.prts.chat/api',
            stream_timeout: 60,
          },
          aiConfig
        )
        
        const sign = lodash.merge(
          {
            auto_sign: true,
            auto_sign_cron: '0 0 1 * * ?',
            notify_list: { friend: [], group: [] },
          },
          signConfig
        )
        // 兼容旧版 notify_list 为数组格式
        if (Array.isArray(sign.notify_list)) {
          const friend = []
          const group = []
          for (const raw of sign.notify_list) {
            const str = String(raw).trim()
            const lower = str.toLowerCase()
            if (lower.startsWith('group:')) group.push(str.slice(6).trim())
            else if (lower.startsWith('friend:')) friend.push(str.slice(7).trim())
          }
          sign.notify_list = { friend, group }
        }
        if (!sign.notify_list?.friend) sign.notify_list = { ...sign.notify_list, friend: [] }
        if (!sign.notify_list?.group) sign.notify_list = { ...sign.notify_list, group: [] }
        
        // 将嵌套对象展开为扁平字段名，以匹配 schemas 中的字段名格式
        const result = { ...common }
        
        // 展开 ai 配置
        for (const key in ai) {
          result[`ai.${key}`] = ai[key]
        }
        
        // 展开 sign 配置（notify_list 单独展开 friend/group）
        for (const key in sign) {
          if (key === 'notify_list') {
            result['sign.notify_list.friend'] = sign.notify_list.friend || []
            result['sign.notify_list.group'] = sign.notify_list.group || []
          } else {
            result[`sign.${key}`] = sign[key]
          }
        }
        
        // 将 message 配置的嵌套结构展开为扁平字段名（如 wiki.provide_operator）
        function flattenObject(obj, prefix = '') {
          const flattened = {}
          for (const key in obj) {
            const value = obj[key]
            const newKey = prefix ? `${prefix}.${key}` : key
            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
              Object.assign(flattened, flattenObject(value, newKey))
            } else {
              flattened[newKey] = value
            }
          }
          return flattened
        }
        
        const flattenedMessage = flattenObject(messageConfig)
        Object.assign(result, flattenedMessage)
        
        return result
      },
      setConfigData(data, { Result }) {
        try {
          // 将从锅巴面板接收到的扁平数据转换为嵌套对象
          const unflattenedData = {}
          for (const key in data) {
            lodash.set(unflattenedData, key, data[key])
          }
          
          // 分离不同配置文件的字段，分别写入 config/common.yaml、config/ai.yaml、config/sign.yaml、config/message.yaml（help 锅巴不配置）
          const commonFields = ['prefix_mode', 'keywords', 'auth_client_name', 'auth_client_type', 'auth_scopes', 'api_key']

          // message 仅包含 defSet/message.yaml 中的叶子键（如 gacha.no_records），用于写入 config/message.yaml
          const defSetMessagePath = `${_path}/plugins/endfield-plugin/defSet/message.yaml`
          const messageFields = new Set()
          if (fs.existsSync(defSetMessagePath)) {
            try {
              const defSetMessage = YAML.parse(fs.readFileSync(defSetMessagePath, 'utf8')) || {}
              function extractKeys(obj, prefix = '') {
                for (const key in obj) {
                  const fullKey = prefix ? `${prefix}.${key}` : key
                  if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
                    extractKeys(obj[key], fullKey)
                  } else {
                    messageFields.add(fullKey)
                  }
                }
              }
              extractKeys(defSetMessage)
            } catch (error) {
              logger.warn('[终末地插件] 读取 defSet/message.yaml 失败，无法获取 message 字段列表')
            }
          }

          const commonData = {}
          const aiData = {}
          const signData = {}
          const messageData = {}

          // 必须遍历扁平键 data（锅巴传来 sign.notify_list 等），不能遍历 unflattenedData（只有顶层 sign）
          for (const key in data) {
            if (commonFields.includes(key)) {
              commonData[key] = data[key]
            } else if (key.startsWith('ai.')) {
              aiData[key.replace('ai.', '')] = data[key]
            } else if (key.startsWith('sign.')) {
              // 使用 lodash.set 支持嵌套键（如 sign.notify_list.friend）
              lodash.set(signData, key.replace('sign.', ''), data[key])
            } else if (messageFields.has(key)) {
              messageData[key] = data[key]
            }
          }
          
          // 保存 common 配置
          if (Object.keys(commonData).length > 0) {
            const currentCommonConfig = setting.getConfig('common') || {}
            const mergedCommonConfig = lodash.merge({}, currentCommonConfig, commonData)
            const result = setting.setConfig('common', mergedCommonConfig)
            if (result === false) {
              return Result.error('common 配置保存失败，请检查文件权限')
            }
          }
          
          // 保存 ai 配置
          if (Object.keys(aiData).length > 0) {
            const currentAiConfig = setting.getConfig('ai') || {}
            const mergedAiConfig = lodash.merge({}, currentAiConfig, aiData)
            const result = setting.setConfig('ai', mergedAiConfig)
            if (result === false) {
              return Result.error('ai 配置保存失败，请检查文件权限')
            }
          }
          
          // 保存 sign 配置（notify_list 整体替换，避免 lodash.merge 按索引合并数组导致删除项仍存在）
          if (Object.keys(signData).length > 0) {
            const currentSignConfig = setting.getConfig('sign') || {}
            const mergedSignConfig = lodash.merge({}, currentSignConfig, signData)
            if (signData.notify_list && typeof signData.notify_list === 'object') {
              mergedSignConfig.notify_list = signData.notify_list
            }
            const result = setting.setConfig('sign', mergedSignConfig)
            if (result === false) {
              return Result.error('sign 配置保存失败，请检查文件权限')
            }
          }
          
          // 保存 message 配置到 config/message.yaml（总是保存到 config，即使修改的是 defSet 的内容）
          if (Object.keys(messageData).length > 0) {
            const configPath = `${_path}/plugins/endfield-plugin/config/message.yaml`
            const configDir = path.dirname(configPath)
            
            if (!fs.existsSync(configDir)) {
              fs.mkdirSync(configDir, { recursive: true })
            }
            
            // 读取当前 config/message.yaml（如果存在）
            let currentMessageConfig = {}
            if (fs.existsSync(configPath)) {
              try {
                currentMessageConfig = YAML.parse(fs.readFileSync(configPath, 'utf8')) || {}
              } catch (error) {
                logger.warn('[终末地插件] 读取现有 config/message.yaml 失败，将创建新配置')
              }
            } else {
              // 如果 config/message.yaml 不存在，先从 defSet/message.yaml 读取作为基础
              const defSetPath = `${_path}/plugins/endfield-plugin/defSet/message.yaml`
              if (fs.existsSync(defSetPath)) {
                try {
                  currentMessageConfig = YAML.parse(fs.readFileSync(defSetPath, 'utf8')) || {}
                } catch (error) {
                  logger.warn('[终末地插件] 读取 defSet/message.yaml 作为基础配置失败')
                }
              }
            }
            
            // 将扁平数据转换为嵌套对象并合并
            const nestedMessageData = {}
            for (const key in messageData) {
              lodash.set(nestedMessageData, key, messageData[key])
            }
            
            const mergedMessageConfig = lodash.merge({}, currentMessageConfig, nestedMessageData)
            fs.writeFileSync(configPath, YAML.stringify(mergedMessageConfig), 'utf8')
            
            // 清除 setting 缓存
            if (setting.config && setting.config.message) {
              delete setting.config.message
            }
          }
          
          logger.debug('[终末地插件] 配置已更新 (Guoba)')
          return Result.ok({}, '保存成功~')
        } catch (error) {
          logger.error('[终末地插件] 配置保存失败:', error)
          return Result.error('配置保存失败，请检查日志')
        }
      },
    },
  }
}
