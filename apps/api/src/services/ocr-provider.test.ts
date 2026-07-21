import { afterEach, describe, expect, it, vi } from "vitest"
import { recognizePaymentScreenshot } from "./ocr-provider.js"

const original = {
  key: process.env.OPENAI_API_KEY,
  model: process.env.OCR_MODEL,
  sharedModel: process.env.OPENAI_MODEL,
  baseUrl: process.env.OPENAI_BASE_URL,
}

afterEach(() => {
  const restore = (name: string, value: string | undefined) => {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
  restore("OPENAI_API_KEY", original.key)
  restore("OCR_MODEL", original.model)
  restore("OPENAI_MODEL", original.sharedModel)
  restore("OPENAI_BASE_URL", original.baseUrl)
  vi.unstubAllGlobals()
})

describe("payment screenshot OCR provider", () => {
  it("uses the shared OpenAI Responses configuration and removes empty fields", async () => {
    process.env.OPENAI_API_KEY = "test-key"
    process.env.OCR_MODEL = "ocr-model"
    process.env.OPENAI_BASE_URL = "https://llm.example.test/v1/"
    const output = {
      platform: "微信支付", orderNo: "420001", productName: null, amount: "¥88.00",
      paymentTime: "2026-07-21 10:30", paymentStatus: "支付成功", paymentMethod: null, receiver: "示例商户",
    }
    const fetchMock = vi.fn(async (_url: string, _request: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => ({ output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(output) }] }] }),
    }))
    vi.stubGlobal("fetch", fetchMock)

    const result = await recognizePaymentScreenshot({ mimeType: "image/png", base64Data: "aW1hZ2U=" })

    expect(result).toMatchObject({ model: "ocr-model", data: { platform: "微信支付", orderNo: "420001", amount: "¥88.00", receiver: "示例商户" } })
    expect(result.data).not.toHaveProperty("productName")
    const [url, request] = fetchMock.mock.calls[0]!
    expect(url).toBe("https://llm.example.test/v1/responses")
    const body = JSON.parse(String(request?.body)) as { model: string; input: Array<{ content: Array<{ type: string; image_url?: string }> }> }
    expect(body.model).toBe("ocr-model")
    expect(body.input[1]?.content[1]?.image_url).toBe("data:image/png;base64,aW1hZ2U=")
  })

  it("requires an API key", async () => {
    delete process.env.OPENAI_API_KEY
    await expect(recognizePaymentScreenshot({ mimeType: "image/png", base64Data: "aW1hZ2U=" })).rejects.toThrow("OPENAI_API_KEY")
  })
})
