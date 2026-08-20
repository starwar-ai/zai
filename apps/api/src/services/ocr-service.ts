import { Prisma, type OcrRecognition } from "@prisma/client"
import type { ExternalInvoiceBatchItemResult, ExternalInvoiceBatchRecognizeRequest, ExternalInvoiceBatchRecognizeResult, ExternalInvoiceRecognizeRequest, ExternalInvoiceRecognizeResult, ExternalNavigationRouteBatchItemResult, ExternalNavigationRouteBatchRecognizeRequest, ExternalNavigationRouteBatchRecognizeResult, ExternalNavigationRouteRecognizeRequest, ExternalNavigationRouteRecognizeResult, ExternalPaymentBatchItemResult, ExternalPaymentBatchRecognizeRequest, ExternalPaymentBatchRecognizeResult, ExternalPaymentRecognizeRequest, ExternalPaymentRecognizeResult, ExternalTrainTicketBatchItemResult, ExternalTrainTicketBatchRecognizeRequest, ExternalTrainTicketBatchRecognizeResult, ExternalTrainTicketRecognizeRequest, ExternalTrainTicketRecognizeResult, ListResponse, OcrBusinessCardUpdateRequest, OcrExportRequest, OcrExportResult, OcrInvoiceItem, OcrModelInfo, OcrRecognitionQuery, OcrRecognitionRecord, OcrRecognitionType, OcrRecognizeRequest, OcrRecognizeResult, OcrRouteData } from "@zform/shared"
import { prisma } from "../database.js"
import { BusinessError } from "../utils/business-error.js"
import { createXlsx } from "../utils/xlsx.js"
import { invoiceModelInfo, recognizeInvoice } from "./ocr-provider.js"
import { recognizePaymentScreenshot } from "./payment-ocr-provider.js"
import { recognizeNavigationRoute } from "./route-ocr-provider.js"
import { extractInvoicePdf, qrInvoiceData, type InvoiceQrResult } from "./invoice-qr-service.js"
import { extractInvoiceTextFromPdf } from "./invoice-qr-service.js"
import { assertTrainTicketText, parseTrainTicketText } from "./train-ticket-parser.js"
import { recognizeTrainTicketText } from "./train-ticket-ocr-provider.js"
import { recognizeBusinessCard } from "./business-card-ocr-provider.js"

