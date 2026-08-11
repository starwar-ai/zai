import { createHash, randomUUID } from "node:crypto"
import { DocumentStatus, Prisma } from "@prisma/client"
import type { CustomerResearchBatchRequest, CustomerResearchBatchResult, CustomerResearchImportRequest, CustomerResearchImportResult, CustomerResearchModelConfig, CustomerResearchProcessResult, CustomerResearchQueueSummary, DetailTableData, DocumentRecord } from "@zform/shared"
import { prisma } from "../database.js"
import { BusinessError } from "../utils/business-error.js"
import { appendResearchRun, buildPreviousResearchContext, researchRunRows, replaceResearchTable } from "../documents/customer-research-history.js"
import type { UserContext } from "./data-permission-service.js"
import { permissionWhere } from "./data-permission-service.js"
import { buildSearchText, createInTransaction, findDocument } from "./document-service.js"
import { customerResearchModelConfig, researchCustomer } from "./customer-research-provider.js"
import { searchCustomerWeb } from "./tavily-search-service.js"

const typeId = "customer_due_diligence"
type Identity = UserContext & { userName: string }
let customerResearchBatchQueue: Promise<void> = Promise.resolve()

export function getCustomerResearchModelConfig(): CustomerResearchModelConfig { return customerResearchModelConfig() }
function selectedResearchProvider(requested?: string): string {
  const config = customerResearchModelConfig()
  const provider = requested || config.defaultProvider
  if (!config.options.some((option) => option.provider === provider)) throw new BusinessError("所选调查模型供应商不在 LLM_PROVIDER_ORDER 中。", 400)
  return provider
}
function researchModelForProvider(provider: string): string { return customerResearchModelConfig().options.find((option) => option.provider === provider)?.model || provider }

function text(value: unknown): string | undefined { return typeof value === "string" && value.trim() ? value.trim() : undefined }
function normalize(value?: string | null): string { return (value || "").normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ") }
function fingerprint(row: CustomerResearchImportRequest["rows"][number]): string { return createHash("sha256").update([normalize(row.companyName), normalize(row.country), normalize(row.website)].join("|")).digest("hex") }
function jsonObject(value: Prisma.JsonValue): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {} }
function importedContactData(row: CustomerResearchImportRequest["rows"][number]): Record<string, string> {
  return Object.fromEntries([
    ["contactName", row.contactName], ["contactEmail", row.contactEmail], ["contactPhone", row.contactPhone], ["businessAddress", row.businessAddress],
  ].flatMap(([key, value]) => value?.trim() ? [[key, value.trim()]] : []))
}

