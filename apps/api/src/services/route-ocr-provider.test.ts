import { afterEach, describe, expect, it, vi } from "vitest"
import { recognizeNavigationRoute } from "./route-ocr-provider.js"

const environmentNames = ["OPENAI_API_KEY", "OPENAI_MODEL", "OPENAI_BASE_URL", "ROUTE_OCR_MODEL"] as const
const original = Object.fromEntries(environmentNames.map((name) => [name, process.env[name]])) as Record<(typeof environmentNames)[number], string | undefined>
afterEach(() => { for (const name of environmentNames) { const value = original[name]; if (value === undefined) delete process.env[name]; else process.env[name] = value }; vi.unstubAllGlobals() })

describe("navigation route OCR provider", () => {
  it("parses the selected route and ordered waypoints", async () => {
    process.env.OPENAI_API_KEY = "test-key"; process.env.ROUTE_OCR_MODEL = "route-model"
    const result = { status: "success", distanceKm: 95.2, tollYuan: 36, destination: "苏州中心", waypoints: ["阳澄湖服务区", "苏州工业园区"], confidence: 0.93, selectedRouteEvidence: "路线卡片有蓝色外框" }
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ output: [{ content: [{ type: "output_text", text: JSON.stringify(result) }] }] }), { status: 200 })))

    await expect(recognizeNavigationRoute({ recognitionType: "NAVIGATION_ROUTE", filename: "route.png", mimeType: "image/png", base64Data: "aW1hZ2U=" })).resolves.toEqual({ data: { routeResultStatus: "success", distanceKm: 95.2, tollYuan: 36, destination: "苏州中心", waypoints: ["阳澄湖服务区", "苏州工业园区"], confidence: 0.93, selectedRouteEvidence: "路线卡片有蓝色外框" }, raw: result, model: "route-model" })
  })

  it("reports the model response when recognition fails", async () => {
    process.env.OPENAI_API_KEY = "test-key"; process.env.ROUTE_OCR_MODEL = "route-model"
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: "账户配额不足", type: "insufficient_quota", code: "quota_exceeded" } }), { status: 429, statusText: "Too Many Requests", headers: { "x-request-id": "req-route-123" } })))

    await expect(recognizeNavigationRoute({ recognitionType: "NAVIGATION_ROUTE", filename: "route.png", mimeType: "image/png", base64Data: "aW1hZ2U=" })).rejects.toThrow("OpenAI 导航截图识别失败（模型：route-model，HTTP 429 Too Many Requests）：账户配额不足；类型：insufficient_quota；代码：quota_exceeded；请求 ID：req-route-123")
  })
})
