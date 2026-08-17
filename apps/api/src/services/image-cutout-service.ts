import { createCanvas, ImageData, loadImage } from "@napi-rs/canvas"
import type { ExternalImageCutoutBatchItemResult, ExternalImageCutoutBatchRequest, ExternalImageCutoutBatchResult, ExternalImageCutoutRequest, ExternalImageCutoutResult, ImageCutoutMimeType } from "@zform/shared"
import { createHash } from "node:crypto"
import { createRequire } from "node:module"
import path from "node:path"
import { pathToFileURL } from "node:url"
import * as ort from "onnxruntime-web"
import { BusinessError } from "../utils/business-error.js"

const modelKey = "/models/isnet_quint8"
const modelVersion = "1.7.0"
const modelResolution = 1024
const maxInputBytes = 8 * 1024 * 1024
const maxDimension = 4096
const maxPixels = 16_000_000
const maxBatchSize = 5
const defaultModelBaseUrl = `https://staticimgly.com/@imgly/background-removal-data/${modelVersion}/dist/`

interface ModelChunk { name: string; hash: string; offsets: [number, number] }
interface ModelResource { chunks: ModelChunk[]; size: number }

let sessionPromise: Promise<ort.InferenceSession> | undefined
let inferenceQueue: Promise<void> = Promise.resolve()

function modelBaseUrl(): URL {
  try {
    const value = process.env.IMAGE_CUTOUT_MODEL_BASE_URL?.trim() || defaultModelBaseUrl
    return new URL(value.endsWith("/") ? value : `${value}/`)
  } catch {
    throw new BusinessError("IMAGE_CUTOUT_MODEL_BASE_URL 配置无效。", 503)
  }
}

function isModelResource(value: unknown): value is ModelResource {
  if (!value || typeof value !== "object") return false
  const resource = value as { chunks?: unknown; size?: unknown }
  return typeof resource.size === "number" && Number.isInteger(resource.size) && resource.size > 0 && Array.isArray(resource.chunks)
    && resource.chunks.length > 0 && resource.chunks.every((chunk) => {
      if (!chunk || typeof chunk !== "object") return false
      const item = chunk as { name?: unknown; hash?: unknown; offsets?: unknown }
      return typeof item.name === "string" && typeof item.hash === "string" && /^[a-f0-9]{64}$/i.test(item.hash) && Array.isArray(item.offsets) && item.offsets.length === 2
        && item.offsets.every((offset) => typeof offset === "number" && Number.isInteger(offset) && offset >= 0)
    })
}

async function fetchChecked(url: URL): Promise<Response> {
  let response: Response
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(120_000) })
  } catch {
    throw new BusinessError("抠图模型资源下载失败，请稍后重试。", 503)
  }
  if (!response.ok) throw new BusinessError(`抠图模型资源下载失败（HTTP ${response.status}）。`, 503)
  return response
}

async function loadModel(): Promise<Uint8Array> {
  const baseUrl = modelBaseUrl()
  const resources = await (await fetchChecked(new URL("resources.json", baseUrl))).json() as Record<string, unknown>
  const resource = resources[modelKey]
  if (!isModelResource(resource)) throw new BusinessError("抠图模型资源清单无效。", 503)
  const modelResource: ModelResource = resource
  const model = new Uint8Array(modelResource.size)
  let nextChunk = 0
  async function worker(): Promise<void> {
    while (nextChunk < modelResource.chunks.length) {
      const chunk = modelResource.chunks[nextChunk++]
      if (!chunk) continue
      const [start, end] = chunk.offsets
      if (end <= start || end > modelResource.size) throw new BusinessError("抠图模型分片范围无效。", 503)
      const bytes = new Uint8Array(await (await fetchChecked(new URL(chunk.name, baseUrl))).arrayBuffer())
      if (bytes.length !== end - start) throw new BusinessError("抠图模型分片大小不匹配。", 503)
      if (createHash("sha256").update(bytes).digest("hex") !== chunk.hash.toLowerCase()) throw new BusinessError("抠图模型分片校验失败。", 503)
      model.set(bytes, start)
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, modelResource.chunks.length) }, () => worker()))
  return model
}