function invoiceItems(value: Prisma.JsonValue): OcrInvoiceItem[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => item && typeof item === "object" && !Array.isArray(item) ? [Object.fromEntries(Object.entries(item).filter((entry): entry is [string, string] => typeof entry[1] === "string")) as OcrInvoiceItem] : [])
}
function routeWaypoints(value: Prisma.JsonValue): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [] }
function toRecord(row: OcrRecognition): OcrRecognitionRecord {
  return {
    id: row.id, recognitionType: row.recognitionType === "INVOICE" ? "INVOICE" : row.recognitionType === "NAVIGATION_ROUTE" ? "NAVIGATION_ROUTE" : row.recognitionType === "TRAIN_TICKET" ? "TRAIN_TICKET" : row.recognitionType === "BUSINESS_CARD" ? "BUSINESS_CARD" : "PAYMENT", ...(row.extractionMethod === "QR" || row.extractionMethod === "AI" || row.extractionMethod === "HYBRID" || row.extractionMethod === "PDF_TEXT" || row.extractionMethod === "PDF_TEXT_AI" ? { extractionMethod: row.extractionMethod } : {}), originalFilename: row.originalFilename, mimeType: row.mimeType,
    status: row.status === "SUCCESS" ? "SUCCESS" : row.status === "FAILED" ? "FAILED" : "RECOGNIZING",
    ...(row.invoiceType === "VAT_NORMAL" || row.invoiceType === "VAT_SPECIAL" ? { invoiceType: row.invoiceType } : {}),
    ...(row.invoiceCategory === "STANDARD" || row.invoiceCategory === "TOLL" ? { invoiceCategory: row.invoiceCategory } : {}),
    ...(row.invoiceNumber ? { invoiceNumber: row.invoiceNumber } : {}), ...(row.invoiceDate ? { invoiceDate: row.invoiceDate } : {}),
    ...(row.buyerName ? { buyerName: row.buyerName } : {}), ...(row.buyerTaxId ? { buyerTaxId: row.buyerTaxId } : {}),
    ...(row.sellerName ? { sellerName: row.sellerName } : {}), ...(row.sellerTaxId ? { sellerTaxId: row.sellerTaxId } : {}),
    ...(row.subtotal ? { subtotal: row.subtotal } : {}), ...(row.totalTax ? { totalTax: row.totalTax } : {}),
    ...(row.totalAmount ? { totalAmount: row.totalAmount } : {}), ...(row.totalAmountInWords ? { totalAmountInWords: row.totalAmountInWords } : {}),
    ...(row.remarks ? { remarks: row.remarks } : {}), ...(row.drawer ? { drawer: row.drawer } : {}),
    ...(row.vehiclePlate ? { vehiclePlate: row.vehiclePlate } : {}), ...(row.vehicleType ? { vehicleType: row.vehicleType } : {}), ...(row.tollAmount ? { tollAmount: row.tollAmount } : {}), ...(row.tollDate ? { tollDate: row.tollDate } : {}),
    items: invoiceItems(row.invoiceItems), waypoints: routeWaypoints(row.waypoints),
    ...(row.platform ? { platform: row.platform } : {}), ...(row.orderNo ? { orderNo: row.orderNo } : {}), ...(row.productName ? { productName: row.productName } : {}),
    ...(row.amount ? { amount: row.amount } : {}), ...(row.paymentTime ? { paymentTime: row.paymentTime } : {}), ...(row.paymentStatus ? { paymentStatus: row.paymentStatus } : {}), ...(row.paymentMethod ? { paymentMethod: row.paymentMethod } : {}), ...(row.receiver ? { receiver: row.receiver } : {}),
    ...(row.routeResultStatus === "success" || row.routeResultStatus === "uncertain" || row.routeResultStatus === "not_found" ? { routeResultStatus: row.routeResultStatus } : {}),
    ...(row.distanceKm !== null ? { distanceKm: Number(row.distanceKm) } : {}), ...(row.tollYuan !== null ? { tollYuan: Number(row.tollYuan) } : {}),
    ...(row.destination ? { destination: row.destination } : {}), ...(row.confidence !== null ? { confidence: Number(row.confidence) } : {}), ...(row.selectedRouteEvidence ? { selectedRouteEvidence: row.selectedRouteEvidence } : {}),
    ...(row.trainInvoiceNo ? { trainInvoiceNo: row.trainInvoiceNo } : {}), ...(row.trainIssueDate ? { trainIssueDate: row.trainIssueDate } : {}),
    ...(row.departureStation ? { departureStation: row.departureStation } : {}), ...(row.arrivalStation ? { arrivalStation: row.arrivalStation } : {}), ...(row.trainNo ? { trainNo: row.trainNo } : {}),
    ...(row.departureDate ? { departureDate: row.departureDate } : {}), ...(row.departureTime ? { departureTime: row.departureTime } : {}), ...(row.seatNo ? { seatNo: row.seatNo } : {}), ...(row.seatClass ? { seatClass: row.seatClass } : {}),
    ...(row.ticketPrice ? { ticketPrice: row.ticketPrice } : {}), ...(row.passengerId ? { passengerId: row.passengerId } : {}), ...(row.passengerName ? { passengerName: row.passengerName } : {}), ...(row.ticketNo ? { ticketNo: row.ticketNo } : {}),
    ...(row.trainBuyerName ? { trainBuyerName: row.trainBuyerName } : {}), ...(row.trainBuyerCreditCode ? { trainBuyerCreditCode: row.trainBuyerCreditCode } : {}),
    ...(row.companyName ? { companyName: row.companyName } : {}), ...(row.contactName ? { contactName: row.contactName } : {}), ...(row.jobTitle ? { jobTitle: row.jobTitle } : {}),
    ...(row.phone ? { phone: row.phone } : {}), ...(row.email ? { email: row.email } : {}), ...(row.address ? { address: row.address } : {}), ...(row.website ? { website: row.website } : {}),
    ...(row.errorMessage ? { errorMessage: row.errorMessage } : {}), createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  }
}
function dateWhere(input: { startDate?: string; endDate?: string }): Prisma.DateTimeFilter | undefined {
  const value: Prisma.DateTimeFilter = {}
  if (input.startDate) value.gte = new Date(`${input.startDate}T00:00:00.000Z`)
  if (input.endDate) value.lte = new Date(`${input.endDate}T23:59:59.999Z`)
  return Object.keys(value).length ? value : undefined
}

