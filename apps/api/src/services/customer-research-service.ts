import { createHash } from "node:crypto"
import { DocumentStatus, Prisma } from "@prisma/client"
import type { CustomerResearchImportRequest, CustomerResearchImportResult, CustomerResearchProcessResult, CustomerResearchQueueSummary, DetailTableData, DocumentRecord } from "@zform/shared"
import { prisma } from "../database.js"
import { BusinessError } from "../utils/business-error.js"
import type { UserContext } from "./data-permission-service.js"
import { permissionWhere } from "./data-permission-service.js"
import { buildSearchText, createInTransaction, findDocument } from "./document-service.js"
import { researchCustomer } from "./customer-research-provider.js"

const typeId = "customer_due_diligence"
type Identity = UserContext & { userName: string }

function text(value: unknown): string | undefined { return typeof value === "string" && value.trim() ? value.trim() : undefined }
function normalize(value?: string | null): string { return (value || "").normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ") }
function fingerprint(row: CustomerResearchImportRequest["rows"][number]): string { return createHash("sha256").update([normalize(row.companyName), normalize(row.country), normalize(row.website)].join("|")).digest("hex") }
function jsonObject(value: Prisma.JsonValue): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {} }

export async function importCustomerResearch(input: CustomerResearchImportRequest, identity: Identity): Promise<CustomerResearchImportResult> {
  return prisma.$transaction(async (client) => {
    await client.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`customer-research-import:${identity.userId}`}))`
    const keys = input.rows.map(fingerprint)
    const existing = await client.document.findMany({ where: { typeId, createdById: identity.userId }, select: { masterData: true } })
    const seen = new Set(existing.map((item) => text(jsonObject(item.masterData).customerFingerprint)).filter((value): value is string => Boolean(value)))
    const rows = input.rows.filter((_row, index) => { const key = keys[index]!; if (seen.has(key)) return false; seen.add(key); return true })
    const ids: string[] = []
    for (const row of rows) {
      const document = await createInTransaction(client, { typeId, masterData: {
        companyName: row.companyName.trim(), country: row.country?.trim() || "", website: row.website?.trim() || "",
        contactName: row.contactName?.trim() || "", contactEmail: row.contactEmail?.trim() || "", contactPhone: row.contactPhone?.trim() || "",
        importFileName: input.fileName, customerFingerprint: fingerprint(row), attempts: 0,
      } }, { name: identity.userName, userId: identity.userId, ...(identity.departmentId ? { departmentId: identity.departmentId } : {}) })
      ids.push(document.id)
    }
    return { totalRows: input.rows.length, importedRows: rows.length, skippedRows: input.rows.length - rows.length, documentIds: ids }
  }, { timeout: 60_000 })
}

export async function getCustomerResearchSummary(user: UserContext): Promise<CustomerResearchQueueSummary> {
  const visibility = await permissionWhere(typeId, user)
  const grouped = await prisma.document.groupBy({ by: ["status"], where: { typeId, ...visibility }, _count: { _all: true } })
  const count = (status: DocumentStatus) => grouped.find((item) => item.status === status)?._count._all || 0
  const current = await prisma.document.findFirst({ where: { typeId, status: DocumentStatus.IN_PROGRESS, ...visibility }, orderBy: { updatedAt: "asc" } })
  const pending = count(DocumentStatus.DRAFT); const researching = count(DocumentStatus.IN_PROGRESS); const completed = count(DocumentStatus.COMPLETED); const failed = count(DocumentStatus.REJECTED)
  return { pending, researching, completed, failed, total: pending + researching + completed + failed, ...(current ? { current: { id: current.id, code: current.code, companyName: String(jsonObject(current.masterData).companyName || "未命名客户") } } : {}) }
}

async function claimNext(identity: Identity): Promise<DocumentRecord | null> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const claimedId = await prisma.$transaction(async (client) => {
      const visibility = await permissionWhere(typeId, identity, client)
      const candidate = await client.document.findFirst({ where: { typeId, status: DocumentStatus.DRAFT, ...visibility }, orderBy: [{ createdAt: "asc" }, { code: "asc" }] })
      if (!candidate) return null
      const masterData = { ...jsonObject(candidate.masterData), status: "IN_PROGRESS", attempts: Number(jsonObject(candidate.masterData).attempts || 0) + 1, startedAt: new Date().toISOString(), failureMessage: "" }
      const updated = await client.document.updateMany({ where: { id: candidate.id, status: DocumentStatus.DRAFT }, data: { status: DocumentStatus.IN_PROGRESS, masterData: masterData as Prisma.InputJsonValue, version: { increment: 1 } } })
      if (!updated.count) return "retry"
      await client.activityRecord.create({ data: { documentId: candidate.id, action: "research", operator: identity.userName, message: `开始调查 ${candidate.code}` } })
      return candidate.id
    })
    if (claimedId === null) return null
    if (claimedId !== "retry") return findDocument(claimedId, identity)
  }
  return null
}

async function finish(document: DocumentRecord, identity: Identity, success: Awaited<ReturnType<typeof researchCustomer>>): Promise<DocumentRecord> {
  const now = new Date().toISOString()
  const { sources, ...result } = success.result
  const masterData = { ...document.masterData, ...result, status: "COMPLETED", failureMessage: "", completedAt: now, promptVersion: success.promptVersion, modelVersion: success.model }
  const detailTables: DetailTableData[] = [{ tableId: "sources", rows: sources.map((source, index) => ({ id: `source-${index + 1}`, data: { ...source } })) }]
  await prisma.$transaction(async (client) => {
    const updated = await client.document.updateMany({ where: { id: document.id, status: DocumentStatus.IN_PROGRESS }, data: { status: DocumentStatus.COMPLETED, masterData: masterData as Prisma.InputJsonValue, detailTables: detailTables as unknown as Prisma.InputJsonValue, searchText: buildSearchText(document.code, masterData, detailTables), version: { increment: 1 } } })
    if (!updated.count) throw new BusinessError("调查单状态已变化，无法保存本次调查结果。", 409)
    await client.activityRecord.create({ data: { documentId: document.id, action: "research-complete", operator: identity.userName, message: `完成调查 ${document.code}` } })
  })
  return findDocument(document.id, identity)
}

async function fail(document: DocumentRecord, identity: Identity, reason: unknown): Promise<{ document: DocumentRecord; error: string }> {
  const message = (reason instanceof Error ? reason.message : "未知调查错误").slice(0, 500)
  const masterData = { ...document.masterData, status: "REJECTED", failureMessage: message, completedAt: new Date().toISOString() }
  await prisma.$transaction(async (client) => {
    await client.document.updateMany({ where: { id: document.id, status: DocumentStatus.IN_PROGRESS }, data: { status: DocumentStatus.REJECTED, masterData: masterData as Prisma.InputJsonValue, version: { increment: 1 } } })
    await client.activityRecord.create({ data: { documentId: document.id, action: "research-failed", operator: identity.userName, message: `调查失败：${message}` } })
  })
  return { document: await findDocument(document.id, identity), error: message }
}

export async function processNextCustomerResearch(identity: Identity): Promise<CustomerResearchProcessResult> {
  const document = await claimNext(identity)
  if (!document) return { status: "empty", document: null }
  try {
    const researched = await researchCustomer({ companyName: String(document.masterData.companyName || ""), ...(text(document.masterData.country) ? { country: text(document.masterData.country) } : {}), ...(text(document.masterData.website) ? { website: text(document.masterData.website) } : {}), ...(text(document.masterData.contactName) ? { contactName: text(document.masterData.contactName) } : {}), ...(text(document.masterData.contactEmail) ? { contactEmail: text(document.masterData.contactEmail) } : {}) })
    return { status: "completed", document: await finish(document, identity, researched) }
  } catch (error) { const failed = await fail(document, identity, error); return { status: "failed", ...failed } }
}

export async function retryCustomerResearch(id: string, identity: Identity): Promise<DocumentRecord> {
  const document = await findDocument(id, identity)
  if (document.typeId !== typeId) throw new BusinessError("当前单据不是客户背景调查。", 400)
  if (document.status !== "REJECTED") throw new BusinessError("只有调查失败的客户可以重试。", 409)
  const masterData = { ...document.masterData, status: "DRAFT", failureMessage: "", startedAt: "", completedAt: "" }
  await prisma.$transaction(async (client) => {
    await client.document.update({ where: { id }, data: { status: DocumentStatus.DRAFT, masterData: masterData as Prisma.InputJsonValue, version: { increment: 1 } } })
    await client.activityRecord.create({ data: { documentId: id, action: "research-retry", operator: identity.userName, message: `重新加入调查队列 ${document.code}` } })
  })
  return findDocument(id, identity)
}
