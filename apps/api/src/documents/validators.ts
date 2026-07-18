import type { DocumentQueryRequest } from "@zform/shared"
import { z } from "zod"

const filterScalarSchema = z.union([z.string().max(500), z.number().finite(), z.boolean()])
const filterConditionSchema = z.object({
  columnId: z.string().min(1).max(100),
  operator: z.enum(["eq", "neq", "contains", "startsWith", "endsWith", "gt", "gte", "lt", "lte", "between", "in", "empty", "notEmpty"]),
  value: z.union([filterScalarSchema, z.array(filterScalarSchema).max(100)]).optional(), secondValue: filterScalarSchema.optional(),
})
type FilterNode = z.infer<typeof filterConditionSchema> | { logic: "and" | "or"; conditions: FilterNode[] }
const filterNodeSchema: z.ZodType<FilterNode> = z.lazy(() => z.union([
  filterConditionSchema,
  z.object({ logic: z.enum(["and", "or"]), conditions: z.array(filterNodeSchema).max(30) }),
]))

export const documentQuerySchema = z.object({
  typeId: z.string().min(1).max(64), mode: z.enum(["document", "detail"]).optional(), detailTableId: z.string().max(64).optional(),
  search: z.string().max(200).optional(),
  filters: z.object({ logic: z.enum(["and", "or"]), conditions: z.array(filterNodeSchema).max(30) }).optional(),
  sorting: z.array(z.object({ columnId: z.string().min(1).max(100), direction: z.enum(["asc", "desc"]) })).max(10).optional(),
  aggregateIds: z.array(z.string().min(1).max(100)).max(30).optional(), page: z.number().int().positive().optional(), pageSize: z.number().int().positive().max(100).optional(),
}).transform((value) => value as DocumentQueryRequest)

export const documentActionSchema = z.enum(["submit", "approve", "reject", "complete", "cancel"])
export const documentImpactSchema = z.object({ masterData: z.record(z.unknown()) })
export const pushDownSchema = z.object({ targetTypeId: z.string().min(1) })
export const documentListSchema = z.object({
  typeId: z.string().optional(),
  status: z.enum(["DRAFT", "PENDING", "APPROVED", "IN_PROGRESS", "COMPLETED", "REJECTED", "CANCELLED"]).optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  sortBy: z.enum(["code", "status", "createdAt", "updatedAt"]).optional(),
  sortDirection: z.enum(["asc", "desc"]).optional(),
})
