import { useEffect, useRef, useState } from "react"
import { ArrowDown, ArrowUp, Eye, EyeOff, Pin, Settings2 } from "lucide-react"
import { Button, IconButton } from "./button"

export type ColumnPin = "left" | "right" | undefined
export interface ConfigurableColumn { id: string; label: string }

interface ColumnSettingsProps {
  columns: ConfigurableColumn[]
  visibleColumnIds: string[]
  pinnedColumns?: Record<string, ColumnPin>
  onChange: (columnIds: string[]) => void
  onPinChange?: (columnId: string, pin: ColumnPin) => void
}

export function ColumnSettings({ columns, visibleColumnIds, pinnedColumns = {}, onChange, onPinChange }: ColumnSettingsProps) {
  const [open, setOpen] = useState(false)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false) }
    window.addEventListener("mousedown", close)
    return () => window.removeEventListener("mousedown", close)
  }, [open])
  const ordered = [...visibleColumnIds.map((id) => columns.find((column) => column.id === id)).filter((column): column is ConfigurableColumn => Boolean(column)), ...columns.filter((column) => !visibleColumnIds.includes(column.id))]
  const toggle = (id: string) => onChange(visibleColumnIds.includes(id) ? visibleColumnIds.filter((item) => item !== id) : [...visibleColumnIds, id])
  const move = (id: string, offset: -1 | 1) => {
    const index = visibleColumnIds.indexOf(id)
    const target = index + offset
    if (index < 0 || target < 0 || target >= visibleColumnIds.length) return
    const next = [...visibleColumnIds]
    ;[next[index], next[target]] = [next[target]!, next[index]!]
    onChange(next)
  }
  const cyclePin = (id: string) => onPinChange?.(id, pinnedColumns[id] === "left" ? "right" : pinnedColumns[id] === "right" ? undefined : "left")
  const allVisible = columns.every((column) => visibleColumnIds.includes(column.id))
  const drop = (targetId: string) => {
    if (!draggedId || draggedId === targetId || !visibleColumnIds.includes(draggedId)) return
    const next = visibleColumnIds.filter((id) => id !== draggedId)
    next.splice(Math.max(0, next.indexOf(targetId)), 0, draggedId)
    onChange(next)
    setDraggedId(null)
  }

  return <div className="ui-column-settings" ref={rootRef}>
    <IconButton aria-label="列设置" title="列设置" aria-expanded={open} onClick={() => setOpen((value) => !value)}><Settings2 /></IconButton>
    {open && <div className="ui-column-settings-panel" role="dialog" aria-label="表格设置">
      <header><span><strong>列设置</strong><small>{visibleColumnIds.length}/{columns.length}</small></span><Button size="sm" onClick={() => onChange(allVisible ? [] : columns.map((column) => column.id))}>{allVisible ? <><EyeOff />全部隐藏</> : <><Eye />全部显示</>}</Button></header>
      <div className="ui-column-list">{ordered.map((column) => { const visible = visibleColumnIds.includes(column.id); const index = visibleColumnIds.indexOf(column.id); const pin = pinnedColumns[column.id]; return <div className={`${visible ? "ui-column-item" : "ui-column-item muted"}${draggedId === column.id ? " dragging" : ""}`} key={column.id} draggable={visible} onDragStart={() => setDraggedId(column.id)} onDragEnd={() => setDraggedId(null)} onDragOver={(event) => event.preventDefault()} onDrop={() => drop(column.id)}>
        <button className="ui-column-visible" aria-label={visible ? `隐藏${column.label}` : `显示${column.label}`} onClick={() => toggle(column.id)}>{visible ? <Eye /> : <EyeOff />}</button><span>{column.label}</span>
        {visible && <><button aria-label={`上移${column.label}`} disabled={index <= 0} onClick={() => move(column.id, -1)}><ArrowUp /></button><button aria-label={`下移${column.label}`} disabled={index >= visibleColumnIds.length - 1} onClick={() => move(column.id, 1)}><ArrowDown /></button>{onPinChange && <button className={pin ? "active" : ""} aria-label={`排列${column.label}`} title={pin === "left" ? "排列到左侧（点击改为右侧）" : pin === "right" ? "排列到右侧（点击取消）" : "排列到左侧"} onClick={() => cyclePin(column.id)}><Pin />{pin === "left" ? "左" : pin === "right" ? "右" : ""}</button>}</>}
      </div> })}</div>
      <footer><span>拖拽调整顺序 · 点击图钉固定列</span></footer>
    </div>}
  </div>
}
