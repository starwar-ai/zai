import { Router } from "express"
import { action, activities, create, dashboard, documents, find, getSchemas, impact, pushDownDocument, query, remove, trace, update } from "../controllers/document-controller.js"
import { asyncHandler } from "../middleware/async-handler.js"

export const documentRoutes = Router()
documentRoutes.get("/schemas", getSchemas)
documentRoutes.get("/dashboard", asyncHandler(dashboard))
documentRoutes.get("/activities", asyncHandler(activities))
documentRoutes.get("/documents", asyncHandler(documents))
documentRoutes.post("/documents/query", asyncHandler(query))
documentRoutes.post("/documents", asyncHandler(create))
documentRoutes.get("/documents/:id", asyncHandler(find))
documentRoutes.put("/documents/:id", asyncHandler(update))
documentRoutes.delete("/documents/:id", asyncHandler(remove))
documentRoutes.get("/documents/:id/trace", asyncHandler(trace))
documentRoutes.post("/documents/:id/impact", asyncHandler(impact))
documentRoutes.post("/documents/:id/actions/:action", asyncHandler(action))
documentRoutes.post("/documents/:id/push-down", asyncHandler(pushDownDocument))
