import type { Request, Response } from "express"
import { z } from "zod"
import { exportOcrRecognitions, getOcrImage, getOcrRecognition, queryOcrRecognitions, recognizeExternalInvoice, recognizeExternalInvoicesBatch, recognizeOcr, removeOcrRecognition } from "../services/ocr-service.js"
import { ok, routeParam } from "../utils/http.js"
import { requestUser } from "../utils/request-context.js"

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const recognitionTypeSchema = z.enum(["PAYMENT", "INVOICE"])
const recognizeSchema = z.object({ recognitionType: recognitionTypeSchema, filename: z.string().trim().min(1).max(255), mimeType: z.enum(["application/pdf", "image/jpeg", "image/png", "image/webp"]), base64Data: z.string().min(4).max(14_000_000).regex(/^[A-Za-z0-9+/]+={0,2}$/) }).strict()
const querySchema = z.object({ recognitionType: recognitionTypeSchema, keyword: z.string().trim().max(100).optional(), startDate: dateSchema.optional(), endDate: dateSchema.optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20) })
const exportSchema = z.object({ recognitionType: recognitionTypeSchema, ids: z.array(z.string().uuid()).max(5000).optional(), startDate: dateSchema.optional(), endDate: dateSchema.optional() }).strict()
const externalInvoiceSchema = z.object({ filename: z.string().trim().min(1).max(255), mimeType: z.enum(["application/pdf", "image/jpeg", "image/png", "image/webp"]), base64Data: z.string().min(4).max(14_000_000).regex(/^[A-Za-z0-9+/]+={0,2}$/), clientRequestId: z.string().trim().min(1).max(100).optional() }).strict()

function externalActor(response: Response): string { return typeof response.locals.externalClientId === "string" ? response.locals.externalClientId : "external:unknown" }
export async function postExternalInvoiceRecognition(request: Request, response: Response): Promise<void> { ok(response, await recognizeExternalInvoice(externalActor(response), externalInvoiceSchema.parse(request.body)), "电子发票识别完成") }
export async function postExternalInvoiceBatchRecognition(request: Request, response: Response): Promise<void> { const body = z.object({ items: z.array(externalInvoiceSchema).min(1).max(10) }).strict().parse(request.body); ok(response, await recognizeExternalInvoicesBatch(externalActor(response), body), "批量电子发票识别完成") }

export async function postOcrRecognition(request: Request, response: Response): Promise<void> { const input = recognizeSchema.parse(request.body); ok(response, await recognizeOcr(requestUser(request).userId, input), input.recognitionType === "INVOICE" ? "发票识别完成" : "支付截图识别完成") }
export async function getOcrRecognitions(request: Request, response: Response): Promise<void> { ok(response, await queryOcrRecognitions(requestUser(request).userId, querySchema.parse(request.query))) }
export async function getOcrRecognitionController(request: Request, response: Response): Promise<void> { ok(response, await getOcrRecognition(requestUser(request).userId, recognitionTypeSchema.parse(request.query.recognitionType), z.string().uuid().parse(routeParam(request.params.id)))) }
export async function getOcrRecognitionImage(request: Request, response: Response): Promise<void> { const image = await getOcrImage(requestUser(request).userId, recognitionTypeSchema.parse(request.query.recognitionType), z.string().uuid().parse(routeParam(request.params.id))); response.type(image.mimeType).send(Buffer.from(image.data)) }
export async function deleteOcrRecognition(request: Request, response: Response): Promise<void> { await removeOcrRecognition(requestUser(request).userId, recognitionTypeSchema.parse(request.query.recognitionType), z.string().uuid().parse(routeParam(request.params.id))); ok(response, null, "识别记录已删除") }
export async function postOcrExport(request: Request, response: Response): Promise<void> { ok(response, await exportOcrRecognitions(requestUser(request).userId, exportSchema.parse(request.body)), "导出文件已生成") }
