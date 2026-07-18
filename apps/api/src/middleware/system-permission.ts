import type { RequestHandler } from "express"
import { assertAnySystemPermission, assertSystemPermission } from "../services/system-management-service.js"
import { requestUser } from "../utils/request-context.js"
import { asyncHandler } from "./async-handler.js"

export function requireSystemPermission(permission: string): RequestHandler {
  return asyncHandler(async (request, _response, next) => {
    await assertSystemPermission(requestUser(request).userId, permission)
    next()
  })
}

export function requireAnySystemPermission(permissions: string[]): RequestHandler {
  return asyncHandler(async (request, _response, next) => {
    await assertAnySystemPermission(requestUser(request).userId, permissions)
    next()
  })
}
