export type LlmProviderMode = "responses" | "chat-json-schema" | "anthropic-json-prompt"

export interface LlmProviderConfig {
  provider: string
  apiKey: string
  model: string
  baseUrl: string
  mode: LlmProviderMode
  temperature: number
}

export function numberFromEnv(name: string, fallback: number): number {
  const value = Number(process.env[name])
  return Number.isFinite(value) ? value : fallback
}

export function configuredLlmProviders(): LlmProviderConfig[] {
  const configs: Record<string, LlmProviderConfig> = {
    openai: { provider: "openai", apiKey: process.env.OPENAI_API_KEY || "", model: process.env.OPENAI_MODEL || "gpt-4.1", baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1", mode: "responses", temperature: 0 },
    ark: { provider: "ark", apiKey: process.env.ARK_API_KEY || "", model: process.env.ARK_MODEL || "", baseUrl: process.env.ARK_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3", mode: "chat-json-schema", temperature: numberFromEnv("ARK_TEMPERATURE", 0.1) },
    kimi: { provider: "kimi", apiKey: process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY || "", model: process.env.KIMI_MODEL || process.env.MOONSHOT_MODEL || "kimi-k2-0711-preview", baseUrl: process.env.KIMI_BASE_URL || process.env.MOONSHOT_BASE_URL || "https://api.moonshot.cn/v1", mode: "chat-json-schema", temperature: numberFromEnv("KIMI_TEMPERATURE", 1) },
    minimax: { provider: "minimax", apiKey: process.env.MINIMAX_API_KEY || "", model: process.env.MINIMAX_MODEL || "MiniMax-M2.7", baseUrl: process.env.MINIMAX_BASE_URL || "https://api.minimax.io/anthropic", mode: "anthropic-json-prompt", temperature: numberFromEnv("MINIMAX_TEMPERATURE", 0.1) },
  }
  return (process.env.LLM_PROVIDER_ORDER || "openai").split(",").map((name) => configs[name.trim().toLowerCase()]).filter((item): item is LlmProviderConfig => Boolean(item))
}
