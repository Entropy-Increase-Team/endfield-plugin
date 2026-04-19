import lodash from 'lodash'
import timers from 'node:timers/promises'
import Runtime from '../../../lib/plugins/runtime.js'
import puppeteer from '../../../lib/puppeteer/puppeteer.js'

const PLUGIN_NAME = 'endfield-plugin'
const RENDER_PREFIX = `${PLUGIN_NAME}/`
const HTML_ROOT = process.cwd()
const SCREENSHOT_CFG_KEYS = [
  'scale',
  'viewport',
  'imgType',
  'quality',
  'omitBackground',
  'path',
  'multiPage',
  'multiPageHeight',
  'pageGotoParams'
]

const PATCH_FLAG = Symbol.for('endfield-plugin.render-patch.applied')
const RUNTIME_PATCH_FLAG = Symbol.for('endfield-plugin.runtime-render-patched')
const RENDERER_PATCH_FLAG = Symbol.for('endfield-plugin.renderer-render-patched')

function isEndfieldRender(name) {
  return typeof name === 'string' && name.startsWith(RENDER_PREFIX)
}

function normalizeRenderData(data = {}, cfg = {}) {
  const nextData = { ...(data || {}) }

  for (const key of SCREENSHOT_CFG_KEYS) {
    if (nextData[key] === undefined && cfg[key] !== undefined) {
      nextData[key] = cfg[key]
    }
  }

  const rawScale = Number(nextData.scale)
  nextData.scale = Number.isFinite(rawScale) ? Math.max(rawScale, 2) : 2
  nextData.imgType = nextData.imgType || 'png'

  if (nextData.imgType !== 'png' && typeof nextData.quality !== 'number') {
    nextData.quality = 100
  }

  return nextData
}

function patchRuntimeRender() {
  if (Runtime.prototype[RUNTIME_PATCH_FLAG]) return

  const originalRender = Runtime.prototype.render
  Runtime.prototype.render = async function(plugin, path, data = {}, cfg = {}) {
    if (plugin !== PLUGIN_NAME) {
      return await originalRender.call(this, plugin, path, data, cfg)
    }

    return await originalRender.call(this, plugin, path, normalizeRenderData(data, cfg), cfg)
  }

  Runtime.prototype[RUNTIME_PATCH_FLAG] = true
}

function patchPuppeteerRender() {
  if (!puppeteer?.render || puppeteer[RENDERER_PATCH_FLAG]) return

  const originalRender = puppeteer.render.bind(puppeteer)
  puppeteer.render = async function(name, data = {}) {
    if (!isEndfieldRender(name)) {
      return await originalRender(name, data)
    }

    return await renderEndfieldScreenshot.call(this, name, normalizeRenderData(data))
  }

  puppeteer[RENDERER_PATCH_FLAG] = true
}

async function renderEndfieldScreenshot(name, data = {}) {
  if (!(await this.browserInit())) return false
  const pageHeight = data.multiPageHeight || 4000

  const savePath = this.dealTpl(name, data)
  if (!savePath) return false

  let buff = ''
  const start = Date.now()

  let ret = []
  this.shoting.push(name)

  const puppeteerTimeout = this.puppeteerTimeout
  let overtime
  if (puppeteerTimeout > 0) {
    overtime = setTimeout(() => {
      if (this.shoting.length) {
        logger.error(`[图片生成][${name}] 截图超时，当前等待队列：${this.shoting.join(',')}`)
        this.restart(true)
        this.shoting = []
      }
    }, puppeteerTimeout)
  }

  try {
    const page = await this.browser.newPage()
    const viewport = data.viewport || {}
    const viewportWidth = Math.max(1, Math.ceil(Number(viewport.width) || 800))
    const viewportHeight = Math.max(1, Math.ceil(Number(viewport.height) || 600))
    const deviceScaleFactor = Math.max(1, Number(data.scale) || 1)

    await page.setViewport({
      width: viewportWidth,
      height: viewportHeight,
      deviceScaleFactor
    })

    const pageGotoParams = lodash.extend({}, this.pageGotoParams, data.pageGotoParams || {})
    await page.goto(`file://${HTML_ROOT}${lodash.trim(savePath, '.')}`, pageGotoParams)
    const body = (await page.$('#container')) || (await page.$('body'))

    const boundingBox = await body.boundingBox()
    let num = 1

    const randData = {
      type: data.imgType || 'jpeg',
      omitBackground: data.omitBackground || false,
      quality: data.quality || 90,
      path: data.path || ''
    }

    if (data.multiPage) {
      randData.type = 'jpeg'
      num = Math.round(boundingBox.height / pageHeight) || 1
    }

    if (data.imgType === 'png') delete randData.quality

    if (!data.multiPage) {
      buff = await body.screenshot(randData)
      if (!Buffer.isBuffer(buff)) buff = Buffer.from(buff)

      this.renderNum++
      const kb = (buff.length / 1024).toFixed(2) + 'KB'
      logger.mark(`[图片生成][${name}][${this.renderNum}次] ${kb} ${logger.green(`${Date.now() - start}ms`)}`)
      ret.push(buff)
    } else {
      if (num > 1) {
        await page.setViewport({
          width: Math.max(1, Math.ceil(boundingBox.width)),
          height: Math.max(1, Math.ceil(pageHeight + 100)),
          deviceScaleFactor
        })
      }

      for (let i = 1; i <= num; i++) {
        if (i !== 1 && i === num) {
          await page.setViewport({
            width: Math.max(1, Math.ceil(boundingBox.width)),
            height: Math.max(1, Math.ceil(parseInt(boundingBox.height) - pageHeight * (num - 1))),
            deviceScaleFactor
          })
        }

        if (i !== 1 && i <= num) {
          await page.evaluate((currentPageHeight) => window.scrollBy(0, currentPageHeight), pageHeight)
        }

        if (num === 1) buff = await body.screenshot(randData)
        else buff = await page.screenshot(randData)
        if (!Buffer.isBuffer(buff)) buff = Buffer.from(buff)

        if (num > 2) await timers.setTimeout(200)

        this.renderNum++

        const kb = (buff.length / 1024).toFixed(2) + 'KB'
        logger.mark(`[图片生成][${name}][${i}/${num}] ${kb}`)
        ret.push(buff)
      }

      if (num > 1) {
        logger.mark(`[图片生成][${name}] 处理完成`)
      }
    }

    page.close().catch(err => logger.error(err))
  } catch (err) {
    logger.error(`[图片生成][${name}] 图片生成失败`, err)
    this.restart(true)
    if (overtime) clearTimeout(overtime)
    ret = []
    return false
  } finally {
    if (overtime) clearTimeout(overtime)
  }

  this.shoting.pop()

  if (ret.length === 0 || !ret[0]) {
    logger.error(`[图片生成][${name}] 图片生成为空`)
    return false
  }

  const durationMs = Date.now() - start
  const sentBytes = ret.reduce((sum, item) => sum + (Buffer.isBuffer(item) ? item.length : 0), 0)
  await this.saveScreenshotCount(ret.length)
  await this.saveScreenshotStats({ count: ret.length, durationMs, sentBytes })

  this.restart()
  return data.multiPage ? ret : ret[0]
}

export function applyRenderPatch() {
  if (globalThis[PATCH_FLAG]) return

  patchRuntimeRender()
  patchPuppeteerRender()

  globalThis[PATCH_FLAG] = true
}

applyRenderPatch()

