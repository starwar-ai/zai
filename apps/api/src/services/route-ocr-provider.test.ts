import { afterEach, describe, expect, it, vi } from "vitest"
import { recognizeNavigationRoute } from "./route-ocr-provider.js"

const environmentNames = ["OPENAI_API_KEY", "OPENAI_MODEL", "OPENAI_BASE_URL", "ARK_API_KEY", "ARK_MODEL", "ARK_BASE_URL", "LLM_PROVIDER_ORDER", "ROUTE_OCR_PROVIDER", "ROUTE_OCR_MODEL"] as const
const original = Object.fromEntries(environmentNames.map((name) => [name, process.env[name]])) as Record<(typeof environmentNames)[number], string | undefined>
afterEach(() => { for (const name of environmentNames) { const value = original[name]; if (value === undefined) delete process.env[name]; else process.env[name] = value }; vi.unstubAllGlobals() })

describe("navigation route OCR provider", () => {
  it("parses the selected route and ordered waypoints", async () => {
    process.env.OPENAI_API_KEY = "test-key"; process.env.ROUTE_OCR_PROVIDER = "openai"; process.env.ROUTE_OCR_MODEL = "route-model"
    const result = { status: "success", distanceKm: 95.2, tollYuan: 36, destination: "苏州中心", waypoints: ["阳澄湖服务区", "苏州工业园区"], confidence: 0.93, selectedRouteEvidence: "路线卡片有蓝色外框" }
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ output: [{ content: [{ type: "output_text", text: JSON.stringify(result) }] }] }), { status: 200 })))

    await expect(recognizeNavigationRoute({ recognitionType: "NAVIGATION_ROUTE", filename: "route.png", mimeType: "image/png", base64Data: "aW1hZ2U=" })).resolves.toEqual({ data: { routeResultStatus: "success", distanceKm: 95.2, tollYuan: 36, destination: "苏州中心", waypoints: ["阳澄湖服务区", "苏州工业园区"], confidence: 0.93, selectedRouteEvidence: "路线卡片有蓝色外框" }, raw: { ...result, provider: "openai" }, model: "route-model" })
  })

  it("reports the model response when recognition fails", async () => {
    process.env.OPENAI_API_KEY = "test-key"; process.env.ROUTE_OCR_PROVIDER = "openai"; process.env.ROUTE_OCR_MODEL = "route-model"
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: "账户配额不足", type: "insufficient_quota", code: "quota_exceeded" } }), { status: 429, statusText: "Too Many Requests", headers: { "x-request-id": "req-route-123" } })))

    await expect(recognizeNavigationRoute({ recognitionType: "NAVIGATION_ROUTE", filename: "route.png", mimeType: "image/png", base64Data: "aW1hZ2U=" })).rejects.toThrow("openai 导航截图识别失败（模型：route-model，HTTP 429 Too Many Requests）：账户配额不足；类型：insufficient_quota；代码：quota_exceeded；请求 ID：req-route-123")
  })

  it("falls back to the first compatible shared provider when module config is empty", async () => {
    process.env.LLM_PROVIDER_ORDER = "ark,openai"; process.env.ARK_API_KEY = "ark-key"; process.env.ARK_MODEL = "doubao-vision"; process.env.ARK_BASE_URL = "https://ark.example.test/api/v3"; delete process.env.OPENAI_API_KEY
    const result = { status: "uncertain", distanceKm: 95, tollYuan: null, destination: "苏州中心", waypoints: [], confidence: 0.68, selectedRouteEvidence: "路线卡片高亮但费用文字模糊" }
    const fetchMock = vi.fn(async (_url: string, _request: RequestInit) => new Response(JSON.stringify({ choices: [{ message: { content: `\`\`\`json\n${JSON.stringify(result)}\n\`\`\`` } }] }), { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    const recognized = await recognizeNavigationRoute({ recognitionType: "NAVIGATION_ROUTE", filename: "route.png", mimeType: "image/png", base64Data: "aW1hZ2U=" })
    expect(recognized).toMatchObject({ model: "doubao-vision", raw: { provider: "ark" }, data: { routeResultStatus: "uncertain", destination: "苏州中心", confidence: 0.68 } })
    const [url, request] = fetchMock.mock.calls[0]!
    expect(url).toBe("https://ark.example.test/api/v3/chat/completions")
    const body = JSON.parse(String(request.body)) as { response_format: { type: string }; messages: Array<{ content: unknown }> }
    expect(body.response_format.type).toBe("json_schema")
    expect(body.messages[1]?.content).toEqual(expect.arrayContaining([expect.objectContaining({ type: "image_url", image_url: { url: "data:image/png;base64,aW1hZ2U=" } })]))
  })

  it("requires the module provider and model to be configured together", async () => {
    process.env.ROUTE_OCR_PROVIDER = "ark"; delete process.env.ROUTE_OCR_MODEL
    await expect(recognizeNavigationRoute({ recognitionType: "NAVIGATION_ROUTE", filename: "route.png", mimeType: "image/png", base64Data: "aW1hZ2U=" })).rejects.toThrow("必须同时配置或同时留空")
    delete process.env.ROUTE_OCR_PROVIDER; process.env.ROUTE_OCR_MODEL = "route-model"
    await expect(recognizeNavigationRoute({ recognitionType: "NAVIGATION_ROUTE", filename: "route.png", mimeType: "image/png", base64Data: "aW1hZ2U=" })).rejects.toThrow("必须同时配置或同时留空")
  })
})
