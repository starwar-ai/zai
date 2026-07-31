import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react"
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core"
import { SortableContext, arrayMove, horizontalListSortingStrategy, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Check, GripVertical, Link2, Trash2 } from "lucide-react"
import { evaluateCondition, evaluateFormula, type DetailRowData, type DetailTableSchema, type FieldSchema, type FormMode, type RowSourceReference } from "@zform/shared"
import { FieldRenderer } from "@/components/field-renderer"
import { IconButton, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui"

interface DocumentDetailTableProps {
  storageId: string
  table: DetailTableSchema
  rows: DetailRowData[]
  mode: FormMode
  addAction?: ReactNode
  onDeleteRow: (rowId: string) => void
  onUpdateCell: (rowId: string, fieldId: string, value: unknown) => void
  onReorderRows: (rows: DetailRowData[]) => void
  onTraceRow?: (source: RowSourceReference) => void
  highlightedRowId?: string
}

interface DetailPreferences { order: string[]; widths: Record<string, number> }

function loadPreferences(key: string): DetailPreferences {
  try { return { order: [], widths: {}, ...JSON.parse(localStorage.getItem(key) || "{}") as Partial<DetailPreferences> } }
  catch { return { order: [], widths: {} } }
}

function displayFieldValue(field: FieldSchema, data: Record<string, unknown>): string {
  const value = field.compute ? evaluateFormula(field.compute, data) : data[field.id]
  if (value === undefined || value === null || value === "") return "—"
  if (field.type === "checkbox") return value ? "是" : "否"
  if (field.type === "select" || field.type === "combobox") {
    const options = field.type === "combobox" ? field.combobox?.options || field.options : field.options
    return options?.find((option) => option.value === value)?.label || String(value)
  }
  if (field.type === "number") return Number(value).toLocaleString("zh-CN", { maximumFractionDigits: 4 })
  if (field.type === "date") return String(value).slice(0, 10)
  if (field.type === "price" && field.price) {
    const amount = data[field.price.amountField]
    if (amount === undefined || amount === null || amount === "") return "—"
    return `${Number(amount).toLocaleString("zh-CN", { maximumFractionDigits: 2 })} ${String(data[field.price.currencyField] || "")}`.trim()
  }
  if (field.type === "ratio" && field.ratio) return `${String(data[field.ratio.numeratorField] ?? "—")} : ${String(data[field.ratio.denominatorField] ?? "—")}${field.ratio.suffix || ""}`
  if (field.type === "dimensions" && field.dimensions) return `${String(data[field.dimensions.lengthField] ?? "—")} × ${String(data[field.dimensions.widthField] ?? "—")} × ${String(data[field.dimensions.heightField] ?? "—")} ${field.dimensions.unit || ""}`.trim()
  return String(value)
}

function SortableHeader({ id, disabled, className, style, children }: { id: string; disabled: boolean; className?: string; style?: CSSProperties; children: ReactNode }) {
  const sortable = useSortable({ id: `column:${id}`, disabled })
  return <TableHead ref={sortable.setNodeRef} {...sortable.attributes} {...sortable.listeners} tabIndex={disabled ? undefined : 0} className={`${className || ""}${sortable.isDragging ? " dragging" : ""}`} style={{ ...style, transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition }}>{children}</TableHead>
}

function SortableRow({ id, disabled, className, children }: { id: string; disabled: boolean; className?: string; children: ReactNode }) {
  const sortable = useSortable({ id: `row:${id}`, disabled })
  return <TableRow ref={sortable.setNodeRef} {...sortable.attributes} {...sortable.listeners} tabIndex={disabled ? undefined : 0} data-row-id={id} className={`${className || ""}${sortable.isDragging ? " dragging" : ""}`} style={{ transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition }}>{children}</TableRow>
}

export function DocumentDetailTable({ storageId, table, rows, mode, addAction, onDeleteRow, onUpdateCell, onReorderRows, onTraceRow, highlightedRowId }: DocumentDetailTableProps) {
  const storageKey = `zform-detail-table:${storageId}:${table.id}`
  const initial = useMemo(() => loadPreferences(storageKey), [storageKey])
  const [columnOrder, setColumnOrder] = useState<string[]>(initial.order)
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(initial.widths)
  const [editingRowIds, setEditingRowIds] = useState<Set<string>>(new Set())
  const previousRowIds = useRef(new Set(rows.map((row) => row.id)))
  const resizeCleanup = useRef<(() => void) | null>(null)
  const editable = mode !== "view" && !table.readOnly
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))

  const fields = useMemo(() => {
    const ids = table.fields.map((field) => field.id)
    const resolved = [...columnOrder.filter((id) => ids.includes(id)), ...ids.filter((id) => !columnOrder.includes(id))]
    return resolved.map((id) => table.fields.find((field) => field.id === id)).filter((field): field is DetailTableSchema["fields"][number] => Boolean(field))
  }, [columnOrder, table.fields])

  useEffect(() => {
    if (!editable) { setEditingRowIds(new Set()); previousRowIds.current = new Set(rows.map((row) => row.id)); return }
    const current = new Set(rows.map((row) => row.id))
    const added = rows.filter((row) => !previousRowIds.current.has(row.id)).map((row) => row.id)
    setEditingRowIds((existing) => new Set([...existing].filter((id) => current.has(id)).concat(added)))
    previousRowIds.current = current
  }, [editable, rows])
  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify({ order: fields.map((field) => field.id), widths: columnWidths } satisfies DetailPreferences)) } catch { /* 浏览器禁用存储时保持当前会话可用 */ }
  }, [columnWidths, fields, storageKey])
  useEffect(() => () => resizeCleanup.current?.(), [])
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setEditingRowIds(new Set()) }
    document.addEventListener("keydown", close); return () => document.removeEventListener("keydown", close)
  }, [])
  useEffect(() => {
    if (!highlightedRowId) return
    document.querySelector<HTMLElement>(`[data-row-id="${highlightedRowId}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" })
  }, [highlightedRowId, rows, table.id])

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const activeId = String(active.id); const overId = String(over.id)
    if (activeId.startsWith("column:") && overId.startsWith("column:")) {
      const ids = fields.map((field) => field.id); const from = ids.indexOf(activeId.slice(7)); const to = ids.indexOf(overId.slice(7)); if (from >= 0 && to >= 0) setColumnOrder(arrayMove(ids, from, to)); return
    }
    if (activeId.startsWith("row:") && overId.startsWith("row:")) {
      const from = rows.findIndex((row) => row.id === activeId.slice(4)); const to = rows.findIndex((row) => row.id === overId.slice(4)); if (from >= 0 && to >= 0) onReorderRows(arrayMove(rows, from, to))
    }
  }
  const moveColumn = (fieldId: string, direction: -1 | 1) => {
    const ids = fields.map((field) => field.id); const index = ids.indexOf(fieldId); const target = index + direction
    if (index < 0 || target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target]!, ids[index]!]; setColumnOrder(ids)
  }
  const moveRow = (rowId: string, direction: -1 | 1) => {
    const next = [...rows]; const index = next.findIndex((row) => row.id === rowId); const target = index + direction
    if (index < 0 || target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target]!, next[index]!]; onReorderRows(next)
  }
  const beginResize = (event: ReactPointerEvent, fieldId: string) => {
    event.preventDefault(); event.stopPropagation()
    const startX = event.clientX; const startWidth = columnWidths[fieldId] || 150
    const move = (pointer: PointerEvent) => setColumnWidths((current) => ({ ...current, [fieldId]: Math.max(100, startWidth + pointer.clientX - startX) }))
    const stop = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); resizeCleanup.current = null }
    resizeCleanup.current?.(); resizeCleanup.current = stop
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", stop)
  }
  const stickyStyle = (side: "left" | "right"): CSSProperties => side === "left" ? { position: "sticky", left: 0, zIndex: 4 } : { position: "sticky", right: 0, zIndex: 4 }
  const totalWidth = 78 + fields.reduce((sum, field) => sum + (columnWidths[field.id] || 150), 0) + (editable ? 72 : 0)

  return <article className="form-section detail-section ztrade-detail-table">
    <div className="section-title"><span /><h2>{table.label}</h2><em>共 {rows.length} 行</em>{editable && addAction}</div>
    <div className="ztrade-detail-scroll"><DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}><Table style={{ width: totalWidth }}><TableHeader><TableRow>
      {editable && <TableHead className="detail-drag-column" style={stickyStyle("left")}><GripVertical aria-hidden /></TableHead>}
      <TableHead className="detail-index-column" style={{ ...stickyStyle("left"), left: editable ? 34 : 0 }}>#</TableHead>
      <SortableContext items={fields.map((field) => `column:${field.id}`)} strategy={horizontalListSortingStrategy}>{fields.map((field) => <SortableHeader key={field.id} id={field.id} disabled={!editable} style={{ width: columnWidths[field.id] || 150, minWidth: columnWidths[field.id] || 150 }}><button className="detail-column-label" aria-label={`拖动${field.label}列，或使用 Alt 加左右方向键调整顺序`} onKeyDown={(event) => { if (event.altKey && event.key === "ArrowLeft") { event.preventDefault(); moveColumn(field.id, -1) } if (event.altKey && event.key === "ArrowRight") { event.preventDefault(); moveColumn(field.id, 1) } }}><GripVertical />{field.label}{field.required && <i>*</i>}</button><span className="ztrade-column-resizer" onPointerDown={(event) => beginResize(event, field.id)} /></SortableHeader>)}</SortableContext>
      <TableHead className="detail-source-column">来源</TableHead>{editable && <TableHead className="detail-actions-column" style={stickyStyle("right")}>操作</TableHead>}
    </TableRow></TableHeader><TableBody>
      <SortableContext items={rows.map((row) => `row:${row.id}`)} strategy={verticalListSortingStrategy}>{rows.map((row, rowIndex) => { const editing = editingRowIds.has(row.id); return <SortableRow key={row.id} id={row.id} disabled={!editable || editing} className={`${editing ? "editing " : ""}${highlightedRowId === row.id ? "highlighted" : ""}`}>
        {editable && <TableCell className="detail-drag-column" style={stickyStyle("left")}><button className="detail-row-drag-handle" aria-label={`移动第${rowIndex + 1}行，Alt 加上下方向键调整顺序`} onKeyDown={(event) => { if (event.altKey && event.key === "ArrowUp") { event.preventDefault(); moveRow(row.id, -1) } if (event.altKey && event.key === "ArrowDown") { event.preventDefault(); moveRow(row.id, 1) } }}><GripVertical /></button></TableCell>}
        <TableCell className="detail-index-column" style={{ ...stickyStyle("left"), left: editable ? 34 : 0 }}>{rowIndex + 1}</TableCell>
        {fields.map((field) => <TableCell key={field.id} style={{ width: columnWidths[field.id] || 150, minWidth: columnWidths[field.id] || 150 }} onDoubleClick={() => { if (editable) setEditingRowIds((current) => new Set(current).add(row.id)) }}>{evaluateCondition(field.visibleWhen, row.data) ? editing && !field.readOnly ? <FieldRenderer field={field} data={row.data} mode={mode} onChange={(fieldId, value) => onUpdateCell(row.id, fieldId, value)} /> : <span className="detail-display-value">{displayFieldValue(field, row.data)}</span> : null}</TableCell>)}
        <TableCell className="detail-source-column" title={row.sourceRef ? `来源：${row.sourceRef.code}/${row.sourceRef.rowId}` : undefined}>{row.sourceRef ? <button className="detail-source-link" aria-label={`打开来源单据${row.sourceRef.code}`} onClick={() => onTraceRow?.(row.sourceRef!)}><Link2 /></button> : null}</TableCell>
        {editable && <TableCell className="detail-actions-column" style={stickyStyle("right")}><div>{editing && <IconButton aria-label="完成编辑" onClick={() => setEditingRowIds((current) => { const next = new Set(current); next.delete(row.id); return next })}><Check /></IconButton>}<IconButton aria-label="删除行" onClick={() => onDeleteRow(row.id)}><Trash2 /></IconButton></div></TableCell>}
      </SortableRow>})}</SortableContext>
    </TableBody></Table></DndContext></div>
    {!rows.length && <div className="detail-empty">暂无明细</div>}
  </article>
}
