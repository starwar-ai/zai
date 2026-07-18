import type { DetailTableSchema, DocumentActionRequest, DocumentCreateRequest, DocumentImpactRequest, DocumentPushDownRequest, DocumentQueryRequest, DocumentSchema, DocumentUpdateRequest, FieldSchema } from "@zform/shared"
import { z } from "zod"

const MAX_TEXT_LENGTH = 500
const MAX_LONG_TEXT_LENGTH = 5000
const MAX_CUSTOM_ARRAY_ITEMS = 100
const MAX_CUSTOM_OBJECT_KEYS = 100
const MAX_DETAIL_ROWS = 500

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }
const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() => z.union([
  z.string().max(MAX_LONG_TEXT_LENGTH),
  z.number().finite(),
  z.boolean(),
  z.null(),
  z.array(jsonValueSchema).max(MAX_CUSTOM_ARRAY_ITEMS),
  z.record(z.string().min(1).max(100), jsonValueSchema).superRefine((value, context) => {
    if (Object.keys(value).length > MAX_CUSTOM_OBJECT_KEYS) context.addIssue({ code: z.ZodIssueCode.custom, message: `对象最多允许 ${MAX_CUSTOM_OBJECT_KEYS} 个字段。` })
  }),
]))

const emptyOrNumberSchema = z.union([z.number().finite().nonnegative(), z.literal("")])
const shortStringSchema = z.string().max(MAX_TEXT_LENGTH)
const longStringSchema = z.string().max(MAX_LONG_TEXT_LENGTH)
const dateSchema = z.union([
  z.literal(""),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期必须使用 YYYY-MM-DD 格式。").refine((value) => {
    const [year, month, day] = value.split("-").map(Number)
    const date = new Date(Date.UTC(year, month - 1, day))
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  }, "日期无效。"),
])

function fieldValueSchema(field: FieldSchema): z.ZodTypeAny {
  if (field.type === "number") return emptyOrNumberSchema.optional()
  if (field.type === "checkbox") return z.boolean().optional()
  if (field.type === "date") return dateSchema.optional()
  if (field.type === "textarea") return longStringSchema.optional()
  if (field.type === "select" && field.options?.length) {
    const allowed = new Set(field.options.map((option) => option.value))
    return shortStringSchema.refine((value) => value === "" || allowed.has(value), `“${field.label}”包含未声明的选项。`).optional()
  }
  if (field.type.startsWith("custom:")) return jsonValueSchema.optional()
  if (field.type === "computed") return z.union([z.string().max(MAX_LONG_TEXT_LENGTH), z.number().finite(), z.boolean(), z.literal("")]).optional()
  return shortStringSchema.optional()
}

function dataShape(fields: FieldSchema[]): Record<string, z.ZodTypeAny> {
  const shape: Record<string, z.ZodTypeAny> = {}
  for (const field of fields) {
    if (field.type === "dimensions" && field.dimensions) {
      shape[field.dimensions.lengthField] = emptyOrNumberSchema.optional()
      shape[field.dimensions.widthField] = emptyOrNumberSchema.optional()
      shape[field.dimensions.heightField] = emptyOrNumberSchema.optional()
    } else if (field.type === "price" && field.price) {
      shape[field.price.amountField] = emptyOrNumberSchema.optional()
      const allowedCurrencies = new Set(field.price.currencies?.map((currency) => currency.value) || [])
      shape[field.price.currencyField] = shortStringSchema.refine((value) => value === "" || !allowedCurrencies.size || allowedCurrencies.has(value), `“${field.label}”包含未声明的币种。`).optional()
    } else if (field.type === "ratio" && field.ratio) {
      shape[field.ratio.numeratorField] = emptyOrNumberSchema.optional()
      shape[field.ratio.denominatorField] = emptyOrNumberSchema.optional()
    } else {
      shape[field.id] = fieldValueSchema(field)
    }
  }
  return shape
}

function sourceReferenceSchema() {
  return z.object({
    documentId: z.string().uuid(),
    typeId: z.string().min(1).max(64),
    code: z.string().min(1).max(64),
    tableId: z.string().min(1).max(64),
    rowId: z.string().min(1).max(100),
  }).strict()
}

