import { DocumentStatus as PrismaDocumentStatus, Prisma, type Document as PrismaDocument, type PrismaClient } from "@prisma/client"
import { randomUUID } from "node:crypto"
import { applyPushDownRule, assessDocumentImpact, evaluateCondition, type ActivityRecord, type DashboardData, type DetailRowData, type DetailTableData, type DocumentAction, type DocumentCreateRequest, type DocumentListQuery, type DocumentRecord, type DocumentStatus, type DocumentUpdateRequest, type ImpactAssessment, type ListResponse, type TraceGraph } from "@zform/shared"
import { prisma } from "../database.js"
import { getSchema, schemas } from "../documents/schemas.js"
import { statusTransitions } from "../documents/workflow.js"
import { BusinessError } from "../utils/business-error.js"
import { permissionWhere, visibleDocumentsWhere, type UserContext } from "./data-permission-service.js"

type DatabaseClient = PrismaClient | Prisma.TransactionClient
const documentTypeIds = schemas.map((schema) => schema.typeId)

async function visibilityWhere(user: UserContext, client: DatabaseClient = prisma): Promise<Prisma.DocumentWhereInput> {
  return visibleDocumentsWhere(documentTypeIds, user, client)
}

export function operator(headers: Record<string, string | string[] | undefined>): string {
  const name = headers["x-user-name"]
  return typeof name === "string" && name.trim() ? decodeURIComponent(name) : "系统管理员"
}

function owner(headers: Record<string, string | string[] | undefined>) {
  const userId = headers["x-user-id"]
  const departmentId = headers["x-user-department-id"]
  return {
    name: operator(headers),
    userId: typeof userId === "string" && userId ? userId : "anonymous",
    ...(typeof departmentId === "string" && departmentId ? { departmentId } : {}),
  }
}

function buildSearchText(code: string, masterData: Record<string, unknown>, detailTables: DetailTableData[]): string {
  const values: string[] = [code]
  const collect = (value: unknown): void => {
    if (value === null || value === undefined) return
    if (["string", "number", "boolean"].includes(typeof value)) { values.push(String(value)); return }
    if (Array.isArray(value)) { value.forEach(collect); return }
    if (typeof value === "object") Object.values(value as Record<string, unknown>).forEach(collect)
  }
  collect(masterData); collect(detailTables)
  return values.join(" ").slice(0, 20000)
}

function normalizeDetailTables(value: unknown): DetailTableData[] {
  if (!Array.isArray(value)) return []
  return value.map((table, tableIndex) => {
    const candidate = table as { tableId?: unknown; rows?: unknown }
    const rows = Array.isArray(candidate.rows) ? candidate.rows.map((row, rowIndex): DetailRowData => {
      const item = row as Record<string, unknown>
      if (typeof item.id === "string" && item.data && typeof item.data === "object") return item as unknown as DetailRowData
      return { id: `legacy-${tableIndex}-${rowIndex}`, data: item }
    }) : []
    return { tableId: String(candidate.tableId || `table-${tableIndex}`), rows }
  })
}

export function toDocumentRecord(row: PrismaDocument): DocumentRecord {
  return {
    id: row.id,
    typeId: row.typeId,
    code: row.code,
    status: row.status as DocumentStatus,
    masterData: row.masterData as Record<string, unknown>,
    detailTables: normalizeDetailTables(row.detailTables),
    ...(row.sourceDocumentId && row.sourceTypeId && row.sourceCode ? {
      sourceRef: { documentId: row.sourceDocumentId, typeId: row.sourceTypeId, code: row.sourceCode },
    } : {}),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    createdBy: row.createdBy,
    version: row.version,
  }
}

function toActivityRecord(row: { id: string; documentId: string; action: string; operator: string; message: string; createdAt: Date }): ActivityRecord {
  return { ...row, createdAt: row.createdAt.toISOString() }
}

