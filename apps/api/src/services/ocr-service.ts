import { Prisma, type OcrRecognition } from "@prisma/client"
import type { ExternalInvoiceBatchItemResult, ExternalInvoiceBatchRecognizeRequest, ExternalInvoiceBatchRecognizeResult, ExternalInvoiceRecognizeRequest, ExternalInvoiceRecognizeResult, ListResponse, OcrExportRequest, OcrExportResult, OcrInvoiceItem, OcrRecognitionQuery, OcrRecognitionRecord, OcrRecognizeRequest, OcrRecognizeResult } from "@zform/shared"
import { prisma } from "../database.js"
import { BusinessError } from "../utils/business-error.js"
import { createXlsx } from "../utils/xlsx.js"
import { recognizeInvoice } from "./ocr-provider.js"
import { recognizePaymentScreenshot } from "./payment-ocr-provider.js"
import { extractInvoicePdf, qrInvoiceData, type InvoiceQrResult } from "./invoice-qr-service.js"

function invoiceItems(value: Prisma.JsonValue): OcrInvoiceItem[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => item && typeof item === "object" && !Array.isArray(item) ? [Object.fromEntries(Object.entries(item).filter((entry): entry is [string, string] => typeof entry[1] === "string")) as OcrInvoiceItem] : [])
}
function toRecord(row: OcrRecognition): OcrRecognitionRecord {
  return {
    id: row.id, recognitionType: row.recognitionType === "INVOICE" ? "INVOICE" : "PAYMENT", ...(row.extractionMethod === "QR" || row.extractionMethod === "AI" || row.extractionMethod === "HYBRID" ? { extractionMethod: row.extractionMethod } : {}), originalFilename: row.originalFilename, mimeType: row.mimeType,
    status: row.status === "SUCCESS" ? "SUCCESS" : row.status === "FAILED" ? "FAILED" : "RECOGNIZING",
    ...(row.invoiceType === "VAT_NORMAL" || row.invoiceType === "VAT_SPECIAL" ? { invoiceType: row.invoiceType } : {}),
    ...(row.invoiceNumber ? { invoiceNumber: row.invoiceNumber } : {}), ...(row.invoiceDate ? { invoiceDate: row.invoiceDate } : {}),
    ...(row.buyerName ? { buyerName: row.buyerName } : {}), ...(row.buyerTaxId ? { buyerTaxId: row.buyerTaxId } : {}),
    ...(row.sellerName ? { sellerName: row.sellerName } : {}), ...(row.sellerTaxId ? { sellerTaxId: row.sellerTaxId } : {}),
    ...(row.subtotal ? { subtotal: row.subtotal } : {}), ...(row.totalTax ? { totalTax: row.totalTax } : {}),
    ...(row.totalAmount ? { totalAmount: row.totalAmount } : {}), ...(row.totalAmountInWords ? { totalAmountInWords: row.totalAmountInWords } : {}),
    ...(row.remarks ? { remarks: row.remarks } : {}), ...(row.drawer ? { drawer: row.drawer } : {}), items: invoiceItems(row.invoiceItems),
    ...(row.platform ? { platform: row.platform } : {}), ...(row.orderNo ? { orderNo: row.orderNo } : {}), ...(row.productName ? { productName: row.productName } : {}),
    ...(row.amount ? { amount: row.amount } : {}), ...(row.paymentTime ? { paymentTime: row.paymentTime } : {}), ...(row.paymentStatus ? { paymentStatus: row.paymentStatus } : {}), ...(row.paymentMethod ? { paymentMethod: row.paymentMethod } : {}), ...(row.receiver ? { receiver: row.receiver } : {}),
    ...(row.errorMessage ? { errorMessage: row.errorMessage } : {}), createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  }
}
function dateWhere(input: { startDate?: string; endDate?: string }): Prisma.DateTimeFilter | undefined {
  const value: Prisma.DateTimeFilter = {}
  if (input.startDate) value.gte = new Date(`${input.startDate}T00:00:00.000Z`)
  if (input.endDate) value.lte = new Date(`${input.endDate}T23:59:59.999Z`)
  return Object.keys(value).length ? value : undefined
}