export function getInvoiceOcrModelInfo(): OcrModelInfo { return invoiceModelInfo() }

export async function recognizeOcr(userId: string, input: OcrRecognizeRequest): Promise<OcrRecognizeResult> {
  const fileData = Buffer.from(input.base64Data, "base64")
  if (!fileData.length) throw new BusinessError("文件内容为空。")
  if (fileData.length > 10 * 1024 * 1024) throw new BusinessError("单个文件不能超过 10MB。", 413)
  if (input.recognitionType === "TRAIN_TICKET" && input.mimeType !== "application/pdf") throw new BusinessError("火车票识别仅支持 PDF 格式的铁路电子客票。")
  if (input.recognitionType !== "INVOICE" && input.recognitionType !== "TRAIN_TICKET" && input.mimeType === "application/pdf") throw new BusinessError(input.recognitionType === "NAVIGATION_ROUTE" ? "导航截图仅支持 JPG、PNG 或 WebP 图片。" : input.recognitionType === "BUSINESS_CARD" ? "供应商名片仅支持 JPG、PNG 或 WebP 图片。" : "支付截图仅支持 JPG、PNG 或 WebP 图片。")
  const created = await prisma.ocrRecognition.create({ data: { userId, recognitionType: input.recognitionType, originalFilename: input.filename, mimeType: input.mimeType, imageData: fileData, status: "RECOGNIZING" } })
  try {
    if (input.recognitionType === "TRAIN_TICKET") {
      const rawText = await extractInvoiceTextFromPdf(new Uint8Array(fileData))
      if (!rawText) throw new Error("无法从 PDF 中提取文本，请确认文件不是扫描件且包含可选择的文字")
      const trainTicket = parseTrainTicketText(rawText)
      assertTrainTicketText(rawText, trainTicket)
      const recognized = await recognizeTrainTicketText(rawText)
      const data = { ...trainTicket, ...recognized.data }
      assertTrainTicketText(rawText, data)
      const updated = await prisma.ocrRecognition.update({ where: { id: created.id }, data: { status: "SUCCESS", extractionMethod: "PDF_TEXT_AI", ...data, rawJson: { ...recognized.raw, parser: "pdfjs-regex-v1", textLength: rawText.length }, model: recognized.model, errorMessage: null } })
      return { record: toRecord(updated), success: true }
    }
    let qr: InvoiceQrResult | null = null
    let pdfText: string | null = null
    const pdfExtraction = input.recognitionType === "INVOICE" && input.mimeType === "application/pdf" ? await extractInvoicePdf(new Uint8Array(fileData), true).catch(() => null) : null
    if (pdfExtraction) { qr = pdfExtraction.qr; pdfText = pdfExtraction.text }
    const recognized = input.recognitionType === "INVOICE"
      ? await recognizeInvoice(input, { ...(pdfText ? { pdfText } : {}), ...(qr ? { qrText: qr.rawText } : {}), ...(pdfExtraction?.pageImageBase64 ? { pageImageBase64: pdfExtraction.pageImageBase64 } : {}) })
      : input.recognitionType === "NAVIGATION_ROUTE" ? await recognizeNavigationRoute(input)
        : input.recognitionType === "BUSINESS_CARD" ? await recognizeBusinessCard(input) : await recognizePaymentScreenshot(input)
    const sourceData = recognized.data
    const mergedData = qr && "items" in sourceData ? { ...sourceData, ...qrInvoiceData(qr), items: sourceData.items } : sourceData
    const data: Prisma.OcrRecognitionUpdateInput = "items" in mergedData
      ? (() => { const { items, ...headers } = mergedData; return { ...headers, invoiceItems: items as unknown as Prisma.InputJsonArray } })()
      : "waypoints" in mergedData
        ? (() => { const { waypoints, ...route } = mergedData as OcrRouteData; return { ...route, waypoints: waypoints as Prisma.InputJsonArray } })()
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
    ...(result.record.invoiceCategory ? { invoiceCategory: result.record.invoiceCategory } : {}),
    ...(result.record.extractionMethod ? { extractionMethod: result.record.extractionMethod } : {}),
    ...(input.clientRequestId ? { clientRequestId: input.clientRequestId } : {}),
    ...(result.record.invoiceNumber ? { invoiceNumber: result.record.invoiceNumber } : {}), ...(result.record.invoiceDate ? { invoiceDate: result.record.invoiceDate } : {}),
    ...(result.record.buyerName ? { buyerName: result.record.buyerName } : {}), ...(result.record.buyerTaxId ? { buyerTaxId: result.record.buyerTaxId } : {}),
    ...(result.record.sellerName ? { sellerName: result.record.sellerName } : {}), ...(result.record.sellerTaxId ? { sellerTaxId: result.record.sellerTaxId } : {}),
    ...(result.record.subtotal ? { subtotal: result.record.subtotal } : {}), ...(result.record.totalTax ? { totalTax: result.record.totalTax } : {}),
    ...(result.record.totalAmount ? { totalAmount: result.record.totalAmount } : {}), ...(result.record.totalAmountInWords ? { totalAmountInWords: result.record.totalAmountInWords } : {}),
    ...(result.record.remarks ? { remarks: result.record.remarks } : {}), ...(result.record.drawer ? { drawer: result.record.drawer } : {}),
    ...(result.record.vehiclePlate ? { vehiclePlate: result.record.vehiclePlate } : {}), ...(result.record.vehicleType ? { vehicleType: result.record.vehicleType } : {}),
    ...(result.record.tollAmount ? { tollAmount: result.record.tollAmount } : {}), ...(result.record.tollDate ? { tollDate: result.record.tollDate } : {}), items: result.record.items,
  }
}

