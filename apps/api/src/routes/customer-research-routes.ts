import { Router } from "express"
import { importCustomers, processNext, retry, summary } from "../controllers/customer-research-controller.js"
import { asyncHandler } from "../middleware/async-handler.js"
import { requireSystemPermission } from "../middleware/system-permission.js"

export const customerResearchRoutes = Router()
customerResearchRoutes.get("/customer-research/summary", requireSystemPermission("document:customer_due_diligence:view"), asyncHandler(summary))
customerResearchRoutes.post("/customer-research/import", requireSystemPermission("document:customer_due_diligence:create"), asyncHandler(importCustomers))
customerResearchRoutes.post("/customer-research/process-next", requireSystemPermission("customer-research:run"), asyncHandler(processNext))
customerResearchRoutes.post("/customer-research/:id/retry", requireSystemPermission("customer-research:retry"), asyncHandler(retry))
