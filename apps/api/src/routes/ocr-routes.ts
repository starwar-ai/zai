import { Router } from "express"
import { deleteOcrRecognition, getInvoiceOcrModel, getOcrRecognitionController, getOcrRecognitionImage, getOcrRecognitions, postExternalInvoiceBatchRecognition, postExternalInvoiceRecognition, postExternalNavigationRouteBatchRecognition, postExternalNavigationRouteRecognition, postExternalPaymentBatchRecognition, postExternalPaymentRecognition, postExternalTrainTicketBatchRecognition, postExternalTrainTicketRecognition, postOcrExport, postOcrRecognition, putBusinessCard } from "../controllers/ocr-controller.js"
import { asyncHandler } from "../middleware/async-handler.js"
import { requireExternalApiKey } from "../middleware/external-api-key.js"
import { requireSystemPermission } from "../middleware/system-permission.js"

export const ocrRoutes = Router()
ocrRoutes.post("/external/invoices/recognize", requireExternalApiKey, asyncHandler(postExternalInvoiceRecognition))
ocrRoutes.post("/external/invoices/recognize/batch", requireExternalApiKey, asyncHandler(postExternalInvoiceBatchRecognition))
ocrRoutes.post("/external/payments/recognize", requireExternalApiKey, asyncHandler(postExternalPaymentRecognition))
ocrRoutes.post("/external/payments/recognize/batch", requireExternalApiKey, asyncHandler(postExternalPaymentBatchRecognition))
ocrRoutes.post("/external/navigation-routes/recognize", requireExternalApiKey, asyncHandler(postExternalNavigationRouteRecognition))
ocrRoutes.post("/external/navigation-routes/recognize/batch", requireExternalApiKey, asyncHandler(postExternalNavigationRouteBatchRecognition))
ocrRoutes.post("/external/train-tickets/recognize", requireExternalApiKey, asyncHandler(postExternalTrainTicketRecognition))
ocrRoutes.post("/external/train-tickets/recognize/batch", requireExternalApiKey, asyncHandler(postExternalTrainTicketBatchRecognition))
ocrRoutes.post("/ocr/recognitions", requireSystemPermission("ocr:recognize"), asyncHandler(postOcrRecognition))
ocrRoutes.get("/ocr/model", requireSystemPermission("ocr:view"), asyncHandler(getInvoiceOcrModel))
ocrRoutes.get("/ocr/recognitions", requireSystemPermission("ocr:view"), asyncHandler(getOcrRecognitions))
ocrRoutes.post("/ocr/recognitions/export", requireSystemPermission("ocr:export"), asyncHandler(postOcrExport))
ocrRoutes.get("/ocr/recognitions/:id", requireSystemPermission("ocr:view"), asyncHandler(getOcrRecognitionController))
ocrRoutes.get("/ocr/recognitions/:id/image", requireSystemPermission("ocr:view"), asyncHandler(getOcrRecognitionImage))
ocrRoutes.put("/ocr/business-cards/:id", requireSystemPermission("ocr:recognize"), asyncHandler(putBusinessCard))
ocrRoutes.delete("/ocr/recognitions/:id", requireSystemPermission("ocr:delete"), asyncHandler(deleteOcrRecognition))