function validateDocument(typeId: string, masterData: Record<string, unknown>, detailTables: DetailTableData[]): void {
  const schema = getSchema(typeId)
  for (const field of schema.masterFields) {
    if (field.visibleWhen && !evaluateCondition(field.visibleWhen, masterData)) continue
    const value = masterData[field.id]
    const required = field.required || Boolean(field.requiredWhen && evaluateCondition(field.requiredWhen, masterData))
    if (required && (value === undefined || value === null || value === "")) throw new BusinessError(`“${field.label}”为必填项。`)
  }
  for (const table of schema.detailTables) {
    if (table.visibleWhen && !evaluateCondition(table.visibleWhen, masterData)) continue
    const rows = detailTables.find((item) => item.tableId === table.id)?.rows || []
    if (table.minRows && rows.length < table.minRows) throw new BusinessError(`“${table.label}”至少需要 ${table.minRows} 行。`)
    if (table.maxRows && rows.length > table.maxRows) throw new BusinessError(`“${table.label}”最多允许 ${table.maxRows} 行。`)
    rows.forEach((row, rowIndex) => table.fields.forEach((field) => {
      if (field.visibleWhen && !evaluateCondition(field.visibleWhen, row.data)) return
      const compositeField = field.type === "price" ? field.price?.amountField : field.type === "ratio" ? field.ratio?.numeratorField : undefined
      const value = row.data[compositeField || field.id]
      const required = field.required || Boolean(field.requiredWhen && evaluateCondition(field.requiredWhen, row.data))
      if (required && (value === undefined || value === null || value === "")) throw new BusinessError(`“${table.label}”第 ${rowIndex + 1} 行的“${field.label}”为必填项。`)
      if (field.type === "number" && value !== undefined && value !== "" && (!Number.isFinite(Number(value)) || Number(value) < 0)) throw new BusinessError(`“${field.label}”必须是非负数字。`)
    }))
  }
}