function detailTableSchema(table: DetailTableSchema, allowSourceReference: boolean) {
  const rowShape: Record<string, z.ZodTypeAny> = {
    id: z.string().min(1).max(100),
    data: z.object(dataShape(table.fields)).strict(),
  }
  if (allowSourceReference) rowShape.sourceRef = sourceReferenceSchema().optional()
  return z.object({
    tableId: z.literal(table.id),
    rows: z.array(z.object(rowShape).strict()).max(table.maxRows ?? MAX_DETAIL_ROWS).superRefine((rows, context) => {
      const seen = new Set<string>()
      rows.forEach((row, index) => {
        if (seen.has(row.id as string)) context.addIssue({ code: z.ZodIssueCode.custom, path: [index, "id"], message: "明细行 ID 不能重复。" })
        seen.add(row.id as string)
      })
    }),
  }).strict()
}

function detailTablesSchema(schema: DocumentSchema, allowSourceReference: boolean) {
  const tableParsers = new Map(schema.detailTables.map((table) => [table.id, detailTableSchema(table, allowSourceReference)]))
  const looseRow = z.object({ id: z.string().min(1).max(100), data: z.record(jsonValueSchema), ...(allowSourceReference ? { sourceRef: sourceReferenceSchema().optional() } : {}) }).strict()
  return z.array(z.object({ tableId: z.string().min(1).max(64), rows: z.array(looseRow).max(MAX_DETAIL_ROWS) }).strict())
    .max(schema.detailTables.length)
    .superRefine((tables, context) => {
      const seen = new Set<string>()
      tables.forEach((table, index) => {
        if (seen.has(table.tableId)) context.addIssue({ code: z.ZodIssueCode.custom, path: [index, "tableId"], message: "明细表 ID 不能重复。" })
        seen.add(table.tableId)
        const parser = tableParsers.get(table.tableId)
        if (!parser) {
          context.addIssue({ code: z.ZodIssueCode.custom, path: [index, "tableId"], message: `Schema 未声明明细表“${table.tableId}”。` })
          return
        }
        const result = parser.safeParse(table)
        if (!result.success) result.error.issues.forEach((issue) => context.addIssue({ ...issue, path: [index, ...issue.path] }))
      })
    })
}

function masterDataSchema(schema: DocumentSchema) {
  return z.object(dataShape(schema.masterFields)).strict()
}

export function documentCreateSchema(schema: DocumentSchema): z.ZodType<DocumentCreateRequest> {
  return z.object({
    typeId: z.literal(schema.typeId),
    masterData: masterDataSchema(schema).optional(),
    detailTables: detailTablesSchema(schema, false).optional(),
  }).strict() as z.ZodType<DocumentCreateRequest>
}

export function documentUpdateSchema(schema: DocumentSchema): z.ZodType<DocumentUpdateRequest> {
  return z.object({
    masterData: masterDataSchema(schema).optional(),
    detailTables: detailTablesSchema(schema, true).optional(),
    version: z.number().int().positive(),
  }).strict().refine((value) => value.masterData !== undefined || value.detailTables !== undefined, "至少需要提交主数据或明细数据。") as z.ZodType<DocumentUpdateRequest>
}

export function documentImpactInputSchema(schema: DocumentSchema): z.ZodType<DocumentImpactRequest> {
  return z.object({ masterData: masterDataSchema(schema) }).strict() as z.ZodType<DocumentImpactRequest>
}

export const documentCreateTypeSchema = z.object({ typeId: z.string().min(1).max(64) }).passthrough()

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
export const documentActionInputSchema: z.ZodType<DocumentActionRequest> = z.object({ comment: z.string().trim().max(500).optional() }).strict()
export const pushDownSchema: z.ZodType<DocumentPushDownRequest> = z.object({ targetTypeId: z.string().min(1).max(64) }).strict()
export const documentListSchema = z.object({
  typeId: z.string().optional(),
  status: z.enum(["DRAFT", "PENDING", "APPROVED", "IN_PROGRESS", "COMPLETED", "REJECTED", "CANCELLED"]).optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  sortBy: z.enum(["code", "status", "createdAt", "updatedAt"]).optional(),
  sortDirection: z.enum(["asc", "desc"]).optional(),
})
