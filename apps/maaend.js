/**
 * MaaEnd 远程控制 - 设备绑定、任务下发、状态查询、截图等
 */
import MaaendRequest from '../model/maaendReq.js'
import setting from '../utils/setting.js'
import { getMessage } from '../utils/common.js'
import { getCopyright } from '../utils/copyright.js'

const REDIS_KEYS = {
  devices: (userId) => `ENDFIELD:MAAEND_DEVICES:${userId}`,
  defaultDevice: (userId) => `ENDFIELD:MAAEND_DEFAULT:${userId}`,
  jobs: (userId) => `ENDFIELD:MAAEND_JOBS:${userId}`,
}

/** 设备状态中文 */
function statusText(s) {
  const map = { online: '在线', offline: '离线', busy: '忙碌' }
  return map[s] || s || '—'
}

/** 任务状态中文 */
function jobStatusText(s) {
  const map = { pending: '等待', running: '执行中', completed: '已完成', failed: '失败', cancelled: '已停止' }
  return map[s] || s || '—'
}

/** 格式化秒数为可读时间 */
function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '—'
  if (seconds < 60) return `${seconds} 秒`
  const min = Math.floor(seconds / 60)
  const sec = seconds % 60
  return sec > 0 ? `${min} 分 ${sec} 秒` : `${min} 分钟`
}

export class maaend extends plugin {
  constructor() {
    super({
      name: '[endfield-plugin]MaaEnd',
      dsc: 'MaaEnd 远程控制：设备、任务、截图',
      event: 'message',
      priority: 50,
      rule: [
        { reg: '^(?:[:：]|#zmd|#终末地)maa\\s*设备$', fnc: 'deviceList' },
        { reg: '^(?:[:：]|#zmd|#终末地)maa\\s*绑定$', fnc: 'bindCode' },
        { reg: '^(?:[:：]|#zmd|#终末地)maa\\s*设置设备(?:\\s*(\\d+))?$', fnc: 'setDefaultDevice' },
        { reg: '^(?:[:：]|#zmd|#终末地)maa\\s*(?:设备任务|任务列表)(?:\\s*(\\d+))?$', fnc: 'maaTask' },
        { reg: '^(?:[:：]|#zmd|#终末地)maa\\s*状态(?:\\s+(\\S+))?$', fnc: 'jobStatus' },
        { reg: '^(?:[:：]|#zmd|#终末地)maa\\s*停止(?:\\s+(\\S+))?$', fnc: 'stopJob' },
        { reg: '^(?:[:：]|#zmd|#终末地)maa\\s*截图(?:\\s*(\\d+))?$', fnc: 'screenshot' },
        { reg: '^(?:[:：]|#zmd|#终末地)maa\\s*重置(?:\\s*(\\d+))?$', fnc: 'resetDevice' },
        { reg: '^(?:[:：]|#zmd|#终末地)maa\\s*删除设备\\s*(\\d+)$', fnc: 'deleteDevice' },
        { reg: '^(?:[:：]|#zmd|#终末地)maa\\s*(?:执行|运行)(?:\\s+(.+))?$', fnc: 'maaExecDefault' },
        { reg: '^(?:[:：]|#zmd|#终末地)maa\\s*历史(?:\\s+(\\d+))?(?:\\s+(.+))?$', fnc: 'jobHistory' }
      ]
    })
    this.commonConfig = setting.getConfig('common') || {}
  }

  getMaaendReq() {
    if (!this.commonConfig.api_key || String(this.commonConfig.api_key).trim() === '') return null
    return new MaaendRequest()
  }

  /** 获取用户绑定的设备 ID 列表 */
  async getUserDeviceIds(userId) {
    const raw = await redis.get(REDIS_KEYS.devices(userId))
    if (!raw) return []
    try { return JSON.parse(raw) } catch { return [] }
  }

  /** 保存用户绑定的设备 ID 列表 */
  async setUserDeviceIds(userId, deviceIds) {
    await redis.set(REDIS_KEYS.devices(userId), JSON.stringify(deviceIds))
  }

