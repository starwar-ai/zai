import { DataScope, Prisma, type PrismaClient } from "@prisma/client"
import type {
  DocumentListRow, DocumentQueryRequest, DocumentQueryResult, DocumentSchema, ListAggregateDefinition,
  ListColumnDefinition, ListFilterCondition, ListFilterGroup, ListSortDefinition, SourceReference,
} from "@zform/shared"
import { prisma } from "../database.js"
import { BusinessError } from "../utils/business-error.js"
import { resolveDataPermission, type ResolvedDataPermission, type UserContext } from "./data-permission-service.js"
import type { DocumentListQueryAdapter } from "./list-query-adapter.js"

type Scalar = string | number | boolean

interface PostgresListRow {
  id: string
  typeId: string
  code: string
  status: DocumentListRow["status"]
  masterData: unknown
  sourceDocumentId: string | null
  sourceTypeId: string | null
  sourceCode: string | null
  createdBy: string
  createdAt: Date | string
  updatedAt: Date | string
  version: number
  detailRow: unknown | null
}

interface PostgresSummaryRow {
  total: bigint | number
  aggregates: Record<string, unknown>
}

interface BuiltListQueries {
  pageQuery: Prisma.Sql
  summaryQuery: Prisma.Sql
  mode: "document" | "detail"
}

const systemExpressions: Record<string, Prisma.Sql> = {
  id: Prisma.sql`d.id::text`,
  typeId: Prisma.sql`d.type_id`,
  code: Prisma.sql`d.code`,
  status: Prisma.sql`d.status::text`,
  createdBy: Prisma.sql`d.created_by`,
  createdAt: Prisma.sql`to_char(d.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`,
  updatedAt: Prisma.sql`to_char(d.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`,
  version: Prisma.sql`d.version::text`,
}

const isGroup = (value: ListFilterCondition | ListFilterGroup): value is ListFilterGroup => "logic" in value
const isScalar = (value: unknown): value is Scalar => ["string", "number", "boolean"].includes(typeof value)
const nestedValue = (source: unknown, path: string): unknown => path.split(".").reduce<unknown>((value, key) => value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined, source)
const asIsoString = (value: Date | string): string => value instanceof Date ? value.toISOString() : new Date(value).toISOString()

function columnExpression(column: ListColumnDefinition, mode: "document" | "detail"): Prisma.Sql | null {
  if (column.source === "system") return systemExpressions[column.path] || null
  if (column.source === "master") return Prisma.sql`d.master_data #>> string_to_array(${column.path}, '.')`
  if (mode === "detail") return Prisma.sql`detail_row.value->'data' #>> string_to_array(${column.path}, '.')`
  return Prisma.sql`NULL::text`
}

function numericExpression(expression: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`CASE WHEN (${expression}) ~ '^[+-]?([0-9]+([.][0-9]+)?|[.][0-9]+)$' THEN (${expression})::numeric END`
}

function comparableExpression(column: ListColumnDefinition, expression: Prisma.Sql): Prisma.Sql {
  return column.dataType === "number" ? numericExpression(expression) : Prisma.sql`lower(${expression})`
}

function scalarParameter(column: ListColumnDefinition, value: Scalar): Prisma.Sql | null {
  if (column.dataType === "number") {
    const number = Number(value)
    return Number.isFinite(number) ? Prisma.sql`${number}` : null
  }
  return Prisma.sql`lower(${String(value)})`
}

function escapeLike(value: Scalar): string {
  return String(value).replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")
}

