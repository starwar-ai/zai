import { Router } from "express"
import { deleteOcrRecognition, getOcrRecognitionController, getOcrRecognitionImage, getOcrRecognitions, postOcrExport, postOcrRecognition } from "../controllers/ocr-controller.js"
import { asyncHandler } from "../middleware/async-handler.js"
import { requireSystemPermission } from "../middleware/system-permission.js"

export const ocrRoutes = Router()
ocrRoutes.post("/ocr/recognitions", requireSystemPermission("ocr:recognize"), asyncHandler(postOcrRecognition))
ocrRoutes.get("/ocr/recognitions", requireSystemPermission("ocr:view"), asyncHandler(getOcrRecognitions))
ocrRoutes.post("/ocr/recognitions/export", requireSystemPermission("ocr:export"), asyncHandler(postOcrExport))
ocrRoutes.get("/ocr/recognitions/:id", requireSystemPermission("ocr:view"), asyncHandler(getOcrRecognitionController))
ocrRoutes.get("/ocr/recognitions/:id/image", requireSystemPermission("ocr:view"), asyncHandler(getOcrRecognitionImage))
ocrRoutes.delete("/ocr/recognitions/:id", requireSystemPermission("ocr:delete"), asyncHandler(deleteOcrRecognition))
