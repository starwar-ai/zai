import { z } from "zod"
import type { GeneratedDeclarationName } from "@zform/shared"

type ProviderMode = "responses" | "chat-json-schema" | "anthropic-json-prompt"
interface ProviderConfig { provider: string; apiKey: string; model: string; baseUrl: string; mode: ProviderMode; temperature: number }

const generatedSchema = z.object({
  declarationName: z.string().trim().min(1).max(100),
  customsDeclarationNameEng: z.string().trim().min(1).max(100),
  confidence: z.number().min(0).max(1),
  reviewRequired: z.boolean(),
  reviewReason: z.string().trim().max(500),
})

export const declarationNameJsonSchema = {
  type: "object", additionalProperties: false,
  properties: {
    declarationName: { type: "string" }, customsDeclarationNameEng: { type: "string" },
    confidence: { type: "number", minimum: 0, maximum: 1 }, reviewRequired: { type: "boolean" }, reviewReason: { type: "string" },
  },
  required: ["declarationName", "customsDeclarationNameEng", "confidence", "reviewRequired", "reviewReason"],
}

export const declarationNameSystemPrompt = `你是跨境电商和外贸报关品名标准化助手。根据中文销售名、英文销售名和历史候选输出统一的中英文报关品名。
规则：输出品类名而非完整销售标题；删除尺寸、容量、电压、功率、颜色、包装数量、营销词、型号、FSC、用途 和规格参数；保留核心品类和必要材质；中文尽量7个字以内；英文全大写且尽量为 2-5 个词；输入冲突、历史候选冲突或疑似公司与品牌名时要求人工复核；不输出 HS Code 或解释性长句。`

function numberFromEnv(name: string, fallback: number): number {
  const value = Number(process.env[name])
  return Number.isFinite(value) ? value : fallback
}

function providers(): ProviderConfig[] {
  const configs: Record<string, ProviderConfig> = {
    openai: { provider: "openai", apiKey: process.env.OPENAI_API_KEY || "", model: process.env.OPENAI_MODEL || "gpt-4.1", baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1", mode: "responses", temperature: 0 },
    kimi: { provider: "kimi", apiKey: process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY || "", model: process.env.KIMI_MODEL || process.env.MOONSHOT_MODEL || "kimi-k2-0711-preview", baseUrl: process.env.KIMI_BASE_URL || process.env.MOONSHOT_BASE_URL || "https://api.moonshot.cn/v1", mode: "chat-json-schema", temperature: numberFromEnv("KIMI_TEMPERATURE", 1) },
    minimax: { provider: "minimax", apiKey: process.env.MINIMAX_API_KEY || "", model: process.env.MINIMAX_MODEL || "MiniMax-M2.7", baseUrl: process.env.MINIMAX_BASE_URL || "https://api.minimax.io/anthropic", mode: "anthropic-json-prompt", temperature: numberFromEnv("MINIMAX_TEMPERATURE", 0.1) },
  }
  return (process.env.LLM_PROVIDER_ORDER || "openai").split(",").map((name) => configs[name.trim().toLowerCase()]).filter((item): item is ProviderConfig => Boolean(item))
}

function extractJson(output: string): unknown {
  const fenced = output.trim().match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim() || output.trim()
  const start = fenced.indexOf("{")
  const end = fenced.lastIndexOf("}")
  if (start < 0 || end <= start) throw new Error("模型输出不包含 JSON 对象")
  return JSON.parse(fenced.slice(start, end + 1)) as unknown
}

function responseOutput(body: unknown): string {
  const parsed = z.object({ output_text: z.string().optional(), output: z.array(z.object({ content: z.array(z.object({ text: z.string().optional() })).optional() })).optional() }).safeParse(body)
  if (!parsed.success) return ""
  return parsed.data.output_text || parsed.data.output?.flatMap((item) => item.content || []).find((item) => item.text)?.text || ""
}

async function providerRequest(provider: ProviderConfig, input: Record<string, unknown>): Promise<GeneratedDeclarationName> {
  const baseUrl = provider.baseUrl.replace(/\/$/, "")
  let endpoint = `${baseUrl}/responses`
  let headers: Record<string, string> = { "content-type": "application/json", authorization: `Bearer ${provider.apiKey}` }
  let body: Record<string, unknown> = {
    model: provider.model,
    input: [{ role: "system", content: declarationNameSystemPrompt }, { role: "user", content: JSON.stringify(input) }],
    text: { format: { type: "json_schema", name: "declaration_name_result", strict: true, schema: declarationNameJsonSchema } },
  }
  if (provider.mode === "chat-json-schema") {
    endpoint = `${baseUrl}/chat/completions`
    body = { model: provider.model, messages: [{ role: "system", content: declarationNameSystemPrompt }, { role: "user", content: JSON.stringify(input) }], temperature: provider.temperature, response_format: { type: "json_schema", json_schema: { name: "declaration_name_result", strict: true, schema: declarationNameJsonSchema } } }
  }
  if (provider.mode === "anthropic-json-prompt") {
    endpoint = `${baseUrl}/v1/messages`
    headers = { "content-type": "application/json", "anthropic-version": "2023-06-01", ...(provider.apiKey.startsWith("sk-cp-") ? { authorization: `Bearer ${provider.apiKey}` } : { "x-api-key": provider.apiKey }) }
    body = { model: provider.model, max_tokens: 1000, temperature: provider.temperature, system: `${declarationNameSystemPrompt}\n只返回符合字段 declarationName、customsDeclarationNameEng、confidence、reviewRequired、reviewReason 的 JSON 对象。`, messages: [{ role: "user", content: JSON.stringify(input) }] }
  }
  const response = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(numberFromEnv("LLM_TIMEOUT_MS", 60000)) })
  const text = await response.text()
  if (!response.ok) throw new Error(`模型服务返回 ${response.status}: ${text.slice(0, 300)}`)
  const payload = JSON.parse(text) as unknown
  const output = provider.mode === "responses"
    ? responseOutput(payload)
    : provider.mode === "chat-json-schema"
      ? z.object({ choices: z.array(z.object({ message: z.object({ content: z.string() }) })) }).parse(payload).choices[0]?.message.content || ""
      : z.object({ content: z.array(z.object({ text: z.string().optional() })) }).parse(payload).content.find((item) => item.text)?.text || ""
  const generated = generatedSchema.parse(extractJson(output))
  return { ...generated, customsDeclarationNameEng: generated.customsDeclarationNameEng.toUpperCase(), provider: provider.provider, model: provider.model }
}

export async function generateDeclarationName(input: { name: string; nameEng: string; existingDeclarationVariants?: string; existingEngVariants?: string; rowCount?: number }): Promise<GeneratedDeclarationName> {
  const errors: string[] = []
  for (const provider of providers()) {
    if (!provider.apiKey) { errors.push(`${provider.provider}: 未配置 API Key`); continue }
    try { return await providerRequest(provider, input) }
    catch (error) { errors.push(`${provider.provider}: ${error instanceof Error ? error.message : String(error)}`) }
  }
  throw new Error(`所有模型供应商均失败：${errors.join(" | ") || "没有可用供应商"}`)
}

export function sanitizeProviderError(message: string): string {
  return message.replace(/org-[a-zA-Z0-9]+/g, "org-<redacted>").replace(/ak-[a-zA-Z0-9]+/g, "ak-<redacted>").replace(/sk-[a-zA-Z0-9_-]+/g, "sk-<redacted>").slice(0, 2000)
}
