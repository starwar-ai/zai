import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { useQuery } from "@tanstack/react-query"
import { getCoreRowModel, useReactTable, type ColumnDef } from "@tanstack/react-table"
import { ArrowDown, ArrowUp, ArrowUpDown, Download, FileText, FilterX, GripVertical, List as ListIcon, Plus, RefreshCw, Search, Trash2 } from "lucide-react"
import {
  STATUS_LABELS, type DocumentListRow, type DocumentQueryResult, type DocumentRecord, type DocumentSchema,
  type FieldSchema, type ListActionDefinition, type ListColumnDefinition, type ListFilterCondition, type ListMode, type ListSortDefinition, type SelectOption,
  type ToolbarActionDefinition,
} from "@zform/shared"
import { api } from "@/apis/framework-api"
import { ListFilterCell } from "@/components/list-filter-cell"
import { StatusPill, formatDate } from "@/components/status-pill"
import { Alert, Button, ColumnSettings, ConfirmDialog, EmptyState, IconButton, Pagination, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, type ColumnPin } from "@/components/ui"
import { pluginRegistry } from "@/core/plugin-registry"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { exportCsv } from "@/lib/csv-export"
import { queryClient } from "@/lib/query-client"

interface DocumentListProps { schema: DocumentSchema; onOpen: (document: DocumentRecord) => void; onCreate: () => void; onCopy: (documentId: string) => void; onChanged: () => Promise<void> }
interface ListPreferences { order: string[]; widths: Record<string, number>; pins: Record<string, ColumnPin>; hidden: string[] }

const EMPTY_RESULT: DocumentQueryResult = { items: [], total: 0, page: 1, pageSize: 20, pageCount: 1, aggregates: [] }
const EMPTY_PREFERENCES: ListPreferences = { order: [], widths: {}, pins: {}, hidden: [] }

function OverflowActions({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    document.addEventListener("pointerdown", close); window.addEventListener("resize", close); window.addEventListener("scroll", close, true)
    return () => { document.removeEventListener("pointerdown", close); window.removeEventListener("resize", close); window.removeEventListener("scroll", close, true) }
  }, [open])
  const rect = triggerRef.current?.getBoundingClientRect()
  return <><button ref={triggerRef} className="row-more-button" aria-label="更多操作" onClick={(event) => { event.stopPropagation(); setOpen((value) => !value) }}>···</button>{open && rect && createPortal(<div className="row-actions-popover" style={{ position: "fixed", top: rect.bottom + 4, right: window.innerWidth - rect.right }} onClick={(event) => event.stopPropagation()}>{children}</div>, document.body)}</>
}

function loadPreferences(key: string): ListPreferences {
  try { return { ...EMPTY_PREFERENCES, ...JSON.parse(localStorage.getItem(key) || "{}") as Partial<ListPreferences> } }
  catch { return EMPTY_PREFERENCES }
}

function displayValue(column: ListColumnDefinition, value: unknown, schema: DocumentSchema) {
  if (column.dataType === "status" && typeof value === "string" && value in STATUS_LABELS) return <StatusPill status={value as keyof typeof STATUS_LABELS} label={schema.statusLabels?.[value as keyof typeof STATUS_LABELS]} />
  if ((column.dataType === "date" || column.dataType === "datetime") && typeof value === "string") return formatDate(value, column.dataType === "datetime")
  if (column.dataType === "number" && value !== undefined && value !== null && value !== "") return Number(value).toLocaleString("zh-CN", { maximumFractionDigits: 2 })
  if (column.dataType === "boolean") return value ? "是" : "否"
  return String(value ?? "—")
}

