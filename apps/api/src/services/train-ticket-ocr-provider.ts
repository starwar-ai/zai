import type { OcrTrainTicketData } from "@zform/shared"
import { z } from "zod"
import { configuredLlmProviders, llmProviderConfig, type LlmProviderConfig } from "./llm-provider-config.js"
import { llmHttpError, llmNetworkError } from "./llm-error-detail.js"

const fieldNames = ["trainInvoiceNo", "trainIssueDate", "departureStation", "arrivalStation", "trainNo", "departureDate", "departureTime", "seatNo", "seatClass", "ticketPrice", "passengerId", "passengerName", "ticketNo", "trainBuyerName", "trainBuyerCreditCode"] as const
const nullableText = z.string().nullable()
const resultSchema = z.object(Object.fromEntries(fieldNames.map((name) => [name, nullableText])) as Record<(typeof fieldNames)[number], typeof nullableText>).strict()
const outputSchema = { type: "object", additionalProperties: false, required: fieldNames, properties: Object.fromEntries(fieldNames.map((name) => [name, { anyOf: [{ type: "string" }, { type: "null" }] }])) } as const

function record(value: unknown): Record<string, unknown> | undefined { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined }
function extractText(payload: unknown, mode: LlmProviderConfig["mode"]): string {
  const root = record(payload)
  if (mode === "responses") { const output = Array.isArray(root?.output) ? root.output : []; for (const item of output) { const content = Array.isArray(record(item)?.content) ? record(item)?.content as unknown[] : []; for (const part of content) { const block = record(part); if (block?.type === "output_text" && typeof block.text === "string") return block.text } } }
  if (mode === "chat-json-schema") { const choice = Array.isArray(root?.choices) ? record(root.choices[0]) : undefined; const content = record(choice?.message)?.content; if (typeof content === "string") return content }
  if (mode === "anthropic-json-prompt") { const content = Array.isArray(root?.content) ? root.content : []; const text = content.map(record).find((item) => item?.type === "text" && typeof item.text === "string")?.text; if (typeof text === "string") return text }
  throw new Error("模型未返回可解析的火车票识别结果")
}
function extractJson(output: string): unknown { const fenced = output.trim().match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim() || output.trim(); const start = fenced.indexOf("{"); const end = fenced.lastIndexOf("}"); if (start < 0 || end <= start) throw new Error("模型未返回有效的火车票 JSON"); return JSON.parse(fenced.slice(start, end + 1)) as unknown }

export function trainTicketProvider(): LlmProviderConfig {
  const configuredProvider = process.env.TRAIN_TICKET_OCR_PROVIDER?.trim().toLowerCase()
  const moduleModel = process.env.TRAIN_TICKET_OCR_MODEL?.trim()
  if (Boolean(configuredProvider) !== Boolean(moduleModel)) throw new Error("TRAIN_TICKET_OCR_PROVIDER 和 TRAIN_TICKET_OCR_MODEL 必须同时配置或同时留空")
  const moduleProvider = configuredProvider ? llmProviderConfig(configuredProvider) : undefined
  if (configuredProvider && !moduleProvider) throw new Error(`TRAIN_TICKET_OCR_PROVIDER=${configuredProvider} 不是受支持的模型供应商`)
  if (moduleProvider && !moduleProvider.apiKey) throw new Error(`火车票识别指定供应商 ${moduleProvider.provider} 未配置 API Key`)
  const provider = moduleProvider || configuredLlmProviders().find((item) => Boolean(item.apiKey))
  if (!provider) throw new Error("LLM_PROVIDER_ORDER 中没有已配置 API Key 的模型，无法执行火车票识别")
  return moduleModel ? { ...provider, model: moduleModel } : provider
}

export async function recognizeTrainTicketText(pdfText: string): Promise<{ data: OcrTrainTicketData; raw: Record<string, unknown>; model: string }> {
  const provider = trainTicketProvider(); const model = provider.model; const baseUrl = provider.baseUrl.replace(/\/$/, "")
  const systemText = "你是中国铁路电子客票字段提取器。只提取文本中明确存在的信息，不得猜测；所有日期、金额、证件号和名称保留票面格式。无法确认的字段返回 null。ticketPrice 仅返回数值，不含人民币符号。"
  const userText = `请从以下铁路电子客票 PDF 文本层提取全部字段：\n${pdfText}`
  let endpoint = `${baseUrl}/responses`; let headers: Record<string, string> = { Authorization: `Bearer ${provider.apiKey}`, "Content-Type": "application/json" }
  let body: Record<string, unknown> = { model, input: [{ role: "system", content: [{ type: "input_text", text: systemText }] }, { role: "user", content: [{ type: "input_text", text: userText }] }], text: { format: { type: "json_schema", name: "railway_e_ticket", strict: true, schema: outputSchema } } }
  if (provider.mode === "chat-json-schema") { endpoint = `${baseUrl}/chat/completions`; body = { model, messages: [{ role: "system", content: systemText }, { role: "user", content: userText }], temperature: provider.temperature, response_format: { type: "json_schema", json_schema: { name: "railway_e_ticket", strict: true, schema: outputSchema } } } }
  if (provider.mode === "anthropic-json-prompt") { endpoint = `${baseUrl}/v1/messages`; headers = { "Content-Type": "application/json", "anthropic-version": "2023-06-01", ...(provider.apiKey.startsWith("sk-cp-") ? { Authorization: `Bearer ${provider.apiKey}` } : { "x-api-key": provider.apiKey }) }; body = { model, max_tokens: 3000, temperature: provider.temperature, system: `${systemText}\n只返回符合以下 JSON Schema 的对象：${JSON.stringify(outputSchema)}`, messages: [{ role: "user", content: userText }] } }
  const configuredTimeout = Number(process.env.LLM_TIMEOUT_MS); const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout > 0 ? configuredTimeout : 60_000
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), timeoutMs)
  let response: Response
  try { response = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(body), signal: controller.signal }) } catch (reason) { throw llmNetworkError(reason, { provider: provider.provider, model, operation: "火车票识别" }, controller.signal.aborted) } finally { clearTimeout(timeout) }
  if (!response.ok) throw await llmHttpError(response, { provider: provider.provider, model, operation: "火车票识别" })
  const parsed = resultSchema.parse(extractJson(extractText(await response.json() as unknown, provider.mode)))
  const data = Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string" && Boolean(entry[1].trim()))) as OcrTrainTicketData
  return { data, raw: { ...parsed, provider: provider.provider }, model }
}
