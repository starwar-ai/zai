import type { CustomerResearchResult } from "@zform/shared"
import { customerResearchResultSchema } from "../documents/customer-research-validator.js"

const reportSchema = {
  type: "object", additionalProperties: false,
  required: ["companySummary", "businessScope", "scaleEstimate", "annualSalesEstimateUsd", "employeeEstimate", "isVerifiedCompany", "verifiedCompanyReason", "verifiedCompanyConfidence", "isGardenOutdoor", "gardenOutdoorReason", "gardenOutdoorConfidence", "salesOverOneMillion", "salesReason", "salesConfidence", "employeesOverTen", "employeesReason", "employeesConfidence", "overallConfidence", "sources", "researchNotes"],
  properties: {
    companySummary: { type: "string" }, businessScope: { type: "string" }, scaleEstimate: { type: "string" },
    annualSalesEstimateUsd: { anyOf: [{ type: "integer", minimum: 0 }, { type: "null" }] }, employeeEstimate: { anyOf: [{ type: "integer", minimum: 0 }, { type: "null" }] },
    isVerifiedCompany: { type: "string", enum: ["yes", "no", "uncertain"] }, verifiedCompanyReason: { type: "string" }, verifiedCompanyConfidence: { type: "integer", minimum: 0, maximum: 100 },
    isGardenOutdoor: { type: "string", enum: ["yes", "no", "uncertain"] }, gardenOutdoorReason: { type: "string" }, gardenOutdoorConfidence: { type: "integer", minimum: 0, maximum: 100 },
    salesOverOneMillion: { type: "string", enum: ["yes", "no", "uncertain"] }, salesReason: { type: "string" }, salesConfidence: { type: "integer", minimum: 0, maximum: 100 },
    employeesOverTen: { type: "string", enum: ["yes", "no", "uncertain"] }, employeesReason: { type: "string" }, employeesConfidence: { type: "integer", minimum: 0, maximum: 100 },
    overallConfidence: { type: "integer", minimum: 0, maximum: 100 },
    sources: { type: "array", items: { type: "object", additionalProperties: false, required: ["title", "url", "claim"], properties: { title: { type: "string" }, url: { type: "string" }, claim: { type: "string" } } } },
    researchNotes: { type: "string" },
  },
} as const

function record(value: unknown): Record<string, unknown> | undefined { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined }
function extractOutputText(value: unknown): string {
  const root = record(value); const output = Array.isArray(root?.output) ? root.output : []
  for (const item of output) {
    const message = record(item); const content = Array.isArray(message?.content) ? message.content : []
    for (const part of content) { const block = record(part); if (block?.type === "output_text" && typeof block.text === "string") return block.text }
  }
  throw new Error("OpenAI 未返回可解析的结构化调查报告")
}

export async function researchCustomer(input: { companyName: string; country?: string; website?: string; contactName?: string; contactEmail?: string }): Promise<{ result: CustomerResearchResult; model: string; promptVersion: string }> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error("尚未配置 OPENAI_API_KEY，无法执行联网调查")
  const model = process.env.OPENAI_MODEL || "gpt-4.1"
  const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "")
  const promptVersion = process.env.PROMPT_VERSION || "v1"
  const configuredTimeout = Number(process.env.LLM_TIMEOUT_MS)
  const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout > 0 ? configuredTimeout : 60_000
  const identity = [`公司名：${input.companyName}`, input.country && `国家/地区：${input.country}`, input.website && `网址：${input.website}`, input.contactName && `联系人：${input.contactName}`, input.contactEmail && `联系邮箱：${input.contactEmail}`].filter(Boolean).join("\n")
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${baseUrl}/responses`, { method: "POST", signal: controller.signal, headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({
      model, tools: [{ type: "web_search" }], tool_choice: "auto",
      input: [
        { role: "system", content: [{ type: "input_text", text: "你是严谨的企业尽职调查分析师。必须联网检索并交叉核验公开信息，以简体中文输出；不得混淆同名公司或臆测。证据不足时选择 uncertain。园林户外包括花园家具、户外家具、庭院、园艺工具、烧烤、遮阳、户外装饰和景观产品。销售额阈值为 1,000,000 美元，员工阈值为 10 人以上。优先使用官网、政府注册、监管披露、权威目录和可靠媒体。" }] },
        { role: "user", content: [{ type: "input_text", text: `请调查以下客户，并完成四项判定。\n\n${identity}` }] },
      ], text: { format: { type: "json_schema", name: "customer_due_diligence_report", strict: true, schema: reportSchema } },
    }) })
    if (!response.ok) throw new Error(`OpenAI 调查失败（HTTP ${response.status}）`)
    const result = customerResearchResultSchema.parse(JSON.parse(extractOutputText(await response.json())) as unknown)
    return { result, model, promptVersion }
  } finally { clearTimeout(timeout) }
}
