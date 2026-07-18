import "dotenv/config"
import express, { type NextFunction, type Request, type Response } from "express"
import cors from "cors"
import helmet from "helmet"
import { z } from "zod"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { ApiEnvelope, DocumentAction, DocumentQueryRequest } from "@zform/shared"
import { schemas } from "./schemas.js"
import { connectDatabase, disconnectDatabase, prisma } from "./database.js"
import { assessImpact, BusinessError, createDocument, executeAction, findDocument, getDashboard, getTrace, listActivities, listDocuments, pushDown, removeDocument, updateDocument } from "./document-service.js"
import { queryDocuments } from "./list-query-service.js"
import { getShellBootstrap, markAllNotificationsRead, markNotificationRead, saveSettings } from "./app-shell-service.js"

const app = express()
const port = Number(process.env.PORT || 3100)

app.use(helmet())
app.use(cors({ origin: process.env.CORS_ORIGIN || "http://localhost:5174" }))
app.use(express.json({ limit: "1mb" }))

function ok<T>(response: Response, data: T, message = "操作成功"): void {
  const body: ApiEnvelope<T> = { success: true, message, data }
  response.json(body)
}

const asyncHandler = (handler: (request: Request, response: Response, next: NextFunction) => Promise<void>) =>
  (request: Request, response: Response, next: NextFunction): void => { handler(request, response, next).catch(next) }

const routeParam = (value: string | string[]): string => Array.isArray(value) ? value[0] || "" : value
const requestUser = (request: Request) => {
  const userId = typeof request.headers["x-user-id"] === "string" ? request.headers["x-user-id"] : "anonymous"
  const departmentId = typeof request.headers["x-user-department-id"] === "string" ? request.headers["x-user-department-id"] : undefined
  return { userId, ...(departmentId ? { departmentId } : {}) }
}
const shellIdentity = (request: Request) => {
  const user = requestUser(request)
  const encodedName = request.headers["x-user-name"]
  const permissionHeader = request.headers["x-user-permissions"]
  return { ...user, userName: typeof encodedName === "string" ? decodeURIComponent(encodedName) : "匿名用户", permissions: typeof permissionHeader === "string" ? permissionHeader.split(",").filter(Boolean) : user.userId === "framework-user" ? ["*"] : ["dashboard:view"] }
}