function conditionSql(condition: ListFilterCondition, columns: Map<string, ListColumnDefinition>, mode: "document" | "detail"): Prisma.Sql {
  const column = columns.get(condition.columnId)
  const rawExpression = column ? columnExpression(column, mode) : null
  if (!column || !rawExpression) throw new BusinessError(`列“${condition.columnId}”不能由 PostgreSQL 列表适配器执行。`)
  if (condition.operator === "empty") return Prisma.sql`(${rawExpression}) IS NULL OR (${rawExpression}) = ''`
  if (condition.operator === "notEmpty") return Prisma.sql`(${rawExpression}) IS NOT NULL AND (${rawExpression}) <> ''`

  if (condition.operator === "contains" || condition.operator === "startsWith" || condition.operator === "endsWith") {
    if (!isScalar(condition.value)) return Prisma.sql`FALSE`
    const escaped = escapeLike(condition.value)
    const pattern = condition.operator === "contains" ? `%${escaped}%` : condition.operator === "startsWith" ? `${escaped}%` : `%${escaped}`
    return Prisma.sql`(${rawExpression}) ILIKE ${pattern} ESCAPE '\'`
  }

  if (condition.operator === "in") {
    if (!Array.isArray(condition.value) || !condition.value.length) return Prisma.sql`FALSE`
    const values = condition.value.filter(isScalar).map((value) => scalarParameter(column, value)).filter((value): value is Prisma.Sql => Boolean(value))
    return values.length ? Prisma.sql`(${comparableExpression(column, rawExpression)}) IN (${Prisma.join(values)})` : Prisma.sql`FALSE`
  }

  if (!isScalar(condition.value)) {
    if (condition.operator === "eq") return Prisma.sql`(${rawExpression}) IS NULL`
    if (condition.operator === "neq") return Prisma.sql`(${rawExpression}) IS NOT NULL`
    return Prisma.sql`FALSE`
  }
  const value = scalarParameter(column, condition.value)
  if (!value) return Prisma.sql`FALSE`
  const expression = comparableExpression(column, rawExpression)

  if (condition.operator === "between") {
    if (!isScalar(condition.secondValue)) return Prisma.sql`FALSE`
    const secondValue = scalarParameter(column, condition.secondValue)
    return secondValue ? Prisma.sql`(${expression}) BETWEEN ${value} AND ${secondValue}` : Prisma.sql`FALSE`
  }
  if (condition.operator === "eq") return Prisma.sql`(${expression}) = ${value}`
  if (condition.operator === "neq") return Prisma.sql`(${expression}) IS DISTINCT FROM ${value}`
  const operator = condition.operator === "gt" ? Prisma.sql`>` : condition.operator === "gte" ? Prisma.sql`>=` : condition.operator === "lt" ? Prisma.sql`<` : Prisma.sql`<=`
  return Prisma.sql`(${expression}) ${operator} ${value}`
}

function groupSql(group: ListFilterGroup, columns: Map<string, ListColumnDefinition>, mode: "document" | "detail"): Prisma.Sql {
  if (!group.conditions.length) return group.logic === "and" ? Prisma.sql`TRUE` : Prisma.sql`FALSE`
  const conditions = group.conditions.map((item) => isGroup(item) ? groupSql(item, columns, mode) : conditionSql(item, columns, mode))
  return Prisma.sql`(${Prisma.join(conditions, group.logic === "and" ? " AND " : " OR ")})`
}

function permissionSql(permission: ResolvedDataPermission): Prisma.Sql {
  if (permission.scope === DataScope.ALL) return Prisma.sql`TRUE`
  const userSql = Prisma.sql`d.created_by_id IN (${Prisma.join(permission.userIds.map((id) => Prisma.sql`${id}`))})`
  const departments = permission.scope === DataScope.DEPARTMENT ? permission.departmentIds : permission.extraDepartmentIds
  if (!departments.length) return userSql
  const departmentSql = Prisma.sql`d.department_id IN (${Prisma.join(departments.map((id) => Prisma.sql`${id}`))})`
  return Prisma.sql`(${departmentSql} OR ${userSql})`
}

function orderSql(sorting: ListSortDefinition[], columns: Map<string, ListColumnDefinition>, mode: "document" | "detail"): Prisma.Sql {
  const items = sorting.map((sort) => {
    const column = columns.get(sort.columnId)
    const rawExpression = column ? columnExpression(column, mode) : null
    if (!column || !rawExpression) throw new BusinessError(`列“${sort.columnId}”不能由 PostgreSQL 列表适配器排序。`)
    const expression = comparableExpression(column, rawExpression)
    return Prisma.sql`${expression} ${sort.direction === "asc" ? Prisma.sql`ASC NULLS LAST` : Prisma.sql`DESC NULLS FIRST`}`
  })
  items.push(Prisma.sql`d.id ASC`)
  if (mode === "detail") items.push(Prisma.sql`detail_row.value->>'id' ASC`)
  return Prisma.join(items, ", ")
}

