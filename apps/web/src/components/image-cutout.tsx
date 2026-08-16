import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react"
import { zipSync } from "fflate"
import { Check, Download, FileImage, ImageDown, LoaderCircle, RotateCcw, ShieldCheck, Sparkles, Trash2, Upload, X } from "lucide-react"
import { Alert, Badge, Button, Card, CardContent, CardHeader, CardTitle, FormField, IconButton, Input, PageHeader, Select } from "@/components/ui"

type BackgroundMode = "transparent" | "white" | "color"
type ExportType = "png" | "jpg"
type ItemStatus = "pending" | "processing" | "completed" | "failed"

interface ImageItem {
  id: string
  file: File
  sourceUrl: string
  outputUrl?: string
  outputBlob?: Blob
  cutoutBlob?: Blob
  outputType?: ExportType
  outputEdge?: number
  status: ItemStatus
  progress: number
  error?: string
}

const MAX_FILES = 20
const MAX_FILE_SIZE = 15 * 1024 * 1024
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"])
const statusLabels: Record<ItemStatus, string> = { pending: "待处理", processing: "处理中", completed: "已完成", failed: "失败" }

function sizeLabel(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function outputName(name: string, type: ExportType) {
  return `${name.replace(/\.[^/.]+$/, "")}_cutout.${type}`
}

function triggerDownload(url: string, filename: string) {
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
}

async function loadImage(blob: Blob) {
  const url = URL.createObjectURL(blob)
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error("无法读取去背结果"))
      image.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function renderExport(blob: Blob, type: ExportType, background: BackgroundMode, color: string, edge: number, padding: number) {
  const image = await loadImage(blob)
  const width = edge || image.naturalWidth
  const height = edge || image.naturalHeight
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext("2d")
  if (!context) throw new Error("浏览器无法创建图片画布")
  if (type === "jpg" || background !== "transparent") {
    context.fillStyle = background === "color" ? color : "#ffffff"
    context.fillRect(0, 0, width, height)
  }
  const availableWidth = width * (1 - padding * 2)
  const availableHeight = height * (1 - padding * 2)
  const ratio = Math.min(availableWidth / image.naturalWidth, availableHeight / image.naturalHeight)
  const renderedWidth = image.naturalWidth * ratio
  const renderedHeight = image.naturalHeight * ratio
  context.drawImage(image, (width - renderedWidth) / 2, (height - renderedHeight) / 2, renderedWidth, renderedHeight)
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error("图片导出失败")), type === "jpg" ? "image/jpeg" : "image/png", .94))
}

