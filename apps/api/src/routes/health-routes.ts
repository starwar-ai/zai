import { Router } from "express"
import { health } from "../controllers/health-controller.js"
import { asyncHandler } from "../middleware/async-handler.js"

export const healthRoutes = Router()
healthRoutes.get("/health", asyncHandler(health))
