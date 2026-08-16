import type { ExternalImageSearchRequest, ExternalImageSearchResult, ImageSearchAsset, ImageSearchAssetQuery, ImageSearchHistoryRecord, ImageSearchMimeType, ImageSearchRequest, ImageSearchResult, ImageSearchResultItem, ImageSearchUploadRequest, ListResponse } from "@zform/shared"
import type { Prisma } from "@prisma/client"
import { z } from "zod"
import { prisma } from "../database.js"
import { BusinessError } from "../utils/business-error.js"
import { llmHttpError, llmNetworkError } from "./llm-error-detail.js"

const featureGroups = {
  scene: ["outdoor", "indoor", "nature", "urban", "abstract"],
  subject: ["person", "animal", "plant", "food", "vehicle", "building", "object", "landscape", "water", "sky"],
  color: ["red", "orange", "yellow", "green", "blue", "purple", "pink", "brown", "white", "black", "gray", "colorful", "monochrome"],
  style: ["photo_realistic", "illustration", "painting", "minimalist", "detailed", "dark", "bright", "warm", "cool", "vintage", "modern"],
  mood: ["calm", "energetic", "dramatic", "cheerful", "melancholic", "mysterious", "romantic", "tense"],
  composition: ["close_up", "wide_shot", "portrait", "landscape_orientation", "symmetrical", "busy", "simple"],
  time: ["daytime", "nighttime", "sunrise_sunset", "indoor_lit"],
  texture: ["smooth", "rough", "soft", "shiny", "matte", "transparent"],
} as const

type FeatureGroup = keyof typeof featureGroups
type FeaturePayload = { description: string } & Record<FeatureGroup, Record<string, number>>
const scoreSchema = z.number().min(0).max(1)
const groupSchemas = Object.fromEntries(Object.entries(featureGroups).map(([group, keys]) => [group, z.object(Object.fromEntries(keys.map((key) => [key, scoreSchema]))).strict()])) as unknown as Record<FeatureGroup, z.ZodType<Record<string, number>>>
const visualFeatureSchema = z.object({ description: z.string().trim().min(1).max(1000), ...groupSchemas }).strict()
const jsonGroupProperties = Object.fromEntries(Object.entries(featureGroups).map(([group, keys]) => [group, { type: "object", additionalProperties: false, required: keys, properties: Object.fromEntries(keys.map((key) => [key, { type: "number", minimum: 0, maximum: 1 }])) }]))
const visualFeatureJsonSchema = { type: "object", additionalProperties: false, required: ["description", ...Object.keys(featureGroups)], properties: { description: { type: "string" }, ...jsonGroupProperties } }

interface AssetRow {
  id: string; title: string; originalFilename: string; mimeType: string; tags: string[]; description: string | null; embedding: Prisma.JsonValue | null; embeddingModel: string | null; indexedAt: Date | null; createdById: string; createdAt: Date; updatedAt: Date
}

interface StoredResult { id: string; title: string; originalFilename: string; mimeType: ImageSearchMimeType; tags: string[]; description?: string; indexed: boolean; embeddingModel?: string; indexedAt?: string; createdById: string; createdAt: string; updatedAt: string; score: number; rank: number }

function toAsset(row: AssetRow): ImageSearchAsset {
  return { id: row.id, title: row.title, originalFilename: row.originalFilename, mimeType: row.mimeType as ImageSearchMimeType, tags: row.tags, ...(row.description ? { description: row.description } : {}), indexed: Boolean(row.embedding && row.indexedAt), ...(row.embeddingModel ? { embeddingModel: row.embeddingModel } : {}), ...(row.indexedAt ? { indexedAt: row.indexedAt.toISOString() } : {}), createdById: row.createdById, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }
}

function decodedImage(input: { base64Data: string; mimeType: ImageSearchMimeType }): Buffer {
  const data = Buffer.from(input.base64Data, "base64")
  if (!data.length) throw new BusinessError("图片内容不能为空。")
  if (data.length > 8 * 1024 * 1024) throw new BusinessError("单张图片不能超过 8MB。", 413)
  const valid = input.mimeType === "image/jpeg" ? data[0] === 0xff && data[1] === 0xd8
    : input.mimeType === "image/png" ? data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      : data.subarray(0, 4).toString("ascii") === "RIFF" && data.subarray(8, 12).toString("ascii") === "WEBP"
  if (!valid) throw new BusinessError("图片内容与声明的文件格式不一致。")
  return data
}

export function featureJsonToVector(features: FeaturePayload): number[] {
  const vector = Object.entries(featureGroups).flatMap(([group, keys]) => keys.map((key) => features[group as FeatureGroup][key] ?? 0))
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0))
  return norm > 0 ? vector.map((value) => value / norm) : vector
}