export async function recognizeOcr(userId: string, input: OcrRecognizeRequest): Promise<OcrRecognizeResult> {
  const fileData = Buffer.from(input.base64Data, "base64")
  if (!fileData.length) throw new BusinessError("文件内容为空。")
  if (fileData.length > 10 * 1024 * 1024) throw new BusinessError("单个文件不能超过 10MB。", 413)
  if (input.recognitionType === "PAYMENT" && input.mimeType === "application/pdf") throw new BusinessError("支付截图仅支持 JPG、PNG 或 WebP 图片。")
  const created = await prisma.ocrRecognition.create({ data: { userId, recognitionType: input.recognitionType, originalFilename: input.filename, mimeType: input.mimeType, imageData: fileData, status: "RECOGNIZING" } })
  try {
    let qr: InvoiceQrResult | null = null
    let pdfText: string | null = null
    const pdfExtraction = input.recognitionType === "INVOICE" && input.mimeType === "application/pdf" ? await extractInvoicePdf(new Uint8Array(fileData), true).catch(() => null) : null
    if (pdfExtraction) { qr = pdfExtraction.qr; pdfText = pdfExtraction.text }
    const recognized = input.recognitionType === "INVOICE" ? await recognizeInvoice(input, { ...(pdfText ? { pdfText } : {}), ...(qr ? { qrText: qr.rawText } : {}), ...(pdfExtraction?.pageImageBase64 ? { pageImageBase64: pdfExtraction.pageImageBase64 } : {}) }) : await recognizePaymentScreenshot(input)
    const sourceData = recognized.data
    const mergedData = qr && "items" in sourceData ? { ...sourceData, ...qrInvoiceData(qr), items: sourceData.items } : sourceData
    const data: Prisma.OcrRecognitionUpdateInput = "items" in mergedData
      ? (() => { const { items, ...headers } = mergedData; return { ...headers, invoiceItems: items as unknown as Prisma.InputJsonArray } })()
      : mergedData
    const extractionMethod = qr ? "HYBRID" : "AI"
    const qrMetadata = qr ? Object.fromEntries(Object.entries({ invoiceCode: qr.invoiceCode, invoiceNumber: qr.invoiceNumber, subtotal: qr.subtotal, invoiceDate: qr.invoiceDate, checkCode: qr.checkCode }).filter((entry) => entry[1] !== undefined)) : undefined
    const rawJson = { ...recognized.raw, ...(qrMetadata ? { qr: qrMetadata } : {}), ...(pdfText ? { pdfTextLength: pdfText.length } : {}) }
    const updated = await prisma.ocrRecognition.update({ where: { id: created.id }, data: { status: "SUCCESS", extractionMethod, ...(qr ? { qrRawText: qr.rawText.slice(0, 1000) } : {}), ...data, rawJson: rawJson as Prisma.InputJsonObject, model: recognized.model, errorMessage: null } })
    return { record: toRecord(updated), success: true }
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : "识别失败，请重试"
    const failed = await prisma.ocrRecognition.update({ where: { id: created.id }, data: { status: "FAILED", errorMessage: message.slice(0, 1000) } })
    return { record: toRecord(failed), success: false }
  }
}

