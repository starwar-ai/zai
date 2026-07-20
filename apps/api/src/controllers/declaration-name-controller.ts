import type { Request, Response } from "express"
import { z } from "zod"
import { approveDeclarationName, convertExternalDeclarationName, generateDeclarationNames, getDeclarationNameJob, listDeclarationNameReviews, rejectDeclarationName, resolveDeclarationNames, writebackDeclarationNames } from "../services/declaration-name-service.js"
import { assertSystemPermission } from "../services/system-management-service.js"
import { ok, routeParam } from "../utils/http.js"
import { shellIdentity } from "../utils/request-context.js"

const itemSchema = z.object({ name: z.string().trim().min(1).max(255), nameEng: z.string().trim().min(1).max(255), shipmentItemId: z.string().trim().min(1).max(100).optional() })
const resolveSchema = z.object({ items: z.array(itemSchema).min(1).max(100), createMissing: z.boolean().optional() })
const approveSchema = z.object({ declarationName: z.string().trim().min(1).max(100).optional(), customsDeclarationNameEng: z.string().trim().min(1).max(100).optional() })
const rejectSchema = z.object({ reason: z.string().trim().min(1).max(500) })
const writebackSchema = z.object({ mappingIds: z.array(z.string().uuid()).max(1000).optional(), shipmentItemIds: z.array(z.string().trim().min(1).max(100)).max(1000).optional(), includeDeclarationItems: z.boolean().optional() })
const externalConvertSchema = z.object({
  name: z.string().trim().min(1, "中文商品名不能为空").max(255),
  nameEng: z.string().trim().min(1, "英文商品名不能为空").max(255),
  clientRequestId: z.string().trim().min(1).max(100).optional(),
}).strict()

export async function postExternalDeclarationNameConvert(request: Request, response: Response): Promise<void> {
  const actor = typeof response.locals.externalClientId === "string" ? response.locals.externalClientId : "external:unknown"
  ok(response, await convertExternalDeclarationName(externalConvertSchema.parse(request.body), actor), "报关品名转换完成")
}

export async function postDeclarationNameResolve(request: Request, response: Response): Promise<void> {
  const identity = shellIdentity(request)
  const body = resolveSchema.parse(request.body)
  if (body.createMissing !== false) await assertSystemPermission(identity.userId, "declaration-name:generate")
  ok(response, await resolveDeclarationNames(body, identity.userId))
}

export async function postDeclarationNameGenerate(request: Request, response: Response): Promise<void> {
  const identity = shellIdentity(request)
  const body = z.object({ items: z.array(itemSchema).min(1).max(100) }).parse(request.body)
  ok(response, await generateDeclarationNames(body.items, identity.userId), "生成任务已创建")
}

export async function getDeclarationNameJobController(request: Request, response: Response): Promise<void> {
  ok(response, await getDeclarationNameJob(z.string().uuid().parse(routeParam(request.params.id))))
}

export async function getDeclarationNameReviews(request: Request, response: Response): Promise<void> {
  const query = z.object({ keyword: z.string().trim().max(100).optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(200).default(50) }).parse(request.query)
  ok(response, await listDeclarationNameReviews(query))
}

export async function postDeclarationNameApprove(request: Request, response: Response): Promise<void> {
  const identity = shellIdentity(request)
  ok(response, await approveDeclarationName(z.string().uuid().parse(routeParam(request.params.id)), approveSchema.parse(request.body), identity.userName), "审核已通过")
}

export async function postDeclarationNameReject(request: Request, response: Response): Promise<void> {
  const identity = shellIdentity(request)
  ok(response, await rejectDeclarationName(z.string().uuid().parse(routeParam(request.params.id)), rejectSchema.parse(request.body), identity.userName), "映射已驳回")
}

export async function postDeclarationNameWriteback(request: Request, response: Response): Promise<void> {
  const identity = shellIdentity(request)
  ok(response, await writebackDeclarationNames(writebackSchema.parse(request.body), identity.userName), "已完成显式回写")
}
