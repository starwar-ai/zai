import type { DocumentQueryRequest } from "@zform/shared"
import { z } from "zod"

const filterConditionSchema = z.object({
  columnId: z.string().min(1),
  operator: z.enum(["eq", "neq", "contains", "startsWith", "endsWith", "gt", "gte", "lt", "lte", "between", "in", "empty", "notEmpty"]),
  value: z.unknown().optional(), secondValue: z.unknown().optional(),
})
type FilterNode = z.infer<typeof filterConditionSchema> | { logic: "and" | "or"; conditions: FilterNode[] }
const filterNodeSchema: z.ZodType<FilterNode> = z.lazy(() => z.union([
  filterConditionSchema,
  z.object({ logic: z.enum(["and", "or"]), conditions: z.array(filterNodeSchema).max(30) }),
]))

export const documentQuerySchema = z.object({
  typeId: z.string().min(1), mode: z.enum(["document", "detail"]).optional(), detailTableId: z.string().optional(),
  search: z.string().max(200).optional(),
  filters: z.object({ logic: z.enum(["and", "or"]), conditions: z.array(filterNodeSchema).max(30) }).optional(),
  sorting: z.array(z.object({ columnId: z.string(), direction: z.enum(["asc", "desc"]) })).max(10).optional(),
  aggregateIds: z.array(z.string()).optional(), page: z.number().int().positive().optional(), pageSize: z.number().int().positive().max(100).optional(),
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