export async function recognizeExternalInvoice(actor: string, input: ExternalInvoiceRecognizeRequest): Promise<ExternalInvoiceRecognizeResult> {
  const result = await recognizeOcr(actor, { recognitionType: "INVOICE", filename: input.filename, mimeType: input.mimeType, base64Data: input.base64Data })
  if (!result.success) throw new BusinessError(result.record.errorMessage || "电子发票识别失败。", 422)
  return {
    recognitionId: result.record.id, originalFilename: result.record.originalFilename,
    ...(result.record.invoiceType ? { invoiceType: result.record.invoiceType } : {}),
    ...(result.record.extractionMethod ? { extractionMethod: result.record.extractionMethod } : {}),
    ...(input.clientRequestId ? { clientRequestId: input.clientRequestId } : {}),
    ...(result.record.invoiceNumber ? { invoiceNumber: result.record.invoiceNumber } : {}), ...(result.record.invoiceDate ? { invoiceDate: result.record.invoiceDate } : {}),
    ...(result.record.buyerName ? { buyerName: result.record.buyerName } : {}), ...(result.record.buyerTaxId ? { buyerTaxId: result.record.buyerTaxId } : {}),
    ...(result.record.sellerName ? { sellerName: result.record.sellerName } : {}), ...(result.record.sellerTaxId ? { sellerTaxId: result.record.sellerTaxId } : {}),
    ...(result.record.subtotal ? { subtotal: result.record.subtotal } : {}), ...(result.record.totalTax ? { totalTax: result.record.totalTax } : {}),
    ...(result.record.totalAmount ? { totalAmount: result.record.totalAmount } : {}), ...(result.record.totalAmountInWords ? { totalAmountInWords: result.record.totalAmountInWords } : {}),
    ...(result.record.remarks ? { remarks: result.record.remarks } : {}), ...(result.record.drawer ? { drawer: result.record.drawer } : {}), items: result.record.items,
  }
}

export async function recognizeExternalInvoicesBatch(actor: string, input: ExternalInvoiceBatchRecognizeRequest): Promise<ExternalInvoiceBatchRecognizeResult> {
  const items = new Array<ExternalInvoiceBatchItemResult>(input.items.length); let cursor = 0
  const worker = async (): Promise<void> => { while (cursor < input.items.length) { const index = cursor; cursor += 1; const item = input.items[index]!; try { const data = await recognizeExternalInvoice(actor, item); items[index] = { index, success: true, ...(item.clientRequestId ? { clientRequestId: item.clientRequestId } : {}), data } } catch (reason) { items[index] = { index, success: false, filename: item.filename, ...(item.clientRequestId ? { clientRequestId: item.clientRequestId } : {}), error: reason instanceof Error ? reason.message : "电子发票识别失败" } } } }
  await Promise.all(Array.from({ length: Math.min(2, input.items.length) }, () => worker()))
  const successCount = items.filter((item) => item.success).length
  return { totalCount: items.length, successCount, failedCount: items.length - successCount, items }
}

export async function queryOcrRecognitions(userId: string, input: OcrRecognitionQuery): Promise<ListResponse<OcrRecognitionRecord>> {
  const page = input.page || 1; const pageSize = input.pageSize || 20; const keyword = input.keyword?.trim(); const createdAt = dateWhere(input)
  const fields = input.recognitionType === "INVOICE" ? ["invoiceType", "invoiceNumber", "buyerName", "buyerTaxId", "sellerName", "sellerTaxId", "totalAmount", "originalFilename"] : ["platform", "orderNo", "productName", "amount", "receiver", "originalFilename"]
  const keywordFilters: Prisma.OcrRecognitionWhereInput[] = keyword ? fields.map((field) => ({ [field]: { contains: keyword, mode: "insensitive" } })) : []
  if (input.recognitionType === "INVOICE" && keyword?.includes("专用")) keywordFilters.push({ invoiceType: "VAT_SPECIAL" })
  if (input.recognitionType === "INVOICE" && keyword?.includes("普通")) keywordFilters.push({ invoiceType: "VAT_NORMAL" })
  const where: Prisma.OcrRecognitionWhereInput = { userId, recognitionType: input.recognitionType, ...(createdAt ? { createdAt } : {}), ...(keywordFilters.length ? { OR: keywordFilters } : {}) }
  const [items, total] = await Promise.all([prisma.ocrRecognition.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }), prisma.ocrRecognition.count({ where })])
  return { items: items.map(toRecord), total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) }
}
export async function getOcrRecognition(userId: string, recognitionType: "PAYMENT" | "INVOICE", id: string): Promise<OcrRecognitionRecord> { const row = await prisma.ocrRecognition.findFirst({ where: { id, userId, recognitionType } }); if (!row) throw new BusinessError("识别记录不存在。", 404); return toRecord(row) }
export async function getOcrImage(userId: string, recognitionType: "PAYMENT" | "INVOICE", id: string): Promise<{ mimeType: string; data: Uint8Array }> { const row = await prisma.ocrRecognition.findFirst({ where: { id, userId, recognitionType }, select: { mimeType: true, imageData: true } }); if (!row) throw new BusinessError("识别文件不存在。", 404); return { mimeType: row.mimeType, data: row.imageData } }
export async function removeOcrRecognition(userId: string, recognitionType: "PAYMENT" | "INVOICE", id: string): Promise<void> { const result = await prisma.ocrRecognition.deleteMany({ where: { id, userId, recognitionType } }); if (!result.count) throw new BusinessError("识别记录不存在。", 404) }

