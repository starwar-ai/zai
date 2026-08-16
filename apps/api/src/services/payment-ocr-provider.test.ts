import { afterEach, describe, expect, it, vi } from "vitest"
import { recognizePaymentScreenshot } from "./payment-ocr-provider.js"

const environmentNames = ["OPENAI_API_KEY", "OPENAI_MODEL", "OPENAI_BASE_URL", "PAYMENT_OCR_MODEL"] as const
const original = Object.fromEntries(environmentNames.map((name) => [name, process.env[name]])) as Record<(typeof environmentNames)[number], string | undefined>
afterEach(() => { for (const name of environmentNames) { const value = original[name]; if (value === undefined) delete process.env[name]; else process.env[name] = value }; vi.unstubAllGlobals() })

describe("payment screenshot OCR provider", () => {
  it("sends the uploaded image as a data URL and returns structured payment fields", async () => {
    process.env.OPENAI_API_KEY = "test-key"; process.env.PAYMENT_OCR_MODEL = "payment-model"
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => new Response(JSON.stringify({
      output: [{ content: [{ type: "output_text", text: JSON.stringify({ platform: "支付宝", orderNo: "202608160001", productName: "测试商品", amount: "¥128.00", paymentTime: "2026-08-16 12:30:00", paymentStatus: "支付成功", paymentMethod: "余额", receiver: null }) }] }],
    }), { status: 200, headers: { "content-type": "application/json" } }))
    vi.stubGlobal("fetch", fetchMock)

    const result = await recognizePaymentScreenshot({ recognitionType: "PAYMENT", filename: "payment.png", mimeType: "image/png", base64Data: "aW1hZ2U=" })

    expect(result).toEqual({ data: { platform: "支付宝", orderNo: "202608160001", productName: "测试商品", amount: "¥128.00", paymentTime: "2026-08-16 12:30:00", paymentStatus: "支付成功", paymentMethod: "余额" }, raw: { platform: "支付宝", orderNo: "202608160001", productName: "测试商品", amount: "¥128.00", paymentTime: "2026-08-16 12:30:00", paymentStatus: "支付成功", paymentMethod: "余额", receiver: null }, model: "payment-model" })
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as { input: Array<{ content: Array<{ type: string; image_url?: string }> }> }
    expect(requestBody.input[1]?.content[1]).toMatchObject({ type: "input_image", image_url: "data:image/png;base64,aW1hZ2U=" })
  })

  it("reports the model response when recognition fails", async () => {
    process.env.OPENAI_API_KEY = "test-key"; process.env.PAYMENT_OCR_MODEL = "payment-model"
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: "账户配额不足", type: "insufficient_quota", code: "quota_exceeded" } }), { status: 429, statusText: "Too Many Requests", headers: { "x-request-id": "req-pay-456" } })))

    await expect(recognizePaymentScreenshot({ recognitionType: "PAYMENT", filename: "payment.png", mimeType: "image/png", base64Data: "aW1hZ2U=" })).rejects.toThrow("OpenAI 支付截图识别失败（模型：payment-model，HTTP 429 Too Many Requests）：账户配额不足；类型：insufficient_quota；代码：quota_exceeded；请求 ID：req-pay-456")
  })
})
