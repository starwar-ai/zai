import type { Response } from "express"
import type { ApiEnvelope } from "@zform/shared"

export function ok<T>(response: Response, data: T, message = "操作成功"): void {
  const body: ApiEnvelope<T> = { success: true, message, data }
  response.json(body)
}

export function routeParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0] || "" : value
}
