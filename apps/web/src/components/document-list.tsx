import { useCallback, useEffect, useMemo, useState } from "react"
import { Download, Filter, Plus, RefreshCw, Search, X } from "lucide-react"
import {
  STATUS_LABELS, type DocumentListRow, type DocumentQueryResult, type DocumentRecord, type DocumentSchema,
  type ListColumnDefinition, type ListFilterCondition, type ListFilterOperator, type ListMode, type ListSortDefinition,
  type ToolbarActionDefinition,
} from "@zform/shared"
import { api } from "@/apis/framework-api"
import { StatusPill, formatDate } from "@/components/status-pill"
import { Alert, Button, ColumnSettings, ConfirmDialog, EmptyState, IconButton, PageHeader, Pagination, type ColumnPin } from "@/components/ui"
import { pluginRegistry } from "@/core/plugin-registry"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { exportCsv } from "@/lib/csv-export"

interface DocumentListProps { schema: DocumentSchema; onOpen: (document: DocumentRecord) => void; onChanged: () => Promise<void> }

const FILTER_LABELS: Record<ListFilterOperator, string> = {
  eq: "等于", neq: "不等于", contains: "包含", startsWith: "开头是", endsWith: "结尾是",
  gt: "大于", gte: "大于等于", lt: "小于", lte: "小于等于", between: "介于", in: "属于", empty: "为空", notEmpty: "不为空",
}
const FILTER_OPERATORS = Object.keys(FILTER_LABELS) as ListFilterOperator[]
const EMPTY_RESULT: DocumentQueryResult = { items: [], total: 0, page: 1, pageSize: 20, pageCount: 1, aggregates: [] }

function displayValue(column: ListColumnDefinition, value: unknown, schema: DocumentSchema) {
  if (column.dataType === "status" && typeof value === "string" && value in STATUS_LABELS) return <StatusPill status={value as keyof typeof STATUS_LABELS} label={schema.statusLabels?.[value as keyof typeof STATUS_LABELS]} />
  if ((column.dataType === "date" || column.dataType === "datetime") && typeof value === "string") return formatDate(value, column.dataType === "datetime")
  if (column.dataType === "number" && value !== undefined && value !== null && value !== "") return Number(value).toLocaleString("zh-CN", { maximumFractionDigits: 2 })
  return String(value ?? "—")
}

