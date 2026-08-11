import { Router } from "express"
import { exportReport, importCustomers, models, processBatch, processCustomer, processCustomerStream, processNext, retry, summary } from "../controllers/customer-research-controller.js"
import { asyncHandler } from "../middleware/async-handler.js"
import { requireSystemPermission } from "../middleware/system-permission.js"

export const customerResearchRoutes = Router()
customerResearchRoutes.get("/customer-research/summary", requireSystemPermission("document:customer_due_diligence:view"), asyncHandler(summary))
customerResearchRoutes.get("/customer-research/models", requireSystemPermission("customer-research:run"), models)
customerResearchRoutes.post("/customer-research/import", requireSystemPermission("document:customer_due_diligence:create"), asyncHandler(importCustomers))
customerResearchRoutes.post("/customer-research/process-next", requireSystemPermission("customer-research:run"), asyncHandler(processNext))
customerResearchRoutes.post("/customer-research/process-batch", requireSystemPermission("customer-research:run"), asyncHandler(processBatch))
customerResearchRoutes.get("/customer-research/:id/report.pdf", requireSystemPermission("document:customer_due_diligence:view"), asyncHandler(exportReport))
customerResearchRoutes.post("/customer-research/:id/process", requireSystemPermission("customer-research:run"), asyncHandler(processCustomer))
customerResearchRoutes.post("/customer-research/:id/process-stream", requireSystemPermission("customer-research:run"), asyncHandler(processCustomerStream))
customerResearchRoutes.post("/customer-research/:id/retry", requireSystemPermission("customer-research:retry"), asyncHandler(retry))