  /** 给用户添加一个设备 */
  async addUserDevice(userId, deviceId) {
    const ids = await this.getUserDeviceIds(userId)
    if (!ids.includes(deviceId)) {
      ids.push(deviceId)
      await this.setUserDeviceIds(userId, ids)
    }
  }

  /** 从用户移除一个设备 */
  async removeUserDevice(userId, deviceId) {
    const ids = await this.getUserDeviceIds(userId)
    await this.setUserDeviceIds(userId, ids.filter(id => id !== deviceId))
    const defaultId = await redis.get(REDIS_KEYS.defaultDevice(userId))
    if (defaultId === deviceId) await redis.del(REDIS_KEYS.defaultDevice(userId))
  }

  /** 获取用户的设备列表（API 全量 → 过滤用户绑定的） */
  async getUserDevices(userId) {
    const req = this.getMaaendReq()
    if (!req) return { err: getMessage('maaend.no_api_key'), devices: [] }
    const res = await req.getDevices()
    if (!res || res.code !== 0) return { err: res?.message || '获取设备列表失败', devices: [] }
    const allDevices = res.data?.devices || []
    const userIds = await this.getUserDeviceIds(userId)
    const existSet = new Set(allDevices.map(d => d.device_id))
    const validIds = userIds.filter(id => existSet.has(id))
    if (validIds.length !== userIds.length) await this.setUserDeviceIds(userId, validIds)
    return { devices: allDevices.filter(d => validIds.includes(d.device_id)) }
  }

  async getDefaultDeviceId(userId) {
    return await redis.get(REDIS_KEYS.defaultDevice(userId))
  }

  async saveJobId(userId, jobId) {
    const key = REDIS_KEYS.jobs(userId)
    await redis.lPush(key, jobId)
    await redis.lTrim(key, 0, 19)
    await redis.expire(key, 86400 * 7)
  }

  async resolveJobId(userId, input) {
    const num = parseInt(input, 10)
    if (String(num) === input && num >= 1 && num <= 20) {
      const jobId = await redis.lIndex(REDIS_KEYS.jobs(userId), num - 1)
      return jobId || null
    }
    return input
  }

  /** 尝试获取设备截图，返回 segment.image 或 null */
  async _tryGetScreenshot(req, deviceId) {
    try {
      const res = await req.getScreenshot(deviceId, true)
      if (res?.isImage && res.data) return segment.image(res.data)
      if (res?.code === 0 && res.data?.base64_image) return segment.image(Buffer.from(res.data.base64_image, 'base64'))
    } catch (err) {
      logger.error(`[MaaEnd]获取截图失败: ${err?.message}`)
    }
    return null
  }