export async function recognizeExternalInvoicesBatch(actor: string, input: ExternalInvoiceBatchRecognizeRequest): Promise<ExternalInvoiceBatchRecognizeResult> {
  const items = new Array<ExternalInvoiceBatchItemResult>(input.items.length); let cursor = 0
  const worker = async (): Promise<void> => { while (cursor < input.items.length) { const index = cursor; cursor += 1; const item = input.items[index]!; try { const data = await recognizeExternalInvoice(actor, item); items[index] = { index, success: true, ...(item.clientRequestId ? { clientRequestId: item.clientRequestId } : {}), data } } catch (reason) { items[index] = { index, success: false, filename: item.filename, ...(item.clientRequestId ? { clientRequestId: item.clientRequestId } : {}), error: reason instanceof Error ? reason.message : "电子发票识别失败" } } } }
  await Promise.all(Array.from({ length: Math.min(2, input.items.length) }, () => worker()))
  const successCount = items.filter((item) => item.success).length
  return { totalCount: items.length, successCount, failedCount: items.length - successCount, items }
}

export async function recognizeExternalTrainTicket(actor: string, input: ExternalTrainTicketRecognizeRequest): Promise<ExternalTrainTicketRecognizeResult> {
  const result = await recognizeOcr(actor, { recognitionType: "TRAIN_TICKET", filename: input.filename, mimeType: input.mimeType, base64Data: input.base64Data })
  if (!result.success) throw new BusinessError(result.record.errorMessage || "火车票识别失败。", 422)
  return {
    recognitionId: result.record.id, originalFilename: result.record.originalFilename, extractionMethod: "PDF_TEXT_AI",
    ...(input.clientRequestId ? { clientRequestId: input.clientRequestId } : {}),
    ...(result.record.trainInvoiceNo ? { trainInvoiceNo: result.record.trainInvoiceNo } : {}), ...(result.record.trainIssueDate ? { trainIssueDate: result.record.trainIssueDate } : {}),
    ...(result.record.departureStation ? { departureStation: result.record.departureStation } : {}), ...(result.record.arrivalStation ? { arrivalStation: result.record.arrivalStation } : {}), ...(result.record.trainNo ? { trainNo: result.record.trainNo } : {}),
    ...(result.record.departureDate ? { departureDate: result.record.departureDate } : {}), ...(result.record.departureTime ? { departureTime: result.record.departureTime } : {}), ...(result.record.seatNo ? { seatNo: result.record.seatNo } : {}), ...(result.record.seatClass ? { seatClass: result.record.seatClass } : {}),
    ...(result.record.ticketPrice ? { ticketPrice: result.record.ticketPrice } : {}), ...(result.record.passengerId ? { passengerId: result.record.passengerId } : {}), ...(result.record.passengerName ? { passengerName: result.record.passengerName } : {}),
    ...(result.record.ticketNo ? { ticketNo: result.record.ticketNo } : {}), ...(result.record.trainBuyerName ? { trainBuyerName: result.record.trainBuyerName } : {}), ...(result.record.trainBuyerCreditCode ? { trainBuyerCreditCode: result.record.trainBuyerCreditCode } : {}),
  }
}

