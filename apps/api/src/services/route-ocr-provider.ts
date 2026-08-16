import type { OcrRecognizeRequest, OcrRouteData } from "@zform/shared"
import { z } from "zod"
import { llmHttpError, llmNetworkError } from "./llm-error-detail.js"

const routeSchema = z.object({
  status: z.enum(["success", "uncertain", "not_found"]),
  distanceKm: z.number().nonnegative().nullable(),
  tollYuan: z.number().nonnegative().nullable(),
  destination: z.string().max(240).nullable(),
  waypoints: z.array(z.string().max(240)).max(20),
  confidence: z.number().min(0).max(1),
  selectedRouteEvidence: z.string().max(1000),
}).strict()

const outputSchema = {
  type: "object", additionalProperties: false,
  required: ["status", "distanceKm", "tollYuan", "destination", "waypoints", "confidence", "selectedRouteEvidence"],
  properties: {
    status: { type: "string", enum: ["success", "uncertain", "not_found"] },
    distanceKm: { anyOf: [{ type: "number", minimum: 0 }, { type: "null" }] },
    tollYuan: { anyOf: [{ type: "number", minimum: 0 }, { type: "null" }] },
    destination: { anyOf: [{ type: "string", maxLength: 240 }, { type: "null" }] },
    waypoints: { type: "array", items: { type: "string", maxLength: 240 }, maxItems: 20 },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    selectedRouteEvidence: { type: "string", maxLength: 1000 },
  },
} as const

function record(value: unknown): Record<string, unknown> | undefined { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined }
function outputText(value: unknown): string { const root = record(value); const output = Array.isArray(root?.output) ? root.output : []; for (const item of output) { const content = Array.isArray(record(item)?.content) ? record(item)?.content as unknown[] : []; for (const part of content) { const block = record(part); if (block?.type === "output_text" && typeof block.text === "string") return block.text } } throw new Error("OpenAI 未返回可解析的导航路线结果") }

export async function recognizeNavigationRoute(input: OcrRecognizeRequest): Promise<{ data: OcrRouteData; raw: Record<string, unknown>; model: string }> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error("尚未配置 OPENAI_API_KEY，无法执行导航截图识别")
  const model = process.env.ROUTE_OCR_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-mini"
  const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "")
  const configuredTimeout = Number(process.env.LLM_TIMEOUT_MS); const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout > 0 ? configuredTimeout : 60_000
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    let response: Response
    try {
      response = await fetch(`${baseUrl}/responses`, { method: "POST", signal: controller.signal, headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({
        model,
        input: [
          { role: "system", content: [{ type: "input_text", text: "你是导航截图的精确数据提取器。只分析画面中被蓝色外框、高亮底色或明确选中状态标示的单一路线方案。读取该方案内的距离与通行费；距离统一换算为公里，通行费统一为人民币元。若显示免费，tollYuan 返回 0。从路线输入区或途经点清单提取目的地及按行程顺序排列的途经地。只保留清楚可见的地名，不得猜测，不要读取未选中的替代方案。无法可靠判断时将对应数值设为 null，并返回 uncertain 或 not_found。" }] },
          { role: "user", content: [{ type: "input_text", text: "识别当前选中的导航路线，返回目的地、途经地、公里数、通行费、置信度及判断选中路线的画面依据。" }, { type: "input_image", image_url: `data:${input.mimeType};base64,${input.base64Data}`, detail: "high" }] },
        ],
        text: { format: { type: "json_schema", name: "selected_navigation_route", strict: true, schema: outputSchema } },
      }) })
    } catch (reason) { throw llmNetworkError(reason, { provider: "OpenAI", model, operation: "导航截图识别" }, controller.signal.aborted) }
    if (!response.ok) throw await llmHttpError(response, { provider: "OpenAI", model, operation: "导航截图识别" })
    const parsed = routeSchema.parse(JSON.parse(outputText(await response.json())) as unknown)
    const data: OcrRouteData = { routeResultStatus: parsed.status, waypoints: parsed.waypoints, confidence: parsed.confidence, selectedRouteEvidence: parsed.selectedRouteEvidence, ...(parsed.distanceKm !== null ? { distanceKm: parsed.distanceKm } : {}), ...(parsed.tollYuan !== null ? { tollYuan: parsed.tollYuan } : {}), ...(parsed.destination ? { destination: parsed.destination } : {}) }
    return { data, raw: parsed as Record<string, unknown>, model }
  } finally { clearTimeout(timeout) }
}
