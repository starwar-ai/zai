import { afterEach, describe, expect, it, vi } from "vitest"
import { recognizeBusinessCard } from "./business-card-ocr-provider.js"

const names = ["LLM_PROVIDER_ORDER", "OPENAI_API_KEY", "OPENAI_MODEL", "OPENAI_BASE_URL", "BUSINESS_CARD_OCR_PROVIDER", "BUSINESS_CARD_OCR_MODEL"] as const
const original = Object.fromEntries(names.map((name) => [name, process.env[name]]))

afterEach(() => { vi.unstubAllGlobals(); for (const name of names) { const value = original[name]; if (value === undefined) delete process.env[name]; else process.env[name] = value } })

describe("supplier business card OCR provider", () => {
  it("uses the dedicated model and normalizes visible fields", async () => {
    process.env.OPENAI_API_KEY = "test-key"; process.env.OPENAI_BASE_URL = "https://openai.example.test/v1"; process.env.BUSINESS_CARD_OCR_PROVIDER = "openai"; process.env.BUSINESS_CARD_OCR_MODEL = "card-vision"
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ output: [{ content: [{ type: "output_text", text: JSON.stringify({ companyName: " 示例供应商 ", contactName: "王明", jobTitle: "经理", phone: "13800000000", email: "sales@example.com", address: "宁波市", website: "example.com" }) }] }] }), { status: 200, headers: { "Content-Type": "application/json" } }))
    vi.stubGlobal("fetch", fetchMock)
    const result = await recognizeBusinessCard({ recognitionType: "BUSINESS_CARD", filename: "card.png", mimeType: "image/png", base64Data: "aW1hZ2U=" })
    expect(result.data).toEqual({ companyName: "示例供应商", contactName: "王明", jobTitle: "经理", phone: "13800000000", email: "sales@example.com", address: "宁波市", website: "example.com" })
    expect(fetchMock).toHaveBeenCalledWith("https://openai.example.test/v1/responses", expect.objectContaining({ method: "POST" }))
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({ model: "card-vision" })
  })

  it("requires provider and model to be configured together", async () => {
    process.env.BUSINESS_CARD_OCR_PROVIDER = "openai"; delete process.env.BUSINESS_CARD_OCR_MODEL
    await expect(recognizeBusinessCard({ recognitionType: "BUSINESS_CARD", filename: "card.png", mimeType: "image/png", base64Data: "aW1hZ2U=" })).rejects.toThrow("必须同时配置或同时留空")
  })
})