export async function recognizeExternalTrainTicketsBatch(actor: string, input: ExternalTrainTicketBatchRecognizeRequest): Promise<ExternalTrainTicketBatchRecognizeResult> {
  const items = new Array<ExternalTrainTicketBatchItemResult>(input.items.length); let cursor = 0
  const worker = async (): Promise<void> => { while (cursor < input.items.length) { const index = cursor; cursor += 1; const item = input.items[index]!; try { const data = await recognizeExternalTrainTicket(actor, item); items[index] = { index, success: true, ...(item.clientRequestId ? { clientRequestId: item.clientRequestId } : {}), data } } catch (reason) { items[index] = { index, success: false, filename: item.filename, ...(item.clientRequestId ? { clientRequestId: item.clientRequestId } : {}), error: reason instanceof Error ? reason.message : "火车票识别失败" } } } }
  await Promise.all(Array.from({ length: Math.min(2, input.items.length) }, () => worker()))
  const successCount = items.filter((item) => item.success).length
  return { totalCount: items.length, successCount, failedCount: items.length - successCount, items }
}

export async function recognizeExternalPayment(actor: string, input: ExternalPaymentRecognizeRequest): Promise<ExternalPaymentRecognizeResult> {
  const result = await recognizeOcr(actor, { recognitionType: "PAYMENT", filename: input.filename, mimeType: input.mimeType, base64Data: input.base64Data })
  if (!result.success) throw new BusinessError(result.record.errorMessage || "支付截图识别失败。", 422)
  return {
    recognitionId: result.record.id, originalFilename: result.record.originalFilename,
    ...(input.clientRequestId ? { clientRequestId: input.clientRequestId } : {}),
    ...(result.record.platform ? { platform: result.record.platform } : {}), ...(result.record.orderNo ? { orderNo: result.record.orderNo } : {}),
    ...(result.record.productName ? { productName: result.record.productName } : {}), ...(result.record.amount ? { amount: result.record.amount } : {}),
    ...(result.record.paymentTime ? { paymentTime: result.record.paymentTime } : {}), ...(result.record.paymentStatus ? { paymentStatus: result.record.paymentStatus } : {}),
    ...(result.record.paymentMethod ? { paymentMethod: result.record.paymentMethod } : {}), ...(result.record.receiver ? { receiver: result.record.receiver } : {}),
  }
}

