import { Router } from "express"
import { bootstrapShell, readAllNotifications, readNotification, updateSettings } from "../controllers/shell-controller.js"
import { asyncHandler } from "../middleware/async-handler.js"

export const shellRoutes = Router()
shellRoutes.get("/shell/bootstrap", asyncHandler(bootstrapShell))
shellRoutes.put("/shell/settings", asyncHandler(updateSettings))
shellRoutes.post("/shell/notifications/read-all", asyncHandler(readAllNotifications))
shellRoutes.post("/shell/notifications/:id/read", asyncHandler(readNotification))
