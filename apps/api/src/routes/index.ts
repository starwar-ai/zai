import { Router } from "express"
import { documentRoutes } from "./document-routes.js"
import { declarationNameRoutes } from "./declaration-name-routes.js"
import { healthRoutes } from "./health-routes.js"
import { shellRoutes } from "./shell-routes.js"
import { systemManagementRoutes } from "./system-management-routes.js"
import { customerResearchRoutes } from "./customer-research-routes.js"
import { ocrRoutes } from "./ocr-routes.js"
import { imageSearchRoutes } from "./image-search-routes.js"
import { imageCutoutRoutes } from "./image-cutout-routes.js"

export const routes = Router()
const apiRoutes = Router()

apiRoutes.use(shellRoutes)
apiRoutes.use(systemManagementRoutes)
apiRoutes.use(declarationNameRoutes)
apiRoutes.use(customerResearchRoutes)
apiRoutes.use(ocrRoutes)
apiRoutes.use(imageSearchRoutes)
apiRoutes.use(imageCutoutRoutes)
apiRoutes.use(documentRoutes)

routes.use(healthRoutes)
routes.use("/api", apiRoutes)