export function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length !== right.length || left.length === 0) return 0
  let dot = 0; let leftNorm = 0; let rightNorm = 0
  for (let index = 0; index < left.length; index += 1) { const a = left[index] ?? 0; const b = right[index] ?? 0; dot += a * b; leftNorm += a * a; rightNorm += b * b }
  const denominator = Math.sqrt(leftNorm) * Math.sqrt(rightNorm)
  return denominator ? dot / denominator : 0
}

function responseOutputText(value: unknown): string {
  const root = value && typeof value === "object" ? value as Record<string, unknown> : undefined
  const output = Array.isArray(root?.output) ? root.output : []
  for (const item of output) {
    const record = item && typeof item === "object" ? item as Record<string, unknown> : undefined
    const content = Array.isArray(record?.content) ? record.content : []
    for (const part of content) { const block = part && typeof part === "object" ? part as Record<string, unknown> : undefined; if (block?.type === "output_text" && typeof block.text === "string") return block.text }
  }
  throw new Error("视觉模型未返回可解析的图片特征。")
}

async function generateImageEmbedding(mimeType: ImageSearchMimeType, data: Uint8Array): Promise<{ description: string; embedding: number[]; model: string }> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new BusinessError("尚未配置 OPENAI_API_KEY，无法生成图片特征。", 503)
  const model = process.env.IMAGE_SEARCH_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-mini"
  const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "")
  const timeoutValue = Number(process.env.LLM_TIMEOUT_MS); const timeoutMs = Number.isFinite(timeoutValue) && timeoutValue > 0 ? timeoutValue : 60_000
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    let response: Response
    try {
      response = await fetch(`${baseUrl}/responses`, { method: "POST", signal: controller.signal, headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model, input: [{ role: "system", content: [{ type: "input_text", text: "你是图片检索特征提取器。请按给定结构对视觉属性稳定评分；相似图片应得到相近评分，只描述图片中可见内容。" }] }, { role: "user", content: [{ type: "input_text", text: "提取这张图片的视觉特征。" }, { type: "input_image", image_url: `data:${mimeType};base64,${Buffer.from(data).toString("base64")}`, detail: "high" }] }], text: { format: { type: "json_schema", name: "image_visual_features", strict: true, schema: visualFeatureJsonSchema } } }) })
    } catch (reason) { throw llmNetworkError(reason, { provider: "OpenAI", model, operation: "图片特征提取" }, controller.signal.aborted) }
    if (!response.ok) throw await llmHttpError(response, { provider: "OpenAI", model, operation: "图片特征提取" })
    const features = visualFeatureSchema.parse(JSON.parse(responseOutputText(await response.json())) as unknown) as FeaturePayload
    return { description: features.description, embedding: featureJsonToVector(features), model }
  } finally { clearTimeout(timeout) }
}

function embeddingFromJson(value: Prisma.JsonValue | null): number[] | undefined {
  return Array.isArray(value) && value.length === 64 && value.every((item) => typeof item === "number" && Number.isFinite(item)) ? value as number[] : undefined
}

export async function uploadImageSearchAsset(user: { userId: string; departmentId?: string }, input: ImageSearchUploadRequest): Promise<ImageSearchAsset> {
  const row = await prisma.imageSearchAsset.create({ data: { title: input.title, originalFilename: input.filename, mimeType: input.mimeType, imageData: decodedImage(input), tags: input.tags || [], createdById: user.userId, ...(user.departmentId ? { departmentId: user.departmentId } : {}) } })
  return toAsset(row)
}

export async function queryImageSearchAssets(input: ImageSearchAssetQuery): Promise<ListResponse<ImageSearchAsset>> {
  const page = input.page || 1; const pageSize = input.pageSize || 24
  const where: Prisma.ImageSearchAssetWhereInput = { ...(input.keyword ? { OR: [{ title: { contains: input.keyword, mode: "insensitive" } }, { originalFilename: { contains: input.keyword, mode: "insensitive" } }, { tags: { has: input.keyword } }] } : {}), ...(input.indexed === true ? { indexedAt: { not: null } } : input.indexed === false ? { indexedAt: null } : {}) }
  const [rows, total] = await Promise.all([prisma.imageSearchAsset.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }), prisma.imageSearchAsset.count({ where })])
  return { items: rows.map(toAsset), total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) }
}

export async function getImageSearchAssetImage(id: string): Promise<{ mimeType: string; data: Uint8Array }> {
  const row = await prisma.imageSearchAsset.findUnique({ where: { id }, select: { mimeType: true, imageData: true } })
  if (!row) throw new BusinessError("图库图片不存在。", 404)
  return { mimeType: row.mimeType, data: row.imageData }
}

export async function removeImageSearchAsset(id: string): Promise<void> {
  const result = await prisma.imageSearchAsset.deleteMany({ where: { id } })
  if (!result.count) throw new BusinessError("图库图片不存在。", 404)
}

