import { Prisma, type OcrRecognition } from "@prisma/client"
import type { ListResponse, OcrExportRequest, OcrExportResult, OcrRecognitionQuery, OcrRecognitionRecord, OcrRecognizeRequest, OcrRecognizeResult } from "@zform/shared"
import { prisma } from "../database.js"
import { BusinessError } from "../utils/business-error.js"
import { createXlsx } from "../utils/xlsx.js"
import { recognizePaymentScreenshot } from "./ocr-provider.js"

function toRecord(row: OcrRecognition): OcrRecognitionRecord {
  return {
    id: row.id, originalFilename: row.originalFilename, mimeType: row.mimeType,
    status: row.status === "SUCCESS" ? "SUCCESS" : row.status === "FAILED" ? "FAILED" : "RECOGNIZING",
    ...(row.platform ? { platform: row.platform } : {}), ...(row.orderNo ? { orderNo: row.orderNo } : {}), ...(row.productName ? { productName: row.productName } : {}),
    ...(row.amount ? { amount: row.amount } : {}), ...(row.paymentTime ? { paymentTime: row.paymentTime } : {}), ...(row.paymentStatus ? { paymentStatus: row.paymentStatus } : {}),
    ...(row.paymentMethod ? { paymentMethod: row.paymentMethod } : {}), ...(row.receiver ? { receiver: row.receiver } : {}), ...(row.errorMessage ? { errorMessage: row.errorMessage } : {}),
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  }
}

function dateWhere(input: { startDate?: string; endDate?: string }): Prisma.DateTimeFilter | undefined {
  const value: Prisma.DateTimeFilter = {}
  if (input.startDate) value.gte = new Date(`${input.startDate}T00:00:00.000Z`)
  if (input.endDate) value.lte = new Date(`${input.endDate}T23:59:59.999Z`)
  return Object.keys(value).length ? value : undefined
}

export async function recognizeOcrPayment(userId: string, input: OcrRecognizeRequest): Promise<OcrRecognizeResult> {
  const imageData = Buffer.from(input.base64Data, "base64")
  if (!imageData.length) throw new BusinessError("图片内容为空。")
  if (imageData.length > 8 * 1024 * 1024) throw new BusinessError("单张图片不能超过 8MB。", 413)
  const created = await prisma.ocrRecognition.create({ data: { userId, originalFilename: input.filename, mimeType: input.mimeType, imageData, status: "RECOGNIZING" } })
  try {
    const recognized = await recognizePaymentScreenshot(input)
    const updated = await prisma.ocrRecognition.update({ where: { id: created.id }, data: { status: "SUCCESS", ...recognized.data, rawJson: recognized.raw as Prisma.InputJsonObject, model: recognized.model, errorMessage: null } })
    return { record: toRecord(updated), success: true }
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : "识别失败，请重试"
    const failed = await prisma.ocrRecognition.update({ where: { id: created.id }, data: { status: "FAILED", errorMessage: message.slice(0, 1000) } })
    return { record: toRecord(failed), success: false }
  }
}

export async function queryOcrRecognitions(userId: string, input: OcrRecognitionQuery): Promise<ListResponse<OcrRecognitionRecord>> {
  const page = input.page || 1; const pageSize = input.pageSize || 20
  const keyword = input.keyword?.trim()
  const createdAt = dateWhere(input)
  const where: Prisma.OcrRecognitionWhereInput = { userId, ...(createdAt ? { createdAt } : {}), ...(keyword ? { OR: ["platform", "orderNo", "productName", "amount", "receiver", "originalFilename"].map((field) => ({ [field]: { contains: keyword, mode: "insensitive" } })) } : {}) }
  const [items, total] = await Promise.all([prisma.ocrRecognition.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }), prisma.ocrRecognition.count({ where })])
  return { items: items.map(toRecord), total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) }
}

export async function getOcrRecognition(userId: string, id: string): Promise<OcrRecognitionRecord> {
  const record = await prisma.ocrRecognition.findFirst({ where: { id, userId } })
  if (!record) throw new BusinessError("识别记录不存在。", 404)
  return toRecord(record)
}

export async function getOcrImage(userId: string, id: string): Promise<{ mimeType: string; data: Uint8Array }> {
  const record = await prisma.ocrRecognition.findFirst({ where: { id, userId }, select: { mimeType: true, imageData: true } })
  if (!record) throw new BusinessError("识别图片不存在。", 404)
  return { mimeType: record.mimeType, data: record.imageData }
}

export async function removeOcrRecognition(userId: string, id: string): Promise<void> {
  const result = await prisma.ocrRecognition.deleteMany({ where: { id, userId } })
  if (!result.count) throw new BusinessError("识别记录不存在。", 404)
}

export async function exportOcrRecognitions(userId: string, input: OcrExportRequest): Promise<OcrExportResult> {
  const createdAt = dateWhere(input)
  const records = await prisma.ocrRecognition.findMany({ where: { userId, status: "SUCCESS", ...(input.ids?.length ? { id: { in: input.ids } } : {}), ...(createdAt ? { createdAt } : {}) }, orderBy: { createdAt: "desc" }, take: 5000 })
  const statusLabel = { SUCCESS: "识别成功", FAILED: "识别失败", RECOGNIZING: "识别中" }
  const rows: unknown[][] = [["序号", "平台", "订单号", "商品名称", "支付金额", "支付时间", "支付状态", "支付方式", "收款方", "识别状态", "文件名", "上传时间"], ...records.map((record, index) => [index + 1, record.platform, record.orderNo, record.productName, record.amount, record.paymentTime, record.paymentStatus, record.paymentMethod, record.receiver, statusLabel[record.status as keyof typeof statusLabel] || record.status, record.originalFilename, record.createdAt.toLocaleString("zh-CN")])]
  const buffer = createXlsx("支付记录", rows)
  return { base64: buffer.toString("base64"), filename: `支付记录_${new Date().toISOString().slice(0, 10)}.xlsx`, count: records.length }
}
