import { DataScope, Prisma, type DataPermissionPolicy, type PrismaClient } from "@prisma/client"
import { prisma } from "../database.js"

export interface UserContext { userId: string; departmentId?: string }
type PermissionClient = PrismaClient | Prisma.TransactionClient
type PermissionPolicy = Pick<DataPermissionPolicy, "typeId" | "scope" | "extraDepartmentIds" | "extraUserIds">

export interface ResolvedDataPermission {
  scope: DataScope
  userIds: string[]
  departmentIds: string[]
  extraDepartmentIds: string[]
}

export function resolveDataPermissionForPolicy(policy: PermissionPolicy | null, user: UserContext): ResolvedDataPermission {
  return {
    scope: policy?.scope || DataScope.PERSONAL,
    userIds: [user.userId, ...(policy?.extraUserIds || [])],
    departmentIds: [user.departmentId, ...(policy?.extraDepartmentIds || [])].filter((value): value is string => Boolean(value)),
    extraDepartmentIds: policy?.extraDepartmentIds || [],
  }
}

export function permissionWhereForPolicy(policy: PermissionPolicy | null, user: UserContext): Prisma.DocumentWhereInput {
  const permission = resolveDataPermissionForPolicy(policy, user)
  if (permission.scope === DataScope.ALL) return {}
  if (permission.scope === DataScope.DEPARTMENT) return { OR: [{ departmentId: { in: permission.departmentIds } }, { createdById: { in: permission.userIds } }] }
  return { OR: [{ createdById: { in: permission.userIds } }, ...(permission.extraDepartmentIds.length ? [{ departmentId: { in: permission.extraDepartmentIds } }] : [])] }
}

async function findPermissionPolicy(typeId: string, user: UserContext, client: PermissionClient): Promise<PermissionPolicy | null> {
  return await client.dataPermissionPolicy.findUnique({ where: { userId_typeId: { userId: user.userId, typeId } } })
    || await client.dataPermissionPolicy.findUnique({ where: { userId_typeId: { userId: user.userId, typeId: "*" } } })
}

export async function permissionWhere(typeId: string, user: UserContext, client: PermissionClient = prisma): Promise<Prisma.DocumentWhereInput> {
  return permissionWhereForPolicy(await findPermissionPolicy(typeId, user, client), user)
}

export async function resolveDataPermission(typeId: string, user: UserContext, client: PermissionClient = prisma): Promise<ResolvedDataPermission> {
  return resolveDataPermissionForPolicy(await findPermissionPolicy(typeId, user, client), user)
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
