import { Router } from "express"
import { documentRoutes } from "./document-routes.js"
import { declarationNameRoutes } from "./declaration-name-routes.js"
import { healthRoutes } from "./health-routes.js"
import { shellRoutes } from "./shell-routes.js"
import { systemManagementRoutes } from "./system-management-routes.js"

export const routes = Router()
const apiRoutes = Router()

apiRoutes.use(shellRoutes)
apiRoutes.use(systemManagementRoutes)
apiRoutes.use(declarationNameRoutes)
apiRoutes.use(documentRoutes)

routes.use(healthRoutes)
routes.use("/api", apiRoutes)
