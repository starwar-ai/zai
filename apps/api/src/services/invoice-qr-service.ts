import { fork } from "node:child_process"
import { fileURLToPath } from "node:url"
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs"
import type { OcrInvoiceData } from "@zform/shared"

function pdfJsAssetUrl(path: string): string {
  return fileURLToPath(new URL(path, import.meta.url)).replaceAll("\\", "/")
}

const pdfJsCMapUrl = pdfJsAssetUrl("../../node_modules/pdfjs-dist/cmaps/")
const pdfJsStandardFontDataUrl = pdfJsAssetUrl("../../node_modules/pdfjs-dist/standard_fonts/")

export interface InvoiceQrResult {
  rawText: string
  invoiceCode?: string
  invoiceNumber: string
  subtotal: string
  invoiceDate: string
  checkCode?: string
}

export interface InvoicePdfExtraction { text: string | null; qr: InvoiceQrResult | null; pageImageBase64?: string }
interface InvoiceQrWorkerResult { qr: InvoiceQrResult | null; pageImageBase64?: string }

function digits(value: string): boolean { return /^\d+$/.test(value) }
function validDate(value: string): boolean {
  if (!/^\d{8}$/.test(value)) return false
  const year = Number(value.slice(0, 4)); const month = Number(value.slice(4, 6)); const day = Number(value.slice(6, 8))
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

/** 解析国家税务发票二维码的逗号分隔核心字段。 */
export function parseInvoiceQr(rawText: string): InvoiceQrResult | null {
  const parts = rawText.replace(/^\uFEFF/, "").split(",").map((value) => value.trim())
  if (parts.length < 7 || parts[0] !== "01") return null
  const invoiceCode = parts[2] || ""; const invoiceNumber = parts[3] || ""; const subtotal = parts[4] || ""; const invoiceDate = parts[5] || ""; const checkCode = parts[6] || ""
  if ((invoiceCode && (!digits(invoiceCode) || invoiceCode.length > 20)) || !digits(invoiceNumber) || invoiceNumber.length < 8 || invoiceNumber.length > 20) return null
  if (!/^\d+(?:\.\d{1,2})?$/.test(subtotal) || !validDate(invoiceDate)) return null
  if (checkCode && (!digits(checkCode) || checkCode.length > 30)) return null
  return { rawText, ...(invoiceCode ? { invoiceCode } : {}), invoiceNumber, subtotal, invoiceDate: `${invoiceDate.slice(0, 4)}-${invoiceDate.slice(4, 6)}-${invoiceDate.slice(6, 8)}`, ...(checkCode ? { checkCode } : {}) }
}

function textItem(value: unknown): value is { str: string; hasEOL?: boolean } {
  return Boolean(value && typeof value === "object" && "str" in value && typeof (value as { str?: unknown }).str === "string")
}

/** 提取原生 PDF 的文本层；扫描件通常返回 null，由调用方回退到视觉识别。 */
export async function extractInvoiceTextFromPdf(pdfData: Uint8Array): Promise<string | null> {
  const loadingTask = getDocument({
    data: pdfData,
    cMapUrl: pdfJsCMapUrl,
    cMapPacked: true,
    standardFontDataUrl: pdfJsStandardFontDataUrl,
    disableFontFace: true,
    useSystemFonts: false,
    isEvalSupported: false,
    stopAtErrors: false,
  })
  try {
    const document = await loadingTask.promise
    if (document.numPages < 1 || document.numPages > 100) throw new Error("PDF 页数无效或超过 100 页")
    const pages: string[] = []
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber)
      const content = await page.getTextContent()
      const pageText = content.items.flatMap((item) => textItem(item) ? [`${item.str}${item.hasEOL ? "\n" : " "}`] : []).join("").replace(/[ \t]+\n/g, "\n").replace(/[ \t]{2,}/g, " ").trim()
      if (pageText) pages.push(`--- 第 ${pageNumber} 页 ---\n${pageText}`)
    }
    const text = pages.join("\n").trim()
    return text.replace(/\s/g, "").length >= 50 ? text.slice(0, 100_000) : null
  } finally { await loadingTask.destroy() }
}

/** 文本提取留在 API 进程；二维码原生渲染在隔离进程中执行。 */
export async function extractInvoicePdf(pdfData: Uint8Array, includePageImage = false): Promise<InvoicePdfExtraction> {
  const text = await extractInvoiceTextFromPdf(pdfData)
  const rendered = await extractInvoiceQrIsolated(pdfData, includePageImage && !text)
  return { text, qr: rendered.qr, ...(rendered.pageImageBase64 ? { pageImageBase64: rendered.pageImageBase64 } : {}) }
}

function isWorkerResult(value: unknown): value is InvoiceQrWorkerResult {
  if (!value || typeof value !== "object" || !("qr" in value)) return false
  const result = value as { qr?: unknown; pageImageBase64?: unknown }
  const validQr = result.qr === null || Boolean(result.qr && typeof result.qr === "object" && "rawText" in result.qr && "invoiceNumber" in result.qr)
  return validQr && (result.pageImageBase64 === undefined || typeof result.pageImageBase64 === "string")
}

export async function extractInvoiceQrIsolated(pdfData: Uint8Array, includePageImage = false): Promise<InvoiceQrWorkerResult> {
  return new Promise((resolve) => {
    const workerUrl = new URL("../workers/invoice-qr-worker.js", import.meta.url)
    const child = fork(workerUrl, [], { execArgv: process.execArgv, stdio: ["ignore", "ignore", "ignore", "ipc"] })
    let settled = false
    const finish = (result: InvoiceQrWorkerResult): void => { if (settled) return; settled = true; clearTimeout(timer); resolve(result); if (child.connected) child.disconnect(); child.kill() }
    const timer = setTimeout(() => finish({ qr: null }), 15_000)
    child.once("message", (message: unknown) => finish(isWorkerResult(message) ? message : { qr: null }))
    child.once("error", () => finish({ qr: null }))
    child.once("exit", () => finish({ qr: null }))
    child.send({ pdfBase64: Buffer.from(pdfData).toString("base64"), includePageImage }, (error) => { if (error) finish({ qr: null }) })
  })
}

export function qrInvoiceData(result: InvoiceQrResult): OcrInvoiceData {
  return { invoiceNumber: result.invoiceNumber, invoiceDate: result.invoiceDate, subtotal: result.subtotal, items: [] }
}
