import './style.css'
import { removeBackground } from '@imgly/background-removal'
import type { Config } from '@imgly/background-removal'

type ModelId = Config['model']

const app = document.querySelector<HTMLDivElement>('#app')!

app.innerHTML = `
  <main class="container">
    <header class="header">
      <h1>图片去背景</h1>
      <p class="subtitle">基于 @imgly/background-removal，在浏览器本地完成 AI 抠图</p>
    </header>

    <section class="card upload-card">
      <div id="dropzone" class="dropzone" tabindex="0" role="button" aria-label="上传图片">
        <input id="file-input" type="file" accept="image/*" hidden />
        <div class="dropzone-icon">↑</div>
        <p class="dropzone-title">拖拽图片到此处，或点击选择</p>
        <p class="dropzone-hint">支持 JPG、PNG、WebP 等常见格式</p>
      </div>

      <div class="controls">
        <label class="field">
          <span>模型</span>
          <select id="model-select">
            <option value="isnet_fp16" selected>标准 (约 80MB，推荐)</option>
            <option value="isnet_quint8">轻量 (约 40MB，速度更快)</option>
            <option value="isnet">高精度 (体积更大)</option>
          </select>
        </label>
        <button id="process-btn" type="button" class="btn" disabled>开始去背景</button>
      </div>
    </section>

    <section id="status-panel" class="card status-panel hidden">
      <div class="status-header">
        <span id="status-text">准备中…</span>
        <span id="status-percent">0%</span>
      </div>
      <div class="progress-track">
        <div id="progress-bar" class="progress-bar"></div>
      </div>
      <p id="status-detail" class="status-detail">首次运行需下载 AI 模型，请耐心等待</p>
    </section>

    <section id="preview-panel" class="card preview-panel hidden">
      <div class="preview-grid">
        <figure class="preview-item">
          <figcaption>原图</figcaption>
          <div class="preview-frame">
            <img id="original-img" alt="原图预览" />
          </div>
        </figure>
        <figure class="preview-item">
          <figcaption>去背景结果</figcaption>
          <div class="preview-frame checkerboard">
            <img id="result-img" alt="去背景结果" />
          </div>
        </figure>
      </div>
      <div class="preview-actions">
        <button id="download-btn" type="button" class="btn btn-secondary" disabled>下载 PNG</button>
        <button id="reset-btn" type="button" class="btn btn-ghost">换一张</button>
      </div>
    </section>

    <p class="footnote">图片仅在本地浏览器处理，不会上传到任何服务器</p>
  </main>
`

const dropzone = document.querySelector<HTMLDivElement>('#dropzone')!
const fileInput = document.querySelector<HTMLInputElement>('#file-input')!
const modelSelect = document.querySelector<HTMLSelectElement>('#model-select')!
const processBtn = document.querySelector<HTMLButtonElement>('#process-btn')!
const statusPanel = document.querySelector<HTMLElement>('#status-panel')!
const statusText = document.querySelector<HTMLElement>('#status-text')!
const statusPercent = document.querySelector<HTMLElement>('#status-percent')!
const statusDetail = document.querySelector<HTMLElement>('#status-detail')!
const progressBar = document.querySelector<HTMLDivElement>('#progress-bar')!
const previewPanel = document.querySelector<HTMLElement>('#preview-panel')!
const originalImg = document.querySelector<HTMLImageElement>('#original-img')!
const resultImg = document.querySelector<HTMLImageElement>('#result-img')!
const downloadBtn = document.querySelector<HTMLButtonElement>('#download-btn')!
const resetBtn = document.querySelector<HTMLButtonElement>('#reset-btn')!

let selectedFile: File | null = null
let originalUrl: string | null = null
let resultUrl: string | null = null
let resultBlob: Blob | null = null
let processing = false

function revokeUrl(url: string | null) {
  if (url) URL.revokeObjectURL(url)
}

function setProgress(current: number, total: number, label: string) {
  const ratio = total > 0 ? Math.min(current / total, 1) : 0
  const percent = Math.round(ratio * 100)

  progressBar.style.width = `${percent}%`
  statusPercent.textContent = `${percent}%`
  statusText.textContent = label
}

function showStatus(label: string, detail: string) {
  statusPanel.classList.remove('hidden')
  statusText.textContent = label
  statusDetail.textContent = detail
}

function hideStatus() {
  statusPanel.classList.add('hidden')
  progressBar.style.width = '0%'
  statusPercent.textContent = '0%'
}

function resetPreview() {
  revokeUrl(originalUrl)
  revokeUrl(resultUrl)
  originalUrl = null
  resultUrl = null
  resultBlob = null
  selectedFile = null

  originalImg.removeAttribute('src')
  resultImg.removeAttribute('src')
  previewPanel.classList.add('hidden')
  downloadBtn.disabled = true
  processBtn.disabled = true
  fileInput.value = ''
}

function loadFile(file: File) {
  if (!file.type.startsWith('image/')) {
    alert('请选择图片文件')
    return
  }

  resetPreview()
  selectedFile = file
  originalUrl = URL.createObjectURL(file)
  originalImg.src = originalUrl
  previewPanel.classList.remove('hidden')
  processBtn.disabled = false
  hideStatus()
}

async function processImage() {
  if (!selectedFile || processing) return

  processing = true
  processBtn.disabled = true
  downloadBtn.disabled = true
  revokeUrl(resultUrl)
  resultUrl = null
  resultBlob = null
  resultImg.removeAttribute('src')

  showStatus('正在处理', '首次运行会下载模型文件，之后会自动缓存')

  const model = modelSelect.value as ModelId
  const config: Config = {
    model,
    progress: (key, current, total) => {
      const isModelDownload = key.includes('fetch') || key.includes('download') || key.includes('onnx') || key.includes('wasm')
      setProgress(
        current,
        total,
        isModelDownload ? '正在下载模型资源…' : '正在 AI 抠图…',
      )
      statusDetail.textContent = key
    },
  }

  try {
    setProgress(0, 1, '正在初始化…')
    const blob = await removeBackground(selectedFile, config)
    resultBlob = blob
    resultUrl = URL.createObjectURL(blob)
    resultImg.src = resultUrl
    downloadBtn.disabled = false
    hideStatus()
  } catch (error) {
    console.error(error)
    showStatus('处理失败', error instanceof Error ? error.message : '未知错误，请重试')
    processBtn.disabled = false
  } finally {
    processing = false
    if (selectedFile && !resultBlob) {
      processBtn.disabled = false
    }
  }
}

function downloadResult() {
  if (!resultBlob || !selectedFile) return

  const link = document.createElement('a')
  const baseName = selectedFile.name.replace(/\.[^.]+$/, '')
  link.href = resultUrl!
  link.download = `${baseName}-no-bg.png`
  link.click()
}

dropzone.addEventListener('click', () => fileInput.click())
dropzone.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    fileInput.click()
  }
})

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0]
  if (file) loadFile(file)
})

dropzone.addEventListener('dragover', (event) => {
  event.preventDefault()
  dropzone.classList.add('dragover')
})

dropzone.addEventListener('dragleave', () => {
  dropzone.classList.remove('dragover')
})

dropzone.addEventListener('drop', (event) => {
  event.preventDefault()
  dropzone.classList.remove('dragover')
  const file = event.dataTransfer?.files?.[0]
  if (file) loadFile(file)
})

processBtn.addEventListener('click', () => {
  void processImage()
})

downloadBtn.addEventListener('click', downloadResult)

resetBtn.addEventListener('click', () => {
  resetPreview()
  hideStatus()
  fileInput.click()
})
