import type { OcrInvoiceData, OcrInvoiceItem, OcrRecognizeRequest } from "@zform/shared"
import { z } from "zod"
import { configuredLlmProviders, llmProviderConfig, type LlmProviderConfig } from "./llm-provider-config.js"
import { llmHttpError, llmNetworkError } from "./llm-error-detail.js"

const nullableText = z.string().nullable().optional().default(null)
const nullableInvoiceType = z.enum(["VAT_NORMAL", "VAT_SPECIAL"]).nullable().optional().default(null)
const invoiceItemSchema = z.object({ itemName: nullableText, specification: nullableText, unit: nullableText, quantity: nullableText, unitPrice: nullableText, amount: nullableText, taxRate: nullableText, taxAmount: nullableText }).strip()
const invoiceDataSchema = z.object({
  invoiceType: nullableInvoiceType, invoiceNumber: nullableText, invoiceDate: nullableText, buyerName: nullableText, buyerTaxId: nullableText, sellerName: nullableText, sellerTaxId: nullableText,
  subtotal: nullableText, totalTax: nullableText, totalAmount: nullableText, totalAmountInWords: nullableText, remarks: nullableText, drawer: nullableText,
  items: z.array(invoiceItemSchema).max(200).optional().default([]),
}).strip()

const nullableString = { anyOf: [{ type: "string" }, { type: "null" }] } as const
const nullableInvoiceTypeSchema = { anyOf: [{ type: "string", enum: ["VAT_NORMAL", "VAT_SPECIAL"] }, { type: "null" }] } as const
const itemKeys = ["itemName", "specification", "unit", "quantity", "unitPrice", "amount", "taxRate", "taxAmount"] as const
const headerKeys = ["invoiceNumber", "invoiceDate", "buyerName", "buyerTaxId", "sellerName", "sellerTaxId", "subtotal", "totalTax", "totalAmount", "totalAmountInWords", "remarks", "drawer"] as const
const outputSchema = {
  type: "object", additionalProperties: false, required: ["invoiceType", ...headerKeys, "items"],
  properties: {
    invoiceType: nullableInvoiceTypeSchema,
    ...Object.fromEntries(headerKeys.map((key) => [key, nullableString])),
    items: { type: "array", items: { type: "object", additionalProperties: false, required: itemKeys, properties: Object.fromEntries(itemKeys.map((key) => [key, nullableString])) } },
  },
} as const

