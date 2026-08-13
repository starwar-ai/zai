import { createCanvas } from "@napi-rs/canvas"
import jsQrModule from "jsqr"
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs"
import { parseInvoiceQr, type InvoiceQrResult } from "./invoice-qr-service.js"

type JsQrDecoder = typeof import("jsqr").default
const jsQR = (typeof jsQrModule === "function" ? jsQrModule : (jsQrModule as unknown as { default: JsQrDecoder }).default) as JsQrDecoder

function decode(data: Uint8ClampedArray, width: number, height: number): InvoiceQrResult | null {
  const result = jsQR(data, width, height, { inversionAttempts: "attemptBoth" })
  return result ? parseInvoiceQr(result.data) : null
}

export async function renderAndDecodeInvoiceQr(pdfData: Uint8Array, includePageImage = false): Promise<{ qr: InvoiceQrResult | null; pageImageBase64?: string }> {
  const loadingTask = getDocument({ data: pdfData, disableFontFace: true, useSystemFonts: false, isEvalSupported: false, maxImageSize: 12_000_000, stopAtErrors: false })
  try {
    const document = await loadingTask.promise
    if (document.numPages < 1 || document.numPages > 100) return { qr: null }
    const page = await document.getPage(1); const viewport = page.getViewport({ scale: 2 })
    if (viewport.width * viewport.height > 12_000_000) return { qr: null }
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height)); const context = canvas.getContext("2d")
    await page.render({ canvas: canvas as unknown as HTMLCanvasElement, viewport }).promise
    const image = context.getImageData(0, 0, canvas.width, canvas.height)
    const full = decode(image.data, image.width, image.height)
    if (full) return { qr: full, ...(includePageImage ? { pageImageBase64: canvas.toBuffer("image/png").toString("base64") } : {}) }
    const cropWidth = Math.ceil(image.width * 0.55); const cropHeight = Math.ceil(image.height * 0.55)
    for (const [x, y] of [[0, 0], [image.width - cropWidth, 0], [0, image.height - cropHeight], [image.width - cropWidth, image.height - cropHeight]]) {
      const crop = context.getImageData(x, y, cropWidth, cropHeight); const result = decode(crop.data, crop.width, crop.height)
      if (result) return { qr: result, ...(includePageImage ? { pageImageBase64: canvas.toBuffer("image/png").toString("base64") } : {}) }
    }
    return { qr: null, ...(includePageImage ? { pageImageBase64: canvas.toBuffer("image/png").toString("base64") } : {}) }
  } finally { await loadingTask.destroy() }
}