export async function recognizeExternalPaymentsBatch(actor: string, input: ExternalPaymentBatchRecognizeRequest): Promise<ExternalPaymentBatchRecognizeResult> {
  const items = new Array<ExternalPaymentBatchItemResult>(input.items.length); let cursor = 0
  const worker = async (): Promise<void> => { while (cursor < input.items.length) { const index = cursor; cursor += 1; const item = input.items[index]!; try { const data = await recognizeExternalPayment(actor, item); items[index] = { index, success: true, ...(item.clientRequestId ? { clientRequestId: item.clientRequestId } : {}), data } } catch (reason) { items[index] = { index, success: false, filename: item.filename, ...(item.clientRequestId ? { clientRequestId: item.clientRequestId } : {}), error: reason instanceof Error ? reason.message : "支付截图识别失败" } } } }
  await Promise.all(Array.from({ length: Math.min(2, input.items.length) }, () => worker()))
  const successCount = items.filter((item) => item.success).length
  return { totalCount: items.length, successCount, failedCount: items.length - successCount, items }
}

export async function recognizeExternalNavigationRoute(actor: string, input: ExternalNavigationRouteRecognizeRequest): Promise<ExternalNavigationRouteRecognizeResult> {
  const result = await recognizeOcr(actor, { recognitionType: "NAVIGATION_ROUTE", filename: input.filename, mimeType: input.mimeType, base64Data: input.base64Data })
  if (!result.success) throw new BusinessError(result.record.errorMessage || "导航截图识别失败。", 422)
  if (!result.record.routeResultStatus || result.record.confidence === undefined || !result.record.selectedRouteEvidence) throw new BusinessError("导航截图识别结果不完整，请重新上传清晰截图。", 422)
  return {
    recognitionId: result.record.id, originalFilename: result.record.originalFilename, extractionMethod: "AI", routeResultStatus: result.record.routeResultStatus, waypoints: result.record.waypoints, confidence: result.record.confidence, selectedRouteEvidence: result.record.selectedRouteEvidence,
    ...(input.clientRequestId ? { clientRequestId: input.clientRequestId } : {}),
    ...(result.record.distanceKm !== undefined ? { distanceKm: result.record.distanceKm } : {}),
    ...(result.record.tollYuan !== undefined ? { tollYuan: result.record.tollYuan } : {}),
    ...(result.record.destination ? { destination: result.record.destination } : {}),
  }
}

export async function recognizeExternalNavigationRoutesBatch(actor: string, input: ExternalNavigationRouteBatchRecognizeRequest): Promise<ExternalNavigationRouteBatchRecognizeResult> {
  const items = new Array<ExternalNavigationRouteBatchItemResult>(input.items.length); let cursor = 0
  const worker = async (): Promise<void> => { while (cursor < input.items.length) { const index = cursor; cursor += 1; const item = input.items[index]!; try { const data = await recognizeExternalNavigationRoute(actor, item); items[index] = { index, success: true, ...(item.clientRequestId ? { clientRequestId: item.clientRequestId } : {}), data } } catch (reason) { items[index] = { index, success: false, filename: item.filename, ...(item.clientRequestId ? { clientRequestId: item.clientRequestId } : {}), error: reason instanceof Error ? reason.message : "导航截图识别失败" } } } }
  await Promise.all(Array.from({ length: Math.min(2, input.items.length) }, () => worker()))
  const successCount = items.filter((item) => item.success).length
  return { totalCount: items.length, successCount, failedCount: items.length - successCount, items }
}

