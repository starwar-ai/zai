import type { ErrorRequestHandler } from "express"
import type { ApiEnvelope } from "@zform/shared"
import { z } from "zod"
import { BusinessError } from "../utils/business-error.js"

export const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
  const statusCode = error instanceof BusinessError ? error.statusCode : error instanceof z.ZodError ? 400 : 500
  const message = error instanceof z.ZodError
    ? error.issues.map((issue) => issue.message).join("；")
    : error instanceof Error ? error.message : "服务器内部错误"
  if (statusCode === 500) console.error(error)
  response.status(statusCode).json({ success: false, message, data: null } satisfies ApiEnvelope<null>)
}
