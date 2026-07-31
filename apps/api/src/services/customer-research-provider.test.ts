import { afterEach, describe, expect, it, vi } from "vitest"
import { customerResearchModelConfig, researchCustomer } from "./customer-research-provider.js"

const original = {
  key: process.env.OPENAI_API_KEY,
  model: process.env.OPENAI_MODEL,
  providerOrder: process.env.LLM_PROVIDER_ORDER,
  kimiModel: process.env.KIMI_MODEL,
  kimiKey: process.env.KIMI_API_KEY,
  minimaxModel: process.env.MINIMAX_MODEL,
  minimaxKey: process.env.MINIMAX_API_KEY,
  baseUrl: process.env.OPENAI_BASE_URL,
  timeout: process.env.LLM_TIMEOUT_MS,
  researchTimeout: process.env.CUSTOMER_RESEARCH_TIMEOUT_MS,
  prompt: process.env.PROMPT_VERSION,
}
const validResult = {
  companySummary: "简介", businessScope: "业务", scaleEstimate: "规模", annualSalesEstimateUsd: null, employeeEstimate: null,
  isVerifiedCompany: "yes", verifiedCompanyReason: "依据", verifiedCompanyConfidence: 90,
  isGardenOutdoor: "uncertain", gardenOutdoorReason: "依据", gardenOutdoorConfidence: 70,
  salesOverOneMillion: "uncertain", salesReason: "依据", salesConfidence: 60,
  employeesOverTen: "no", employeesReason: "依据", employeesConfidence: 80,
  overallConfidence: 75, sources: [], researchNotes: "备注",
}

afterEach(() => {
  const restore = (name: string, value: string | undefined) => { if (value === undefined) delete process.env[name]; else process.env[name] = value }
  restore("OPENAI_API_KEY", original.key); restore("OPENAI_MODEL", original.model); restore("LLM_PROVIDER_ORDER", original.providerOrder); restore("KIMI_MODEL", original.kimiModel); restore("KIMI_API_KEY", original.kimiKey); restore("MINIMAX_MODEL", original.minimaxModel); restore("MINIMAX_API_KEY", original.minimaxKey); restore("OPENAI_BASE_URL", original.baseUrl); restore("LLM_TIMEOUT_MS", original.timeout); restore("CUSTOMER_RESEARCH_TIMEOUT_MS", original.researchTimeout); restore("PROMPT_VERSION", original.prompt)
  vi.unstubAllGlobals()
})

describe("customer research provider configuration", () => {
  it("uses LLM_PROVIDER_ORDER for model options and default", () => {
    process.env.LLM_PROVIDER_ORDER = "kimi,openai,minimax"
    process.env.KIMI_MODEL = "kimi-model"
    process.env.KIMI_API_KEY = "kimi-key"
    process.env.OPENAI_MODEL = "openai-model"
    process.env.OPENAI_API_KEY = "openai-key"
    process.env.MINIMAX_MODEL = "minimax-model"
    process.env.MINIMAX_API_KEY = "minimax-key"
    expect(customerResearchModelConfig()).toEqual({ defaultProvider: "kimi", options: [
      { provider: "kimi", model: "kimi-model", label: "kimi · kimi-model" },
      { provider: "openai", model: "openai-model", label: "openai · openai-model" },
      { provider: "minimax", model: "minimax-model", label: "minimax · minimax-model" },
    ] })
  })

  it("reuses the existing zai OpenAI environment variables", async () => {
    process.env.OPENAI_API_KEY = "test-key"
    process.env.LLM_PROVIDER_ORDER = "openai"
    process.env.OPENAI_MODEL = "configured-model"
    process.env.OPENAI_BASE_URL = "https://llm.example.test/v1/"
    process.env.LLM_TIMEOUT_MS = "12345"
    process.env.PROMPT_VERSION = "shared-v7"
    const result = validResult
    const fetchMock = vi.fn(async (_url: string, _request: RequestInit) => ({ ok: true, status: 200, text: async () => JSON.stringify({ output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(result) }] }] }) }))
    vi.stubGlobal("fetch", fetchMock)

    const researched = await researchCustomer({ companyName: "示例客户", previousResearch: "第一次调查结论", webEvidence: { queries: ["示例客户 profile"], results: [{ title: "官网", url: "https://example.test/about", content: "公开公司简介" }] } })

    expect(researched).toMatchObject({ model: "configured-model", promptVersion: "shared-v7" })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, request] = fetchMock.mock.calls[0]!
    expect(url).toBe("https://llm.example.test/v1/responses")
    const requestBody = JSON.parse(String(request.body)) as { model: string; tools?: unknown; input: Array<{ role: string; content: Array<{ text: string }> }> }
    expect(requestBody).toMatchObject({ model: "configured-model" })
    expect(requestBody.tools).toBeUndefined()
    expect(requestBody.input.find((item) => item.role === "user")?.content[0]?.text).toContain("第一次调查结论")
    expect(requestBody.input.find((item) => item.role === "user")?.content[0]?.text).toContain("https://example.test/about")
  })

  it("returns a clear error when customer research times out", async () => {
    process.env.OPENAI_API_KEY = "test-key"
    process.env.LLM_PROVIDER_ORDER = "openai"
    process.env.CUSTOMER_RESEARCH_TIMEOUT_MS = "90000"
    vi.stubGlobal("fetch", vi.fn(async () => { const error = new Error("aborted"); error.name = "TimeoutError"; throw error }))
    await expect(researchCustomer({ companyName: "超时客户" })).rejects.toThrow("openai 调查超过 90 秒")
  })

  it("streams OpenAI response text deltas", async () => {
    process.env.OPENAI_API_KEY = "test-key"
    process.env.LLM_PROVIDER_ORDER = "openai"
    const json = JSON.stringify(validResult)
    const streamBody = `data: ${JSON.stringify({ type: "response.output_text.delta", delta: json.slice(0, 30) })}\n\ndata: ${JSON.stringify({ type: "response.output_text.delta", delta: json.slice(30) })}\n\ndata: [DONE]\n\n`
    vi.stubGlobal("fetch", vi.fn(async () => new Response(streamBody, { status: 200, headers: { "content-type": "text/event-stream" } })))
    const deltas: string[] = []
    const researched = await researchCustomer({ companyName: "流式客户" }, "openai", (delta) => deltas.push(delta))
    expect(deltas.join("")).toBe(json)
    expect(researched.result.companySummary).toBe("简介")
  })

  it("streams Kimi reasoning separately from final JSON content", async () => {
    process.env.KIMI_API_KEY = "kimi-key"
    process.env.KIMI_MODEL = "kimi-k3"
    process.env.LLM_PROVIDER_ORDER = "kimi"
    const json = JSON.stringify(validResult)
    const streamBody = [
      { choices: [{ delta: { reasoning_content: "正在核验公司信息" } }] },
      { choices: [{ delta: { content: json } }] },
    ].map((item) => `data: ${JSON.stringify(item)}\n\n`).join("") + "data: [DONE]\n\n"
    vi.stubGlobal("fetch", vi.fn(async () => new Response(streamBody, { status: 200, headers: { "content-type": "text/event-stream" } })))
    const deltas: Array<{ kind: string; delta: string }> = []
    const researched = await researchCustomer({ companyName: "Kimi 流式客户" }, "kimi", (delta, kind) => deltas.push({ kind, delta }))
    expect(deltas).toEqual([{ kind: "reasoning", delta: "正在核验公司信息" }, { kind: "content", delta: json }])
    expect(researched.result.companySummary).toBe("简介")
  })
})