export async function queryOcrRecognitions(userId: string, input: OcrRecognitionQuery): Promise<ListResponse<OcrRecognitionRecord>> {
  const page = input.page || 1; const pageSize = input.pageSize || 20; const keyword = input.keyword?.trim(); const createdAt = dateWhere(input)
  const fields = input.recognitionType === "INVOICE" ? ["invoiceType", "invoiceCategory", "invoiceNumber", "buyerName", "buyerTaxId", "sellerName", "sellerTaxId", "vehiclePlate", "vehicleType", "tollAmount", "tollDate", "totalAmount", "originalFilename"] : input.recognitionType === "NAVIGATION_ROUTE" ? ["destination", "selectedRouteEvidence", "originalFilename"] : input.recognitionType === "TRAIN_TICKET" ? ["trainInvoiceNo", "departureStation", "arrivalStation", "trainNo", "passengerName", "ticketNo", "trainBuyerName", "originalFilename"] : input.recognitionType === "BUSINESS_CARD" ? ["companyName", "contactName", "jobTitle", "phone", "email", "address", "website", "originalFilename"] : ["platform", "orderNo", "productName", "amount", "receiver", "originalFilename"]
  const keywordFilters: Prisma.OcrRecognitionWhereInput[] = keyword ? fields.map((field) => ({ [field]: { contains: keyword, mode: "insensitive" } })) : []
  if (input.recognitionType === "INVOICE" && keyword?.includes("专用")) keywordFilters.push({ invoiceType: "VAT_SPECIAL" })
  if (input.recognitionType === "INVOICE" && keyword?.includes("普通")) keywordFilters.push({ invoiceType: "VAT_NORMAL" })
  if (input.recognitionType === "INVOICE" && keyword?.includes("通行费")) keywordFilters.push({ invoiceCategory: "TOLL" })
  const where: Prisma.OcrRecognitionWhereInput = { userId, recognitionType: input.recognitionType, ...(createdAt ? { createdAt } : {}), ...(keywordFilters.length ? { OR: keywordFilters } : {}) }
  const [items, total] = await Promise.all([prisma.ocrRecognition.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }), prisma.ocrRecognition.count({ where })])
  return { items: items.map(toRecord), total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) }
}
export async function getOcrRecognition(userId: string, recognitionType: OcrRecognitionType, id: string): Promise<OcrRecognitionRecord> { const row = await prisma.ocrRecognition.findFirst({ where: { id, userId, recognitionType } }); if (!row) throw new BusinessError("识别记录不存在。", 404); return toRecord(row) }
export async function getOcrImage(userId: string, recognitionType: OcrRecognitionType, id: string): Promise<{ mimeType: string; data: Uint8Array }> { const row = await prisma.ocrRecognition.findFirst({ where: { id, userId, recognitionType }, select: { mimeType: true, imageData: true } }); if (!row) throw new BusinessError("识别文件不存在。", 404); return { mimeType: row.mimeType, data: row.imageData } }
export async function removeOcrRecognition(userId: string, recognitionType: OcrRecognitionType, id: string): Promise<void> { const result = await prisma.ocrRecognition.deleteMany({ where: { id, userId, recognitionType } }); if (!result.count) throw new BusinessError("识别记录不存在。", 404) }

export async function updateBusinessCard(userId: string, id: string, input: OcrBusinessCardUpdateRequest): Promise<OcrRecognitionRecord> {
  const current = await prisma.ocrRecognition.findFirst({ where: { id, userId, recognitionType: "BUSINESS_CARD" }, select: { id: true } })
  if (!current) throw new BusinessError("供应商名片记录不存在。", 404)
  const normalized = Object.fromEntries(Object.entries(input).map(([key, value]) => [key, value?.trim() || null]))
  const updated = await prisma.ocrRecognition.update({ where: { id }, data: { ...normalized, companyName: input.companyName.trim(), status: "SUCCESS", errorMessage: null } })
  return toRecord(updated)
}

