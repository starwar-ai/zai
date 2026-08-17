import { afterEach, describe, expect, it, vi } from "vitest"
import { recognizePaymentScreenshot } from "./payment-ocr-provider.js"

const environmentNames = ["LLM_PROVIDER_ORDER", "OPENAI_API_KEY", "OPENAI_MODEL", "OPENAI_BASE_URL", "ARK_API_KEY", "ARK_MODEL", "ARK_BASE_URL", "PAYMENT_OCR_PROVIDER", "PAYMENT_OCR_MODEL"] as const
const original = Object.fromEntries(environmentNames.map((name) => [name, process.env[name]])) as Record<(typeof environmentNames)[number], string | undefined>
afterEach(() => { for (const name of environmentNames) { const value = original[name]; if (value === undefined) delete process.env[name]; else process.env[name] = value }; vi.unstubAllGlobals() })

describe("payment screenshot OCR provider", () => {
  it("sends the uploaded image as a data URL and returns structured payment fields", async () => {
    process.env.OPENAI_API_KEY = "test-key"; process.env.PAYMENT_OCR_PROVIDER = "openai"; process.env.PAYMENT_OCR_MODEL = "payment-model"
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => new Response(JSON.stringify({
      output: [{ content: [{ type: "output_text", text: JSON.stringify({ platform: "支付宝", orderNo: "202608160001", productName: "测试商品", amount: "¥128.00", paymentTime: "2026-08-16 12:30:00", paymentStatus: "支付成功", paymentMethod: "余额", receiver: null }) }] }],
    }), { status: 200, headers: { "content-type": "application/json" } }))
    vi.stubGlobal("fetch", fetchMock)

    const result = await recognizePaymentScreenshot({ recognitionType: "PAYMENT", filename: "payment.png", mimeType: "image/png", base64Data: "aW1hZ2U=" })

    expect(result).toEqual({ data: { platform: "支付宝", orderNo: "202608160001", productName: "测试商品", amount: "¥128.00", paymentTime: "2026-08-16 12:30:00", paymentStatus: "支付成功", paymentMethod: "余额" }, raw: { platform: "支付宝", orderNo: "202608160001", productName: "测试商品", amount: "¥128.00", paymentTime: "2026-08-16 12:30:00", paymentStatus: "支付成功", paymentMethod: "余额", receiver: null, provider: "openai" }, model: "payment-model" })
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as { input: Array<{ content: Array<{ type: string; image_url?: string }> }> }
    expect(requestBody.input[1]?.content[1]).toMatchObject({ type: "input_image", image_url: "data:image/png;base64,aW1hZ2U=" })
  })

  it("reports the model response when recognition fails", async () => {
    process.env.OPENAI_API_KEY = "test-key"; process.env.PAYMENT_OCR_PROVIDER = "openai"; process.env.PAYMENT_OCR_MODEL = "payment-model"
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: "账户配额不足", type: "insufficient_quota", code: "quota_exceeded" } }), { status: 429, statusText: "Too Many Requests", headers: { "x-request-id": "req-pay-456" } })))

    await expect(recognizePaymentScreenshot({ recognitionType: "PAYMENT", filename: "payment.png", mimeType: "image/png", base64Data: "aW1hZ2U=" })).rejects.toThrow("openai 支付截图识别失败（模型：payment-model，HTTP 429 Too Many Requests）：账户配额不足；类型：insufficient_quota；代码：quota_exceeded；请求 ID：req-pay-456")
  })

  it("falls back to the first configured shared visual provider", async () => {
    process.env.LLM_PROVIDER_ORDER = "minimax,ark,openai"; process.env.ARK_API_KEY = "ark-key"; process.env.ARK_MODEL = "shared-vision-model"; process.env.ARK_BASE_URL = "https://ark.example.test/api/v3/"; delete process.env.PAYMENT_OCR_PROVIDER; delete process.env.PAYMENT_OCR_MODEL; delete process.env.OPENAI_API_KEY
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({ choices: [{ message: { content: `\`\`\`json\n${JSON.stringify({ platform: "微信支付", orderNo: null, productName: null, amount: "20.00", paymentTime: null, paymentStatus: "支付成功", paymentMethod: "零钱", receiver: "测试商户" })}\n\`\`\`` } }] }), { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    const result = await recognizePaymentScreenshot({ recognitionType: "PAYMENT", filename: "payment.jpg", mimeType: "image/jpeg", base64Data: "aW1hZ2U=" })

    expect(result.model).toBe("shared-vision-model")
    expect(result.raw.provider).toBe("ark")
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://ark.example.test/api/v3/chat/completions")
    const init = fetchMock.mock.calls[0]?.[1]
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer ark-key")
    const body = JSON.parse(String(init?.body)) as { model: string; messages: Array<{ content: unknown }> }
    expect(body.model).toBe("shared-vision-model")
    expect(body.messages[1]?.content).toEqual(expect.arrayContaining([expect.objectContaining({ type: "image_url", image_url: { url: "data:image/jpeg;base64,aW1hZ2U=" } })]))
  })

  it("requires the dedicated provider and model to be configured together", async () => {
    process.env.PAYMENT_OCR_PROVIDER = "ark"; delete process.env.PAYMENT_OCR_MODEL
    await expect(recognizePaymentScreenshot({ recognitionType: "PAYMENT", filename: "payment.png", mimeType: "image/png", base64Data: "aW1hZ2U=" })).rejects.toThrow("PAYMENT_OCR_PROVIDER 和 PAYMENT_OCR_MODEL 必须同时配置或同时留空")
    delete process.env.PAYMENT_OCR_PROVIDER; process.env.PAYMENT_OCR_MODEL = "payment-model"
    await expect(recognizePaymentScreenshot({ recognitionType: "PAYMENT", filename: "payment.png", mimeType: "image/png", base64Data: "aW1hZ2U=" })).rejects.toThrow("PAYMENT_OCR_PROVIDER 和 PAYMENT_OCR_MODEL 必须同时配置或同时留空")
  })
})
