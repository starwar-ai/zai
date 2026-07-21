import type { OcrPaymentData } from "@zform/shared"
import { z } from "zod"

const paymentDataSchema = z.object({
  platform: z.string().nullable(), orderNo: z.string().nullable(), productName: z.string().nullable(), amount: z.string().nullable(),
  paymentTime: z.string().nullable(), paymentStatus: z.string().nullable(), paymentMethod: z.string().nullable(), receiver: z.string().nullable(),
}).strict()

const outputSchema = {
  type: "object", additionalProperties: false,
  required: ["platform", "orderNo", "productName", "amount", "paymentTime", "paymentStatus", "paymentMethod", "receiver"],
  properties: Object.fromEntries(["platform", "orderNo", "productName", "amount", "paymentTime", "paymentStatus", "paymentMethod", "receiver"].map((key) => [key, { anyOf: [{ type: "string" }, { type: "null" }] }])),
} as const

function record(value: unknown): Record<string, unknown> | undefined { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined }
function extractOutputText(value: unknown): string {
  const root = record(value); const output = Array.isArray(root?.output) ? root.output : []
  for (const item of output) { const message = record(item); const content = Array.isArray(message?.content) ? message.content : []; for (const part of content) { const block = record(part); if (block?.type === "output_text" && typeof block.text === "string") return block.text } }
  throw new Error("OpenAI 未返回可解析的 OCR 结果")
}

export async function recognizePaymentScreenshot(input: { mimeType: string; base64Data: string }): Promise<{ data: OcrPaymentData; raw: Record<string, unknown>; model: string }> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error("尚未配置 OPENAI_API_KEY，无法执行截图识别")
  const model = process.env.OCR_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-mini"
  const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "")
  const configuredTimeout = Number(process.env.LLM_TIMEOUT_MS)
  const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout > 0 ? configuredTimeout : 60_000
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${baseUrl}/responses`, { method: "POST", signal: controller.signal, headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({
      model,
      input: [
        { role: "system", content: [{ type: "input_text", text: "你是支付截图信息提取助手。只提取图片中明确存在的信息，不得猜测。支持电商订单和微信支付、支付宝、银行卡等支付凭证。金额与时间保留图片原始格式；无法确认的字段返回 null。" }] },
        { role: "user", content: [{ type: "input_text", text: "识别截图中的平台、订单号、商品名称、支付金额、支付时间、支付状态、支付方式和收款方。" }, { type: "input_image", image_url: `data:${input.mimeType};base64,${input.base64Data}`, detail: "high" }] },
      ],
      text: { format: { type: "json_schema", name: "payment_screenshot", strict: true, schema: outputSchema } },
    }) })
    if (!response.ok) throw new Error(`OpenAI OCR 失败（HTTP ${response.status}）`)
    const parsed = paymentDataSchema.parse(JSON.parse(extractOutputText(await response.json())) as unknown)
    const raw = parsed as Record<string, unknown>
    const data = Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string" && Boolean(entry[1].trim()))) as OcrPaymentData
    return { data, raw, model }
  } finally { clearTimeout(timeout) }
}