async function nextCode(client: DatabaseClient, typeId: string): Promise<string> {
  const schema = getSchema(typeId)
  const now = new Date()
  const period = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`
  const sequence = await client.documentSequence.upsert({
    where: { typeId_period: { typeId, period } },
    create: { typeId, period, value: 1 },
    update: { value: { increment: 1 } },
  })
  return `${schema.codePrefix}-${period}-${String(sequence.value).padStart(4, "0")}`
}

async function createInTransaction(client: Prisma.TransactionClient, input: { typeId: string; masterData?: Record<string, unknown>; detailTables?: DetailTableData[]; source?: DocumentRecord }, creator: { name: string; userId: string; departmentId?: string }): Promise<PrismaDocument> {
  const schema = getSchema(input.typeId)
  const defaults = Object.fromEntries(schema.masterFields.filter((field) => field.defaultValue !== undefined).map((field) => [field.id, field.defaultValue]))
  const code = await nextCode(client, input.typeId)
  const document = await client.document.create({
    data: {
      typeId: input.typeId,
      code,
      status: PrismaDocumentStatus.DRAFT,
      masterData: { ...defaults, ...input.masterData, status: "DRAFT" } as Prisma.InputJsonValue,
      detailTables: (input.detailTables || []) as unknown as Prisma.InputJsonValue,
      searchText: buildSearchText(code, { ...defaults, ...input.masterData, status: "DRAFT" }, input.detailTables || []),
      createdBy: creator.name,
      createdById: creator.userId,
      departmentId: creator.departmentId,
      sourceDocumentId: input.source?.id,
      sourceTypeId: input.source?.typeId,
      sourceCode: input.source?.code,
      activities: { create: { action: "create", operator: creator.name, message: `创建了${schema.typeName} ${code}` } },
    },
  })
  return document
}

export async function listDocuments(params: DocumentListQuery, user: UserContext = { userId: "anonymous" }): Promise<ListResponse<DocumentRecord>> {
  const page = Math.max(1, params.page || 1)
  const pageSize = Math.min(100, Math.max(5, params.pageSize || 20))
  const where: Prisma.DocumentWhereInput = {
    ...(params.typeId ? { typeId: params.typeId } : {}),
    ...(params.status && Object.values(PrismaDocumentStatus).includes(params.status as PrismaDocumentStatus) ? { status: params.status as PrismaDocumentStatus } : {}),
    ...(params.search?.trim() ? { searchText: { contains: params.search.trim(), mode: "insensitive" } } : {}),
    ...(params.typeId ? await permissionWhere(params.typeId, user) : { createdById: user.userId }),
  }
  const sortBy = params.sortBy || "updatedAt"
  const sortDirection = params.sortDirection || "desc"
  const [rows, total] = await prisma.$transaction([
    prisma.document.findMany({ where, orderBy: { [sortBy]: sortDirection }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.document.count({ where }),
  ])
  return { items: rows.map(toDocumentRecord), total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) }
}

export async function findDocument(id: string, user: UserContext, client: DatabaseClient = prisma): Promise<DocumentRecord> {
  const document = await client.document.findFirst({ where: { id, ...(await visibilityWhere(user, client)) } })
  if (!document) throw new BusinessError("单据不存在或已被删除。", 404)
  return toDocumentRecord(document)
}

export async function listActivities(user: UserContext, documentId?: string): Promise<ActivityRecord[]> {
  const visibleWhere = await visibilityWhere(user)
  if (documentId) await findDocument(documentId, user)
  const rows = await prisma.activityRecord.findMany({
    where: { ...(documentId ? { documentId } : {}), document: { is: visibleWhere } },
    orderBy: { createdAt: "desc" },
    take: documentId ? 100 : 50,
  })
  return rows.map(toActivityRecord)
}

export async function createDocument(input: DocumentCreateRequest, headers: Record<string, string | string[] | undefined>): Promise<DocumentRecord> {
  const document = await prisma.$transaction((client) => createInTransaction(client, input, owner(headers)))
  return toDocumentRecord(document)
}

export function preserveDetailSourceReferences(current: DetailTableData[], next: DetailTableData[]): DetailTableData[] {
  const sourceReferences = new Map(current.flatMap((table) => table.rows.flatMap((row) => row.sourceRef ? [[`${table.tableId}:${row.id}`, row.sourceRef] as const] : [])))
  return next.map((table) => ({
    ...table,
    rows: table.rows.map((row) => {
      const sourceRef = sourceReferences.get(`${table.tableId}:${row.id}`)
      return { id: row.id, data: row.data, ...(sourceRef ? { sourceRef } : {}) }
    }),
  }))
}

export async function updateDocument(id: string, input: DocumentUpdateRequest, headers: Record<string, string | string[] | undefined>, user: UserContext): Promise<DocumentRecord> {
  return prisma.$transaction(async (client) => {
    const document = await findDocument(id, user, client)
    if (!["DRAFT", "REJECTED"].includes(document.status)) throw new BusinessError("只有草稿或已驳回的单据可以编辑。")
    if (input.version !== document.version) throw new BusinessError("单据已被其他用户更新，请刷新后重试。", 409)
    const masterData = { ...document.masterData, ...input.masterData, status: document.status }
    const detailTables = input.detailTables ? preserveDetailSourceReferences(document.detailTables, input.detailTables) : document.detailTables
    validateDocument(document.typeId, masterData, detailTables)
    const schema = getSchema(document.typeId)
    const downstreamRows = await client.document.findMany({ where: { sourceDocumentId: id } })
    const impact = assessDocumentImpact(document, masterData, schema.impactRules || [], downstreamRows.map(toDocumentRecord))
    if (!impact.canProceed) throw new BusinessError(impact.summary, 422)
    const updated = await client.document.updateMany({
      where: { id, version: document.version, status: { in: [PrismaDocumentStatus.DRAFT, PrismaDocumentStatus.REJECTED] } },
      data: { masterData: masterData as Prisma.InputJsonValue, detailTables: detailTables as unknown as Prisma.InputJsonValue, searchText: buildSearchText(document.code, masterData, detailTables), version: { increment: 1 } },
    })
    if (updated.count !== 1) throw new BusinessError("单据已被其他用户更新，请刷新后重试。", 409)
    await client.activityRecord.create({ data: { documentId: id, action: "update", operator: operator(headers), message: `更新了${document.code}` } })
    return findDocument(id, user, client)
  })
}

export async function removeDocument(id: string, user: UserContext): Promise<void> {
  await prisma.$transaction(async (client) => {
    const document = await findDocument(id, user, client)
    if (document.status !== "DRAFT") throw new BusinessError("只有草稿单据可以删除。")
    await client.document.delete({ where: { id } })
  })
}

export async function executeAction(id: string, action: DocumentAction, headers: Record<string, string | string[] | undefined>, user: UserContext, comment?: string): Promise<DocumentRecord> {
  return prisma.$transaction(async (client) => {
    const document = await findDocument(id, user, client)
    const schema = getSchema(document.typeId)
    const configured = schema.formActions?.find((item) => item.command === "workflow" && item.workflowAction === action)
    const legacyAllowed = (schema.actions?.[document.status] || []).includes(action)
    const configuredAllowed = configured && (!configured.allowedStatuses || configured.allowedStatuses.includes(document.status)) && evaluateCondition(configured.visibleWhen, document.masterData)
    if (!legacyAllowed && !configuredAllowed) throw new BusinessError("当前状态不能执行该操作。")
    if (action === "submit") validateDocument(document.typeId, document.masterData, document.detailTables)
    const nextStatus = statusTransitions[action]
    if (!nextStatus) throw new BusinessError("未知的流程操作。")
    const masterData = { ...document.masterData, status: nextStatus }
    const updated = await client.document.updateMany({
      where: { id, version: document.version, status: document.status as PrismaDocumentStatus },
      data: { status: nextStatus as PrismaDocumentStatus, masterData: masterData as Prisma.InputJsonValue, version: { increment: 1 } },
    })
    if (updated.count !== 1) throw new BusinessError("单据状态已经变化，请刷新后重试。", 409)
    const suffix = comment?.trim() ? `：${comment.trim()}` : ""
    const actionText = action === "approve" ? "审批通过" : action === "reject" ? "驳回" : action === "submit" ? "提交审批" : action === "complete" ? "标记完成" : "取消"
    await client.activityRecord.create({ data: { documentId: id, action, operator: operator(headers), message: `${actionText} ${document.code}${suffix}` } })
    return findDocument(id, user, client)
  })
}

export async function pushDown(id: string, targetTypeId: string, headers: Record<string, string | string[] | undefined>, user: UserContext): Promise<DocumentRecord> {
  try {
    return await prisma.$transaction(async (client) => {
      const source = await findDocument(id, user, client)
      const sourceSchema = getSchema(source.typeId)
      const targetSchema = getSchema(targetTypeId)
      const rule = sourceSchema.pushDownRules?.find((item) => item.targetTypeId === targetTypeId)
      if (!rule) throw new BusinessError(`不支持从${sourceSchema.typeName}下推到${targetSchema.typeName}。`)
      if (rule.allowedStatuses && !rule.allowedStatuses.includes(source.status)) throw new BusinessError("当前状态不能执行该下推规则。")
      const duplicated = await client.document.findFirst({ where: { sourceDocumentId: id, typeId: targetTypeId } })
      if (duplicated) throw new BusinessError(`已下推生成 ${duplicated.code}，不能重复下推。`)
      const mapped = applyPushDownRule(source, rule, randomUUID)
      const target = await createInTransaction(client, { typeId: targetTypeId, ...mapped, source }, owner(headers))
      await client.activityRecord.create({ data: { documentId: source.id, action: "push_down", operator: operator(headers), message: `下推生成${targetSchema.typeName} ${target.code}` } })
      return toDocumentRecord(target)
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2002" || error.code === "P2034")) throw new BusinessError("该单据已被下推或正在处理，请刷新后重试。", 409)
    throw error
  }
}

export async function assessImpact(id: string, nextMasterData: Record<string, unknown>, user: UserContext): Promise<ImpactAssessment> {
  const source = await findDocument(id, user)
  const schema = getSchema(source.typeId)
  const downstreamRows = await prisma.document.findMany({ where: { sourceDocumentId: id } })
  return assessDocumentImpact(source, nextMasterData, schema.impactRules || [], downstreamRows.map(toDocumentRecord))
}

export async function getTrace(id: string, user: UserContext): Promise<TraceGraph> {
  const source = await findDocument(id, user)
  const visibleWhere = await visibilityWhere(user)
  const [downstreamRows, upstream] = await Promise.all([
    prisma.document.findMany({ where: { sourceDocumentId: id, ...visibleWhere }, orderBy: { createdAt: "asc" } }),
    source.sourceRef ? prisma.document.findFirst({ where: { id: source.sourceRef.documentId, ...visibleWhere }, select: { id: true } }) : null,
  ])
  return {
    upstream: upstream ? source.sourceRef : undefined,
    downstream: downstreamRows.map((row) => ({ documentId: row.id, typeId: row.typeId, code: row.code })),
  }
}

export async function getDashboard(user: UserContext): Promise<DashboardData> {
  const monthStart = new Date()
  monthStart.setUTCDate(1)
  monthStart.setUTCHours(0, 0, 0, 0)
  const visibleWhere = await visibilityWhere(user)
  const [totalDocuments, statusGroups, typeGroups, completedThisMonth, recentRows, activityRows] = await Promise.all([
    prisma.document.count({ where: visibleWhere }),
    prisma.document.groupBy({ by: ["status"], where: visibleWhere, _count: { _all: true } }),
    prisma.document.groupBy({ by: ["typeId"], where: visibleWhere, _count: { _all: true } }),
    prisma.document.count({ where: { ...visibleWhere, status: PrismaDocumentStatus.COMPLETED, updatedAt: { gte: monthStart } } }),
    prisma.document.findMany({ where: visibleWhere, orderBy: { updatedAt: "desc" }, take: 6 }),
    prisma.activityRecord.findMany({ where: { document: { is: visibleWhere } }, orderBy: { createdAt: "desc" }, take: 8 }),
  ])
  const statusCounts = Object.fromEntries(Object.values(PrismaDocumentStatus).map((status) => [status, statusGroups.find((group) => group.status === status)?._count._all || 0])) as Record<DocumentStatus, number>
  return {
    totalDocuments,
    pendingApprovals: statusCounts.PENDING,
    inProgress: statusCounts.IN_PROGRESS,
    completedThisMonth,
    statusCounts,
    typeCounts: schemas.map((schema) => ({ typeId: schema.typeId, typeName: schema.typeName, count: typeGroups.find((group) => group.typeId === schema.typeId)?._count._all || 0 })),
    recentDocuments: recentRows.map(toDocumentRecord),
    recentActivities: activityRows.map(toActivityRecord),
  }
}
