import { Prisma, type DeclarationNameMapping } from "@prisma/client"
import { evaluateDeclarationNameReview, normalizeDeclarationName, type DeclarationNameApproveRequest, type DeclarationNameInput, type DeclarationNameJob, type DeclarationNameMapping as DeclarationNameMappingDto, type DeclarationNameRejectRequest, type DeclarationNameResolveRequest, type DeclarationNameResolveResult, type DeclarationNameWritebackRequest, type DeclarationNameWritebackResult, type ListResponse } from "@zform/shared"
import { prisma } from "../database.js"
import { BusinessError } from "../utils/business-error.js"
import { generateDeclarationName, sanitizeProviderError } from "./declaration-name-generator.js"

const maxBatchResolve = Number(process.env.MAX_BATCH_RESOLVE || 100)
const autoApproveConfidence = Number(process.env.AUTO_APPROVE_CONFIDENCE || 0.9)
const promptVersion = process.env.PROMPT_VERSION || "v1"

function json(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue }

function toMapping(row: DeclarationNameMapping): DeclarationNameMappingDto {
  return {
    id: row.id, name: row.rawName, nameEng: row.rawNameEng,
    ...(row.declarationName ? { declarationName: row.declarationName } : {}),
    ...(row.customsDeclarationNameEng ? { customsDeclarationNameEng: row.customsDeclarationNameEng } : {}),
    ...(row.confidence !== null ? { confidence: Number(row.confidence) } : {}),
    reviewRequired: row.reviewRequired, reviewReason: row.reviewReason || "", status: row.status,
    ...(row.promptVersion ? { promptVersion: row.promptVersion } : {}), ...(row.modelVersion ? { modelVersion: row.modelVersion } : {}),
    ...(row.approvedBy ? { approvedBy: row.approvedBy } : {}), ...(row.approvedAt ? { approvedAt: row.approvedAt.toISOString() } : {}),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function assertItems(items: DeclarationNameInput[]): void {
  if (!items.length) throw new BusinessError("items 不能为空。")
  if (items.length > maxBatchResolve) throw new BusinessError(`单次最多处理 ${maxBatchResolve} 条。`)
}

async function ensureMapping(item: DeclarationNameInput): Promise<DeclarationNameMapping> {
  const name = item.name.trim()
  const nameEng = item.nameEng.trim()
  const normalizedName = normalizeDeclarationName(name)
  const normalizedNameEng = normalizeDeclarationName(nameEng)
  const mapping = await prisma.declarationNameMapping.upsert({
    where: { normalizedName_normalizedNameEng: { normalizedName, normalizedNameEng } }, update: {},
    create: { normalizedName, normalizedNameEng, rawName: name, rawNameEng: nameEng },
  })
  if (item.shipmentItemId) {
    await prisma.declarationNameSourceItem.upsert({
      where: { sourceType_sourceItemId: { sourceType: "SHIPMENT", sourceItemId: item.shipmentItemId } },
      update: { rawName: name, rawNameEng: nameEng, normalizedName, normalizedNameEng },
      create: { sourceType: "SHIPMENT", sourceItemId: item.shipmentItemId, rawName: name, rawNameEng: nameEng, normalizedName, normalizedNameEng },
    })
  }
  return mapping
}

async function createJob(mappingIds: string[], userId: string): Promise<string> {
  const ids = [...new Set(mappingIds)]
  const job = await prisma.declarationNameGenerationJob.create({ data: { inputCount: ids.length, createdBy: userId, items: { create: ids.map((mappingId) => ({ mappingId })) } } })
  void processDeclarationNameJob(job.id).catch(async (error: unknown) => {
    const message = sanitizeProviderError(error instanceof Error ? error.message : String(error))
    await prisma.declarationNameGenerationJob.update({ where: { id: job.id }, data: { status: "FAILED", errorMessage: message, finishedAt: new Date() } }).catch(() => undefined)
  })
  return job.id
}

export async function resolveDeclarationNames(request: DeclarationNameResolveRequest, userId: string): Promise<DeclarationNameResolveResult> {
  assertItems(request.items)
  const mappings = await Promise.all(request.items.map(ensureMapping))
  const missing = mappings.filter((item) => item.status === "PENDING" || item.status === "FAILED")
  const jobId = request.createMissing !== false && missing.length ? await createJob(missing.map((item) => item.id), userId) : undefined
  return { ...(jobId ? { jobId } : {}), items: mappings.map(toMapping) }
}

export async function generateDeclarationNames(items: DeclarationNameInput[], userId: string): Promise<{ jobId: string; inputCount: number }> {
  assertItems(items)
  const mappings = await Promise.all(items.map(ensureMapping))
  return { jobId: await createJob(mappings.map((item) => item.id), userId), inputCount: mappings.length }
}

export async function listDeclarationNameReviews(input: { keyword?: string; page: number; pageSize: number }): Promise<ListResponse<DeclarationNameMappingDto>> {
  const where: Prisma.DeclarationNameMappingWhereInput = {
    status: "REVIEW_REQUIRED",
    ...(input.keyword ? { OR: [{ rawName: { contains: input.keyword, mode: "insensitive" } }, { rawNameEng: { contains: input.keyword, mode: "insensitive" } }, { reviewReason: { contains: input.keyword, mode: "insensitive" } }] } : {}),
  }
  const [items, total] = await Promise.all([
    prisma.declarationNameMapping.findMany({ where, orderBy: { updatedAt: "desc" }, skip: (input.page - 1) * input.pageSize, take: input.pageSize }),
    prisma.declarationNameMapping.count({ where }),
  ])
  return { items: items.map(toMapping), total, page: input.page, pageSize: input.pageSize, pageCount: Math.max(1, Math.ceil(total / input.pageSize)) }
}

export async function getDeclarationNameJob(id: string): Promise<DeclarationNameJob> {
  const job = await prisma.declarationNameGenerationJob.findUnique({ where: { id } })
  if (!job) throw new BusinessError("生成任务不存在。", 404)
  return { id: job.id, status: job.status, inputCount: job.inputCount, successCount: job.successCount, failedCount: job.failedCount, reviewCount: job.reviewCount, ...(job.errorMessage ? { errorMessage: job.errorMessage } : {}), createdAt: job.createdAt.toISOString(), ...(job.startedAt ? { startedAt: job.startedAt.toISOString() } : {}), ...(job.finishedAt ? { finishedAt: job.finishedAt.toISOString() } : {}) }
}

export async function approveDeclarationName(id: string, request: DeclarationNameApproveRequest, actor: string): Promise<DeclarationNameMappingDto> {
  const current = await prisma.declarationNameMapping.findUnique({ where: { id } })
  if (!current) throw new BusinessError("报关名称映射不存在。", 404)
  const declarationName = request.declarationName?.trim() || current.declarationName
  const customsDeclarationNameEng = request.customsDeclarationNameEng?.trim().toUpperCase() || current.customsDeclarationNameEng
  if (!declarationName || !customsDeclarationNameEng) throw new BusinessError("中英文报关名不能为空。")
  const saved = await prisma.$transaction(async (client) => {
    const mapping = await client.declarationNameMapping.update({ where: { id }, data: { declarationName, customsDeclarationNameEng, reviewRequired: false, reviewReason: "", status: "APPROVED", approvedBy: actor, approvedAt: new Date(), rejectedBy: null, rejectedAt: null, rejectReason: null } })
    await client.declarationNameAuditLog.create({ data: { mappingId: id, action: "APPROVE", actor, beforeJson: json(toMapping(current)), afterJson: json(toMapping(mapping)) } })
    return mapping
  })
  return toMapping(saved)
}

export async function rejectDeclarationName(id: string, request: DeclarationNameRejectRequest, actor: string): Promise<DeclarationNameMappingDto> {
  const current = await prisma.declarationNameMapping.findUnique({ where: { id } })
  if (!current) throw new BusinessError("报关名称映射不存在。", 404)
  const saved = await prisma.$transaction(async (client) => {
    const mapping = await client.declarationNameMapping.update({ where: { id }, data: { status: "REJECTED", reviewRequired: true, rejectedBy: actor, rejectedAt: new Date(), rejectReason: request.reason, reviewReason: request.reason } })
    await client.declarationNameAuditLog.create({ data: { mappingId: id, action: "REJECT", actor, beforeJson: json(toMapping(current)), afterJson: json(toMapping(mapping)), note: request.reason } })
    return mapping
  })
  return toMapping(saved)
}

export async function writebackDeclarationNames(request: DeclarationNameWritebackRequest, actor: string): Promise<DeclarationNameWritebackResult> {
  if (!request.mappingIds?.length && !request.shipmentItemIds?.length) throw new BusinessError("mappingIds 或 shipmentItemIds 至少提供一项。")
  const mappings = await prisma.declarationNameMapping.findMany({ where: { status: "APPROVED", reviewRequired: false, ...(request.mappingIds?.length ? { id: { in: request.mappingIds } } : {}) } })
  const requestedItems = await prisma.declarationNameSourceItem.findMany({ where: { locked: false, ...(request.shipmentItemIds?.length ? { sourceType: "SHIPMENT", sourceItemId: { in: request.shipmentItemIds } } : {}), ...(request.includeDeclarationItems ? {} : { sourceType: "SHIPMENT" }) } })
  const byKey = new Map(mappings.map((mapping) => [`${mapping.normalizedName}\u0000${mapping.normalizedNameEng}`, mapping]))
  let shipmentItemsAffected = 0
  let declarationItemsAffected = 0
  await prisma.$transaction(async (client) => {
    for (const item of requestedItems) {
      const mapping = byKey.get(`${item.normalizedName}\u0000${item.normalizedNameEng}`)
      if (!mapping?.declarationName || !mapping.customsDeclarationNameEng) continue
      await client.declarationNameSourceItem.update({ where: { id: item.id }, data: { mappingId: mapping.id, declarationName: mapping.declarationName, customsDeclarationNameEng: mapping.customsDeclarationNameEng } })
      if (item.sourceType === "SHIPMENT") shipmentItemsAffected += 1
      else declarationItemsAffected += 1
    }
    await client.declarationNameAuditLog.create({ data: { action: "WRITEBACK", actor, note: `映射 ${request.mappingIds?.length || 0} 条，来源项 ${request.shipmentItemIds?.length || 0} 条`, afterJson: json({ shipmentItemsAffected, declarationItemsAffected }) } })
  })
  return { shipmentItemsAffected, declarationItemsAffected }
}

export async function processDeclarationNameJob(jobId: string): Promise<void> {
  await prisma.declarationNameGenerationJob.update({ where: { id: jobId }, data: { status: "RUNNING", startedAt: new Date() } })
  const items = await prisma.declarationNameGenerationJobItem.findMany({ where: { jobId }, include: { mapping: true }, orderBy: { createdAt: "asc" } })
  let successCount = 0; let failedCount = 0; let reviewCount = 0
  for (const item of items) {
    const before = item.mapping
    try {
      await prisma.declarationNameMapping.update({ where: { id: before.id }, data: { status: "GENERATING", errorMessage: null } })
      const generated = await generateDeclarationName({ name: before.rawName, nameEng: before.rawNameEng, existingDeclarationVariants: before.existingDeclarationVariants || "", existingEngVariants: before.existingEngVariants || "", rowCount: before.rowCount })
      const decision = evaluateDeclarationNameReview({ name: before.rawName, nameEng: before.rawNameEng, generated, autoApproveConfidence })
      await prisma.$transaction([
        prisma.declarationNameMapping.update({ where: { id: before.id }, data: { declarationName: generated.declarationName, customsDeclarationNameEng: generated.customsDeclarationNameEng, confidence: generated.confidence, reviewRequired: decision.reviewRequired, reviewReason: decision.reviewReason, status: decision.status, promptVersion, modelVersion: `${generated.provider || "unknown"}:${generated.model || "unknown"}` } }),
        prisma.declarationNameGenerationJobItem.update({ where: { id: item.id }, data: { status: "SUCCESS", errorMessage: null } }),
        prisma.declarationNameAuditLog.create({ data: { mappingId: before.id, action: "MODEL_GENERATE", actor: "system", beforeJson: json(toMapping(before)), afterJson: json(generated) } }),
      ])
      successCount += 1; if (decision.reviewRequired) reviewCount += 1
    } catch (error) {
      failedCount += 1
      const message = sanitizeProviderError(error instanceof Error ? error.message : String(error))
      await prisma.$transaction([
        prisma.declarationNameMapping.update({ where: { id: before.id }, data: { status: "FAILED", errorMessage: message } }),
        prisma.declarationNameGenerationJobItem.update({ where: { id: item.id }, data: { status: "FAILED", errorMessage: message } }),
      ])
    }
  }
  await prisma.declarationNameGenerationJob.update({ where: { id: jobId }, data: { status: failedCount ? "FAILED" : "COMPLETED", successCount, failedCount, reviewCount, finishedAt: new Date() } })
}
