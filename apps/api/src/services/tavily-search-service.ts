import { numberFromEnv } from "./llm-provider-config.js"

export interface CustomerWebSearchInput {
  companyName: string
  country?: string
  website?: string
  businessAddress?: string
}

export interface CustomerWebSearchResult {
  title: string
  url: string
  content: string
  score?: number
}

export interface CustomerWebEvidence {
  queries: string[]
  results: CustomerWebSearchResult[]
}

interface TavilyResponse {
  results?: Array<{ title?: unknown; url?: unknown; content?: unknown; score?: unknown }>
}

function searchQueries(input: CustomerWebSearchInput): string[] {
  const identity = [`"${input.companyName}"`, input.country, input.website, input.businessAddress].filter(Boolean).join(" ")
  return [
    `${identity} official website company registration`,
    `${identity} revenue employees company profile`,
    `${identity} garden outdoor furniture products`,
  ]
}

function parseResults(payload: TavilyResponse): CustomerWebSearchResult[] {
  return (payload.results || []).flatMap((item) => {
    if (typeof item.title !== "string" || typeof item.url !== "string" || typeof item.content !== "string") return []
    const score = typeof item.score === "number" ? item.score : undefined
    return [{ title: item.title.trim(), url: item.url.trim(), content: item.content.trim(), ...(score !== undefined ? { score } : {}) }]
  }).filter((item) => item.title && /^https?:\/\//i.test(item.url) && item.content)
}

export function formatCustomerWebEvidence(evidence: CustomerWebEvidence): string {
  return evidence.results.map((item, index) => `[${index + 1}] ${item.title}\nURL: ${item.url}\n摘要: ${item.content}`).join("\n\n").slice(0, 24_000)
}

export async function searchCustomerWeb(input: CustomerWebSearchInput, onProgress?: (message: string) => void): Promise<CustomerWebEvidence> {
  const apiKey = process.env.TAVILY_API_KEY?.trim()
  if (!apiKey) throw new Error("未配置 TAVILY_API_KEY，无法执行实时联网调查")
  const endpoint = (process.env.TAVILY_BASE_URL || "https://api.tavily.com").replace(/\/$/, "") + "/search"
  const searchDepth = process.env.TAVILY_SEARCH_DEPTH === "advanced" ? "advanced" : "basic"
  const maxResults = Math.max(1, Math.min(numberFromEnv("TAVILY_MAX_RESULTS", 5), 10))
  const timeoutMs = numberFromEnv("TAVILY_TIMEOUT_MS", 30_000)
  const queries = searchQueries(input)
  const resultsByUrl = new Map<string, CustomerWebSearchResult>()
  const failures: string[] = []

  for (const query of queries) {
    onProgress?.(`正在搜索：${query}\n`)
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ query, topic: "general", search_depth: searchDepth, max_results: maxResults, include_answer: false, include_raw_content: false }),
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}：${(await response.text()).slice(0, 200)}`)
      const found = parseResults(JSON.parse(await response.text()) as TavilyResponse)
      for (const item of found) {
        if (!resultsByUrl.has(item.url)) {
          resultsByUrl.set(item.url, item)
          onProgress?.(`• ${item.title}\n  ${item.url}\n`)
        }
      }
      onProgress?.(`本次找到 ${found.length} 条结果。\n\n`)
    } catch (error) {
      const message = error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name) ? `超过 ${Math.ceil(timeoutMs / 1000)} 秒` : error instanceof Error ? error.message : "未知错误"
      failures.push(`${query}：${message}`)
      onProgress?.(`搜索失败：${message}\n\n`)
    }
  }

  const results = [...resultsByUrl.values()].slice(0, 15)
  if (!results.length) throw new Error(`Tavily 未返回可用的公开信息${failures.length ? `：${failures.join("；").slice(0, 400)}` : ""}`)
  onProgress?.(`联网查询完成，共整理 ${results.length} 个不重复来源，正在交给模型分析。\n`)
  return { queries, results }
}
