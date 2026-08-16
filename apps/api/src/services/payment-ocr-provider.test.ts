import { afterEach, describe, expect, it, vi } from "vitest"
import { recognizePaymentScreenshot } from "./payment-ocr-provider.js"

const environmentNames = ["OPENAI_API_KEY", "OPENAI_MODEL", "OPENAI_BASE_URL", "PAYMENT_OCR_MODEL"] as const
const original = Object.fromEntries(environmentNames.map((name) => [name, process.env[name]])) as Record<(typeof environmentNames)[number], string | undefined>
afterEach(() => { for (const name of environmentNames) { const value = original[name]; if (value === undefined) delete process.env[name]; else process.env[name] = value }; vi.unstubAllGlobals() })

describe("payment screenshot OCR provider", () => {
  it("reports the model response when recognition fails", async () => {
    process.env.OPENAI_API_KEY = "test-key"; process.env.PAYMENT_OCR_MODEL = "payment-model"
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: "账户配额不足", type: "insufficient_quota", code: "quota_exceeded" } }), { status: 429, statusText: "Too Many Requests", headers: { "x-request-id": "req-pay-456" } })))

    await expect(recognizePaymentScreenshot({ recognitionType: "PAYMENT", filename: "payment.png", mimeType: "image/png", base64Data: "aW1hZ2U=" })).rejects.toThrow("OpenAI 支付截图识别失败（模型：payment-model，HTTP 429 Too Many Requests）：账户配额不足；类型：insufficient_quota；代码：quota_exceeded；请求 ID：req-pay-456")
  })
})