function aggregateSql(definition: ListAggregateDefinition, columns: Map<string, ListColumnDefinition>, mode: "document" | "detail"): Prisma.Sql {
  const column = columns.get(definition.columnId)
  const expression = column ? columnExpression(column, mode) : null
  if (!column || !expression) throw new BusinessError(`聚合“${definition.id}”引用了不支持的列。`)
  if (definition.function === "count") return Prisma.sql`COUNT(NULLIF(${expression}, ''))`
  const numeric = numericExpression(expression)
  if (definition.function === "sum") return Prisma.sql`COALESCE(SUM(${numeric}), 0)`
  if (definition.function === "avg") return Prisma.sql`AVG(${numeric})`
  if (definition.function === "min") return Prisma.sql`MIN(${numeric})`
  return Prisma.sql`MAX(${numeric})`
}

export function buildPostgresListQueries(schema: DocumentSchema, request: DocumentQueryRequest, permission: ResolvedDataPermission): BuiltListQueries {
  if (!schema.list) throw new BusinessError(`单据类型“${schema.typeName}”没有配置通用列表。`)
  const mode = request.mode || schema.list.defaultMode || "document"
  const columns = new Map(schema.list.columns.map((column) => [column.id, column]))
  const tableId = request.detailTableId || schema.list.detailTableId || schema.detailTables[0]?.id
  if (mode === "detail" && !tableId) throw new BusinessError("明细行模式需要指定明细表。")
  const detailJoin = mode === "detail" ? Prisma.sql`
    CROSS JOIN LATERAL jsonb_array_elements(d.detail_tables) AS detail_table(value)
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(detail_table.value->'rows', '[]'::jsonb)) AS detail_row(value)
  ` : Prisma.empty
  const predicates: Prisma.Sql[] = [Prisma.sql`d.type_id = ${request.typeId}`, permissionSql(permission)]
  if (request.search?.trim()) predicates.push(Prisma.sql`d.search_text ILIKE ${`%${escapeLike(request.search.trim())}%`} ESCAPE '\'`)
  if (mode === "detail") predicates.push(Prisma.sql`detail_table.value->>'tableId' = ${tableId as string}`)
  if (request.filters?.conditions.length) predicates.push(groupSql(request.filters, columns, mode))
  const where = Prisma.join(predicates, " AND ")
  const sorting = request.sorting?.length ? request.sorting : schema.list.defaultSorting || []
  const page = Math.max(1, request.page || 1)
  const pageSize = Math.min(100, Math.max(5, request.pageSize || 20))
  const selectedAggregates = (schema.list.aggregates || []).filter((item) => !request.aggregateIds || request.aggregateIds.includes(item.id))
  const aggregatePairs = selectedAggregates.flatMap((item) => [Prisma.sql`${item.id}`, aggregateSql(item, columns, mode)])
  const aggregateObject = aggregatePairs.length ? Prisma.sql`jsonb_build_object(${Prisma.join(aggregatePairs)})` : Prisma.sql`'{}'::jsonb`
  const from = Prisma.sql`FROM documents d ${detailJoin} WHERE ${where}`
  const pageQuery = Prisma.sql`
    SELECT d.id::text AS id, d.type_id AS "typeId", d.code, d.status::text AS status,
      d.master_data AS "masterData", d.source_document_id::text AS "sourceDocumentId",
      d.source_type_id AS "sourceTypeId", d.source_code AS "sourceCode", d.created_by AS "createdBy",
      d.created_at AS "createdAt", d.updated_at AS "updatedAt", d.version,
      ${mode === "detail" ? Prisma.sql`detail_row.value` : Prisma.sql`NULL::jsonb`} AS "detailRow"
    ${from}
    ORDER BY ${orderSql(sorting, columns, mode)}
    LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
  `
  const summaryQuery = Prisma.sql`SELECT COUNT(*) AS total, ${aggregateObject} AS aggregates ${from}`
  return { pageQuery, summaryQuery, mode }
}

