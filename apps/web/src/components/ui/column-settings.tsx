import { useEffect, useRef, useState } from "react"
import { ArrowDown, ArrowUp, Eye, EyeOff, Pin, RotateCcw, Settings2 } from "lucide-react"
import { Button, IconButton } from "./button"

export type ColumnPin = "left" | "right" | undefined
export interface ConfigurableColumn { id: string; label: string }

interface ColumnSettingsProps {
  columns: ConfigurableColumn[]
  visibleColumnIds: string[]
  pinnedColumns?: Record<string, ColumnPin>
  onChange: (columnIds: string[]) => void
  onPinChange?: (columnId: string, pin: ColumnPin) => void
  onReset: () => void
}

export function ColumnSettings({ columns, visibleColumnIds, pinnedColumns = {}, onChange, onPinChange, onReset }: ColumnSettingsProps) {
  const [open, setOpen] = useState(false)
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

  return <div className="ui-column-settings" ref={rootRef}>
    <Button size="sm" aria-expanded={open} onClick={() => setOpen((value) => !value)}><Settings2 />列设置</Button>
    {open && <div className="ui-column-settings-panel" role="dialog" aria-label="列设置">
      <header><strong>显示与排列</strong><IconButton aria-label="恢复默认列设置" title="恢复默认" onClick={onReset}><RotateCcw /></IconButton></header>
      <div className="ui-column-list">{ordered.map((column) => { const visible = visibleColumnIds.includes(column.id); const index = visibleColumnIds.indexOf(column.id); const pin = pinnedColumns[column.id]; return <div className={visible ? "ui-column-item" : "ui-column-item muted"} key={column.id}>
        <button className="ui-column-visible" aria-label={visible ? `隐藏${column.label}` : `显示${column.label}`} onClick={() => toggle(column.id)}>{visible ? <Eye /> : <EyeOff />}</button><span>{column.label}</span>
        {visible && <><button aria-label={`上移${column.label}`} disabled={index <= 0} onClick={() => move(column.id, -1)}><ArrowUp /></button><button aria-label={`下移${column.label}`} disabled={index >= visibleColumnIds.length - 1} onClick={() => move(column.id, 1)}><ArrowDown /></button>{onPinChange && <button className={pin ? "active" : ""} aria-label={`排列${column.label}`} title={pin === "left" ? "排列到左侧（点击改为右侧）" : pin === "right" ? "排列到右侧（点击取消）" : "排列到左侧"} onClick={() => cyclePin(column.id)}><Pin />{pin === "left" ? "左" : pin === "right" ? "右" : ""}</button>}</>}
      </div> })}</div>
      <footer><span>至少保留一列；可将重点列排列到两侧。</span><Button size="sm" onClick={() => setOpen(false)}>完成</Button></footer>
    </div>}
  </div>
}
