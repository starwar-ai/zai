import { afterEach, describe, expect, it, vi } from "vitest"
import { formatCustomerWebEvidence, searchCustomerWeb } from "./tavily-search-service.js"

const original = {
  apiKey: process.env.TAVILY_API_KEY,
  baseUrl: process.env.TAVILY_BASE_URL,
  maxResults: process.env.TAVILY_MAX_RESULTS,
  timeout: process.env.TAVILY_TIMEOUT_MS,
}

afterEach(() => {
  for (const [name, value] of Object.entries({ TAVILY_API_KEY: original.apiKey, TAVILY_BASE_URL: original.baseUrl, TAVILY_MAX_RESULTS: original.maxResults, TAVILY_TIMEOUT_MS: original.timeout })) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
  vi.unstubAllGlobals()
})

describe("Tavily customer web search", () => {
  it("runs multiple searches, deduplicates URLs and emits progress", async () => {
    process.env.TAVILY_API_KEY = "test-key"
    process.env.TAVILY_BASE_URL = "https://search.example.test/"
    const fetchMock = vi.fn(async (_url: string, _request: RequestInit) => new Response(JSON.stringify({ results: [{ title: "Example", url: "https://example.test/about", content: "Company profile", score: 0.9 }] }), { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)
    const progress: string[] = []

    const evidence = await searchCustomerWeb({ companyName: "示例公司", country: "中国", website: "example.test" }, (message) => progress.push(message))

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(evidence.results).toHaveLength(1)
    expect(progress.join("")).toContain("正在搜索")
    const [url, request] = fetchMock.mock.calls[0]!
    expect(url).toBe("https://search.example.test/search")
    expect(request.headers).toMatchObject({ authorization: "Bearer test-key" })
    expect(String(request.body)).not.toContain("test-key")
    expect(String(request.body)).toContain("example.test")
    expect(formatCustomerWebEvidence(evidence)).toContain("URL: https://example.test/about")
  })

  it("requires a configured API key", async () => {
    delete process.env.TAVILY_API_KEY
    await expect(searchCustomerWeb({ companyName: "示例公司" })).rejects.toThrow("TAVILY_API_KEY")
  })
})
