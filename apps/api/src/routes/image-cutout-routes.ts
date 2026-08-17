import { Router } from "express"
import { postExternalImageCutout, postExternalImageCutoutBatch } from "../controllers/image-cutout-controller.js"
import { asyncHandler } from "../middleware/async-handler.js"
import { requireExternalApiKey } from "../middleware/external-api-key.js"

export const imageCutoutRoutes = Router()

imageCutoutRoutes.post("/external/image-cutout/remove-background", requireExternalApiKey, asyncHandler(postExternalImageCutout))
imageCutoutRoutes.post("/external/image-cutout/remove-background/batch", requireExternalApiKey, asyncHandler(postExternalImageCutoutBatch))
