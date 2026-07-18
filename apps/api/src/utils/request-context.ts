import type { Request } from "express"
import type { UserContext } from "../services/data-permission-service.js"

export interface ShellIdentity extends UserContext {
  userName: string
  permissions: string[]
}

export function requestUser(request: Request): UserContext {
  const userId = typeof request.headers["x-user-id"] === "string" ? request.headers["x-user-id"] : "anonymous"
  const departmentId = typeof request.headers["x-user-department-id"] === "string" ? request.headers["x-user-department-id"] : undefined
  return { userId, ...(departmentId ? { departmentId } : {}) }
}

export function shellIdentity(request: Request): ShellIdentity {
  const user = requestUser(request)
  const encodedName = request.headers["x-user-name"]
  const permissionHeader = request.headers["x-user-permissions"]
  return {
    ...user,
    userName: typeof encodedName === "string" ? decodeURIComponent(encodedName) : "匿名用户",
    permissions: typeof permissionHeader === "string"
      ? permissionHeader.split(",").filter(Boolean)
      : user.userId === "framework-user" ? ["*"] : ["dashboard:view"],
  }
}
