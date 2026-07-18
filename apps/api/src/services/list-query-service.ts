import { Prisma } from "@prisma/client"
import type {
  DocumentListRow, DocumentQueryRequest, DocumentQueryResult, DocumentRecord, DocumentSchema,
  ListAggregateDefinition, ListColumnDefinition, ListFilterCondition, ListFilterGroup,
} from "@zform/shared"
import { prisma } from "../database.js"
import { BusinessError } from "../utils/business-error.js"
import { toDocumentRecord } from "./document-service.js"
import { permissionWhere, type UserContext } from "./data-permission-service.js"
import { getSchema } from "../documents/schemas.js"

const isGroup = (value: ListFilterCondition | ListFilterGroup): value is ListFilterGroup => "logic" in value

function nestedValue(source: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined, source)
}

function systemValue(document: DocumentRecord, path: string): unknown {
  if (path === "id") return document.id
  return nestedValue(document, path)
}

function columnValue(column: ListColumnDefinition, document: DocumentRecord, detail?: Record<string, unknown>): unknown {
  if (column.source === "system") return systemValue(document, column.path)
  if (column.source === "master") return nestedValue(document.masterData, column.path)
  return nestedValue(detail, column.path)
}

function compare(left: unknown, right: unknown): number {
  if (left === right) return 0
  if (left === undefined || left === null || left === "") return 1
  if (right === undefined || right === null || right === "") return -1
  if (typeof left === "number" || typeof right === "number") return Number(left) - Number(right)
  return String(left).localeCompare(String(right), "zh-CN", { numeric: true, sensitivity: "base" })
}

function matches(condition: ListFilterCondition, row: DocumentListRow): boolean {
  const value = row.values[condition.columnId]
  const expected = condition.value
  const text = String(value ?? "").toLocaleLowerCase()
  const expectedText = String(expected ?? "").toLocaleLowerCase()
  switch (condition.operator) {
    case "eq": return compare(value, expected) === 0
    case "neq": return compare(value, expected) !== 0
    case "contains": return text.includes(expectedText)
    case "startsWith": return text.startsWith(expectedText)
    case "endsWith": return text.endsWith(expectedText)
    case "gt": return compare(value, expected) > 0
    case "gte": return compare(value, expected) >= 0
    case "lt": return compare(value, expected) < 0
    case "lte": return compare(value, expected) <= 0
    case "between": return compare(value, expected) >= 0 && compare(value, condition.secondValue) <= 0
    case "in": return Array.isArray(expected) && expected.some((item) => compare(value, item) === 0)
    case "empty": return value === undefined || value === null || value === ""
    case "notEmpty": return value !== undefined && value !== null && value !== ""
  }
}

function matchesGroup(group: ListFilterGroup, row: DocumentListRow): boolean {
  const outcomes = group.conditions.map((item) => isGroup(item) ? matchesGroup(item, row) : matches(item, row))
  return group.logic === "and" ? outcomes.every(Boolean) : outcomes.some(Boolean)
}

function createRows(documents: DocumentRecord[], schema: DocumentSchema, request: DocumentQueryRequest): DocumentListRow[] {
  const definition = schema.list
  if (!definition) throw new BusinessError(`单据类型“${schema.typeName}”没有配置通用列表。`)
  const mode = request.mode || definition.defaultMode || "document"
  if (!(definition.modes || ["document"]).includes(mode)) throw new BusinessError("当前 Schema 不支持所选列表模式。")
  const columns = definition.columns
  const makeRow = (document: DocumentRecord, detail?: { id: string; data: Record<string, unknown>; sourceRef?: DocumentListRow["sourceRef"] }): DocumentListRow => ({
    key: detail ? `${document.id}:${detail.id}` : document.id,
    documentId: document.id,
    ...(detail ? { rowId: detail.id } : {}),
    typeId: document.typeId, code: document.code, status: document.status, createdBy: document.createdBy,
    createdAt: document.createdAt, updatedAt: document.updatedAt,
    ...(detail?.sourceRef || document.sourceRef ? { sourceRef: detail?.sourceRef || document.sourceRef } : {}),
    values: Object.fromEntries(columns.map((column) => [column.id, columnValue(column, document, detail?.data)])),
  })
  if (mode === "document") return documents.map((document) => makeRow(document))
  const tableId = request.detailTableId || definition.detailTableId || schema.detailTables[0]?.id
  if (!tableId) throw new BusinessError("明细行模式需要指定明细表。")
  return documents.flatMap((document) => document.detailTables.find((table) => table.tableId === tableId)?.rows.map((row) => makeRow(document, row)) || [])
}

function aggregate(rows: DocumentListRow[], definitions: ListAggregateDefinition[], ids?: string[]) {
  return definitions.filter((item) => !ids || ids.includes(item.id)).map((item) => {
    const values = rows.map((row) => row.values[item.columnId]).filter((value) => value !== null && value !== undefined && value !== "")
    const numbers = values.map(Number).filter(Number.isFinite)
    let value: number | string | null = null
    if (item.function === "count") value = values.length
    if (item.function === "sum") value = numbers.reduce((sum, current) => sum + current, 0)
    if (item.function === "avg") value = numbers.length ? numbers.reduce((sum, current) => sum + current, 0) / numbers.length : null
    if (item.function === "min") value = numbers.length ? Math.min(...numbers) : null
    if (item.function === "max") value = numbers.length ? Math.max(...numbers) : null
    return { id: item.id, label: item.label, function: item.function, value }
  })
}

export async function queryDocuments(request: DocumentQueryRequest, user: UserContext): Promise<DocumentQueryResult> {
  const schema = getSchema(request.typeId)
  if (!schema.list) throw new BusinessError(`单据类型“${schema.typeName}”没有配置通用列表。`)
  const columnMap = new Map(schema.list.columns.map((column) => [column.id, column]))
  for (const sort of request.sorting || []) if (!columnMap.get(sort.columnId)?.sortable) throw new BusinessError(`列“${sort.columnId}”不允许排序。`)
  const validateFilters = (group?: ListFilterGroup): void => group?.conditions.forEach((item) => {
    if (isGroup(item)) validateFilters(item)
    else if (!columnMap.get(item.columnId)?.filterable) throw new BusinessError(`列“${item.columnId}”不允许筛选。`)
  })
  validateFilters(request.filters)
  const page = Math.max(1, request.page || 1)
  const pageSize = Math.min(100, Math.max(5, request.pageSize || 20))
  const where: Prisma.DocumentWhereInput = {
    typeId: request.typeId,
    ...(request.search?.trim() ? { searchText: { contains: request.search.trim(), mode: "insensitive" } } : {}),
    ...(await permissionWhere(request.typeId, user)),
  }
  const records = (await prisma.document.findMany({ where })).map(toDocumentRecord)
  let rows = createRows(records, schema, request)
  if (request.filters?.conditions.length) rows = rows.filter((row) => matchesGroup(request.filters as ListFilterGroup, row))
  const summaries = aggregate(rows, schema.list.aggregates || [], request.aggregateIds)
  const sorting = request.sorting?.length ? request.sorting : schema.list.defaultSorting || []
  rows.sort((left, right) => {
    for (const sort of sorting) {
      const outcome = compare(left.values[sort.columnId], right.values[sort.columnId])
      if (outcome) return sort.direction === "asc" ? outcome : -outcome
    }
    return 0
  })
  const total = rows.length
  return { items: rows.slice((page - 1) * pageSize, page * pageSize), total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)), aggregates: summaries }
}
