import type { OcrRecognizeRequest, OcrRouteData } from "@zform/shared"
import { z } from "zod"
import { configuredLlmProviders, llmProviderConfig, type LlmProviderConfig } from "./llm-provider-config.js"
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
function responsesOutputText(value: unknown): string { const root = record(value); const output = Array.isArray(root?.output) ? root.output : []; for (const item of output) { const content = Array.isArray(record(item)?.content) ? record(item)?.content as unknown[] : []; for (const part of content) { const block = record(part); if (block?.type === "output_text" && typeof block.text === "string") return block.text } } throw new Error("模型未返回可解析的导航路线结果") }
function chatOutputText(value: unknown): string { const root = record(value); const choice = Array.isArray(root?.choices) ? record(root.choices[0]) : undefined; const content = record(choice?.message)?.content; if (typeof content === "string") return content; if (Array.isArray(content)) return content.map(record).filter((item) => item?.type === "text" && typeof item.text === "string").map((item) => String(item?.text)).join(""); throw new Error("模型未返回可解析的导航路线结果") }
function extractJson(output: string): unknown { const fenced = output.trim().match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim() || output.trim(); const start = fenced.indexOf("{"); const end = fenced.lastIndexOf("}"); if (start < 0 || end <= start) throw new Error("模型未返回有效的导航路线 JSON"); return JSON.parse(fenced.slice(start, end + 1)) as unknown }

function routeProvider(): LlmProviderConfig {
  const configuredProvider = process.env.ROUTE_OCR_PROVIDER?.trim().toLowerCase()
  const moduleModel = process.env.ROUTE_OCR_MODEL?.trim()
  if (Boolean(configuredProvider) !== Boolean(moduleModel)) throw new Error("ROUTE_OCR_PROVIDER 和 ROUTE_OCR_MODEL 必须同时配置或同时留空")
  const moduleProvider = configuredProvider ? llmProviderConfig(configuredProvider) : undefined
  if (configuredProvider && !moduleProvider) throw new Error(`ROUTE_OCR_PROVIDER=${configuredProvider} 不是受支持的模型供应商`)
  if (moduleProvider && !moduleProvider.apiKey) throw new Error(`导航截图指定供应商 ${moduleProvider.provider} 未配置 API Key`)
  if (moduleProvider?.mode === "anthropic-json-prompt") throw new Error(`${moduleProvider.provider} 当前未配置导航截图视觉识别协议，请选择 openai、ark 或支持图片输入的兼容供应商`)
  const provider = moduleProvider || configuredLlmProviders().find((item) => Boolean(item.apiKey && item.model) && item.mode !== "anthropic-json-prompt")
  if (!provider) throw new Error("LLM_PROVIDER_ORDER 中没有已配置 API Key、模型且支持图片输入的供应商，无法执行导航截图识别")
  return moduleModel ? { ...provider, model: moduleModel } : provider
}

export async function recognizeNavigationRoute(input: OcrRecognizeRequest): Promise<{ data: OcrRouteData; raw: Record<string, unknown>; model: string }> {
  const provider = routeProvider()
  const model = provider.model
  const baseUrl = provider.baseUrl.replace(/\/$/, "")
  const configuredTimeout = Number(process.env.LLM_TIMEOUT_MS); const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout > 0 ? configuredTimeout : 60_000
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const systemText = "你是导航截图的精确数据提取器。只分析画面中被蓝色外框、高亮底色或明确选中状态标示的单一路线方案。读取该方案内的距离与通行费；距离统一换算为公里，通行费统一为人民币元。若显示免费，tollYuan 返回 0。从路线输入区或途经点清单提取目的地及按行程顺序排列的途经地。只保留清楚可见的地名，不得猜测，不要读取未选中的替代方案。无法可靠判断时将对应数值设为 null，并返回 uncertain 或 not_found。"
    const userText = "识别当前选中的导航路线，返回目的地、途经地、公里数、通行费、置信度及判断选中路线的画面依据。"
    let endpoint = `${baseUrl}/responses`
    let body: Record<string, unknown> = { model, input: [{ role: "system", content: [{ type: "input_text", text: systemText }] }, { role: "user", content: [{ type: "input_text", text: userText }, { type: "input_image", image_url: `data:${input.mimeType};base64,${input.base64Data}`, detail: "high" }] }], text: { format: { type: "json_schema", name: "selected_navigation_route", strict: true, schema: outputSchema } } }
    if (provider.mode === "chat-json-schema") {
      endpoint = `${baseUrl}/chat/completions`
      body = { model, messages: [{ role: "system", content: systemText }, { role: "user", content: [{ type: "text", text: userText }, { type: "image_url", image_url: { url: `data:${input.mimeType};base64,${input.base64Data}` } }] }], temperature: provider.temperature, response_format: { type: "json_schema", json_schema: { name: "selected_navigation_route", strict: true, schema: outputSchema } } }
    }
    let response: Response
    try {
      response = await fetch(endpoint, { method: "POST", signal: controller.signal, headers: { Authorization: `Bearer ${provider.apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify(body) })
    } catch (reason) { throw llmNetworkError(reason, { provider: provider.provider, model, operation: "导航截图识别" }, controller.signal.aborted) }
    if (!response.ok) throw await llmHttpError(response, { provider: provider.provider, model, operation: "导航截图识别" })
    const payload = await response.json() as unknown
    const parsed = routeSchema.parse(extractJson(provider.mode === "responses" ? responsesOutputText(payload) : chatOutputText(payload)))
    const data: OcrRouteData = { routeResultStatus: parsed.status, waypoints: parsed.waypoints, confidence: parsed.confidence, selectedRouteEvidence: parsed.selectedRouteEvidence, ...(parsed.distanceKm !== null ? { distanceKm: parsed.distanceKm } : {}), ...(parsed.tollYuan !== null ? { tollYuan: parsed.tollYuan } : {}), ...(parsed.destination ? { destination: parsed.destination } : {}) }
    return { data, raw: { ...(parsed as Record<string, unknown>), provider: provider.provider }, model }
  } finally { clearTimeout(timeout) }
}
