import type { OcrPaymentData, OcrRecognizeRequest } from "@zform/shared"
import { z } from "zod"
import { configuredLlmProviders, llmProviderConfig, type LlmProviderConfig } from "./llm-provider-config.js"
import { llmHttpError, llmNetworkError } from "./llm-error-detail.js"

const keys = ["platform", "orderNo", "productName", "amount", "paymentTime", "paymentStatus", "paymentMethod", "receiver"] as const
const paymentSchema = z.object({ platform: z.string().nullable(), orderNo: z.string().nullable(), productName: z.string().nullable(), amount: z.string().nullable(), paymentTime: z.string().nullable(), paymentStatus: z.string().nullable(), paymentMethod: z.string().nullable(), receiver: z.string().nullable() }).strict()
const outputSchema = { type: "object", additionalProperties: false, required: keys, properties: Object.fromEntries(keys.map((key) => [key, { anyOf: [{ type: "string" }, { type: "null" }] }])) } as const
function record(value: unknown): Record<string, unknown> | undefined { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined }
function outputText(value: unknown): string { const root = record(value); const output = Array.isArray(root?.output) ? root.output : []; for (const item of output) { const content = Array.isArray(record(item)?.content) ? record(item)?.content as unknown[] : []; for (const part of content) { const block = record(part); if (block?.type === "output_text" && typeof block.text === "string") return block.text } } throw new Error("OpenAI 未返回可解析的支付截图结果") }
function chatText(value: unknown): string { const root = record(value); const choice = Array.isArray(root?.choices) ? record(root.choices[0]) : undefined; const content = record(choice?.message)?.content; if (typeof content === "string") return content; if (Array.isArray(content)) return content.map(record).filter((item) => item?.type === "text" && typeof item.text === "string").map((item) => String(item?.text)).join(""); throw new Error("模型未返回可解析的支付截图结果") }
function extractJson(output: string): unknown { const fenced = output.trim().match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim() || output.trim(); const start = fenced.indexOf("{"); const end = fenced.lastIndexOf("}"); if (start < 0 || end <= start) throw new Error("模型未返回有效的支付截图 JSON"); return JSON.parse(fenced.slice(start, end + 1)) as unknown }

function paymentProvider(): LlmProviderConfig {
  const configuredProvider = process.env.PAYMENT_OCR_PROVIDER?.trim().toLowerCase()
  const moduleModel = process.env.PAYMENT_OCR_MODEL?.trim()
  if (Boolean(configuredProvider) !== Boolean(moduleModel)) throw new Error("PAYMENT_OCR_PROVIDER 和 PAYMENT_OCR_MODEL 必须同时配置或同时留空")
  const moduleProvider = configuredProvider ? llmProviderConfig(configuredProvider) : undefined
  if (configuredProvider && !moduleProvider) throw new Error(`PAYMENT_OCR_PROVIDER=${configuredProvider} 不是受支持的模型供应商`)
  if (moduleProvider && !moduleProvider.apiKey) throw new Error(`支付截图指定供应商 ${moduleProvider.provider} 未配置 API Key`)
  if (moduleProvider?.mode === "anthropic-json-prompt") throw new Error(`${moduleProvider.provider} 当前未配置支付截图视觉识别协议`)
  const provider = moduleProvider || configuredLlmProviders().find((item) => Boolean(item.apiKey) && item.mode !== "anthropic-json-prompt")
  if (!provider) throw new Error("LLM_PROVIDER_ORDER 中没有已配置且支持图片输入的模型，无法执行支付截图识别")
  return moduleModel ? { ...provider, model: moduleModel } : provider
}

export async function recognizePaymentScreenshot(input: OcrRecognizeRequest): Promise<{ data: OcrPaymentData; raw: Record<string, unknown>; model: string }> {
  const provider = paymentProvider(); const model = provider.model; const baseUrl = provider.baseUrl.replace(/\/$/, "")
  const configuredTimeout = Number(process.env.LLM_TIMEOUT_MS); const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout > 0 ? configuredTimeout : 60_000
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const systemText = "你是支付截图信息提取助手。只提取图片中明确存在的信息，不得猜测；无法确认的字段返回 null。"
    const userText = "提取平台、订单号、商品名称、支付金额、支付时间、支付状态、支付方式和收款方。"
    let endpoint = `${baseUrl}/responses`
    let body: Record<string, unknown> = { model, input: [{ role: "system", content: [{ type: "input_text", text: systemText }] }, { role: "user", content: [{ type: "input_text", text: userText }, { type: "input_image", image_url: `data:${input.mimeType};base64,${input.base64Data}`, detail: "high" }] }], text: { format: { type: "json_schema", name: "payment_screenshot", strict: true, schema: outputSchema } } }
    if (provider.mode === "chat-json-schema") {
      endpoint = `${baseUrl}/chat/completions`
      body = { model, messages: [{ role: "system", content: systemText }, { role: "user", content: [{ type: "text", text: userText }, { type: "image_url", image_url: { url: `data:${input.mimeType};base64,${input.base64Data}` } }] }], temperature: provider.temperature, response_format: { type: "json_schema", json_schema: { name: "payment_screenshot", strict: true, schema: outputSchema } } }
    }
    let response: Response
    try {
      response = await fetch(endpoint, { method: "POST", signal: controller.signal, headers: { Authorization: `Bearer ${provider.apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify(body) })
    } catch (reason) {
      throw llmNetworkError(reason, { provider: provider.provider, model, operation: "支付截图识别" }, controller.signal.aborted)
    }
    if (!response.ok) throw await llmHttpError(response, { provider: provider.provider, model, operation: "支付截图识别" })
    const payload = await response.json() as unknown
    const parsed = paymentSchema.parse(extractJson(provider.mode === "responses" ? outputText(payload) : chatText(payload))); const data = Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string" && Boolean(entry[1].trim()))) as OcrPaymentData
    return { data, raw: { ...parsed, provider: provider.provider }, model }
  } finally { clearTimeout(timeout) }
}
