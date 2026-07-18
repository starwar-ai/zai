import { Prisma } from "@prisma/client"
import type { RoleRecord, SystemManagementData, SystemMenuRecord, UserRecord, UserStatus } from "@zform/shared"
import { prisma } from "../database.js"
import { BusinessError } from "../utils/business-error.js"

const menuTargets = ["dashboard", "document-list", "settings", "help", "menu-management", "user-management", "role-management"] as const

export async function assertSystemPermission(userId: string, permission: string): Promise<void> {
  const user = await prisma.appUser.findUnique({ where: { id: userId }, include: { roles: { include: { role: true } } } })
  const permissions = user?.roles.flatMap((item) => item.role.permissions) || []
  if (!user || user.status !== "ACTIVE" || (!permissions.includes("*") && !permissions.includes(permission))) throw new BusinessError("没有执行该系统管理操作的权限。", 403)
}

export async function assertAnySystemPermission(userId: string, required: string[]): Promise<void> {
  const user = await prisma.appUser.findUnique({ where: { id: userId }, include: { roles: { include: { role: true } } } })
  const permissions = user?.roles.flatMap((item) => item.role.permissions) || []
  if (!user || user.status !== "ACTIVE" || (!permissions.includes("*") && !required.some((permission) => permissions.includes(permission)))) throw new BusinessError("没有访问系统管理数据的权限。", 403)
}

function toMenu(row: { id: string; groupId: string; groupLabel: string; label: string; icon: string; target: string; targetId: string | null; permissionCode: string | null; order: number; enabled: boolean }): SystemMenuRecord {
  const target = menuTargets.includes(row.target as typeof menuTargets[number]) ? row.target as SystemMenuRecord["target"] : "help"
  return { id: row.id, groupId: row.groupId, groupLabel: row.groupLabel, label: row.label, icon: row.icon, target, ...(row.targetId ? { targetId: row.targetId } : {}), ...(row.permissionCode ? { permissionCode: row.permissionCode } : {}), order: row.order, enabled: row.enabled }
}

function toRole(row: { id: string; code: string; name: string; description: string | null; permissions: string[]; createdAt: Date; updatedAt: Date; _count: { users: number } }): RoleRecord {
  return { id: row.id, code: row.code, name: row.name, ...(row.description ? { description: row.description } : {}), permissions: row.permissions, userCount: row._count.users, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }
}

function toUser(row: { id: string; name: string; email: string | null; departmentId: string | null; departmentName: string | null; status: string; createdAt: Date; updatedAt: Date; roles: Array<{ role: { id: string; code: string; name: string } }> }): UserRecord {
  return { id: row.id, name: row.name, ...(row.email ? { email: row.email } : {}), ...(row.departmentId ? { departmentId: row.departmentId } : {}), ...(row.departmentName ? { departmentName: row.departmentName } : {}), status: row.status === "DISABLED" ? "DISABLED" : "ACTIVE", roles: row.roles.map((item) => item.role), createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }
}

export async function listSystemManagement(): Promise<SystemManagementData> {
  const [menus, roles, users] = await Promise.all([
    prisma.systemMenu.findMany({ orderBy: [{ order: "asc" }, { id: "asc" }] }),
    prisma.role.findMany({ include: { _count: { select: { users: true } } }, orderBy: { createdAt: "asc" } }),
    prisma.appUser.findMany({ include: { roles: { include: { role: true } } }, orderBy: { createdAt: "asc" } }),
  ])
  return { menus: menus.map(toMenu), roles: roles.map(toRole), users: users.map(toUser) }
}

export async function createMenu(input: SystemMenuRecord): Promise<SystemMenuRecord> {
  try { return toMenu(await prisma.systemMenu.create({ data: input })) }
  catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new BusinessError("菜单标识已存在。", 409); throw error }
}

export async function updateMenu(id: string, input: Omit<SystemMenuRecord, "id">): Promise<SystemMenuRecord> {
  return toMenu(await prisma.systemMenu.update({ where: { id }, data: input }))
}

export async function removeMenu(id: string): Promise<void> { await prisma.systemMenu.delete({ where: { id } }) }

export async function createRole(input: { code: string; name: string; description?: string; permissions: string[] }): Promise<RoleRecord> {
  try { return toRole(await prisma.role.create({ data: input, include: { _count: { select: { users: true } } } })) }
  catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new BusinessError("角色编码已存在。", 409); throw error }
}

export async function updateRole(id: string, input: { name: string; description?: string; permissions: string[] }): Promise<RoleRecord> {
  return toRole(await prisma.role.update({ where: { id }, data: input, include: { _count: { select: { users: true } } } }))
}

export async function removeRole(id: string): Promise<void> {
  const role = await prisma.role.findUnique({ where: { id } })
  if (!role) throw new BusinessError("角色不存在。", 404)
  if (role.code === "SYSTEM_ADMIN") throw new BusinessError("系统管理员角色不能删除。")
  await prisma.role.delete({ where: { id } })
}

export async function createUser(input: { id: string; name: string; email?: string; departmentId?: string; departmentName?: string; status: UserStatus; roleIds: string[] }): Promise<UserRecord> {
  try {
    return await prisma.$transaction(async (client) => {
      await client.appUser.create({ data: { id: input.id, name: input.name, email: input.email, departmentId: input.departmentId, departmentName: input.departmentName, status: input.status, roles: { create: input.roleIds.map((roleId) => ({ roleId })) } } })
      return toUser(await client.appUser.findUniqueOrThrow({ where: { id: input.id }, include: { roles: { include: { role: true } } } }))
    })
  } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new BusinessError("用户标识已存在。", 409); throw error }
}

export async function updateUser(id: string, input: { name: string; email?: string; departmentId?: string; departmentName?: string; status: UserStatus; roleIds: string[] }): Promise<UserRecord> {
  return prisma.$transaction(async (client) => {
    await client.appUser.update({ where: { id }, data: { name: input.name, email: input.email, departmentId: input.departmentId, departmentName: input.departmentName, status: input.status } })
    await client.userRole.deleteMany({ where: { userId: id } })
    if (input.roleIds.length) await client.userRole.createMany({ data: input.roleIds.map((roleId) => ({ userId: id, roleId })) })
    return toUser(await client.appUser.findUniqueOrThrow({ where: { id }, include: { roles: { include: { role: true } } } }))
  })
}

export async function removeUser(id: string): Promise<void> {
  if (id === "framework-user") throw new BusinessError("当前演示管理员不能删除。")
  await prisma.appUser.delete({ where: { id } })
}
