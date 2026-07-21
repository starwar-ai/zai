import { Prisma } from "@prisma/client"
import type { DepartmentInput, DepartmentRecord, RoleRecord, SystemManagementData, SystemMenuRecord, UserRecord, UserStatus } from "@zform/shared"
import { prisma } from "../database.js"
import { BusinessError } from "../utils/business-error.js"

const menuTargets = ["dashboard", "document-list", "settings", "help", "menu-management", "user-management", "role-management", "department-management", "declaration-name", "ocr-recognition"] as const

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

function toDepartment(row: { id: string; code: string; name: string; parentId: string | null; order: number; createdAt: Date; updatedAt: Date; userCount?: number }): DepartmentRecord {
  return { id: row.id, code: row.code, name: row.name, ...(row.parentId ? { parentId: row.parentId } : {}), order: row.order, userCount: row.userCount || 0, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }
}

export async function listSystemManagement(): Promise<SystemManagementData> {
  const [menus, roles, users, departments] = await Promise.all([
    prisma.systemMenu.findMany({ orderBy: [{ order: "asc" }, { id: "asc" }] }),
    prisma.role.findMany({ include: { _count: { select: { users: true } } }, orderBy: { createdAt: "asc" } }),
    prisma.appUser.findMany({ include: { roles: { include: { role: true } } }, orderBy: { createdAt: "asc" } }),
    prisma.department.findMany({ orderBy: [{ order: "asc" }, { code: "asc" }] }),
  ])
  const userCounts = new Map<string, number>()
  users.forEach((user) => { if (user.departmentId) userCounts.set(user.departmentId, (userCounts.get(user.departmentId) || 0) + 1) })
  return { menus: menus.map(toMenu), roles: roles.map(toRole), users: users.map(toUser), departments: departments.map((department) => toDepartment({ ...department, userCount: userCounts.get(department.id) || 0 })) }
}

export async function createDepartment(input: DepartmentInput): Promise<DepartmentRecord> {
  if (input.parentId && !await prisma.department.findUnique({ where: { id: input.parentId } })) throw new BusinessError("上级部门不存在。", 404)
  try { return toDepartment(await prisma.department.create({ data: input })) }
  catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new BusinessError("部门编码已存在。", 409); throw error }
}

export async function updateDepartment(id: string, input: DepartmentInput): Promise<DepartmentRecord> {
  const departments = await prisma.department.findMany()
  if (!departments.some((department) => department.id === id)) throw new BusinessError("部门不存在。", 404)
  if (input.parentId === id) throw new BusinessError("部门不能作为自己的上级。")
  const parentById = new Map(departments.map((department) => [department.id, department.parentId]))
  let ancestorId = input.parentId
  while (ancestorId) {
    if (ancestorId === id) throw new BusinessError("不能将部门移动到自己的下级部门。")
    ancestorId = parentById.get(ancestorId) || undefined
  }
  try { return toDepartment(await prisma.department.update({ where: { id }, data: input })) }
  catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new BusinessError("部门编码已存在。", 409); throw error }
}

export async function removeDepartment(id: string): Promise<void> {
  await prisma.$transaction(async (client) => {
    const [department, childCount, userCount] = await Promise.all([client.department.findUnique({ where: { id } }), client.department.count({ where: { parentId: id } }), client.appUser.count({ where: { departmentId: id } })])
    if (!department) throw new BusinessError("部门不存在。", 404)
    if (childCount) throw new BusinessError("该部门存在下级部门，不能删除。")
    if (userCount) throw new BusinessError("该部门仍有关联用户，不能删除。")
    await client.department.delete({ where: { id } })
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}

async function resolveDepartment(client: Prisma.TransactionClient, departmentId?: string): Promise<{ departmentId?: string; departmentName?: string }> {
  if (!departmentId) return {}
  const department = await client.department.findUnique({ where: { id: departmentId } })
  if (!department) throw new BusinessError("所选部门不存在。", 404)
  return { departmentId: department.id, departmentName: department.name }
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
  const role = await prisma.role.findUnique({ where: { id }, include: { _count: { select: { users: true } } } })
  if (!role) throw new BusinessError("角色不存在。", 404)
  if (role.code === "SYSTEM_ADMIN") throw new BusinessError("系统管理员角色不能删除。")
  if (role._count.users) throw new BusinessError("角色仍有关联用户，不能删除。")
  await prisma.role.delete({ where: { id } })
}

export async function createUser(input: { id: string; name: string; email?: string; departmentId?: string; departmentName?: string; status: UserStatus; roleIds: string[] }): Promise<UserRecord> {
  try {
    return await prisma.$transaction(async (client) => {
      const department = await resolveDepartment(client, input.departmentId)
      await client.appUser.create({ data: { id: input.id, name: input.name, email: input.email, ...department, status: input.status, roles: { create: input.roleIds.map((roleId) => ({ roleId })) } } })
      return toUser(await client.appUser.findUniqueOrThrow({ where: { id: input.id }, include: { roles: { include: { role: true } } } }))
    })
  } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new BusinessError("用户标识已存在。", 409); throw error }
}

export async function updateUser(id: string, input: { name: string; email?: string; departmentId?: string; departmentName?: string; status: UserStatus; roleIds: string[] }): Promise<UserRecord> {
  return prisma.$transaction(async (client) => {
    const department = await resolveDepartment(client, input.departmentId)
    await client.appUser.update({ where: { id }, data: { name: input.name, email: input.email, departmentId: department.departmentId || null, departmentName: department.departmentName || null, status: input.status } })
    await client.userRole.deleteMany({ where: { userId: id } })
    if (input.roleIds.length) await client.userRole.createMany({ data: input.roleIds.map((roleId) => ({ userId: id, roleId })) })
    return toUser(await client.appUser.findUniqueOrThrow({ where: { id }, include: { roles: { include: { role: true } } } }))
  })
}

export async function removeUser(id: string): Promise<void> {
  if (id === "framework-user") throw new BusinessError("当前演示管理员不能删除。")
  await prisma.appUser.delete({ where: { id } })
}