function record(value: unknown): Record<string, unknown> | undefined { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined }
function extractOutputText(value: unknown): string {
  const root = record(value); const output = Array.isArray(root?.output) ? root.output : []
  for (const item of output) { const message = record(item); const content = Array.isArray(message?.content) ? message.content : []; for (const part of content) { const block = record(part); if (block?.type === "output_text" && typeof block.text === "string") return block.text } }
  throw new Error("OpenAI 未返回可解析的发票识别结果")
}
function extractChatText(value: unknown): string {
  const root = record(value); const choice = Array.isArray(root?.choices) ? record(root.choices[0]) : undefined
  const content = record(choice?.message)?.content
  if (typeof content === "string") return content
  if (Array.isArray(content)) return content.map(record).filter((item) => item?.type === "text" && typeof item.text === "string").map((item) => String(item?.text)).join("")
  throw new Error("模型未返回可解析的发票识别结果")
}
function extractJson(output: string): unknown {
  const fenced = output.trim().match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim() || output.trim()
  const start = fenced.indexOf("{"); const end = fenced.lastIndexOf("}")
  if (start < 0 || end <= start) throw new Error("模型未返回有效的发票 JSON")
  return JSON.parse(fenced.slice(start, end + 1)) as unknown
}
const invoiceAliases = {
  invoiceType: ["invoiceType", "invoice_type", "发票类型"], invoiceNumber: ["invoiceNumber", "invoice_number", "发票号码"], invoiceDate: ["invoiceDate", "invoice_date", "开票日期"],
  buyerName: ["buyerName", "buyer_name", "购买方名称", "购买方"], buyerTaxId: ["buyerTaxId", "buyer_tax_id", "购买方税号", "购买方纳税人识别号"],
  sellerName: ["sellerName", "seller_name", "销售方名称", "销售方"], sellerTaxId: ["sellerTaxId", "seller_tax_id", "销售方税号", "销售方纳税人识别号"],
  subtotal: ["subtotal", "amountTotal", "amount_total", "金额合计"], totalTax: ["totalTax", "total_tax", "税额合计"], totalAmount: ["totalAmount", "total_amount", "价税合计"],
  totalAmountInWords: ["totalAmountInWords", "total_amount_in_words", "价税合计大写"], remarks: ["remarks", "remark", "备注"], drawer: ["drawer", "开票人"],
} as const
const itemAliases = {
  itemName: ["itemName", "item_name", "name", "项目名称", "商品名称"], specification: ["specification", "规格型号"], unit: ["unit", "单位"], quantity: ["quantity", "数量"],
  unitPrice: ["unitPrice", "unit_price", "单价"], amount: ["amount", "金额"], taxRate: ["taxRate", "tax_rate", "税率"], taxAmount: ["taxAmount", "tax_amount", "税额"],
} as const
function aliasValue(source: Record<string, unknown>, aliases: readonly string[]): unknown { for (const key of aliases) { if (source[key] !== undefined) return source[key] }; return undefined }
function textValue(value: unknown): string | null { return typeof value === "string" ? value : typeof value === "number" && Number.isFinite(value) ? String(value) : null }
function invoiceType(value: unknown, fallbackText: string): "VAT_NORMAL" | "VAT_SPECIAL" | null {
  const text = typeof value === "string" ? value.trim() : ""
  if (text === "VAT_SPECIAL" || /专用发票|special/i.test(text)) return "VAT_SPECIAL"
  if (text === "VAT_NORMAL" || /普通发票|normal/i.test(text)) return "VAT_NORMAL"
  if (/专用发票/.test(fallbackText)) return "VAT_SPECIAL"
  if (/普通发票/.test(fallbackText)) return "VAT_NORMAL"
  return null
}
function normalizeInvoicePayload(value: unknown, fallbackText: string): Record<string, unknown> {
  const root = record(value) || {}
  const wrapped = ["data", "result", "invoice", "invoiceData", "electronic_invoice"].map((key) => record(root[key])).find(Boolean)
  const source = wrapped || root
  const rawInvoiceType = aliasValue(source, invoiceAliases.invoiceType)
  const normalized: Record<string, unknown> = Object.fromEntries(Object.entries(invoiceAliases).map(([key, aliases]) => [key, textValue(aliasValue(source, aliases))]))
  normalized.invoiceType = invoiceType(rawInvoiceType, fallbackText)
  const rawItems = aliasValue(source, ["items", "invoiceItems", "invoice_items", "商品明细", "明细"])
  normalized.items = Array.isArray(rawItems) ? rawItems.map((value) => { const item = record(value) || {}; return Object.fromEntries(Object.entries(itemAliases).map(([key, aliases]) => [key, textValue(aliasValue(item, aliases))])) }) : []
  return normalized
}
function compactItem(item: z.infer<typeof invoiceItemSchema>): OcrInvoiceItem { return Object.fromEntries(Object.entries(item).filter((entry): entry is [string, string] => typeof entry[1] === "string" && Boolean(entry[1].trim()))) as OcrInvoiceItem }

/** 购销方与至少一条有名称的明细是可用发票结果的最低要求；票种、税号、备注允许票面无法明确识别。 */
export function assertCompleteInvoice(data: OcrInvoiceData): void {
  const missing: string[] = []
  if (!data.buyerName?.trim()) missing.push("购买方名称")
  if (!data.sellerName?.trim()) missing.push("销售方名称")
  if (!data.items.some((item) => Boolean(item.itemName?.trim()))) missing.push("商品明细")
  if (missing.length) throw new Error(`发票识别不完整，缺少：${missing.join("、")}`)
}

export interface InvoiceRecognitionContext { pdfText?: string; qrText?: string; pageImageBase64?: string }

const PROVIDER_NETWORK_ATTEMPTS = 2

async function fetchInvoiceProvider(endpoint: string, request: RequestInit, provider: string, model: string, timeoutMs: number): Promise<Response> {
  for (let attempt = 1; attempt <= PROVIDER_NETWORK_ATTEMPTS; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      return await fetch(endpoint, { ...request, signal: controller.signal })
    } catch (reason) {
      if (controller.signal.aborted) throw llmNetworkError(reason, { provider, model, operation: "发票识别" }, true)
      if (attempt === PROVIDER_NETWORK_ATTEMPTS) throw llmNetworkError(reason, { provider, model, operation: "发票识别" }, false)
    } finally {
      clearTimeout(timeout)
    }
  }
  throw new Error(`${provider} 发票识别网络连接失败，请稍后重试`)
}

function invoiceProvider(): LlmProviderConfig {
  const configuredProvider = process.env.OCR_PROVIDER?.trim().toLowerCase()
  const moduleModel = process.env.OCR_MODEL?.trim()
  if (Boolean(configuredProvider) !== Boolean(moduleModel)) throw new Error("OCR_PROVIDER 和 OCR_MODEL 必须同时配置或同时留空")
  const moduleProvider = configuredProvider ? llmProviderConfig(configuredProvider) : undefined
  if (configuredProvider && !moduleProvider) throw new Error(`OCR_PROVIDER=${configuredProvider} 不是受支持的模型供应商`)
  if (moduleProvider && !moduleProvider.apiKey) throw new Error(`电子发票指定供应商 ${moduleProvider.provider} 未配置 API Key`)
  const provider = moduleProvider || configuredLlmProviders().find((item) => Boolean(item.apiKey))
  if (!provider) throw new Error("LLM_PROVIDER_ORDER 中没有已配置 API Key 的模型，无法执行发票识别")
  if (provider.mode === "anthropic-json-prompt") throw new Error(`${provider.provider} 当前未配置发票视觉识别协议，请在 LLM_PROVIDER_ORDER 中优先配置 openai 或 ark`)
  return moduleModel ? { ...provider, model: moduleModel } : provider
}