export async function importCustomerResearch(input: CustomerResearchImportRequest, identity: Identity): Promise<CustomerResearchImportResult> {
  return prisma.$transaction(async (client) => {
    await client.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`customer-research-import:${identity.userId}`}))`
    const existing = await client.document.findMany({ where: { typeId, createdById: identity.userId }, select: { id: true, code: true, masterData: true, detailTables: true } })
    const existingByFingerprint = new Map(existing.flatMap((item) => { const key = text(jsonObject(item.masterData).customerFingerprint); return key ? [[key, item] as const] : [] }))
    const seen = new Set<string>()
    const ids: string[] = []
    let updatedRows = 0
    for (const row of input.rows) {
      const key = fingerprint(row)
      if (seen.has(key)) continue
      seen.add(key)
      const existingDocument = existingByFingerprint.get(key)
      if (existingDocument) {
        const currentMasterData = jsonObject(existingDocument.masterData)
        const contactData = importedContactData(row)
        const changed = Object.entries(contactData).some(([field, value]) => currentMasterData[field] !== value)
        if (changed) {
          const masterData = { ...currentMasterData, ...contactData, importFileName: input.fileName }
          await client.document.update({ where: { id: existingDocument.id }, data: { masterData: masterData as Prisma.InputJsonValue, searchText: buildSearchText(existingDocument.code, masterData, existingDocument.detailTables as unknown as DetailTableData[]), version: { increment: 1 } } })
          await client.activityRecord.create({ data: { documentId: existingDocument.id, action: "import-update", operator: identity.userName, message: `重新导入并更新客户资料 ${existingDocument.code}` } })
          ids.push(existingDocument.id)
          updatedRows += 1
        }
        continue
      }
      const document = await createInTransaction(client, { typeId, masterData: {
        companyName: row.companyName.trim(), country: row.country?.trim() || "", website: row.website?.trim() || "",
        contactName: row.contactName?.trim() || "", contactEmail: row.contactEmail?.trim() || "", contactPhone: row.contactPhone?.trim() || "",
        businessAddress: row.businessAddress?.trim() || "",
        importFileName: input.fileName, customerFingerprint: fingerprint(row), attempts: 0,
      } }, { name: identity.userName, userId: identity.userId, ...(identity.departmentId ? { departmentId: identity.departmentId } : {}) })
      ids.push(document.id)
    }
    const importedRows = ids.length - updatedRows
    return { totalRows: input.rows.length, importedRows, updatedRows, skippedRows: input.rows.length - importedRows - updatedRows, documentIds: ids }
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

async function claimCustomer(id: string, identity: Identity): Promise<DocumentRecord> {
  const document = await findDocument(id, identity)
  if (document.typeId !== typeId) throw new BusinessError("当前单据不是客户背景调查。", 400)
  if (document.status !== "DRAFT" && document.status !== "COMPLETED") throw new BusinessError("只有等待调查或已完成的客户可以再次调查。", 409)
  await prisma.$transaction(async (client) => {
    let detailTables = document.detailTables
    if (document.status === "COMPLETED" && !researchRunRows(detailTables).length) {
      const sources = detailTables.find((table) => table.tableId === "sources")?.rows.map((row) => row.data) || []
      detailTables = appendResearchRun(detailTables, { id: randomUUID(), data: { runNumber: 1, status: "COMPLETED", provider: "legacy", model: String(document.masterData.modelVersion || "未知模型"), promptVersion: String(document.masterData.promptVersion || "未知版本"), startedAt: String(document.masterData.startedAt || ""), completedAt: String(document.masterData.completedAt || document.updatedAt), companySummary: String(document.masterData.companySummary || ""), overallConfidence: Number(document.masterData.overallConfidence || 0), sourceCount: sources.length, resultJson: JSON.stringify({ ...document.masterData, sources }) } })
    }
    const masterData = { ...document.masterData, status: "IN_PROGRESS", attempts: Number(document.masterData.attempts || 0) + 1, startedAt: new Date().toISOString(), failureMessage: "" }
    const updated = await client.document.updateMany({ where: { id, status: { in: [DocumentStatus.DRAFT, DocumentStatus.COMPLETED] } }, data: { status: DocumentStatus.IN_PROGRESS, masterData: masterData as Prisma.InputJsonValue, detailTables: detailTables as unknown as Prisma.InputJsonValue, version: { increment: 1 } } })
    if (!updated.count) throw new BusinessError("客户状态已变化，无法开始调查。", 409)
    await client.activityRecord.create({ data: { documentId: id, action: "research", operator: identity.userName, message: `${document.status === "COMPLETED" ? "再次" : "立即"}调查 ${document.code}` } })
  })
  return findDocument(id, identity)
}

async function finish(document: DocumentRecord, identity: Identity, success: Awaited<ReturnType<typeof researchCustomer>>, provider: string): Promise<DocumentRecord> {
  const now = new Date().toISOString()
  const { sources, ...result } = success.result
  const masterData = { ...document.masterData, ...result, status: "COMPLETED", failureMessage: "", completedAt: now, promptVersion: success.promptVersion, modelVersion: success.model }
  const runNumber = researchRunRows(document.detailTables).length + 1
  const history = appendResearchRun(document.detailTables, { id: randomUUID(), data: { runNumber, status: "COMPLETED", provider, model: success.model, promptVersion: success.promptVersion, startedAt: String(document.masterData.startedAt || ""), completedAt: now, companySummary: result.companySummary, overallConfidence: result.overallConfidence, sourceCount: sources.length, resultJson: JSON.stringify(success.result) } })
  const detailTables = replaceResearchTable(history, { tableId: "sources", rows: sources.map((source, index) => ({ id: `source-${runNumber}-${index + 1}`, data: { ...source } })) })
  await prisma.$transaction(async (client) => {
    const updated = await client.document.updateMany({ where: { id: document.id, status: DocumentStatus.IN_PROGRESS, version: document.version }, data: { status: DocumentStatus.COMPLETED, masterData: masterData as Prisma.InputJsonValue, detailTables: detailTables as unknown as Prisma.InputJsonValue, searchText: buildSearchText(document.code, masterData, detailTables), version: { increment: 1 } } })
    if (!updated.count) throw new BusinessError("调查单状态已变化，无法保存本次调查结果。", 409)
    await client.activityRecord.create({ data: { documentId: document.id, action: "research-complete", operator: identity.userName, message: `完成调查 ${document.code}` } })
  })
  return findDocument(document.id, identity)
}

async function fail(document: DocumentRecord, identity: Identity, reason: unknown, provider: string): Promise<{ document: DocumentRecord; error: string }> {
  const message = (reason instanceof Error ? reason.message : "未知调查错误").slice(0, 500)
  const completedAt = new Date().toISOString()
  const masterData = { ...document.masterData, status: "REJECTED", failureMessage: message, completedAt }
  const runNumber = researchRunRows(document.detailTables).length + 1
  const detailTables = appendResearchRun(document.detailTables, { id: randomUUID(), data: { runNumber, status: "REJECTED", provider, model: researchModelForProvider(provider), promptVersion: process.env.PROMPT_VERSION || "v1", startedAt: String(document.masterData.startedAt || ""), completedAt, errorMessage: message, resultJson: "" } })
  await prisma.$transaction(async (client) => {
    const updated = await client.document.updateMany({ where: { id: document.id, status: DocumentStatus.IN_PROGRESS, version: document.version }, data: { status: DocumentStatus.REJECTED, masterData: masterData as Prisma.InputJsonValue, detailTables: detailTables as unknown as Prisma.InputJsonValue, searchText: buildSearchText(document.code, masterData, detailTables), version: { increment: 1 } } })
    if (updated.count) await client.activityRecord.create({ data: { documentId: document.id, action: "research-failed", operator: identity.userName, message: `调查失败：${message}` } })
  })
  return { document: await findDocument(document.id, identity), error: message }
}

export async function processNextCustomerResearch(identity: Identity): Promise<CustomerResearchProcessResult> {
  const document = await claimNext(identity)
  if (!document) return { status: "empty", document: null }
  return processClaimedCustomer(document, identity)
}

type ResearchDeltaKind = "search" | "content" | "reasoning"

async function processClaimedCustomer(document: DocumentRecord, identity: Identity, provider = selectedResearchProvider(), onDelta?: (delta: string, kind: ResearchDeltaKind) => void): Promise<CustomerResearchProcessResult> {
  try {
    const previousResearch = buildPreviousResearchContext(document.detailTables)
    const customer = { companyName: String(document.masterData.companyName || ""), ...(text(document.masterData.country) ? { country: text(document.masterData.country) } : {}), ...(text(document.masterData.website) ? { website: text(document.masterData.website) } : {}), ...(text(document.masterData.contactName) ? { contactName: text(document.masterData.contactName) } : {}), ...(text(document.masterData.contactEmail) ? { contactEmail: text(document.masterData.contactEmail) } : {}), ...(text(document.masterData.businessAddress) ? { businessAddress: text(document.masterData.businessAddress) } : {}) }
    const webEvidence = await searchCustomerWeb(customer, (message) => onDelta?.(message, "search"))
    const researched = await researchCustomer({ ...customer, webEvidence, ...(previousResearch ? { previousResearch } : {}) }, provider, (delta, kind) => onDelta?.(delta, kind))
    return { status: "completed", document: await finish(document, identity, researched, provider) }
  } catch (error) { const failed = await fail(document, identity, error, provider); return { status: "failed", ...failed } }
}

export async function processCustomerResearch(id: string, identity: Identity, provider?: string, onDelta?: (delta: string, kind: ResearchDeltaKind) => void): Promise<CustomerResearchProcessResult> {
  const selectedProvider = selectedResearchProvider(provider)
  return processClaimedCustomer(await claimCustomer(id, identity), identity, selectedProvider, onDelta)
}

async function processCustomerResearchBatch(documentIds: string[], identity: Identity, provider: string): Promise<void> {
  for (const documentId of documentIds) {
    try {
      await processCustomerResearch(documentId, identity, provider)
    } catch (error) {
      const message = (error instanceof Error ? error.message : "未知调查错误").slice(0, 500)
      await prisma.activityRecord.create({ data: { documentId, action: "research-batch-failed", operator: identity.userName, message: `批量调查未能启动：${message}` } }).catch(() => undefined)
    }
  }
}

export async function queueCustomerResearchBatch(input: CustomerResearchBatchRequest, identity: Identity): Promise<CustomerResearchBatchResult> {
  const provider = selectedResearchProvider(input.provider)
  const documentIds = [...new Set(input.documentIds)]
  const documents = await Promise.all(documentIds.map((id) => findDocument(id, identity)))
  const invalid = documents.filter((document) => document.typeId !== typeId || (document.status !== "DRAFT" && document.status !== "COMPLETED"))
  if (invalid.length) throw new BusinessError(`所选客户中有 ${invalid.length} 条不处于等待调查或调查完成状态，请刷新列表后重试。`, 409)
  const batchId = randomUUID()
  customerResearchBatchQueue = customerResearchBatchQueue.then(() => processCustomerResearchBatch(documentIds, identity, provider)).catch((error: unknown) => {
    console.error(`[customer-research:${batchId}] 后台批量调查异常`, error)
  })
  return { batchId, acceptedCount: documentIds.length }
}

export async function retryCustomerResearch(id: string, identity: Identity): Promise<DocumentRecord> {
  const document = await findDocument(id, identity)
  if (document.typeId !== typeId) throw new BusinessError("当前单据不是客户背景调查。", 400)
  if (document.status !== "REJECTED" && document.status !== "IN_PROGRESS") throw new BusinessError("只有调查失败或调查中的客户可以重新加入。", 409)
  const masterData = { ...document.masterData, status: "DRAFT", failureMessage: "", startedAt: "", completedAt: "" }
  await prisma.$transaction(async (client) => {
    const updated = await client.document.updateMany({ where: { id, status: document.status as DocumentStatus, version: document.version }, data: { status: DocumentStatus.DRAFT, masterData: masterData as Prisma.InputJsonValue, version: { increment: 1 } } })
    if (!updated.count) throw new BusinessError("客户状态已变化，请刷新后重试。", 409)
    await client.activityRecord.create({ data: { documentId: id, action: document.status === "IN_PROGRESS" ? "research-interrupted" : "research-retry", operator: identity.userName, message: `${document.status === "IN_PROGRESS" ? "中断当前调查并" : ""}重新加入调查队列 ${document.code}` } })
  })
  return findDocument(id, identity)
}