export function DocumentList({ schema, onOpen, onChanged }: DocumentListProps) {
  const definition = schema.list
  const [mode, setMode] = useState<ListMode>(definition?.defaultMode || "document")
  const [search, setSearch] = useState("")
  const debouncedSearch = useDebouncedValue(search, 250)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [result, setResult] = useState<DocumentQueryResult>(EMPTY_RESULT)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState<ListFilterCondition[]>([])
  const [sorting, setSorting] = useState<ListSortDefinition[]>(definition?.defaultSorting || [])
  const [selected, setSelected] = useState<string[]>([])
  const [visibleColumnIds, setVisibleColumnIds] = useState<string[]>([])
  const [pinnedColumns, setPinnedColumns] = useState<Record<string, ColumnPin>>({})
  const [deleteRequest, setDeleteRequest] = useState<{ kind: "row"; row: DocumentListRow } | { kind: "bulk" } | null>(null)
  const availableColumns = useMemo(() => (definition?.columns || []).filter((column) => mode === "detail" || column.source !== "detail"), [definition, mode])
  const columns = useMemo(() => {
    const order = new Map(visibleColumnIds.map((id, index) => [id, index]))
    const pinWeight = (column: ListColumnDefinition) => pinnedColumns[column.id] === "left" ? 0 : pinnedColumns[column.id] === "right" ? 2 : 1
    return availableColumns.filter((column) => visibleColumnIds.includes(column.id)).sort((left, right) => pinWeight(left) - pinWeight(right) || (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0))
  }, [availableColumns, pinnedColumns, visibleColumnIds])

  const load = useCallback(async () => {
    if (!definition) return
    setLoading(true); setError(null)
    try {
      const data = await api.queryDocuments({ typeId: schema.typeId, mode, detailTableId: definition.detailTableId, search: debouncedSearch, filters: filters.length ? { logic: "and", conditions: filters } : undefined, sorting, page, pageSize })
      setResult(data); setSelected([])
    } catch (reason) { setError(reason instanceof Error ? reason.message : "加载失败") }
    finally { setLoading(false) }
  }, [debouncedSearch, definition, filters, mode, page, pageSize, schema.typeId, sorting])

  useEffect(() => { void load() }, [load])
  useEffect(() => { setPage(1); setMode(definition?.defaultMode || "document"); setSorting(definition?.defaultSorting || []); setFilters([]); setVisibleColumnIds((definition?.columns || []).filter((column) => (definition?.defaultMode || "document") === "detail" || column.source !== "detail").map((column) => column.id)); setPinnedColumns({}) }, [definition, schema.typeId])
  useEffect(() => { setVisibleColumnIds((current) => { const available = availableColumns.map((column) => column.id); const retained = current.filter((id) => available.includes(id)); return [...retained, ...available.filter((id) => !retained.includes(id))] }) }, [availableColumns])

  if (!definition) return <Alert variant="danger">当前 Schema 尚未配置通用列表。</Alert>

  const open = async (row: DocumentListRow) => onOpen(await api.document(row.documentId))
  const create = async () => { const document = await api.create(schema.typeId); await onChanged(); onOpen(document) }
  const remove = async (row: DocumentListRow) => {
    if (row.status !== "DRAFT") return
    setDeleteRequest({ kind: "row", row })
  }
  const executeRowAction = async (command: string, row: DocumentListRow) => {
    if (command === "open") await open(row)
    if (command === "copy") await navigator.clipboard.writeText(row.code)
    if (command === "delete") await remove(row)
  }
  const exportRows = () => {
    exportCsv(`${schema.typeId}-${mode}`, columns.map((column) => ({ label: column.label, value: (row: DocumentListRow) => row.values[column.id] })), result.items)
  }
  const executeToolbar = async (command: string) => {
    if (command === "create") await create()
    if (command === "export") exportRows()
    if (command === "bulkDelete" && selected.length) setDeleteRequest({ kind: "bulk" })
  }
  const confirmDelete = async () => {
    if (!deleteRequest) return
    const ids = deleteRequest.kind === "row" ? [deleteRequest.row.documentId] : [...new Set(result.items.filter((row) => selected.includes(row.key) && row.status === "DRAFT").map((row) => row.documentId))]
    setDeleteRequest(null)
    try { await Promise.all(ids.map(api.remove)); await onChanged(); await load() } catch (reason) { setError(reason instanceof Error ? reason.message : "删除失败") }
  }
  const renderToolbarAction = (action: ToolbarActionDefinition) => {
    if (action.command.startsWith("custom:")) {
      const Plugin = pluginRegistry.getToolbarAction(action.command.slice("custom:".length))
      return Plugin ? <Plugin key={action.id} action={action} schema={schema} onChanged={onChanged} reload={load} /> : <Button key={action.id} disabled>{action.label}（插件未注册）</Button>
    }
    return <Button key={action.id} variant={action.variant === "primary" ? "primary" : action.variant === "danger" ? "danger" : "secondary"} disabled={action.requiresSelection && !selected.length} onClick={() => executeToolbar(action.command)}>{action.command === "create" ? <Plus size={17} /> : <Download size={16} />}{action.command === "create" ? `${action.label}${schema.typeName}` : action.label}</Button>
  }
  const sortColumn = (column: ListColumnDefinition, append: boolean) => {
    if (!column.sortable) return
    setPage(1)
    setSorting((current) => {
      const existing = current.find((item) => item.columnId === column.id)
      const next: ListSortDefinition = { columnId: column.id, direction: existing?.direction === "asc" ? "desc" : "asc" }
      return append ? [...current.filter((item) => item.columnId !== column.id), next] : [next]
    })
  }
  const updateFilter = (index: number, patch: Partial<ListFilterCondition>) => setFilters((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item))
  const gridTemplate = `34px ${columns.map((column) => `${column.width || 130}px`).join(" ")} 160px`

  return <>
    <PageHeader eyebrow={`单据中心 / ${schema.typeName}`} title={schema.typeName} description={schema.description} actions={(definition.toolbarActions || []).filter((action) => !action.modes || action.modes.includes(mode)).map(renderToolbarAction)} />
    <article className="panel list-panel">
      <div className="list-toolbar">
        <div className="search-box"><Search /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} placeholder="搜索单号和单据内容" /></div>
        {(definition.modes || ["document"]).length > 1 && <div className="mode-switch"><button className={mode === "document" ? "active" : ""} onClick={() => { setMode("document"); setPage(1) }}>主表模式</button><button className={mode === "detail" ? "active" : ""} onClick={() => { setMode("detail"); setPage(1) }}>明细行模式</button></div>}
        <Button onClick={() => setShowFilters((value) => !value)}><Filter size={15} />多条件筛选{filters.length ? ` (${filters.length})` : ""}</Button><ColumnSettings columns={availableColumns} visibleColumnIds={visibleColumnIds} pinnedColumns={pinnedColumns} onChange={(ids) => { if (ids.length) setVisibleColumnIds(ids) }} onPinChange={(id, pin) => setPinnedColumns((current) => ({ ...current, [id]: pin }))} onReset={() => { setVisibleColumnIds(availableColumns.map((column) => column.id)); setPinnedColumns({}) }} />
        <span className="toolbar-spacer" /><span className="sort-hint">点击表头排序，Shift 点击追加</span><IconButton onClick={load} title="刷新"><RefreshCw className={loading ? "spin" : ""} /></IconButton>
      </div>
      {showFilters && <div className="advanced-filters">
        {filters.map((filter, index) => <div className="filter-row" key={`${index}-${filter.columnId}`}><select value={filter.columnId} onChange={(event) => updateFilter(index, { columnId: event.target.value })}>{columns.filter((column) => column.filterable).map((column) => <option value={column.id} key={column.id}>{column.label}</option>)}</select><select value={filter.operator} onChange={(event) => updateFilter(index, { operator: event.target.value as ListFilterOperator })}>{FILTER_OPERATORS.map((operator) => <option value={operator} key={operator}>{FILTER_LABELS[operator]}</option>)}</select>{!["empty", "notEmpty"].includes(filter.operator) && <input value={String(filter.value ?? "")} onChange={(event) => updateFilter(index, { value: event.target.value })} placeholder="筛选值" />}{filter.operator === "between" && <input value={String(filter.secondValue ?? "")} onChange={(event) => updateFilter(index, { secondValue: event.target.value })} placeholder="结束值" />}<IconButton onClick={() => setFilters((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X /></IconButton></div>)}
        <Button size="sm" onClick={() => { const first = columns.find((column) => column.filterable); if (first) setFilters((current) => [...current, { columnId: first.id, operator: "contains", value: "" }]) }}>添加条件</Button><span>多个条件按“并且”执行；查询协议同时支持嵌套“或者”。</span>
      </div>}
      {result.aggregates.length > 0 && <div className="aggregate-strip">{result.aggregates.map((item) => <div key={item.id}><span>{item.label}</span><strong>{typeof item.value === "number" ? item.value.toLocaleString("zh-CN", { maximumFractionDigits: 2 }) : item.value ?? "—"}</strong></div>)}</div>}
      {error && <Alert variant="danger" className="list-alert">{error}</Alert>}
      <div className="document-table generic-table"><div className="document-row document-head" style={{ gridTemplateColumns: gridTemplate }}><span><input type="checkbox" checked={result.items.length > 0 && selected.length === result.items.length} onChange={(event) => setSelected(event.target.checked ? result.items.map((row) => row.key) : [])} /></span>{columns.map((column) => { const sort = sorting.findIndex((item) => item.columnId === column.id); return <span key={column.id} onClick={(event) => sortColumn(column, event.shiftKey)}>{column.label}{sort >= 0 ? ` ${sorting[sort]?.direction === "asc" ? "↑" : "↓"}${sorting.length > 1 ? sort + 1 : ""}` : ""}</span> })}<span>操作</span></div>
        {!loading && result.items.map((row) => <div className="document-row" style={{ gridTemplateColumns: gridTemplate }} key={row.key} onDoubleClick={() => open(row)}><span><input type="checkbox" checked={selected.includes(row.key)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, row.key] : current.filter((key) => key !== row.key))} /></span>{columns.map((column) => <span className={column.id === "code" ? "subject-cell" : ""} key={column.id}>{displayValue(column, row.values[column.id], schema)}</span>)}<span className="row-actions">{(definition.rowActions || []).filter((action) => !action.allowedStatuses || action.allowedStatuses.includes(row.status)).map((action) => <button className={action.variant === "danger" ? "danger" : ""} key={action.id} onClick={() => executeRowAction(action.command, row)}>{action.label}</button>)}</span></div>)}
        {loading && <EmptyState icon={<RefreshCw className="spin" />} title="正在执行服务端查询..." />}
        {!loading && !result.items.length && <EmptyState icon={<Search />} title="没有找到符合条件的记录" description="调整关键词、筛选条件或列表模式" />}
      </div>
      <Pagination page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1) }} />
    </article>
    <ConfirmDialog open={Boolean(deleteRequest)} title={deleteRequest?.kind === "bulk" ? "批量删除草稿" : "删除草稿"} description={deleteRequest?.kind === "bulk" ? `将删除选中项中的草稿单据，共选择 ${selected.length} 项。非草稿项会自动跳过。` : `确认删除草稿 ${deleteRequest?.row.code || ""}？此操作不可撤销。`} confirmLabel="删除" destructive onConfirm={() => void confirmDelete()} onClose={() => setDeleteRequest(null)} />
  </>
}