export async function recognizeInvoice(input: OcrRecognizeRequest, context: InvoiceRecognitionContext = {}): Promise<{ data: OcrInvoiceData; raw: Record<string, unknown>; model: string }> {
  const provider = invoiceProvider()
  const model = provider.model
  const baseUrl = provider.baseUrl.replace(/\/$/, "")
  const configuredTimeout = Number(process.env.LLM_TIMEOUT_MS); const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout > 0 ? configuredTimeout : 60_000
  const fileContent = input.mimeType === "application/pdf" && context.pdfText
    ? { type: "input_text", text: `以下是从原生 PDF 文本层提取的内容，请按原文结构识别：\n${context.pdfText}` }
    : input.mimeType === "application/pdf"
    ? { type: "input_file", filename: input.filename, file_data: `data:application/pdf;base64,${input.base64Data}` }
    : { type: "input_image", image_url: `data:${input.mimeType};base64,${input.base64Data}`, detail: "high" }
  const qrContent = context.qrText ? [{ type: "input_text", text: `发票二维码原文（仅用于校验发票号码、日期和金额等核心字段，不包含购销方、明细和备注）：${context.qrText}` }] : []
  const systemText = "你是专业的中国电子发票识别助手。只提取发票中明确存在的信息，不得猜测。必须根据票面标题判定发票类型：增值税专用发票返回 VAT_SPECIAL，普通发票（包括增值税普通发票）返回 VAT_NORMAL。必须仔细识别购买方和销售方的名称、纳税人识别号，逐行提取全部货物、服务或应税劳务明细，并提取备注栏原文。金额、税率和日期保留票面格式；票面没有税号、备注或其他字段时返回 null，不得用推测内容填充。"
  const userText = `完整识别这份发票。先区分普通发票与增值税专用发票，再确保购买方、销售方、全部商品明细和备注没有遗漏，同时提取发票号码、开票日期、双方税号、金额税额合计、价税合计大小写和开票人。${context.qrText ? `\n发票二维码原文（仅用于校验核心字段）：${context.qrText}` : ""}${context.pdfText ? `\n以下是原生 PDF 文本层：\n${context.pdfText}` : ""}`
  let endpoint = `${baseUrl}/responses`
  let body: Record<string, unknown> = { model, input: [{ role: "system", content: [{ type: "input_text", text: systemText }] }, { role: "user", content: [{ type: "input_text", text: userText }, ...qrContent, fileContent] }], text: { format: { type: "json_schema", name: "electronic_invoice", strict: true, schema: outputSchema } } }
  if (provider.mode === "chat-json-schema") {
    endpoint = `${baseUrl}/chat/completions`
    const imageUrl = input.mimeType === "application/pdf" ? context.pageImageBase64 && `data:image/png;base64,${context.pageImageBase64}` : `data:${input.mimeType};base64,${input.base64Data}`
    if (input.mimeType === "application/pdf" && !context.pdfText && !imageUrl) throw new Error("PDF 没有可提取文本，且首页图像转换失败，无法使用方舟视觉模型识别")
    const userContent: Array<Record<string, unknown>> = [{ type: "text", text: userText }]
    if (imageUrl) userContent.push({ type: "image_url", image_url: { url: imageUrl } })
    body = { model, messages: [{ role: "system", content: systemText }, { role: "user", content: userContent }], temperature: provider.temperature, response_format: { type: "json_schema", json_schema: { name: "electronic_invoice", strict: true, schema: outputSchema } } }
  }
  const response = await fetchInvoiceProvider(endpoint, { method: "POST", headers: { Authorization: `Bearer ${provider.apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify(body) }, provider.provider, model, timeoutMs)
  if (!response.ok) throw await llmHttpError(response, { provider: provider.provider, model, operation: "发票识别" })
  const payload = await response.json() as unknown
  const output = provider.mode === "responses" ? extractOutputText(payload) : extractChatText(payload)
  const parsed = invoiceDataSchema.parse(normalizeInvoicePayload(extractJson(output), `${context.pdfText || ""}\n${output}`))
  const raw = parsed as unknown as Record<string, unknown>
  const headers = Object.fromEntries(Object.entries(parsed).filter(([key, value]) => key !== "items" && typeof value === "string" && Boolean(value.trim())))
  const data = { ...headers, items: parsed.items.map(compactItem) } as OcrInvoiceData
  assertCompleteInvoice(data)
  return { data, raw: { ...raw, provider: provider.provider }, model }
}