export async function exportOcrRecognitions(userId: string, input: OcrExportRequest): Promise<OcrExportResult> {
  const createdAt = dateWhere(input)
  const records = await prisma.ocrRecognition.findMany({ where: { userId, recognitionType: input.recognitionType, status: "SUCCESS", ...(input.ids?.length ? { id: { in: input.ids } } : {}), ...(createdAt ? { createdAt } : {}) }, orderBy: { createdAt: "desc" }, take: 5000 })
  const invoice = input.recognitionType === "INVOICE"
  const invoiceRows = records.flatMap((row, recordIndex) => {
    const items = invoiceItems(row.invoiceItems)
    const exportItems: Array<OcrInvoiceItem | undefined> = items.length ? items : [undefined]
    return exportItems.map((item, itemIndex) => [
      recordIndex + 1, itemIndex + 1, row.invoiceType === "VAT_SPECIAL" ? "增值税专用发票" : row.invoiceType === "VAT_NORMAL" ? "普通发票" : undefined, row.invoiceNumber, row.invoiceDate,
      row.buyerName, row.buyerTaxId, row.sellerName, row.sellerTaxId,
      item?.itemName, item?.specification, item?.unit, item?.quantity,
      item?.unitPrice, item?.amount, item?.taxRate, item?.taxAmount,
      row.subtotal, row.totalTax, row.totalAmount, row.totalAmountInWords,
      row.drawer, row.remarks, row.originalFilename, row.createdAt.toLocaleString("zh-CN"),
    ])
  })
  const rows: unknown[][] = invoice ? [["发票序号", "明细序号", "发票类型", "发票号码", "开票日期", "购买方", "购买方税号", "销售方", "销售方税号", "商品名称", "规格型号", "单位", "数量", "单价", "明细金额", "税率", "明细税额", "金额合计", "税额合计", "价税合计", "价税合计（大写）", "开票人", "备注", "文件名", "识别时间"], ...invoiceRows] : [["序号", "平台", "订单号", "商品名称", "支付金额", "支付时间", "支付状态", "支付方式", "收款方", "文件名", "识别时间"], ...records.map((row, index) => [index + 1, row.platform, row.orderNo, row.productName, row.amount, row.paymentTime, row.paymentStatus, row.paymentMethod, row.receiver, row.originalFilename, row.createdAt.toLocaleString("zh-CN")])]
  const label = invoice ? "电子发票识别" : "支付截图识别"; const buffer = createXlsx(label, rows)
  return { base64: buffer.toString("base64"), filename: `${label}_${new Date().toISOString().slice(0, 10)}.xlsx`, count: records.length }
}
