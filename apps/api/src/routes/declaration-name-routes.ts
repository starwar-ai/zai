import { Router } from "express"
import { getDeclarationNameJobController, getDeclarationNameReviews, postDeclarationNameApprove, postDeclarationNameGenerate, postDeclarationNameReject, postDeclarationNameResolve, postDeclarationNameWriteback, postExternalDeclarationNameConvert } from "../controllers/declaration-name-controller.js"
import { asyncHandler } from "../middleware/async-handler.js"
import { requireExternalApiKey } from "../middleware/external-api-key.js"
import { requireSystemPermission } from "../middleware/system-permission.js"

export const declarationNameRoutes = Router()

declarationNameRoutes.post("/external/declaration-names/convert", requireExternalApiKey, asyncHandler(postExternalDeclarationNameConvert))
declarationNameRoutes.post("/declaration-names/resolve", requireSystemPermission("declaration-name:view"), asyncHandler(postDeclarationNameResolve))
declarationNameRoutes.post("/declaration-names/generate", requireSystemPermission("declaration-name:generate"), asyncHandler(postDeclarationNameGenerate))
declarationNameRoutes.get("/declaration-names/jobs/:id", requireSystemPermission("declaration-name:view"), asyncHandler(getDeclarationNameJobController))
declarationNameRoutes.get("/declaration-names/reviews", requireSystemPermission("declaration-name:view"), asyncHandler(getDeclarationNameReviews))
declarationNameRoutes.post("/declaration-names/mappings/:id/approve", requireSystemPermission("declaration-name:review"), asyncHandler(postDeclarationNameApprove))
declarationNameRoutes.post("/declaration-names/mappings/:id/reject", requireSystemPermission("declaration-name:review"), asyncHandler(postDeclarationNameReject))
declarationNameRoutes.post("/declaration-names/writeback", requireSystemPermission("declaration-name:writeback"), asyncHandler(postDeclarationNameWriteback))
