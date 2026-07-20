import { createHash, timingSafeEqual } from "node:crypto"
import type { RequestHandler } from "express"
import { BusinessError } from "../utils/business-error.js"

function configuredKeys(): string[] {
  return (process.env.EXTERNAL_API_KEYS || "").split(",").map((value) => value.trim()).filter(Boolean)
}

function suppliedKey(authorization: string | undefined, apiKey: string | undefined): string {
  if (apiKey?.trim()) return apiKey.trim()
  const match = authorization?.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || ""
}

function keyEquals(left: string, right: string): boolean {
  const leftDigest = createHash("sha256").update(left).digest()
  const rightDigest = createHash("sha256").update(right).digest()
  return timingSafeEqual(leftDigest, rightDigest)
}

export function authenticateExternalApiKey(authorization: string | undefined, apiKey: string | undefined): string {
  const keys = configuredKeys()
  if (!keys.length) throw new BusinessError("外部接口尚未配置 API Key。", 503)
  const candidate = suppliedKey(authorization, apiKey)
  if (!candidate || !keys.some((key) => keyEquals(candidate, key))) throw new BusinessError("API Key 无效。", 401)
  return `external:${createHash("sha256").update(candidate).digest("hex").slice(0, 12)}`
}

export const requireExternalApiKey: RequestHandler = (request, response, next) => {
  response.locals.externalClientId = authenticateExternalApiKey(request.header("authorization"), request.header("x-api-key"))
  next()
}
