import { Router } from "express"
import { deleteDepartment, deleteMenu, deleteRole, deleteUser, getSystemManagement, postDepartment, postMenu, postRole, postUser, putDepartment, putMenu, putRole, putUser } from "../controllers/system-management-controller.js"
import { asyncHandler } from "../middleware/async-handler.js"
import { requireAnySystemPermission, requireSystemPermission } from "../middleware/system-permission.js"

export const systemManagementRoutes = Router()
const managementPermissions = ["system:menu:manage", "system:user:manage", "system:role:manage", "system:department:manage"]

systemManagementRoutes.get("/system-management", requireAnySystemPermission(managementPermissions), asyncHandler(getSystemManagement))
systemManagementRoutes.post("/system-management/menus", requireSystemPermission("system:menu:manage"), asyncHandler(postMenu))
systemManagementRoutes.put("/system-management/menus/:id", requireSystemPermission("system:menu:manage"), asyncHandler(putMenu))
systemManagementRoutes.delete("/system-management/menus/:id", requireSystemPermission("system:menu:manage"), asyncHandler(deleteMenu))
systemManagementRoutes.post("/system-management/roles", requireSystemPermission("system:role:manage"), asyncHandler(postRole))
systemManagementRoutes.put("/system-management/roles/:id", requireSystemPermission("system:role:manage"), asyncHandler(putRole))
systemManagementRoutes.delete("/system-management/roles/:id", requireSystemPermission("system:role:manage"), asyncHandler(deleteRole))
systemManagementRoutes.post("/system-management/users", requireSystemPermission("system:user:manage"), asyncHandler(postUser))
systemManagementRoutes.put("/system-management/users/:id", requireSystemPermission("system:user:manage"), asyncHandler(putUser))
systemManagementRoutes.delete("/system-management/users/:id", requireSystemPermission("system:user:manage"), asyncHandler(deleteUser))
systemManagementRoutes.post("/system-management/departments", requireSystemPermission("system:department:manage"), asyncHandler(postDepartment))
systemManagementRoutes.put("/system-management/departments/:id", requireSystemPermission("system:department:manage"), asyncHandler(putDepartment))
systemManagementRoutes.delete("/system-management/departments/:id", requireSystemPermission("system:department:manage"), asyncHandler(deleteDepartment))