  async setDefaultDevice() {
    const match = this.e.msg?.match(/^(?:[:：]|#zmd|#终末地)maa\s*设置设备(?:\s*(\d+))?$/)
    const idx = match?.[1] || ''
    const userId = this.e.user_id

    if (!idx) {
      const defaultId = await this.getDefaultDeviceId(userId)
      if (!defaultId) {
        await this.reply(getMessage('maaend.no_default_device'))
        return true
      }
      const { devices } = await this.getUserDevices(userId)
      const pos = devices.findIndex(d => d.device_id === defaultId)
      if (pos >= 0) {
        const d = devices[pos]
        await this.reply(`当前默认设备：${pos + 1}. ${d.device_name || d.device_id} [${statusText(d.status)}]\n更换：:maa 设置设备 <新序号>`)
      } else {
        await redis.del(REDIS_KEYS.defaultDevice(userId))
        await this.reply(getMessage('maaend.default_device_invalid'))
      }
      return true
    }

    const out = await this.getDeviceByIndex(userId, idx)
    if (out.err) { await this.reply(out.err); return true }
    if (!out.device) return true

    await redis.set(REDIS_KEYS.defaultDevice(userId), out.device.device_id)
    await this.reply([
      `已设置默认设备：${idx}. ${out.device.device_name || out.device.device_id} [${statusText(out.device.status)}]`,
      '',
      '后续命令可省略设备序号，例如：',
      '  :maa 截图 → 截取默认设备',
      '  :maa 任务列表 → 查看默认设备任务',
      '  :maa 执行 daily → 在默认设备执行任务'
    ].join('\n'))
    return true
  }

  /** 按序号获取用户的设备；序号为空时使用默认设备，仅一台设备时自动选中 */
  async getDeviceByIndex(userId, indexOneBased) {
    const { err, devices } = await this.getUserDevices(userId)
    if (err) return { err }
    if (devices.length === 0) return { err: getMessage('maaend.no_devices') }

    if (indexOneBased == null || indexOneBased === '') {
      const defaultId = await this.getDefaultDeviceId(userId)
      if (!defaultId) {
        if (devices.length === 1) return { device: devices[0], devices, deviceIdx: 1 }
        return { err: getMessage('maaend.no_device_index') }
      }
      const pos = devices.findIndex(d => d.device_id === defaultId)
      if (pos < 0) {
        await redis.del(REDIS_KEYS.defaultDevice(userId))
        if (devices.length === 1) return { device: devices[0], devices, deviceIdx: 1 }
        return { err: getMessage('maaend.default_device_invalid') }
      }
      return { device: devices[pos], devices, deviceIdx: pos + 1 }
    }

    const i = parseInt(indexOneBased, 10)
    if (!Number.isFinite(i) || i < 1 || i > devices.length) {
      return { err: getMessage('maaend.device_index_out', { max: devices.length }) }
    }
    return { device: devices[i - 1], devices, deviceIdx: i }
  }

  async deviceList() {
    const req = this.getMaaendReq()
    if (!req) return true
    const userId = this.e.user_id
    const { err, devices } = await this.getUserDevices(userId)
    if (err) { await this.reply(err); return true }
    if (devices.length === 0) {
      await this.reply(getMessage('maaend.no_devices_full'))
      return true
    }
    const defaultId = await this.getDefaultDeviceId(userId)
    const lines = ['【我的 MaaEnd 设备】', `共 ${devices.length} 台设备：`, '']
    devices.forEach((d, i) => {
      const isDefault = d.device_id === defaultId
      const cap = d.capabilities
      const tasks = cap?.tasks?.length ? cap.tasks.join('、') : '—'
      lines.push(`${i + 1}. ${d.device_name || d.device_id} [${statusText(d.status)}]${isDefault ? ' ★默认' : ''}`)
      lines.push(`    ID: ${d.device_id} | 版本: ${d.maaend_version || '—'} / ${d.client_version || '—'}`)
      lines.push(`    任务: ${tasks}`)
      if (d.current_job_id) lines.push(`    当前任务: ${d.current_job_id}`)
      lines.push('')
    })
    await this.reply(lines.join('\n').trim())
    return true
  }

  async bindCode() {
    if (!this.e.isPrivate) {
      await this.reply(getMessage('maaend.bind_private_only'))
      return true
    }
    const req = this.getMaaendReq()
    if (!req) return true

    // 快照当前所有设备，用于后续检测新增设备
    const beforeRes = await req.getDevices()
    const beforeIds = new Set((beforeRes?.data?.devices || []).map(d => d.device_id))

    const res = await req.createBindCode()
    if (!res || res.code !== 0) {
      await this.reply(res?.message || getMessage('maaend.bind_failed'))
      return true
    }
    const { bind_code, expires_in } = res.data || {}
    await this.reply([
      '【MaaEnd 绑定码】',
      `绑定码：${bind_code || '—'}`,
      `有效期：${formatDuration(expires_in || 300)}`,
      '',
      '请在 MaaEnd Client 中输入上述绑定码完成设备绑定。',
      '绑定成功后会自动通知你。'
    ].join('\n'))

    // 后台轮询：检测新设备并自动认领给当前用户
    const userId = this.e.user_id
    const e = this.e
    const maxWait = (expires_in || 300) * 1000
    const pollInterval = 5000
    let elapsed = 0

    const poll = async () => {
      elapsed += pollInterval
      if (elapsed > maxWait) return
      try {
        const pollReq = new MaaendRequest()
        const nowRes = await pollReq.getDevices()
        const nowDevices = nowRes?.data?.devices || []
        const newDevices = nowDevices.filter(d => !beforeIds.has(d.device_id))
        if (newDevices.length > 0) {
          for (const d of newDevices) await this.addUserDevice(userId, d.device_id)
          const userIds = await this.getUserDeviceIds(userId)
          if (userIds.length === 1) await redis.set(REDIS_KEYS.defaultDevice(userId), userIds[0])
          const names = newDevices.map(d => d.device_name || d.device_id).join('、')
          await e.reply(getMessage('maaend.bind_success', { names }))
          return
        }
      } catch (err) {
        logger.error(`[MaaEnd]绑定轮询异常: ${err?.message}`)
      }
      setTimeout(poll, pollInterval)
    }
    setTimeout(poll, pollInterval)
    return true
  }

  /** 查看设备任务列表：:maa 设备任务/任务列表 [序号] */
  async maaTask() {
    const match = this.e.msg?.match(/^(?:[:：]|#zmd|#终末地)maa\s*(?:设备任务|任务列表)(?:\s*(\d+))?$/)
    if (!match) return true
    const deviceIdx = match[1] || null  // null = 使用默认设备

    const out = await this.getDeviceByIndex(this.e.user_id, deviceIdx)
    if (out.err) { await this.reply(out.err); return true }
    if (!out.device) return true

    const req = this.getMaaendReq()
    if (!req) return true

    const taskRes = await req.getDeviceTasks(out.device.device_id)
    if (!taskRes || taskRes.code !== 0) {
      await this.reply(taskRes?.message || '获取设备任务失败')
      return true
    }

    const availableTasks = taskRes.data?.tasks || []
    const controllers = taskRes.data?.controllers || []
    const resources = taskRes.data?.resources || []

    return this._renderTaskList(out.device, out.deviceIdx, availableTasks, controllers, resources)
  }

  /** 渲染任务列表图片（降级为纯文本） */
  async _renderTaskList(device, deviceIdx, tasks, controllers, resources) {
    const taskList = tasks.map((t, i) => ({
      index: i + 1,
      name: t.name,
      label: t.label || '',
      description: t.description || '',
      options: (t.options || []).map(opt => ({
        name: opt.name,
        label: opt.label || opt.name,
        casesText: (opt.cases || []).map(c => `${c.name}(${c.label})`).join(' / ')
      }))
    }))

    // 优先使用模板渲染
    if (this.e?.runtime?.render) {
      try {
        const pluResPath = this.e?.runtime?.path?.plugin?.['endfield-plugin']?.res || ''
        const renderData = {
          deviceName: device.device_name || device.device_id,
          deviceId: device.device_id,
          status: device.status || 'offline',
          statusText: statusText(device.status),
          version: device.maaend_version || '',
          taskCount: taskList.length,
          tasks: taskList,
          controllerText: controllers.join('、') || '—',
          resourceText: resources.join('、') || '—',
          deviceIdx,
          firstTaskName: tasks[0]?.name || 'daily',
          pluResPath,
          ...getCopyright()
        }
        const img = await this.e.runtime.render('endfield-plugin', 'maaend/tasks', renderData, {
          scale: 1.6,
          retType: 'base64'
        })
        if (img) {
          await this.reply(img)
          return true
        }
      } catch (err) {
        logger.error(`[MaaEnd]渲染任务列表失败: ${err?.message || err}`)
      }
    }

    // 降级为纯文本
    const lines = [`【${device.device_name || device.device_id} 可用任务】`]
    if (taskList.length === 0) {
      lines.push('暂无可用任务')
    } else {
      taskList.forEach(t => {
        const desc = t.description ? ` - ${t.description}` : ''
        lines.push(`  ${t.index}. ${t.name}${t.label ? `（${t.label}）` : ''}${desc}`)
      })
    }
    lines.push(`控制器：${controllers.join('、') || '—'} | 资源：${resources.join('、') || '—'}`)
    lines.push('', `执行：:maa 执行 1 2 3（序号）或 :maa 执行 ${tasks[0]?.name || 'daily'}（名称）`)
    await this.reply(lines.join('\n'))
    return true
  }

  /** 解析任务参数并执行 */
  async _executeTask(device, taskPart, availableTasks, controllers, resources) {
    const taskArgs = taskPart.split(/\s+/).filter(Boolean)
    const controller = controllers[0] || 'Win32'
    const resource = resources[0] || 'Official'

    // 解析任务参数：纯数字视为序号，否则视为任务名
    const resolvedTasks = []
    for (const arg of taskArgs) {
      const num = parseInt(arg, 10)
      if (String(num) === arg && num >= 1 && num <= availableTasks.length) {
        const t = availableTasks[num - 1]
        resolvedTasks.push({ name: t.name, label: t.label || '' })
      } else if (String(num) === arg && num > availableTasks.length) {
        await this.reply(getMessage('maaend.task_index_out', { num, max: availableTasks.length }))
        return true
      } else {
        // 按名称匹配，尝试查找对应的中文标签
        const found = availableTasks.find(t => t.name === arg)
        resolvedTasks.push({ name: arg, label: found?.label || '' })
      }
    }

    const req = this.getMaaendReq()
    const tasks = resolvedTasks.map(t => ({ name: t.name, options: {} }))
    const res = await req.runTask(device.device_id, { controller, resource, tasks })
    if (!res) {
      await this.reply(getMessage('maaend.task_run_failed'))
      return true
    }
    if (res.code === 40001) {
      await this.reply(getMessage('maaend.device_offline'))
      return true
    }
    if (res.code === 40002) {
      await this.reply(res.message || getMessage('maaend.device_busy'))
      return true
    }
    if (res.code !== 0) {
      await this.reply(res.message || `请求失败(code: ${res.code})`)
      return true
    }
    const jobId = res.data?.job_id
    const taskDesc = resolvedTasks.map(t => t.label ? `${t.label}(${t.name})` : t.name).join('、')
    if (jobId) await this.saveJobId(this.e.user_id, jobId)

    // 下发通知 + 截图合并为一条消息
    const msg = [`任务已下发 → ${taskDesc}\n任务编号：#1\n查询进度：:maa 状态\n停止任务：:maa 停止`]
    const ssImg = await this._tryGetScreenshot(req, device.device_id)
    if (ssImg) msg.push(ssImg)
    await this.reply(msg)

    // 启动后台轮询，任务完成时自动推送通知和截图
    if (jobId) {
      this._pollJobCompletion(jobId, device.device_id, this.e)
    }
    return true
  }

  /**
   * 后台轮询任务状态，完成/失败时推送通知并附带截图
   * 每 15 秒检查一次，最长监控 30 分钟
   */
  _pollJobCompletion(jobId, deviceId, e) {
    let attempts = 0
    const maxAttempts = 120

    const poll = async () => {
      attempts++
      if (attempts > maxAttempts) {
        logger.mark(`[MaaEnd]任务轮询超时，已停止监控: ${jobId}`)
        return
      }
      try {
        const req = new MaaendRequest()
        const res = await req.getJob(jobId)
        if (!res || res.code !== 0) {
          // 查询失败，继续重试（maxAttempts 会兜底）
          setTimeout(poll, 15000)
          return
        }
        const job = res.data || {}

        // 仍在执行，继续轮询
        if (!['completed', 'failed', 'cancelled'].includes(job.status)) {
          setTimeout(poll, 15000)
          return
        }

        // 任务结束，推送通知 + 截图合并为一条消息
        const duration = job.duration_ms != null ? formatDuration(Math.ceil(job.duration_ms / 1000)) : '—'
        const lines = [
          `【任务${jobStatusText(job.status)}】`,
          `设备：${job.device_name || job.device_id || '—'}`,
          `耗时：${duration}`
        ]
        if (job.error) lines.push(`错误：${job.error}`)
        const msg = [lines.join('\n')]
        if (job.status === 'completed') {
          const ssImg = await (async () => {
            try {
              const ssRes = await req.getScreenshot(deviceId, true)
              if (ssRes?.isImage && ssRes.data) return segment.image(ssRes.data)
              if (ssRes?.code === 0 && ssRes.data?.base64_image) return segment.image(Buffer.from(ssRes.data.base64_image, 'base64'))
            } catch (err) {
              logger.error(`[MaaEnd]获取完成截图失败: ${err?.message}`)
            }
            return null
          })()
          if (ssImg) msg.push(ssImg)
        }
        await e.reply(msg)
      } catch (err) {
        logger.error(`[MaaEnd]轮询任务状态异常: ${err?.message}`)
      }
    }

    // 15 秒后开始首次轮询
    setTimeout(poll, 15000)
  }

  async jobStatus() {
    const match = this.e.msg?.match(/^(?:[:：]|#zmd|#终末地)maa\s*状态(?:\s+(\S+))?$/)
    const rawInput = match?.[1]?.trim() || '1'  // 无参数默认查最近一次任务
    const jobId = await this.resolveJobId(this.e.user_id, rawInput)
    if (!jobId) {
      await this.reply(getMessage('maaend.job_not_found', { id: rawInput }))
      return true
    }
    const req = this.getMaaendReq()
    const res = await req.getJob(jobId)
    if (!res) {
      await this.reply(getMessage('maaend.job_query_failed'))
      return true
    }
    if (res.code !== 0) {
      await this.reply(res.message || `查询失败(code: ${res.code})`)
      return true
    }
    const j = res.data || {}
    const progress = j.progress ? `${j.progress.completed}/${j.progress.total}` : '—'
    const lines = [
      '【任务状态】',
      `任务ID：${j.job_id}`,
      `设备：${j.device_name || j.device_id}`,
      `状态：${jobStatusText(j.status)}`,
      `当前子任务：${j.current_task || '—'}`,
      `进度：${progress}`,
      `耗时：${j.duration_ms != null ? `${j.duration_ms}ms` : '—'}`,
      j.error ? `错误：${j.error}` : ''
    ].filter(Boolean)
    if (Array.isArray(j.logs) && j.logs.length) {
      lines.push('', '最近日志：')
      j.logs.slice(-5).forEach((l) => lines.push(`  [${l.level}] ${l.message}`))
    }
    await this.reply(lines.join('\n'))
    return true
  }

  async stopJob() {
    const match = this.e.msg?.match(/^(?:[:：]|#zmd|#终末地)maa\s*停止(?:\s+(\S+))?$/)
    const rawInput = match?.[1]?.trim() || '1'  // 无参数默认停止最近一次任务
    const jobId = await this.resolveJobId(this.e.user_id, rawInput)
    if (!jobId) {
      await this.reply(getMessage('maaend.job_not_found', { id: rawInput }))
      return true
    }
    const req = this.getMaaendReq()
    const res = await req.stopJob(jobId)
    if (!res || res.code !== 0) {
      await this.reply(res?.message || '停止任务失败')
      return true
    }
    await this.reply(res.data?.message || '已发送停止指令')
    return true
  }

  async screenshot() {
    const match = this.e.msg?.match(/^(?:[:：]|#zmd|#终末地)maa\s*截图(?:\s*(\d+))?$/)
    const idx = match?.[1] || null  // null = 使用默认设备
    const out = await this.getDeviceByIndex(this.e.user_id, idx)
    if (out.err) {
      await this.reply(out.err)
      return true
    }
    if (!out.device) return true
    const req = this.getMaaendReq()
    const img = await this._tryGetScreenshot(req, out.device.device_id)
    if (img) {
      await this.reply(img)
    } else {
      await this.reply(getMessage('maaend.screenshot_failed'))
    }
    return true
  }

  async resetDevice() {
    const match = this.e.msg?.match(/^(?:[:：]|#zmd|#终末地)maa\s*重置(?:\s*(\d+))?$/)
    const idx = match?.[1] || null  // null = 使用默认设备
    const out = await this.getDeviceByIndex(this.e.user_id, idx)
    if (out.err) {
      await this.reply(out.err)
      return true
    }
    if (!out.device) return true
    const req = this.getMaaendReq()
    const res = await req.resetDevice(out.device.device_id)
    if (!res || res.code !== 0) {
      await this.reply(res?.message || '重置设备状态失败')
      return true
    }
    await this.reply(res.data?.message || '设备任务状态已重置')
    return true
  }

  async deleteDevice() {
    const match = this.e.msg?.match(/^(?:[:：]|#zmd|#终末地)maa\s*删除设备\s*(\d+)$/)
    const idx = match ? match[1] : ''
    if (!idx) {
      await this.reply(getMessage('maaend.delete_usage'))
      return true
    }
    const out = await this.getDeviceByIndex(this.e.user_id, idx)
    if (out.err) {
      await this.reply(out.err)
      return true
    }
    if (!out.device) return true
    const req = this.getMaaendReq()
    const res = await req.deleteDevice(out.device.device_id)
    if (!res || res.code !== 0) {
      await this.reply(res?.message || '删除设备失败')
      return true
    }
    await this.removeUserDevice(this.e.user_id, out.device.device_id)
    await this.reply(res.data?.message || '设备已删除')
    return true
  }

  /** 在默认设备上执行任务：:maa 执行/运行 <任务名或序号> */
  async maaExecDefault() {
    const match = this.e.msg?.match(/^(?:[:：]|#zmd|#终末地)maa\s*(?:执行|运行)(?:\s+(.+))?$/)
    const taskPart = match ? (match[1] || '').trim() : ''

    // 获取默认设备
    const out = await this.getDeviceByIndex(this.e.user_id, null)
    if (out.err) { await this.reply(out.err); return true }
    if (!out.device) return true

    const req = this.getMaaendReq()
    if (!req) return true

    const taskRes = await req.getDeviceTasks(out.device.device_id)
    if (!taskRes || taskRes.code !== 0) {
      await this.reply(taskRes?.message || '获取设备任务失败')
      return true
    }

    const availableTasks = taskRes.data?.tasks || []
    const controllers = taskRes.data?.controllers || []
    const resources = taskRes.data?.resources || []

    // 无任务参数 → 显示默认设备的任务列表
    if (!taskPart) {
      return this._renderTaskList(out.device, out.deviceIdx, availableTasks, controllers, resources)
    }

    // 有任务参数 → 在默认设备上执行
    return this._executeTask(out.device, taskPart, availableTasks, controllers, resources)
  }

  async jobHistory() {
    const match = this.e.msg?.match(/^(?:[:：]|#zmd|#终末地)maa\s*(?:历史)(?:\s+(\d+))?(?:\s+(.+))?$/)
    const page = match && match[1] ? parseInt(match[1], 10) : 1
    const deviceIdFilter = match && match[2] ? match[2].trim() : ''
    const req = this.getMaaendReq()
    if (!req) return true
    const res = await req.getJobs({ page, limit: 10, device_id: deviceIdFilter || undefined })
    if (!res || res.code !== 0) {
      await this.reply(res?.message || '获取任务历史失败')
      return true
    }
    const jobs = res.data?.jobs || []
    const total = res.data?.total ?? 0
    if (jobs.length === 0) {
      await this.reply(getMessage('maaend.no_job_history'))
      return true
    }
    const lines = [`【任务历史】 第 ${page} 页，共 ${total} 条`, '']
    jobs.forEach((j) => {
      lines.push(`• ${j.job_id} | ${j.device_name || j.device_id} | ${jobStatusText(j.status)} | ${j.duration_ms ?? '—'}ms`)
    })
    await this.reply(lines.join('\n'))
    return true
  }

}
