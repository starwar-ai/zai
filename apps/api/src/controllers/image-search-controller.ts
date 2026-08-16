import type { Request, Response } from "express"
import { z } from "zod"
import { getImageSearchAssetImage, getImageSearchQueryImage, indexImageSearchAsset, indexPendingImageSearchAssets, queryImageSearchAssets, queryImageSearchHistory, removeImageSearchAsset, removeImageSearchHistory, searchByImage, searchExternalByImage, uploadImageSearchAsset } from "../services/image-search-service.js"
import { ok, routeParam } from "../utils/http.js"
import { requestUser } from "../utils/request-context.js"

const mimeTypeSchema = z.enum(["image/jpeg", "image/png", "image/webp"])
const base64Schema = z.string().min(4).max(14_000_000).regex(/^[A-Za-z0-9+/]+={0,2}$/)
const uploadSchema = z.object({ title: z.string().trim().min(1).max(255), filename: z.string().trim().min(1).max(255), mimeType: mimeTypeSchema, base64Data: base64Schema, tags: z.array(z.string().trim().min(1).max(40)).max(20).optional() }).strict()
const searchSchema = z.object({ filename: z.string().trim().min(1).max(255), mimeType: mimeTypeSchema, base64Data: base64Schema, topK: z.number().int().min(1).max(50).default(12) }).strict()
const externalSearchSchema = z.object({ filename: z.string().trim().min(1).max(255), mimeType: mimeTypeSchema, base64Data: base64Schema, topK: z.number().int().min(1).max(50).default(12), clientRequestId: z.string().trim().min(1).max(100).optional() }).strict()
const assetQuerySchema = z.object({ keyword: z.string().trim().max(100).optional(), indexed: z.enum(["true", "false"]).transform((value) => value === "true").optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(24) })
const historyQuerySchema = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20) })

export async function postImageSearchAsset(request: Request, response: Response): Promise<void> { ok(response, await uploadImageSearchAsset(requestUser(request), uploadSchema.parse(request.body)), "图片已加入图库") }
export async function getImageSearchAssets(request: Request, response: Response): Promise<void> { ok(response, await queryImageSearchAssets(assetQuerySchema.parse(request.query))) }
export async function getImageSearchAssetFile(request: Request, response: Response): Promise<void> { const image = await getImageSearchAssetImage(z.string().uuid().parse(routeParam(request.params.id))); response.type(image.mimeType).send(Buffer.from(image.data)) }
export async function deleteImageSearchAsset(request: Request, response: Response): Promise<void> { await removeImageSearchAsset(z.string().uuid().parse(routeParam(request.params.id))); ok(response, null, "图库图片已删除") }
export async function postIndexImageSearchAsset(request: Request, response: Response): Promise<void> { ok(response, await indexImageSearchAsset(z.string().uuid().parse(routeParam(request.params.id))), "图片索引已生成") }
export async function postIndexPendingImageSearchAssets(request: Request, response: Response): Promise<void> { const input = z.object({ limit: z.number().int().min(1).max(50).default(20) }).strict().parse(request.body || {}); ok(response, await indexPendingImageSearchAssets(input.limit), "待索引图片处理完成") }
export async function postSearchByImage(request: Request, response: Response): Promise<void> { ok(response, await searchByImage(requestUser(request).userId, searchSchema.parse(request.body)), "以图搜图完成") }
export async function getImageSearchHistory(request: Request, response: Response): Promise<void> { const input = historyQuerySchema.parse(request.query); ok(response, await queryImageSearchHistory(requestUser(request).userId, input.page, input.pageSize)) }
export async function getImageSearchQueryFile(request: Request, response: Response): Promise<void> { const image = await getImageSearchQueryImage(requestUser(request).userId, z.string().uuid().parse(routeParam(request.params.id))); response.type(image.mimeType).send(Buffer.from(image.data)) }
export async function deleteImageSearchHistory(request: Request, response: Response): Promise<void> { await removeImageSearchHistory(requestUser(request).userId, z.string().uuid().parse(routeParam(request.params.id))); ok(response, null, "搜索记录已删除") }
export async function postExternalImageSearch(request: Request, response: Response): Promise<void> { const actor = typeof response.locals.externalClientId === "string" ? response.locals.externalClientId : "external:unknown"; ok(response, await searchExternalByImage(actor, externalSearchSchema.parse(request.body)), "以图搜图完成") }
export async function getExternalImageSearchAssetFile(request: Request, response: Response): Promise<void> { const image = await getImageSearchAssetImage(z.string().uuid().parse(routeParam(request.params.id))); response.type(image.mimeType).send(Buffer.from(image.data)) }
