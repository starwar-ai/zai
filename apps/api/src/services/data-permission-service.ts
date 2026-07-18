import { DataScope, Prisma, type DataPermissionPolicy, type PrismaClient } from "@prisma/client"
import { prisma } from "../database.js"

export interface UserContext { userId: string; departmentId?: string }
type PermissionClient = PrismaClient | Prisma.TransactionClient
type PermissionPolicy = Pick<DataPermissionPolicy, "typeId" | "scope" | "extraDepartmentIds" | "extraUserIds">

export function permissionWhereForPolicy(policy: PermissionPolicy | null, user: UserContext): Prisma.DocumentWhereInput {
  const scope = policy?.scope || DataScope.PERSONAL
  if (scope === DataScope.ALL) return {}
  const users = [user.userId, ...(policy?.extraUserIds || [])]
  const departments = [user.departmentId, ...(policy?.extraDepartmentIds || [])].filter((value): value is string => Boolean(value))
  if (scope === DataScope.DEPARTMENT) return { OR: [{ departmentId: { in: departments } }, { createdById: { in: users } }] }
  return { OR: [{ createdById: { in: users } }, ...(policy?.extraDepartmentIds.length ? [{ departmentId: { in: policy.extraDepartmentIds } }] : [])] }
}

export async function permissionWhere(typeId: string, user: UserContext, client: PermissionClient = prisma): Promise<Prisma.DocumentWhereInput> {
  const policy = await client.dataPermissionPolicy.findUnique({ where: { userId_typeId: { userId: user.userId, typeId } } })
    || await client.dataPermissionPolicy.findUnique({ where: { userId_typeId: { userId: user.userId, typeId: "*" } } })
  return permissionWhereForPolicy(policy, user)
}

export async function visibleDocumentsWhere(typeIds: string[], user: UserContext, client: PermissionClient = prisma): Promise<Prisma.DocumentWhereInput> {
  const policies = await client.dataPermissionPolicy.findMany({ where: { userId: user.userId, typeId: { in: [...typeIds, "*"] } } })
  const fallback = policies.find((policy) => policy.typeId === "*") || null
  return visibleDocumentsWhereForPolicies(typeIds, user, policies, fallback)
}

export function visibleDocumentsWhereForPolicies(typeIds: string[], user: UserContext, policies: PermissionPolicy[], fallback: PermissionPolicy | null = null): Prisma.DocumentWhereInput {
  return {
    OR: typeIds.map((typeId) => ({
      typeId,
      ...permissionWhereForPolicy(policies.find((policy) => policy.typeId === typeId) || fallback, user),
    })),
  }
}
