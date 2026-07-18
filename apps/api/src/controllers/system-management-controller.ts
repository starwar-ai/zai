import type { Request, Response } from "express"
import { z } from "zod"
import { createMenu, createRole, createUser, listSystemManagement, removeMenu, removeRole, removeUser, updateMenu, updateRole, updateUser } from "../services/system-management-service.js"
import { ok, routeParam } from "../utils/http.js"

const menuInputSchema = z.object({
  id: z.string().min(2).max(80), groupId: z.string().min(1).max(64), groupLabel: z.string().min(1).max(80),
  label: z.string().min(1).max(80), icon: z.string().min(1).max(60),
  target: z.enum(["dashboard", "document-list", "settings", "help", "menu-management", "user-management", "role-management", "declaration-name"]),
  targetId: z.string().max(80).optional(), permissionCode: z.string().max(100).optional(), order: z.number().int(), enabled: z.boolean(),
})
const roleInputSchema = z.object({
  code: z.string().regex(/^[A-Z][A-Z0-9_]*$/).max(64), name: z.string().min(1).max(80),
  description: z.string().max(300).optional(), permissions: z.array(z.string().min(1).max(100)).max(100),
})
const userInputSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]+$/).max(64), name: z.string().min(1).max(80), email: z.string().email().max(160).optional(),
  departmentId: z.string().max(64).optional(), departmentName: z.string().max(100).optional(),
  status: z.enum(["ACTIVE", "DISABLED"]), roleIds: z.array(z.string().uuid()).max(20),
})

export async function getSystemManagement(_request: Request, response: Response): Promise<void> { ok(response, await listSystemManagement()) }
export async function postMenu(request: Request, response: Response): Promise<void> { ok(response, await createMenu(menuInputSchema.parse(request.body)), "菜单已创建") }
export async function putMenu(request: Request, response: Response): Promise<void> { ok(response, await updateMenu(routeParam(request.params.id), menuInputSchema.omit({ id: true }).parse(request.body)), "菜单已保存") }
export async function deleteMenu(request: Request, response: Response): Promise<void> { await removeMenu(routeParam(request.params.id)); ok(response, null, "菜单已删除") }
export async function postRole(request: Request, response: Response): Promise<void> { ok(response, await createRole(roleInputSchema.parse(request.body)), "角色已创建") }
export async function putRole(request: Request, response: Response): Promise<void> { ok(response, await updateRole(routeParam(request.params.id), roleInputSchema.omit({ code: true }).parse(request.body)), "角色已保存") }
export async function deleteRole(request: Request, response: Response): Promise<void> { await removeRole(routeParam(request.params.id)); ok(response, null, "角色已删除") }
export async function postUser(request: Request, response: Response): Promise<void> { ok(response, await createUser(userInputSchema.parse(request.body)), "用户已创建") }
export async function putUser(request: Request, response: Response): Promise<void> { ok(response, await updateUser(routeParam(request.params.id), userInputSchema.omit({ id: true }).parse(request.body)), "用户已保存") }
export async function deleteUser(request: Request, response: Response): Promise<void> { await removeUser(routeParam(request.params.id)); ok(response, null, "用户已删除") }