export function ImageCutout() {
  const inputRef = useRef<HTMLInputElement>(null)
  const itemsRef = useRef<ImageItem[]>([])
  const mountedRef = useRef(true)
  const [items, setItems] = useState<ImageItem[]>([])
  const [dragging, setDragging] = useState(false)
  const [working, setWorking] = useState(false)
  const [background, setBackground] = useState<BackgroundMode>("transparent")
  const [exportType, setExportType] = useState<ExportType>("png")
  const [preset, setPreset] = useState("square")
  const [edge, setEdge] = useState(1600)
  const [padding, setPadding] = useState(.08)
  const [color, setColor] = useState("#f4f0e9")
  const [message, setMessage] = useState<{ variant: "success" | "warning" | "danger"; text: string }>()

  useEffect(() => { itemsRef.current = items }, [items])
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      for (const item of itemsRef.current) {
        URL.revokeObjectURL(item.sourceUrl)
        if (item.outputUrl) URL.revokeObjectURL(item.outputUrl)
      }
    }
  }, [])

  const completed = items.filter((item) => item.status === "completed" && item.outputBlob && item.outputUrl)
  const totalProgress = items.length ? Math.round(items.reduce((sum, item) => sum + item.progress, 0) / items.length) : 0
  const outputSummary = useMemo(() => `${edge ? `${edge} × ${edge}px` : "原始尺寸"} · ${background === "transparent" ? "透明背景" : background === "white" ? "纯白背景" : "自定义底色"} · ${exportType.toUpperCase()}`, [background, edge, exportType])

  function addFiles(files: FileList | File[]) {
    const selected = Array.from(files)
    const valid = selected.filter((file) => ACCEPTED_TYPES.has(file.type) && file.size <= MAX_FILE_SIZE)
    const available = valid.slice(0, Math.max(0, MAX_FILES - items.length))
    if (valid.length !== selected.length) setMessage({ variant: "warning", text: "已跳过格式不支持或超过 15 MB 的图片。" })
    else if (available.length !== valid.length) setMessage({ variant: "warning", text: `单个批次最多处理 ${MAX_FILES} 张图片。` })
    else setMessage(undefined)
    if (!available.length) return
    setItems((current) => [...current, ...available.map((file) => ({ id: crypto.randomUUID(), file, sourceUrl: URL.createObjectURL(file), status: "pending" as const, progress: 0 }))])
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(false)
    if (!working) addFiles(event.dataTransfer.files)
  }

  function removeItem(id: string) {
    setItems((current) => {
      const item = current.find((entry) => entry.id === id)
      if (item) { URL.revokeObjectURL(item.sourceUrl); if (item.outputUrl) URL.revokeObjectURL(item.outputUrl) }
      return current.filter((entry) => entry.id !== id)
    })
  }

  function clearItems() {
    for (const item of items) { URL.revokeObjectURL(item.sourceUrl); if (item.outputUrl) URL.revokeObjectURL(item.outputUrl) }
    setItems([])
    setMessage(undefined)
  }

  async function processImages() {
    const pending = items.filter((item) => item.status === "pending" || item.status === "failed")
    const candidates = pending.length ? pending : items
    if (!candidates.length) return
    setWorking(true)
    setMessage(undefined)
    let failed = 0
    try {
      const { removeBackground } = await import("@imgly/background-removal")
      for (const item of candidates) {
        setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: "processing", progress: 10, error: undefined } : entry))
        try {
          const cutout = item.cutoutBlob || await removeBackground(item.file)
          setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, progress: 78 } : entry))
          const outputBlob = await renderExport(cutout, exportType, background, color, edge, padding)
          const outputUrl = URL.createObjectURL(outputBlob)
          if (!mountedRef.current) { URL.revokeObjectURL(outputUrl); return }
          setItems((current) => current.map((entry) => {
            if (entry.id !== item.id) return entry
            if (entry.outputUrl) URL.revokeObjectURL(entry.outputUrl)
            return { ...entry, cutoutBlob: cutout, outputBlob, outputUrl, outputType: exportType, outputEdge: edge, status: "completed", progress: 100 }
          }))
        } catch (reason) {
          failed += 1
          const error = reason instanceof Error ? reason.message : "处理失败"
          setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: "failed", progress: 0, error } : entry))
        }
      }
      if (mountedRef.current) setMessage(failed ? { variant: "warning", text: `${candidates.length - failed} 张处理完成，${failed} 张失败，可再次重试。` } : { variant: "success", text: `已完成 ${candidates.length} 张图片的去背与规格化输出。` })
    } catch (reason) {
      if (mountedRef.current) setMessage({ variant: "danger", text: reason instanceof Error ? `去背引擎加载失败：${reason.message}` : "去背引擎加载失败" })
    } finally {
      if (mountedRef.current) setWorking(false)
    }
  }

  async function downloadAll() {
    const files: Record<string, Uint8Array> = {}
    const usedNames = new Set<string>()
    for (const [index, item] of completed.entries()) {
      if (item.outputBlob && item.outputType) {
        const preferred = outputName(item.file.name, item.outputType)
        const filename = usedNames.has(preferred) ? `${String(index + 1).padStart(2, "0")}_${preferred}` : preferred
        usedNames.add(filename)
        files[filename] = new Uint8Array(await item.outputBlob.arrayBuffer())
      }
    }
    const blob = new Blob([zipSync(files)], { type: "application/zip" })
    const url = URL.createObjectURL(blob)
    triggerDownload(url, `image-cutout_${new Date().toISOString().slice(0, 10)}.zip`)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  function choosePreset(value: string) {
    setPreset(value)
    setEdge(value === "amazon" ? 2000 : value === "square" ? 1600 : value === "thumbnail" ? 1000 : 0)
  }

  return <div className="cutout-page">
    <PageHeader eyebrow="智能工具 / 本地视觉处理" title="智能抠图" description="批量移除图片背景，并统一输出画布、留白、底色与文件格式。图片内容仅在当前浏览器中处理。" actions={<Badge variant="success"><ShieldCheck />本地处理</Badge>} />
    {message && <Alert variant={message.variant}>{message.text}</Alert>}
    <div className="cutout-workspace">
      <Card className="cutout-upload-card"><CardHeader><div><CardTitle>01 · 原始素材</CardTitle><p>添加 JPG、PNG 或 WebP，单张不超过 15 MB</p></div>{items.length > 0 && <Button size="sm" variant="ghost" disabled={working} onClick={clearItems}><Trash2 />清空</Button>}</CardHeader><CardContent>
        <div className={`cutout-drop${dragging ? " active" : ""}`} role="button" tabIndex={0} onClick={() => !working && inputRef.current?.click()} onKeyDown={(event) => event.key === "Enter" && !working && inputRef.current?.click()} onDragEnter={(event) => { event.preventDefault(); if (!working) setDragging(true) }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={onDrop}>
          <input ref={inputRef} hidden multiple type="file" accept="image/jpeg,image/png,image/webp" onChange={(event: ChangeEvent<HTMLInputElement>) => { if (event.target.files) addFiles(event.target.files); event.target.value = "" }} />
          <span><Upload /></span><strong>{dragging ? "松开即可加入批次" : "拖拽图片到这里，或点击选择"}</strong><p>最多 {MAX_FILES} 张 · AI 前景识别 · 精细边缘处理</p>
        </div>
        <div className="cutout-queue-header"><strong>{String(items.length).padStart(2, "0")} 张图片</strong><span>{working ? `总体进度 ${totalProgress}%` : "等待处理"}</span></div>
        {items.length ? <div className="cutout-queue">{items.map((item, index) => <div className="cutout-queue-item" key={item.id}>
          <span className="cutout-index">{String(index + 1).padStart(2, "0")}</span><img src={item.sourceUrl} alt="" /><div><strong title={item.file.name}>{item.file.name}</strong><span>{sizeLabel(item.file.size)} · {statusLabels[item.status]}{item.error ? ` · ${item.error}` : ""}</span><div className="cutout-progress"><i style={{ width: `${item.progress}%` }} /></div></div>
          {item.status === "completed" ? <Check className="cutout-done" /> : item.status === "processing" ? <LoaderCircle className="spin" /> : <IconButton aria-label={`移除 ${item.file.name}`} disabled={working} onClick={() => removeItem(item.id)}><X /></IconButton>}
        </div>)}</div> : <div className="cutout-empty"><FileImage /><span>尚未加入图片</span></div>}
      </CardContent></Card>
      <Card className="cutout-settings-card"><CardHeader><div><CardTitle>02 · 输出规格</CardTitle><p>一次设置，应用到当前待处理批次</p></div></CardHeader><CardContent>
        <FormField label="背景底色"><div className="cutout-background-options"><button className={background === "transparent" ? "selected checkerboard" : "checkerboard"} onClick={() => { setBackground("transparent"); setExportType("png") }}>透明</button><button className={background === "white" ? "selected" : ""} onClick={() => setBackground("white")}>纯白</button><label className={background === "color" ? "selected" : ""} onClick={() => setBackground("color")}><Input aria-label="自定义背景色" type="color" value={color} onChange={(event) => { setColor(event.target.value); setBackground("color") }} />自定义</label></div></FormField>
        <FormField label="画布尺寸"><Select value={preset} onChange={(event) => choosePreset(event.target.value)}><option value="square">通用方图 — 1600 px</option><option value="amazon">电商主图 — 2000 px</option><option value="thumbnail">网站缩略图 — 1000 px</option><option value="original">保留原始尺寸</option></Select></FormField>
        <FormField label={`主体留白 · ${Math.round(padding * 100)}%`}><Input type="range" min="0" max="0.2" value={padding} step="0.01" onChange={(event) => setPadding(Number(event.target.value))} /></FormField>
        <FormField label="输出格式"><div className="cutout-format-options"><button className={exportType === "png" ? "selected" : ""} onClick={() => setExportType("png")}><strong>PNG</strong><span>支持透明背景</span></button><button className={exportType === "jpg" ? "selected" : ""} onClick={() => setExportType("jpg")}><strong>JPG</strong><span>文件体积较小</span></button></div></FormField>
        <div className="cutout-summary"><span>OUTPUT</span><strong>{outputSummary}</strong></div>
        <Button className="cutout-process" variant="primary" loading={working} disabled={!items.length || working} onClick={() => void processImages()}><Sparkles />{working ? `正在处理 ${totalProgress}%` : completed.length === items.length ? "按当前规格重新导出" : "开始批量抠图"}</Button>
        <small className="cutout-local-note"><ShieldCheck />首次使用会下载 AI 模型；原始图片不会上传到服务器。</small>
      </CardContent></Card>
    </div>
    <section className="cutout-results"><header><div><span>03 · 成品校样</span><h2>处理结果</h2></div><div><Badge variant={completed.length ? "success" : "neutral"}>{completed.length} / {items.length} 完成</Badge><Button disabled={!completed.length} onClick={() => void downloadAll()}><Download />下载 ZIP</Button></div></header>
      {completed.length ? <div className="cutout-result-grid">{completed.map((item) => <Card key={item.id}><div className="cutout-result-image checkerboard"><img src={item.outputUrl} alt={`${item.file.name} 抠图结果`} /><Badge variant="success"><Check />完成</Badge></div><CardContent><div><strong title={outputName(item.file.name, item.outputType || "png")}>{outputName(item.file.name, item.outputType || "png")}</strong><span>{item.outputEdge || "原始"} px · {(item.outputType || "png").toUpperCase()}</span></div><IconButton aria-label={`下载 ${item.file.name}`} onClick={() => item.outputUrl && triggerDownload(item.outputUrl, outputName(item.file.name, item.outputType || "png"))}><ImageDown /></IconButton></CardContent></Card>)}</div> : <div className="cutout-results-empty"><ImageDown /><strong>成品会显示在这里</strong><span>完成抠图后可单张下载，或打包下载 ZIP。</span></div>}
    </section>
    <footer className="cutout-footer"><span>浏览器端 AI 前景识别 · 边缘处理 · 规格化输出</span><Button size="sm" variant="ghost" disabled={working} onClick={() => { clearItems(); setPreset("square"); setEdge(1600); setPadding(.08); setBackground("transparent"); setExportType("png") }}><RotateCcw />重置工作台</Button></footer>
  </div>
}
