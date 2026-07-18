import type { Request, Response } from "express"
import type { DocumentAction } from "@zform/shared"
import { schemas } from "../documents/schemas.js"
import { documentActionSchema, documentImpactSchema, documentListSchema, documentQuerySchema, pushDownSchema } from "../documents/validators.js"
import { assessImpact, createDocument, executeAction, findDocument, getDashboard, getTrace, listActivities, listDocuments, pushDown, removeDocument, updateDocument } from "../services/document-service.js"
import { queryDocuments } from "../services/list-query-service.js"
import { ok, routeParam } from "../utils/http.js"
import { requestUser } from "../utils/request-context.js"

export function getSchemas(_request: Request, response: Response): void { ok(response, schemas) }
export async function dashboard(request: Request, response: Response): Promise<void> { ok(response, await getDashboard(requestUser(request))) }
export async function activities(request: Request, response: Response): Promise<void> { ok(response, await listActivities(requestUser(request), typeof request.query.documentId === "string" ? request.query.documentId : undefined)) }
export async function documents(request: Request, response: Response): Promise<void> { ok(response, await listDocuments(documentListSchema.parse(request.query), requestUser(request))) }
export async function query(request: Request, response: Response): Promise<void> { ok(response, await queryDocuments(documentQuerySchema.parse(request.body), requestUser(request))) }
export async function find(request: Request, response: Response): Promise<void> { ok(response, await findDocument(routeParam(request.params.id), requestUser(request))) }
export async function trace(request: Request, response: Response): Promise<void> { ok(response, await getTrace(routeParam(request.params.id), requestUser(request))) }
export async function impact(request: Request, response: Response): Promise<void> { ok(response, await assessImpact(routeParam(request.params.id), documentImpactSchema.parse(request.body).masterData, requestUser(request))) }
export async function create(request: Request, response: Response): Promise<void> { ok(response, await createDocument(request.body, request.headers), "单据已创建") }
export async function update(request: Request, response: Response): Promise<void> { ok(response, await updateDocument(routeParam(request.params.id), request.body, request.headers, requestUser(request)), "单据已保存") }
export async function remove(request: Request, response: Response): Promise<void> { await removeDocument(routeParam(request.params.id), requestUser(request)); ok(response, null, "单据已删除") }
export async function action(request: Request, response: Response): Promise<void> {
  const actionValue = documentActionSchema.parse(routeParam(request.params.action)) as DocumentAction
  ok(response, await executeAction(routeParam(request.params.id), actionValue, request.headers, requestUser(request), request.body?.comment), "流程操作成功")
}
export async function pushDownDocument(request: Request, response: Response): Promise<void> {
  const input = pushDownSchema.parse(request.body)
  ok(response, await pushDown(routeParam(request.params.id), input.targetTypeId, request.headers, requestUser(request)), "下推成功")
}
