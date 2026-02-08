/**
 * MaaEnd 远程控制 - 设备绑定、任务下发、状态查询、截图等
 */
import MaaendRequest from '../model/maaendReq.js'
import setting from '../utils/setting.js'
import { getCopyright } from '../utils/copyright.js'

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

/** 格式化 ISO 时间为可读格式 */
function formatTime(isoStr) {
  if (!isoStr) return '—'
  try {
    const d = new Date(isoStr)
    if (isNaN(d.getTime())) return isoStr
    const pad = n => String(n).padStart(2, '0')
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  } catch { return isoStr }
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
    const req = new MaaendRequest()
    if (!this.commonConfig.api_key || String(this.commonConfig.api_key).trim() === '') {
      return null
    }
    return req
  }

  /** 获取当前用户的默认设备 ID */
  async getDefaultDeviceId() {
    return await redis.get(`ENDFIELD:MAAEND_DEFAULT:${this.e.user_id}`)
  }

  /** 保存 Job ID 到用户最近任务列表（最新在前，最多 20 条） */
  async saveJobId(jobId) {
    const key = `ENDFIELD:MAAEND_JOBS:${this.e.user_id}`
    await redis.lPush(key, jobId)
    await redis.lTrim(key, 0, 19)
    await redis.expire(key, 86400 * 7)
  }

  /** 解析用户输入的任务标识：短编号(1~20)→实际 Job ID，其余原样返回 */
  async resolveJobId(input) {
    const num = parseInt(input, 10)
    if (String(num) === input && num >= 1 && num <= 20) {
      const key = `ENDFIELD:MAAEND_JOBS:${this.e.user_id}`
      const jobId = await redis.lIndex(key, num - 1)
      return jobId || null
    }
    return input
  }

  /** 设置默认设备 / 查看当前默认设备 */
  async setDefaultDevice() {
    const match = this.e.msg?.match(/^(?:[:：]|#zmd|#终末地)maa\s*设置设备(?:\s*(\d+))?$/)
    const idx = match?.[1] || ''

    const req = this.getMaaendReq()
    if (!req) return true

    // 未提供序号 → 显示当前默认设备
    if (!idx) {
      const defaultId = await this.getDefaultDeviceId()
      if (!defaultId) {
        await this.reply('当前未设置默认设备。\n用法：:maa 设置设备 <序号>')
        return true
      }
      const res = await req.getDevices()
      const devices = res?.data?.devices || []
      const pos = devices.findIndex(d => d.device_id === defaultId)
      if (pos >= 0) {
        const d = devices[pos]
        await this.reply(`当前默认设备：${pos + 1}. ${d.device_name || d.device_id} [${statusText(d.status)}]\n更换：:maa 设置设备 <新序号>`)
      } else {
        await redis.del(`ENDFIELD:MAAEND_DEFAULT:${this.e.user_id}`)
        await this.reply('当前默认设备已失效（可能已解绑），请重新设置。')
      }
      return true
    }

    // 提供了序号 → 设置为默认设备
    const out = await this.getDeviceByIndex(idx)
    if (out.err) { await this.reply(out.err); return true }
    if (!out.device) return true

    await redis.set(`ENDFIELD:MAAEND_DEFAULT:${this.e.user_id}`, out.device.device_id)
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

  /** 获取设备列表并按序号取设备；序号为空时自动使用默认设备 */
  async getDeviceByIndex(indexOneBased) {
    const req = this.getMaaendReq()
    if (!req) return { err: null, device: null }
    const res = await req.getDevices()
    if (!res || res.code !== 0) return { err: res?.message || '获取设备列表失败' }
    const devices = res.data?.devices || []
    if (devices.length === 0) return { err: '暂无绑定设备，请私聊发送「:maa 绑定」获取绑定码。' }

    // 未提供序号，尝试使用默认设备
    if (indexOneBased == null || indexOneBased === '') {
      const defaultId = await this.getDefaultDeviceId()
      if (!defaultId) {
        return { err: '未指定设备序号，且未设置默认设备。\n请使用「:maa 设置设备 <序号>」设置默认设备，或在命令中指定序号。' }
      }
      const pos = devices.findIndex(d => d.device_id === defaultId)
      if (pos < 0) {
        await redis.del(`ENDFIELD:MAAEND_DEFAULT:${this.e.user_id}`)
        return { err: '默认设备已失效（可能已解绑），请重新设置。' }
      }
      return { device: devices[pos], devices, deviceIdx: pos + 1 }
    }

    const i = parseInt(indexOneBased, 10)
    if (!Number.isFinite(i) || i < 1 || i > devices.length) {
      return { err: `请输入设备序号 1～${devices.length}` }
    }
    return { device: devices[i - 1], devices, deviceIdx: i }
  }

  async deviceList() {
    const req = this.getMaaendReq()
    if (!req) return true
    const res = await req.getDevices()
    if (!res) {
      await this.reply('获取设备列表失败，请检查网络或 API 配置。')
      return true
    }
    if (res.code !== 0) {
      await this.reply(res.message || `请求失败(code: ${res.code})`)
      return true
    }
    const devices = res.data?.devices || []
    const count = res.data?.count ?? devices.length
    if (devices.length === 0) {
      await this.reply('暂无绑定设备。请私聊发送「:maa 绑定」获取绑定码，在 MaaEnd Client 中输入后完成绑定。')
      return true
    }
    const lines = ['【MaaEnd 设备列表】', `共 ${count} 台设备：`, '']
    devices.forEach((d, i) => {
      const cap = d.capabilities
      const tasks = cap?.tasks?.length ? cap.tasks.join('、') : '—'
      const controllers = cap?.controllers?.length ? cap.controllers.join('、') : '—'
      const resources = cap?.resources?.length ? cap.resources.join('、') : '—'
      lines.push(`${i + 1}. ${d.device_name || d.device_id} [${statusText(d.status)}]`)
      lines.push(`    ID: ${d.device_id} | 版本: ${d.maaend_version || '—'} / ${d.client_version || '—'}`)
      lines.push(`    任务: ${tasks} | 控制器: ${controllers} | 资源: ${resources}`)
      if (d.current_job_id) lines.push(`    当前任务: ${d.current_job_id}`)
      lines.push('')
    })
    await this.reply(lines.join('\n').trim())
    return true
  }

  async bindCode() {
    if (!this.e.isPrivate) {
      await this.reply('请私聊使用「:maa 绑定」获取绑定码')
      return true
    }
    const req = this.getMaaendReq()
    if (!req) return true
    const res = await req.createBindCode()
    if (!res || res.code !== 0) {
      await this.reply(res?.message || '生成绑定码失败。')
      return true
    }
    const { bind_code, expires_in, expires_at } = res.data || {}
    const msg = [
      '【MaaEnd 绑定码】',
      `绑定码：${bind_code || '—'}`,
      `有效期：${formatDuration(expires_in || 300)}`,
      `过期时间：${formatTime(expires_at)}`,
      '',
      '请在 MaaEnd Client 中输入上述绑定码完成设备绑定。'
    ].join('\n')
    await this.reply(msg)
    return true
  }

  /** 查看设备任务列表：:maa 设备任务/任务列表 [序号] */
  async maaTask() {
    const match = this.e.msg?.match(/^(?:[:：]|#zmd|#终末地)maa\s*(?:设备任务|任务列表)(?:\s*(\d+))?$/)
    if (!match) return true
    const deviceIdx = match[1] || null  // null = 使用默认设备

    const out = await this.getDeviceByIndex(deviceIdx)
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
        await this.reply(`任务序号 ${num} 超出范围，该设备共 ${availableTasks.length} 个可用任务`)
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
      await this.reply('下发任务请求失败')
      return true
    }
    if (res.code === 40001) {
      await this.reply('设备离线，无法执行任务')
      return true
    }
    if (res.code === 40002) {
      await this.reply(res.message || '设备正在执行任务，请稍后再试')
      return true
    }
    if (res.code !== 0) {
      await this.reply(res.message || `请求失败(code: ${res.code})`)
      return true
    }
    const jobId = res.data?.job_id
    const taskDesc = resolvedTasks.map(t => t.label ? `${t.label}(${t.name})` : t.name).join('、')
    if (jobId) await this.saveJobId(jobId)

    // 下发通知 + 截图合并为一条消息
    const msg = [`任务已下发 → ${taskDesc}\n任务编号：#1\n查询进度：:maa 状态\n停止任务：:maa 停止`]
    try {
      const ssRes = await req.getScreenshot(device.device_id, true)
      if (ssRes?.isImage && ssRes.data) {
        msg.push(segment.image(ssRes.data))
      } else if (ssRes?.code === 0 && ssRes.data?.base64_image) {
        msg.push(segment.image(Buffer.from(ssRes.data.base64_image, 'base64')))
      }
    } catch (err) {
      logger.error(`[MaaEnd]获取下发截图失败: ${err?.message}`)
    }
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
          try {
            const ssRes = await req.getScreenshot(deviceId, true)
            if (ssRes?.isImage && ssRes.data) {
              msg.push(segment.image(ssRes.data))
            } else if (ssRes?.code === 0 && ssRes.data?.base64_image) {
              msg.push(segment.image(Buffer.from(ssRes.data.base64_image, 'base64')))
            }
          } catch (err) {
            logger.error(`[MaaEnd]获取完成截图失败: ${err?.message}`)
          }
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
    const jobId = await this.resolveJobId(rawInput)
    if (!jobId) {
      await this.reply(`未找到编号 #${rawInput} 对应的任务`)
      return true
    }
    const req = this.getMaaendReq()
    const res = await req.getJob(jobId)
    if (!res) {
      await this.reply('查询任务状态失败')
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
    const jobId = await this.resolveJobId(rawInput)
    if (!jobId) {
      await this.reply(`未找到编号 #${rawInput} 对应的任务`)
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
    const out = await this.getDeviceByIndex(idx)
    if (out.err) {
      await this.reply(out.err)
      return true
    }
    if (!out.device) return true
    const req = this.getMaaendReq()
    const res = await req.getScreenshot(out.device.device_id, true)
    if (!res) {
      await this.reply('获取截图失败')
      return true
    }
    if (res.isImage && res.data) {
      await this.reply(segment.image(res.data))
      return true
    }
    if (res.code === 0 && res.data?.base64_image) {
      const buf = Buffer.from(res.data.base64_image, 'base64')
      await this.reply(segment.image(buf))
      return true
    }
    await this.reply(res?.message || '设备可能离线或未连接控制器，无法截图')
    return true
  }

  async resetDevice() {
    const match = this.e.msg?.match(/^(?:[:：]|#zmd|#终末地)maa\s*重置(?:\s*(\d+))?$/)
    const idx = match?.[1] || null  // null = 使用默认设备
    const out = await this.getDeviceByIndex(idx)
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
      await this.reply('用法：:maa 删除设备 <序号>')
      return true
    }
    const out = await this.getDeviceByIndex(idx)
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
    await this.reply(res.data?.message || '设备已删除')
    return true
  }

  /** 在默认设备上执行任务：:maa 执行/运行 <任务名或序号> */
  async maaExecDefault() {
    const match = this.e.msg?.match(/^(?:[:：]|#zmd|#终末地)maa\s*(?:执行|运行)(?:\s+(.+))?$/)
    const taskPart = match ? (match[1] || '').trim() : ''

    // 获取默认设备
    const out = await this.getDeviceByIndex(null)
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
      await this.reply('暂无任务历史')
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
