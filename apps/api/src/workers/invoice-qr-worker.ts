import { renderAndDecodeInvoiceQr } from "../services/invoice-qr-renderer.js"

process.once("message", (message: unknown) => {
  const input = message && typeof message === "object" ? message as { pdfBase64?: unknown; includePageImage?: unknown } : undefined
  if (typeof input?.pdfBase64 !== "string") { process.send?.({ qr: null }); return }
  renderAndDecodeInvoiceQr(new Uint8Array(Buffer.from(input.pdfBase64, "base64")), input.includePageImage === true)
    .then((result) => process.send?.(result))
    .catch(() => process.send?.(null))
    .finally(() => setImmediate(() => process.exit(0)))
})