export async function indexImageSearchAsset(id: string): Promise<ImageSearchAsset> {
  const asset = await prisma.imageSearchAsset.findUnique({ where: { id } })
  if (!asset) throw new BusinessError("图库图片不存在。", 404)
  const generated = await generateImageEmbedding(asset.mimeType as ImageSearchMimeType, asset.imageData)
  const updated = await prisma.imageSearchAsset.update({ where: { id }, data: { description: generated.description, embedding: generated.embedding, embeddingModel: generated.model, indexedAt: new Date() } })
  return toAsset(updated)
}

export async function indexPendingImageSearchAssets(limit: number): Promise<{ processed: number; failed: number; total: number }> {
  const pending = await prisma.imageSearchAsset.findMany({ where: { indexedAt: null }, orderBy: { createdAt: "asc" }, take: limit, select: { id: true } })
  let processed = 0; let failed = 0
  for (const item of pending) { try { await indexImageSearchAsset(item.id); processed += 1 } catch { failed += 1 } }
  return { processed, failed, total: pending.length }
}

export async function searchByImage(userId: string, input: ImageSearchRequest): Promise<ImageSearchResult> {
  const queryImage = decodedImage(input); const topK = input.topK || 12
  const query = await generateImageEmbedding(input.mimeType, queryImage)
  const rows = await prisma.imageSearchAsset.findMany({ where: { indexedAt: { not: null } }, orderBy: { createdAt: "desc" } })
  const results: ImageSearchResultItem[] = rows.flatMap((row) => { const embedding = embeddingFromJson(row.embedding); if (!embedding) return []; return [{ ...toAsset(row), score: Math.round(cosineSimilarity(query.embedding, embedding) * 10000) / 10000, rank: 0 }] }).sort((left, right) => right.score - left.score).slice(0, topK).map((item, index) => ({ ...item, rank: index + 1 }))
  const history = await prisma.imageSearchHistory.create({ data: { userId, queryOriginalFilename: input.filename, queryMimeType: input.mimeType, queryImageData: queryImage, topK, results: results as unknown as Prisma.InputJsonValue } })
  return { historyId: history.id, results }
}

export async function searchExternalByImage(actor: string, input: ExternalImageSearchRequest): Promise<ExternalImageSearchResult> {
  try {
    const result = await searchByImage(actor, input)
    return {
      searchId: result.historyId,
      ...(input.clientRequestId ? { clientRequestId: input.clientRequestId } : {}),
      resultCount: result.results.length,
      results: result.results.map((item) => ({ id: item.id, title: item.title, tags: item.tags, ...(item.description ? { description: item.description } : {}), score: item.score, rank: item.rank, imagePath: `/api/external/image-search/assets/${item.id}/image` })),
    }
  } catch (reason) {
    if (reason instanceof BusinessError) throw reason
    throw new BusinessError(reason instanceof Error ? reason.message : "以图搜图处理失败。", 422)
  }
}

function storedResults(value: Prisma.JsonValue): StoredResult[] {
  const parsed = z.array(z.object({ id: z.string().uuid(), title: z.string(), originalFilename: z.string(), mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]), tags: z.array(z.string()), description: z.string().optional(), indexed: z.boolean(), embeddingModel: z.string().optional(), indexedAt: z.string().optional(), createdById: z.string(), createdAt: z.string(), updatedAt: z.string(), score: z.number(), rank: z.number().int() })).safeParse(value)
  return parsed.success ? parsed.data : []
}

export async function queryImageSearchHistory(userId: string, page: number, pageSize: number): Promise<ListResponse<ImageSearchHistoryRecord>> {
  const where = { userId }; const [rows, total] = await Promise.all([prisma.imageSearchHistory.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }), prisma.imageSearchHistory.count({ where })])
  return { items: rows.map((row) => { const results = storedResults(row.results); return { id: row.id, queryOriginalFilename: row.queryOriginalFilename, topK: row.topK, resultCount: results.length, results, createdAt: row.createdAt.toISOString() } }), total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) }
}

export async function getImageSearchQueryImage(userId: string, id: string): Promise<{ mimeType: string; data: Uint8Array }> {
  const row = await prisma.imageSearchHistory.findFirst({ where: { id, userId }, select: { queryMimeType: true, queryImageData: true } })
  if (!row) throw new BusinessError("搜索记录不存在。", 404)
  return { mimeType: row.queryMimeType, data: row.queryImageData }
}

export async function removeImageSearchHistory(userId: string, id: string): Promise<void> {
  const result = await prisma.imageSearchHistory.deleteMany({ where: { id, userId } })
  if (!result.count) throw new BusinessError("搜索记录不存在。", 404)
}