async function createSession(): Promise<ort.InferenceSession> {
  const require = createRequire(import.meta.url)
  const ortDist = path.dirname(require.resolve("onnxruntime-web"))
  ort.env.wasm.numThreads = Math.max(1, Math.min(4, Number(process.env.IMAGE_CUTOUT_THREADS) || 1))
  ort.env.wasm.proxy = false
  ort.env.wasm.wasmPaths = {
    mjs: pathToFileURL(path.join(ortDist, "ort-wasm-simd-threaded.mjs")).href,
    wasm: pathToFileURL(path.join(ortDist, "ort-wasm-simd-threaded.wasm")).href,
  }
  try {
    return await ort.InferenceSession.create(await loadModel(), { executionProviders: ["wasm"], graphOptimizationLevel: "all" })
  } catch (error) {
    if (error instanceof BusinessError) throw error
    throw new BusinessError("抠图模型初始化失败，请检查模型资源和运行环境。", 503)
  }
}

function getSession(): Promise<ort.InferenceSession> {
  sessionPromise ??= createSession().catch((error: unknown) => { sessionPromise = undefined; throw error })
  return sessionPromise
}

function enqueueInference<T>(task: () => Promise<T>): Promise<T> {
  const result = inferenceQueue.then(task, task)
  inferenceQueue = result.then(() => undefined, () => undefined)
  return result
}

function matchesMimeType(buffer: Buffer, mimeType: ImageCutoutMimeType): boolean {
  if (mimeType === "image/png") return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  if (mimeType === "image/jpeg") return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
  return buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP"
}

function decodeInput(request: ExternalImageCutoutRequest): Buffer {
  const buffer = Buffer.from(request.base64Data, "base64")
  if (!buffer.length) throw new BusinessError("图片内容不能为空。")
  if (buffer.length > maxInputBytes) throw new BusinessError("单张图片不能超过 8MB。", 413)
  if (!matchesMimeType(buffer, request.mimeType)) throw new BusinessError("mimeType 与实际图片格式不一致。")
  return buffer
}

function tensorFromImageData(data: Uint8ClampedArray): Float32Array {
  const stride = modelResolution * modelResolution
  const tensor = new Float32Array(stride * 3)
  for (let source = 0, target = 0; source < data.length; source += 4, target += 1) {
    tensor[target] = (data[source]! - 128) / 256
    tensor[target + stride] = (data[source + 1]! - 128) / 256
    tensor[target + stride * 2] = (data[source + 2]! - 128) / 256
  }
  return tensor
}

function outputFilename(filename: string, format: "png" | "jpg"): string {
  const stem = filename.replace(/\.[^/.]+$/, "").trim() || "image"
  return `${stem}_cutout.${format}`
}

