import { DataScope, Prisma } from "@prisma/client"
import { prisma } from "../database.js"

export interface UserContext { userId: string; departmentId?: string }

export async function permissionWhere(typeId: string, user: UserContext): Promise<Prisma.DocumentWhereInput> {
  const policy = await prisma.dataPermissionPolicy.findUnique({ where: { userId_typeId: { userId: user.userId, typeId } } })
    || await prisma.dataPermissionPolicy.findUnique({ where: { userId_typeId: { userId: user.userId, typeId: "*" } } })
  const scope = policy?.scope || DataScope.PERSONAL
  if (scope === DataScope.ALL) return {}
  const users = [user.userId, ...(policy?.extraUserIds || [])]
  const departments = [user.departmentId, ...(policy?.extraDepartmentIds || [])].filter((value): value is string => Boolean(value))
  if (scope === DataScope.DEPARTMENT) return { OR: [{ departmentId: { in: departments } }, { createdById: { in: users } }] }
  return { OR: [{ createdById: { in: users } }, ...(policy?.extraDepartmentIds.length ? [{ departmentId: { in: policy.extraDepartmentIds } }] : [])] }
}
