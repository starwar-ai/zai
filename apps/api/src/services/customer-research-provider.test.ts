import { afterEach, describe, expect, it, vi } from "vitest"
import { researchCustomer } from "./customer-research-provider.js"

const original = {
  key: process.env.OPENAI_API_KEY,
  model: process.env.OPENAI_MODEL,
  baseUrl: process.env.OPENAI_BASE_URL,
  timeout: process.env.LLM_TIMEOUT_MS,
  prompt: process.env.PROMPT_VERSION,
}

afterEach(() => {
  const restore = (name: string, value: string | undefined) => { if (value === undefined) delete process.env[name]; else process.env[name] = value }
  restore("OPENAI_API_KEY", original.key); restore("OPENAI_MODEL", original.model); restore("OPENAI_BASE_URL", original.baseUrl); restore("LLM_TIMEOUT_MS", original.timeout); restore("PROMPT_VERSION", original.prompt)
  vi.unstubAllGlobals()
})

describe("customer research provider configuration", () => {
  it("reuses the existing zai OpenAI environment variables", async () => {
    process.env.OPENAI_API_KEY = "test-key"
    process.env.OPENAI_MODEL = "configured-model"
    process.env.OPENAI_BASE_URL = "https://llm.example.test/v1/"
    process.env.LLM_TIMEOUT_MS = "12345"
    process.env.PROMPT_VERSION = "shared-v7"
    const result = {
      companySummary: "简介", businessScope: "业务", scaleEstimate: "规模", annualSalesEstimateUsd: null, employeeEstimate: null,
      isVerifiedCompany: "yes", verifiedCompanyReason: "依据", verifiedCompanyConfidence: 90,
      isGardenOutdoor: "uncertain", gardenOutdoorReason: "依据", gardenOutdoorConfidence: 70,
      salesOverOneMillion: "uncertain", salesReason: "依据", salesConfidence: 60,
      employeesOverTen: "no", employeesReason: "依据", employeesConfidence: 80,
      overallConfidence: 75, sources: [], researchNotes: "备注",
    }
    const fetchMock = vi.fn(async (_url: string, _request: RequestInit) => ({ ok: true, status: 200, json: async () => ({ output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(result) }] }] }) }))
    vi.stubGlobal("fetch", fetchMock)

    const researched = await researchCustomer({ companyName: "示例客户" })

    expect(researched).toMatchObject({ model: "configured-model", promptVersion: "shared-v7" })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, request] = fetchMock.mock.calls[0]!
    expect(url).toBe("https://llm.example.test/v1/responses")
    expect(JSON.parse(String(request.body))).toMatchObject({ model: "configured-model" })
  })
})
