interface LlmErrorContext {
  provider: string
  model: string
  operation: string
}

const MAX_ERROR_DETAIL_LENGTH = 700

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function textValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function truncate(value: string): string {
  return value.length > MAX_ERROR_DETAIL_LENGTH ? `${value.slice(0, MAX_ERROR_DETAIL_LENGTH)}…` : value
}

/** 从不同大模型供应商的错误响应中提取可供排障的信息，但不透传完整的超长响应。 */
export async function llmHttpError(response: Response, context: LlmErrorContext): Promise<Error> {
  const responseText = (await response.text()).trim()
  let detail = responseText
  try {
    const payload = objectValue(JSON.parse(responseText) as unknown)
    const error = objectValue(payload?.error) || payload
    const message = textValue(error?.message) || textValue(error?.detail) || textValue(payload?.message)
    const type = textValue(error?.type)
    const code = textValue(error?.code)
    const param = textValue(error?.param)
    detail = [message, type && `类型：${type}`, code && `代码：${code}`, param && `参数：${param}`].filter(Boolean).join("；") || responseText
  } catch {
    // 非 JSON 响应（例如网关文本）仍保留其正文，便于定位供应商错误。
  }
  const requestId = response.headers?.get("x-request-id") || response.headers?.get("request-id") || response.headers?.get("x-tt-logid")
  const status = response.statusText ? `${response.status} ${response.statusText}` : String(response.status)
  const suffix = [detail && truncate(detail), requestId && `请求 ID：${requestId}`].filter(Boolean).join("；") || "供应商未返回错误详情"
  return new Error(`${context.provider} ${context.operation}失败（模型：${context.model}，HTTP ${status}）：${suffix}`)
}

export function llmNetworkError(reason: unknown, context: LlmErrorContext, timedOut: boolean): Error {
  const detail = reason instanceof Error && reason.message ? truncate(reason.message) : "未知网络错误"
  return new Error(`${context.provider} ${context.operation}${timedOut ? "请求超时" : "网络连接失败"}（模型：${context.model}）：${detail}`)
}