app.get("/health", asyncHandler(async (_request, response) => {
  await prisma.$queryRaw`SELECT 1`
  ok(response, { status: "ok", database: "postgresql", timestamp: new Date().toISOString() })
}))
app.get("/api/schemas", (_request, response) => ok(response, schemas))
app.get("/api/shell/bootstrap", asyncHandler(async (request, response) => ok(response, await getShellBootstrap(shellIdentity(request)))))
app.put("/api/shell/settings", asyncHandler(async (request, response) => {
  const input = z.object({ theme: z.enum(["light", "system"]), compactMode: z.boolean(), sidebarCollapsed: z.boolean(), dashboardWidgetIds: z.array(z.enum(["metrics", "recent-documents", "business-distribution", "business-flow", "recent-activities"])), showGlobalStatusBar: z.boolean() }).parse(request.body)
  ok(response, await saveSettings(requestUser(request).userId, input), "用户设置已保存")
}))
app.post("/api/shell/notifications/read-all", asyncHandler(async (request, response) => { await markAllNotificationsRead(requestUser(request).userId); ok(response, null) }))
app.post("/api/shell/notifications/:id/read", asyncHandler(async (request, response) => { await markNotificationRead(requestUser(request).userId, routeParam(request.params.id)); ok(response, null) }))
app.get("/api/dashboard", asyncHandler(async (_request, response) => ok(response, await getDashboard())))
app.get("/api/activities", asyncHandler(async (request, response) => ok(response, await listActivities(request.query.documentId as string | undefined))))
app.get("/api/documents", asyncHandler(async (request, response) => {
  const result = await listDocuments({
    typeId: request.query.typeId as string, status: request.query.status as never, search: request.query.search as string,
    page: Number(request.query.page || 1), pageSize: Number(request.query.pageSize || 20),
    sortBy: request.query.sortBy as never, sortDirection: request.query.sortDirection as never,
  }, requestUser(request))
  ok(response, result)
}))
const filterConditionSchema = z.object({ columnId: z.string().min(1), operator: z.enum(["eq", "neq", "contains", "startsWith", "endsWith", "gt", "gte", "lt", "lte", "between", "in", "empty", "notEmpty"]), value: z.unknown().optional(), secondValue: z.unknown().optional() })
type FilterNode = z.infer<typeof filterConditionSchema> | { logic: "and" | "or"; conditions: FilterNode[] }
const filterNodeSchema: z.ZodType<FilterNode> = z.lazy(() => z.union([filterConditionSchema, z.object({ logic: z.enum(["and", "or"]), conditions: z.array(filterNodeSchema).max(30) })]))
app.post("/api/documents/query", asyncHandler(async (request, response) => {
  const input = z.object({ typeId: z.string().min(1), mode: z.enum(["document", "detail"]).optional(), detailTableId: z.string().optional(), search: z.string().max(200).optional(), filters: z.object({ logic: z.enum(["and", "or"]), conditions: z.array(filterNodeSchema).max(30) }).optional(), sorting: z.array(z.object({ columnId: z.string(), direction: z.enum(["asc", "desc"]) })).max(10).optional(), aggregateIds: z.array(z.string()).optional(), page: z.number().int().positive().optional(), pageSize: z.number().int().positive().max(100).optional() }).parse(request.body) as DocumentQueryRequest
  ok(response, await queryDocuments(input, requestUser(request)))
}))
app.get("/api/documents/:id", asyncHandler(async (request, response) => ok(response, await findDocument(routeParam(request.params.id)))))
app.get("/api/documents/:id/trace", asyncHandler(async (request, response) => ok(response, await getTrace(routeParam(request.params.id)))))
app.post("/api/documents/:id/impact", asyncHandler(async (request, response) => {
  const input = z.object({ masterData: z.record(z.unknown()) }).parse(request.body)
  ok(response, await assessImpact(routeParam(request.params.id), input.masterData))
}))
app.post("/api/documents", asyncHandler(async (request, response) => ok(response, await createDocument(request.body, request.headers), "单据已创建")))
app.put("/api/documents/:id", asyncHandler(async (request, response) => ok(response, await updateDocument(routeParam(request.params.id), request.body, request.headers), "单据已保存")))
app.delete("/api/documents/:id", asyncHandler(async (request, response) => { await removeDocument(routeParam(request.params.id)); ok(response, null, "单据已删除") }))
app.post("/api/documents/:id/actions/:action", asyncHandler(async (request, response) => {
  const action = z.enum(["submit", "approve", "reject", "complete", "cancel"]).parse(routeParam(request.params.action)) as DocumentAction
  ok(response, await executeAction(routeParam(request.params.id), action, request.headers, request.body?.comment), "流程操作成功")
}))
app.post("/api/documents/:id/push-down", asyncHandler(async (request, response) => {
  const input = z.object({ targetTypeId: z.string().min(1) }).parse(request.body)
  ok(response, await pushDown(routeParam(request.params.id), input.targetTypeId, request.headers), "下推成功")
}))

// 生产构建后由 API 同时托管管理端静态资源。
const webDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web/dist")
app.use(express.static(webDist))

app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  const statusCode = error instanceof BusinessError ? error.statusCode : error instanceof z.ZodError ? 400 : 500
  const message = error instanceof z.ZodError ? error.issues.map((issue) => issue.message).join("；") : error instanceof Error ? error.message : "服务器内部错误"
  if (statusCode === 500) console.error(error)
  response.status(statusCode).json({ success: false, message, data: null } satisfies ApiEnvelope<null>)
})

await connectDatabase()
const server = app.listen(port, () => console.log(`ZForm 服务已启动：http://localhost:${port}`))

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => server.close(() => { disconnectDatabase().finally(() => process.exit(0)) }))
}