async function processImage(request: ExternalImageCutoutRequest, startedAt: number): Promise<ExternalImageCutoutResult> {
  const buffer = decodeInput(request)
  let image: Awaited<ReturnType<typeof loadImage>>
  try { image = await loadImage(buffer) } catch { throw new BusinessError("图片无法解码或文件已损坏。", 422) }
  const originalWidth = image.width
  const originalHeight = image.height
  if (!originalWidth || !originalHeight || originalWidth > maxDimension || originalHeight > maxDimension || originalWidth * originalHeight > maxPixels) {
    throw new BusinessError("图片尺寸不能超过 4096×4096，且总像素不能超过 1600 万。", 413)
  }

  const inferenceCanvas = createCanvas(modelResolution, modelResolution)
  const inferenceContext = inferenceCanvas.getContext("2d")
  inferenceContext.drawImage(image, 0, 0, modelResolution, modelResolution)
  const input = tensorFromImageData(inferenceContext.getImageData(0, 0, modelResolution, modelResolution).data)
  const session = await getSession()
  let output: ort.Tensor
  try {
    const results = await session.run({ input: new ort.Tensor("float32", input, [1, 3, modelResolution, modelResolution]) })
    const tensor = results.output
    if (!tensor) throw new Error("output missing")
    output = tensor
  } catch { throw new BusinessError("抠图模型推理失败。", 500) }
  if (!(output.data instanceof Float32Array) || output.data.length !== modelResolution * modelResolution) throw new BusinessError("抠图模型输出格式无效。", 500)

  const maskBytes = new Uint8ClampedArray(modelResolution * modelResolution * 4)
  for (let index = 0; index < output.data.length; index += 1) {
    const offset = index * 4
    maskBytes[offset] = 255; maskBytes[offset + 1] = 255; maskBytes[offset + 2] = 255
    maskBytes[offset + 3] = Math.round(Math.max(0, Math.min(1, output.data[index]!)) * 255)
  }
  const maskCanvas = createCanvas(modelResolution, modelResolution)
  maskCanvas.getContext("2d").putImageData(new ImageData(maskBytes, modelResolution, modelResolution), 0, 0)
  const resizedMaskCanvas = createCanvas(originalWidth, originalHeight)
  const resizedMaskContext = resizedMaskCanvas.getContext("2d")
  resizedMaskContext.drawImage(maskCanvas, 0, 0, originalWidth, originalHeight)
  const mask = resizedMaskContext.getImageData(0, 0, originalWidth, originalHeight).data

  const foregroundCanvas = createCanvas(originalWidth, originalHeight)
  const foregroundContext = foregroundCanvas.getContext("2d")
  foregroundContext.drawImage(image, 0, 0)
  const foreground = foregroundContext.getImageData(0, 0, originalWidth, originalHeight)
  for (let index = 3; index < foreground.data.length; index += 4) foreground.data[index] = Math.round(foreground.data[index]! * mask[index]! / 255)
  foregroundContext.clearRect(0, 0, originalWidth, originalHeight)
  foregroundContext.putImageData(foreground, 0, 0)

  const outputFormat = request.outputFormat || "png"
  const outputWidth = request.edge || originalWidth
  const outputHeight = request.edge || originalHeight
  const padding = request.padding ?? .08
  const resultCanvas = createCanvas(outputWidth, outputHeight)
  const resultContext = resultCanvas.getContext("2d")
  if (outputFormat === "jpg" || request.backgroundMode === "white" || request.backgroundMode === "color") {
    resultContext.fillStyle = request.backgroundMode === "color" ? request.backgroundColor || "#ffffff" : "#ffffff"
    resultContext.fillRect(0, 0, outputWidth, outputHeight)
  }
  const ratio = Math.min(outputWidth * (1 - padding * 2) / originalWidth, outputHeight * (1 - padding * 2) / originalHeight)
  const renderedWidth = originalWidth * ratio
  const renderedHeight = originalHeight * ratio
  resultContext.drawImage(foregroundCanvas, (outputWidth - renderedWidth) / 2, (outputHeight - renderedHeight) / 2, renderedWidth, renderedHeight)
  const mimeType = outputFormat === "jpg" ? "image/jpeg" : "image/png"
  const outputBuffer = outputFormat === "jpg" ? resultCanvas.toBuffer("image/jpeg", 94) : resultCanvas.toBuffer("image/png")
  return {
    originalFilename: request.filename, outputFilename: outputFilename(request.filename, outputFormat), mimeType,
    base64Data: outputBuffer.toString("base64"), originalWidth, originalHeight, outputWidth, outputHeight,
    engine: "isnet_quint8", processingMs: Math.max(1, Math.round(performance.now() - startedAt)),
    ...(request.clientRequestId ? { clientRequestId: request.clientRequestId } : {}),
  }
}

export function removeExternalImageBackground(request: ExternalImageCutoutRequest): Promise<ExternalImageCutoutResult> {
  const startedAt = performance.now()
  return enqueueInference(() => processImage(request, startedAt))
}

export async function removeExternalImageBackgroundsBatch(request: ExternalImageCutoutBatchRequest): Promise<ExternalImageCutoutBatchResult> {
  if (!request.items.length) throw new BusinessError("items 不能为空。")
  if (request.items.length > maxBatchSize) throw new BusinessError(`单次最多处理 ${maxBatchSize} 张图片。`)
  const items: ExternalImageCutoutBatchItemResult[] = []
  for (const [index, item] of request.items.entries()) {
    try {
      const data = await removeExternalImageBackground(item)
      items.push({ index, success: true, ...(item.clientRequestId ? { clientRequestId: item.clientRequestId } : {}), data })
    } catch (error) {
      const message = error instanceof BusinessError ? error.message : "抠图处理失败。"
      items.push({ index, success: false, filename: item.filename, ...(item.clientRequestId ? { clientRequestId: item.clientRequestId } : {}), error: message })
    }
  }
  const successCount = items.filter((item) => item.success).length
  return { totalCount: items.length, successCount, failedCount: items.length - successCount, items }
}

export const imageCutoutLimits = { maxInputBytes, maxDimension, maxPixels, maxBatchSize } as const