export async function exportOcrRecognitions(userId: string, input: OcrExportRequest): Promise<OcrExportResult> {
  const createdAt = dateWhere(input)
  const records = await prisma.ocrRecognition.findMany({ where: { userId, recognitionType: input.recognitionType, status: "SUCCESS", ...(input.ids?.length ? { id: { in: input.ids } } : {}), ...(createdAt ? { createdAt } : {}) }, orderBy: { createdAt: "desc" }, take: 5000 })
  const invoice = input.recognitionType === "INVOICE"
  const navigationRoute = input.recognitionType === "NAVIGATION_ROUTE"
  const trainTicket = input.recognitionType === "TRAIN_TICKET"
  const businessCard = input.recognitionType === "BUSINESS_CARD"
  const invoiceRows = records.flatMap((row, recordIndex) => {
    const items = invoiceItems(row.invoiceItems)
    const exportItems: Array<OcrInvoiceItem | undefined> = items.length ? items : [undefined]
    return exportItems.map((item, itemIndex) => [
      recordIndex + 1, itemIndex + 1, row.invoiceCategory === "TOLL" ? "通行费电子发票" : row.invoiceType === "VAT_SPECIAL" ? "增值税专用发票" : row.invoiceType === "VAT_NORMAL" ? "普通发票" : undefined, row.invoiceNumber, row.invoiceDate,
      row.buyerName, row.buyerTaxId, row.sellerName, row.sellerTaxId,
      item?.itemName, item?.specification, item?.unit, item?.quantity,
      item?.unitPrice, item?.amount, item?.taxRate, item?.taxAmount,
      row.subtotal, row.totalTax, row.totalAmount, row.totalAmountInWords,
      row.drawer, row.remarks, row.vehiclePlate, row.vehicleType, row.tollAmount, row.tollDate, row.originalFilename, row.createdAt.toLocaleString("zh-CN"),
    ])
  })
  const rows: unknown[][] = invoice ? [["发票序号", "明细序号", "发票类型", "发票号码", "开票日期", "购买方", "购买方税号", "销售方", "销售方税号", "商品名称", "规格型号", "单位", "数量", "单价", "明细金额", "税率", "明细税额", "金额合计", "税额合计", "价税合计", "价税合计（大写）", "开票人", "备注", "车牌", "车辆类型", "通行费", "通行日期", "文件名", "识别时间"], ...invoiceRows] : navigationRoute ? [["序号", "识别结论", "目的地", "途经地", "距离（公里）", "通行费（元）", "置信度", "选中路线依据", "文件名", "识别时间"], ...records.map((row, index) => [index + 1, row.routeResultStatus, row.destination, routeWaypoints(row.waypoints).join(" → "), row.distanceKm, row.tollYuan, row.confidence, row.selectedRouteEvidence, row.originalFilename, row.createdAt.toLocaleString("zh-CN")])] : trainTicket ? [["序号", "发票号码", "开票日期", "出发站", "到达站", "车次", "出发日期", "出发时间", "车厢座位", "席别", "票价", "乘客姓名", "身份证号", "电子客票号", "购买方名称", "统一社会信用代码", "文件名", "识别时间"], ...records.map((row, index) => [index + 1, row.trainInvoiceNo, row.trainIssueDate, row.departureStation, row.arrivalStation, row.trainNo, row.departureDate, row.departureTime, row.seatNo, row.seatClass, row.ticketPrice, row.passengerName, row.passengerId, row.ticketNo, row.trainBuyerName, row.trainBuyerCreditCode, row.originalFilename, row.createdAt.toLocaleString("zh-CN")])] : businessCard ? [["序号", "公司名称", "联系人", "职称", "电话", "电子邮箱", "地址", "网站", "文件名", "识别时间"], ...records.map((row, index) => [index + 1, row.companyName, row.contactName, row.jobTitle, row.phone, row.email, row.address, row.website, row.originalFilename, row.createdAt.toLocaleString("zh-CN")])] : [["序号", "平台", "订单号", "商品名称", "支付金额", "支付时间", "支付状态", "支付方式", "收款方", "文件名", "识别时间"], ...records.map((row, index) => [index + 1, row.platform, row.orderNo, row.productName, row.amount, row.paymentTime, row.paymentStatus, row.paymentMethod, row.receiver, row.originalFilename, row.createdAt.toLocaleString("zh-CN")])]
  const label = invoice ? "电子发票识别" : navigationRoute ? "导航截图识别" : trainTicket ? "火车票识别" : businessCard ? "供应商名片识别" : "支付截图识别"; const buffer = createXlsx(label, rows)
  return { base64: buffer.toString("base64"), filename: `${label}_${new Date().toISOString().slice(0, 10)}.xlsx`, count: records.length }
}