function rowSourceReference(value: unknown): DocumentListRow["sourceRef"] {
  if (!value || typeof value !== "object") return undefined
  const item = value as Record<string, unknown>
  return typeof item.documentId === "string" && typeof item.typeId === "string" && typeof item.code === "string"
    ? { documentId: item.documentId, typeId: item.typeId, code: item.code, ...(typeof item.tableId === "string" && typeof item.rowId === "string" ? { tableId: item.tableId, rowId: item.rowId } : {}) }
    : undefined
}

function toListRow(row: PostgresListRow, columns: ListColumnDefinition[]): DocumentListRow {
  const detail = row.detailRow && typeof row.detailRow === "object" ? row.detailRow as Record<string, unknown> : undefined
  const detailData = detail?.data && typeof detail.data === "object" ? detail.data as Record<string, unknown> : undefined
  const documentSource: SourceReference | undefined = row.sourceDocumentId && row.sourceTypeId && row.sourceCode
    ? { documentId: row.sourceDocumentId, typeId: row.sourceTypeId, code: row.sourceCode }
    : undefined
  const system: Record<string, unknown> = {
    id: row.id, typeId: row.typeId, code: row.code, status: row.status, createdBy: row.createdBy,
    createdAt: asIsoString(row.createdAt), updatedAt: asIsoString(row.updatedAt), version: row.version,
  }
  const sourceRef = rowSourceReference(detail?.sourceRef) || documentSource
  const rowId = typeof detail?.id === "string" ? detail.id : undefined
  return {
    key: rowId ? `${row.id}:${rowId}` : row.id,
    documentId: row.id,
    ...(rowId ? { rowId } : {}),
    typeId: row.typeId,
    code: row.code,
    status: row.status,
    createdBy: row.createdBy,
    createdAt: asIsoString(row.createdAt),
    updatedAt: asIsoString(row.updatedAt),
    ...(sourceRef ? { sourceRef } : {}),
    values: Object.fromEntries(columns.map((column) => [column.id, column.source === "system" ? nestedValue(system, column.path) : column.source === "master" ? nestedValue(row.masterData, column.path) : nestedValue(detailData, column.path)])),
  }
}

export class PostgresDocumentListQueryAdapter implements DocumentListQueryAdapter {
  constructor(private readonly client: PrismaClient = prisma) {}

  supports(schema: DocumentSchema, request: DocumentQueryRequest): boolean {
    if (!schema.list) return false
    const mode = request.mode || schema.list.defaultMode || "document"
    return (schema.list.modes || ["document"]).includes(mode)
      && schema.list.columns.every((column) => column.source !== "system" || Boolean(systemExpressions[column.path]))
  }

  async query(schema: DocumentSchema, request: DocumentQueryRequest, user: UserContext): Promise<DocumentQueryResult> {
    return this.client.$transaction(async (transaction) => {
      const permission = await resolveDataPermission(request.typeId, user, transaction)
      const queries = buildPostgresListQueries(schema, request, permission)
      const rows = await transaction.$queryRaw<PostgresListRow[]>(queries.pageQuery)
      const [summary] = await transaction.$queryRaw<PostgresSummaryRow[]>(queries.summaryQuery)
      const page = Math.max(1, request.page || 1)
      const pageSize = Math.min(100, Math.max(5, request.pageSize || 20))
      const total = Number(summary?.total || 0)
      const definitions = (schema.list?.aggregates || []).filter((item) => !request.aggregateIds || request.aggregateIds.includes(item.id))
      return {
        items: rows.map((row) => toListRow(row, schema.list?.columns || [])),
        total,
        page,
        pageSize,
        pageCount: Math.max(1, Math.ceil(total / pageSize)),
        aggregates: definitions.map((item) => ({ id: item.id, label: item.label, function: item.function, value: summary?.aggregates?.[item.id] === null || summary?.aggregates?.[item.id] === undefined ? null : Number(summary.aggregates[item.id]) })),
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead })
  }
}