export function DocumentList({ schema, onOpen, onCreate, onCopy, onChanged }: DocumentListProps) {
  const definition = schema.list
  const preferenceKey = `zform-list-table:${schema.typeId}`
  const initialPreferences = useMemo(() => loadPreferences(preferenceKey), [preferenceKey])
  const [mode, setMode] = useState<ListMode>(definition?.defaultMode || "document")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<ListFilterCondition[]>([])
  const debouncedFilters = useDebouncedValue(filters, 250)
  const [sorting, setSorting] = useState<ListSortDefinition[]>(definition?.defaultSorting || [])
  const [selectedRows, setSelectedRows] = useState<Map<string, DocumentListRow>>(new Map())
  const [visibleColumnIds, setVisibleColumnIds] = useState<string[]>(initialPreferences.order)
  const [pinnedColumns, setPinnedColumns] = useState<Record<string, ColumnPin>>(initialPreferences.pins)
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(initialPreferences.widths)
  const [draggedColumnId, setDraggedColumnId] = useState<string | null>(null)
  const [deleteRequest, setDeleteRequest] = useState<{ kind: "row"; row: DocumentListRow } | { kind: "bulk" } | null>(null)
  const resizeCleanup = useRef<(() => void) | null>(null)

  const availableColumns = useMemo(() => (definition?.columns || []).filter((column) => mode === "detail" || column.source !== "detail"), [definition, mode])
  const columns = useMemo(() => {
    const order = new Map(visibleColumnIds.map((id, index) => [id, index]))
    const pinWeight = (column: ListColumnDefinition) => pinnedColumns[column.id] === "left" ? 0 : pinnedColumns[column.id] === "right" ? 2 : 1
    return availableColumns.filter((column) => visibleColumnIds.includes(column.id)).sort((left, right) => pinWeight(left) - pinWeight(right) || (order.get(left.id) ?? 999) - (order.get(right.id) ?? 999))
  }, [availableColumns, pinnedColumns, visibleColumnIds])

  const queryRequest = useMemo(() => ({ typeId: schema.typeId, mode, detailTableId: definition?.detailTableId, filters: debouncedFilters.length ? { logic: "and" as const, conditions: debouncedFilters } : undefined, sorting, page, pageSize }), [debouncedFilters, definition?.detailTableId, mode, page, pageSize, schema.typeId, sorting])
  const query = useQuery({ queryKey: ["documents", schema.typeId, queryRequest], queryFn: () => api.queryDocuments(queryRequest), enabled: Boolean(definition), placeholderData: (previous) => previous })
  const result = query.data || EMPTY_RESULT
  const loading = query.isFetching
  const load = useCallback(async () => { setError(null); await queryClient.invalidateQueries({ queryKey: ["documents", schema.typeId] }) }, [schema.typeId])
  const tableColumns = useMemo<ColumnDef<DocumentListRow>[]>(() => columns.map((column) => ({ id: column.id, accessorFn: (row) => row.values[column.id] })), [columns])
  const tableModel = useReactTable({ data: result.items, columns: tableColumns, getCoreRowModel: getCoreRowModel(), manualPagination: true, manualSorting: true, rowCount: result.total, getRowId: (row) => row.key })
  useEffect(() => {
    const saved = loadPreferences(preferenceKey)
    const ids = (definition?.columns || []).filter((column) => (definition?.defaultMode || "document") === "detail" || column.source !== "detail").map((column) => column.id)
    const order = [...saved.order.filter((id) => ids.includes(id)), ...ids.filter((id) => !saved.order.includes(id) && !saved.hidden.includes(id))]
    setPage(1); setMode(definition?.defaultMode || "document"); setSorting(definition?.defaultSorting || []); setFilters([]); setSelectedRows(new Map())
    setVisibleColumnIds(order); setPinnedColumns(saved.pins); setColumnWidths(saved.widths)
  }, [definition, preferenceKey])
  useEffect(() => {
    setVisibleColumnIds((current) => {
      const available = availableColumns.map((column) => column.id)
      const retained = current.filter((id) => available.includes(id))
      return [...retained, ...available.filter((id) => !retained.includes(id) && !initialPreferences.hidden.includes(id))]
    })
  }, [availableColumns, initialPreferences.hidden])
  useEffect(() => {
    const hidden = availableColumns.map((column) => column.id).filter((id) => !visibleColumnIds.includes(id))
    try { localStorage.setItem(preferenceKey, JSON.stringify({ order: visibleColumnIds, widths: columnWidths, pins: pinnedColumns, hidden } satisfies ListPreferences)) } catch { /* 浏览器禁用存储时保持当前会话可用 */ }
  }, [availableColumns, columnWidths, pinnedColumns, preferenceKey, visibleColumnIds])
  useEffect(() => () => resizeCleanup.current?.(), [])

  if (!definition) return <Alert variant="danger">当前 Schema 尚未配置通用列表。</Alert>

  const selected = [...selectedRows.keys()]
  const open = async (row: DocumentListRow) => onOpen(await api.document(row.documentId))
  const remove = (row: DocumentListRow) => { if (row.status === "DRAFT") setDeleteRequest({ kind: "row", row }) }
  const executeRowAction = async (command: string, row: DocumentListRow) => {
    setError(null)
    try {
      if (command === "open") await open(row)
      if (command === "copy") await navigator.clipboard.writeText(row.code)
      if (command === "copyDocument") onCopy(row.documentId)
      if (command === "delete") remove(row)
    } catch (reason) { setError(reason instanceof Error ? reason.message : "操作失败") }
  }
  const exportRows = () => exportCsv(`${schema.typeId}-${mode}`, columns.map((column) => ({ label: column.label, value: (row: DocumentListRow) => row.values[column.id] })), result.items)
  const executeToolbar = async (command: string) => {
    if (command === "create") onCreate()
    if (command === "export") exportRows()
    if (command === "bulkDelete" && selected.length) setDeleteRequest({ kind: "bulk" })
  }
  const confirmDelete = async () => {
    if (!deleteRequest) return
    const ids = deleteRequest.kind === "row" ? [deleteRequest.row.documentId] : [...new Set([...selectedRows.values()].filter((row) => row.status === "DRAFT").map((row) => row.documentId))]
    setDeleteRequest(null)
    try { await Promise.all(ids.map(api.remove)); await queryClient.invalidateQueries({ queryKey: ["documents", schema.typeId] }); setSelectedRows(new Map()); await onChanged() } catch (reason) { setError(reason instanceof Error ? reason.message : "删除失败") }
  }
  const renderToolbarAction = (action: ToolbarActionDefinition) => {
    if (action.command.startsWith("custom:")) {
      const Plugin = pluginRegistry.getToolbarAction(action.command.slice("custom:".length))
      return Plugin ? <Plugin key={action.id} action={action} schema={schema} onChanged={onChanged} reload={load} /> : <Button key={action.id} disabled>{action.label}（插件未注册）</Button>
    }
    return <Button size="sm" key={action.id} variant={action.variant === "primary" ? "primary" : action.variant === "danger" ? "danger" : "secondary"} disabled={action.requiresSelection && !selected.length} onClick={() => executeToolbar(action.command)}>{action.command === "create" && <Plus size={16} />}{action.command === "bulkDelete" && <Trash2 size={15} />}{action.label}</Button>
  }
  const renderRowAction = (action: ListActionDefinition, row: DocumentListRow) => {
    if (action.command.startsWith("custom:")) {
      const Plugin = pluginRegistry.getListRowAction(action.command.slice("custom:".length))
      return Plugin ? <Plugin key={action.id} action={action} row={row} schema={schema} onChanged={onChanged} reload={load} /> : <button disabled key={action.id}>{action.label}（插件未注册）</button>
    }
    return <button className={action.variant === "danger" ? "danger" : ""} key={action.id} onClick={(event) => { event.stopPropagation(); void executeRowAction(action.command, row) }}>{action.label}</button>
  }
  const renderRowActions = (row: DocumentListRow) => {
    const actions = (definition.rowActions || []).filter((action) => !action.allowedStatuses || action.allowedStatuses.includes(row.status))
    return <div className="row-actions" onClick={(event) => event.stopPropagation()}>{actions.slice(0, 2).map((action) => renderRowAction(action, row))}{actions.length > 2 && <OverflowActions>{actions.slice(2).map((action) => renderRowAction(action, row))}</OverflowActions>}</div>
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
  const updateColumnFilter = (columnId: string, filter?: ListFilterCondition) => { setPage(1); setFilters((current) => filter ? [...current.filter((item) => item.columnId !== columnId), filter] : current.filter((item) => item.columnId !== columnId)) }
  const fieldForColumn = (column: ListColumnDefinition): FieldSchema | undefined => column.source === "master" ? schema.masterFields.find((field) => field.id === column.path.replace(/^master\./, "")) : column.source === "detail" ? schema.detailTables.flatMap((table) => table.fields).find((field) => field.id === column.path.split(".").at(-1)) : undefined
  const optionsForColumn = (column: ListColumnDefinition, field?: FieldSchema): SelectOption[] | undefined => column.dataType === "status" ? Object.entries({ ...STATUS_LABELS, ...schema.statusLabels }).map(([value, label]) => ({ value, label })) : field?.type === "combobox" ? field.combobox?.options || field.options : field?.options
  const toggleRow = (row: DocumentListRow, checked: boolean) => setSelectedRows((current) => { const next = new Map(current); if (checked) next.set(row.key, row); else next.delete(row.key); return next })
  const togglePage = (checked: boolean) => setSelectedRows((current) => { const next = new Map(current); result.items.forEach((row) => checked ? next.set(row.key, row) : next.delete(row.key)); return next })
  const reorderColumn = (targetId: string) => {
    if (!draggedColumnId || draggedColumnId === targetId) return
    setVisibleColumnIds((current) => { const next = current.filter((id) => id !== draggedColumnId); next.splice(Math.max(0, next.indexOf(targetId)), 0, draggedColumnId); return next })
    setDraggedColumnId(null)
  }
  const moveColumn = (columnId: string, direction: -1 | 1) => setVisibleColumnIds((current) => { const next = [...current]; const index = next.indexOf(columnId); const target = index + direction; if (index < 0 || target < 0 || target >= next.length) return current; [next[index], next[target]] = [next[target]!, next[index]!]; return next })
  const beginResize = (event: ReactPointerEvent, column: ListColumnDefinition) => {
    event.preventDefault(); event.stopPropagation()
    const startX = event.clientX; const startWidth = columnWidths[column.id] || column.width || 130
    const move = (pointer: PointerEvent) => setColumnWidths((current) => ({ ...current, [column.id]: Math.max(72, startWidth + pointer.clientX - startX) }))
    const stop = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); resizeCleanup.current = null }
    resizeCleanup.current?.(); resizeCleanup.current = stop
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", stop)
  }
  const stickyStyle = (column: ListColumnDefinition): CSSProperties => {
    const pin = pinnedColumns[column.id]
    if (!pin) return {}
    const sameSide = columns.filter((item) => pinnedColumns[item.id] === pin)
    const index = sameSide.findIndex((item) => item.id === column.id)
    const offsetColumns = pin === "left" ? sameSide.slice(0, index) : sameSide.slice(index + 1)
    const offset = offsetColumns.reduce((sum, item) => sum + (columnWidths[item.id] || item.width || 130), pin === "left" ? 42 : 150)
    return { position: "sticky", [pin]: offset, zIndex: 3 }
  }
  const allPageSelected = result.items.length > 0 && result.items.every((row) => selectedRows.has(row.key))

  return <>
    <article className="list-panel ztrade-list-table zform-list-page">
      <div className="zform-table-toolbar">
        <div className="zform-table-title"><FileText /><strong>{schema.typeName}</strong>{selected.length > 0 && <span className="selection-summary">已选 <strong>{selected.length}</strong> 项 <button onClick={() => setSelectedRows(new Map())}>清空</button></span>}</div>
        <div className="zform-table-settings">{(definition.toolbarActions || []).filter((action) => action.command !== "export" && (!action.modes || action.modes.includes(mode))).map(renderToolbarAction)}{(definition.modes || ["document"]).length > 1 && <IconButton onClick={() => { setMode((current) => current === "document" ? "detail" : "document"); setPage(1) }} title={mode === "document" ? "切换到明细模式" : "切换到单据模式"}>{mode === "document" ? <ListIcon /> : <FileText />}</IconButton>}<IconButton disabled={!filters.length} onClick={() => setFilters([])} title={`清除筛选${filters.length ? ` (${filters.length})` : ""}`}><FilterX /></IconButton><IconButton onClick={() => void load()} title="刷新"><RefreshCw className={loading ? "spin" : ""} /></IconButton><IconButton onClick={exportRows} title="导出 CSV"><Download /></IconButton><ColumnSettings columns={availableColumns} visibleColumnIds={visibleColumnIds} pinnedColumns={pinnedColumns} onChange={(ids) => setVisibleColumnIds(ids)} onPinChange={(id, pin) => setPinnedColumns((current) => ({ ...current, [id]: pin }))} /></div>
      </div>
      {(error || query.error) && <Alert variant="danger" className="list-alert">{error || (query.error instanceof Error ? query.error.message : "加载失败")}</Alert>}
      <div className="ztrade-table-scroll">
        <Table style={{ width: 42 + columns.reduce((sum, column) => sum + (columnWidths[column.id] || column.width || 130), 0) + 150 }}>
          <TableHeader><TableRow>
            <TableHead className="ztrade-selection-column ztrade-sticky-left"><input type="checkbox" checked={allPageSelected} onChange={(event) => togglePage(event.target.checked)} /></TableHead>
            {columns.map((column) => { const sortIndex = sorting.findIndex((item) => item.columnId === column.id); return <TableHead key={column.id} draggable onDragStart={() => setDraggedColumnId(column.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => reorderColumn(column.id)} className={draggedColumnId === column.id ? "dragging" : ""} style={{ width: columnWidths[column.id] || column.width || 130, minWidth: columnWidths[column.id] || column.width || 130, ...stickyStyle(column) }}><button className="ztrade-sort-button" aria-label={`${column.label}，点击排序，Alt 加左右方向键调整列顺序`} onKeyDown={(event) => { if (event.altKey && event.key === "ArrowLeft") { event.preventDefault(); moveColumn(column.id, -1) } if (event.altKey && event.key === "ArrowRight") { event.preventDefault(); moveColumn(column.id, 1) } }} onClick={(event) => sortColumn(column, event.shiftKey)}><GripVertical />{column.label}{sortIndex < 0 ? <ArrowUpDown /> : sorting[sortIndex]?.direction === "asc" ? <ArrowUp /> : <ArrowDown />}{sortIndex >= 0 && sorting.length > 1 && <sup>{sortIndex + 1}</sup>}</button><span className="ztrade-column-resizer" onPointerDown={(event) => beginResize(event, column)} /></TableHead> })}
            <TableHead className="ztrade-actions-column ztrade-sticky-right">操作</TableHead>
          </TableRow><TableRow className="ztrade-filter-row"><TableHead className="ztrade-selection-column ztrade-sticky-left" />{columns.map((column) => { const filter = filters.find((item) => item.columnId === column.id); const field = fieldForColumn(column); return <TableHead key={column.id} style={{ width: columnWidths[column.id] || column.width || 130, minWidth: columnWidths[column.id] || column.width || 130, ...stickyStyle(column) }}>{column.filterable ? <ListFilterCell column={column} field={field} options={optionsForColumn(column, field)} filter={filter} onChange={(next) => updateColumnFilter(column.id, next)} /> : null}</TableHead>})}<TableHead className="ztrade-actions-column ztrade-sticky-right" /></TableRow></TableHeader>
          <TableBody>{tableModel.getRowModel().rows.map(({ original: row }) => <TableRow key={row.key} onClick={() => void open(row)} data-state={selectedRows.has(row.key) ? "selected" : undefined}><TableCell className="ztrade-selection-column ztrade-sticky-left"><input type="checkbox" checked={selectedRows.has(row.key)} onClick={(event) => event.stopPropagation()} onChange={(event) => toggleRow(row, event.target.checked)} /></TableCell>{columns.map((column) => <TableCell key={column.id} className={column.id === "code" ? "subject-cell" : ""} style={{ width: columnWidths[column.id] || column.width || 130, minWidth: columnWidths[column.id] || column.width || 130, ...stickyStyle(column) }}><span className="ztrade-cell-value">{displayValue(column, row.values[column.id], schema)}</span></TableCell>)}<TableCell className="ztrade-actions-column ztrade-sticky-right">{renderRowActions(row)}</TableCell></TableRow>)}</TableBody>
        </Table>
        {loading && !result.items.length && <EmptyState icon={<RefreshCw className="spin" />} title="正在执行服务端查询..." />}
        {loading && result.items.length > 0 && <div className="table-loading-overlay"><RefreshCw className="spin" />正在刷新…</div>}
        {!loading && !result.items.length && <EmptyState icon={<Search />} title="没有找到符合条件的记录" description="请调整筛选条件或列表模式" />}
      </div>
      <Pagination page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1) }} />
    </article>
    <ConfirmDialog open={Boolean(deleteRequest)} title={deleteRequest?.kind === "bulk" ? "批量删除草稿" : "删除草稿"} description={deleteRequest?.kind === "bulk" ? `将删除已选择的 ${selected.length} 项中的草稿单据，非草稿项自动跳过。` : `确认删除草稿 ${deleteRequest?.row.code || ""}？此操作不可撤销。`} confirmLabel="删除" destructive onConfirm={() => void confirmDelete()} onClose={() => setDeleteRequest(null)} />
  </>
}
