import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import type { FieldSchema, ListColumnDefinition, ListFilterCondition, ListFilterOperator, SelectOption } from "@zform/shared"

const LABELS: Record<ListFilterOperator, string> = {
  eq: "等于", neq: "不等于", contains: "包含", startsWith: "开头是", endsWith: "结尾是",
  gt: "大于", gte: "大于等于", lt: "小于", lte: "小于等于", between: "介于", in: "属于", empty: "为空", notEmpty: "不为空",
}
const SYMBOLS: Record<ListFilterOperator, string> = { eq: "=", neq: "≠", contains: "∋", startsWith: "A…", endsWith: "…Z", gt: ">", gte: "≥", lt: "<", lte: "≤", between: "↔", in: "∈", empty: "∅", notEmpty: "∅̸" }

function defaultOperator(column: ListColumnDefinition, field?: FieldSchema): ListFilterOperator {
  if (field?.type === "select" || field?.type === "combobox" || field?.type === "checkbox") return "eq"
  return column.dataType === "number" || column.dataType === "date" || column.dataType === "datetime" || column.dataType === "boolean" || column.dataType === "status" ? "eq" : "contains"
}

function operators(column: ListColumnDefinition, field?: FieldSchema): ListFilterOperator[] {
  if (field?.type === "select" || field?.type === "combobox" || field?.type === "checkbox") return ["eq", "neq", "empty", "notEmpty"]
  if (column.dataType === "number") return ["eq", "neq", "gt", "gte", "lt", "lte", "between", "empty", "notEmpty"]
  if (column.dataType === "date" || column.dataType === "datetime") return ["eq", "gt", "lt", "between", "empty", "notEmpty"]
  if (column.dataType === "status") return ["eq", "neq", "empty", "notEmpty"]
  if (column.dataType === "boolean") return ["eq", "neq", "empty", "notEmpty"]
  return ["contains", "eq", "neq", "startsWith", "endsWith", "empty", "notEmpty"]
}

function normalizedValue(value: string, column: ListColumnDefinition): unknown {
  if (column.dataType === "number") return value === "" ? "" : Number(value)
  if (column.dataType === "boolean") return value === "true"
  return value
}

interface ListFilterCellProps {
  column: ListColumnDefinition
  field?: FieldSchema
  options?: SelectOption[]
  filter?: ListFilterCondition
  onChange: (filter: ListFilterCondition | undefined) => void
}

function OperatorSelect({ columnLabel, value, options, onChange }: { columnLabel: string; value: ListFilterOperator; options: ListFilterOperator[]; onChange: (value: ListFilterOperator) => void }) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    document.addEventListener("pointerdown", close)
    window.addEventListener("resize", close)
    window.addEventListener("scroll", close, true)
    return () => { document.removeEventListener("pointerdown", close); window.removeEventListener("resize", close); window.removeEventListener("scroll", close, true) }
  }, [open])
  const rect = triggerRef.current?.getBoundingClientRect()
  return <><button ref={triggerRef} type="button" className="filter-operator" aria-label={`${columnLabel}筛选操作符：${LABELS[value]}`} aria-expanded={open} title={LABELS[value]} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); setOpen((current) => !current) }}>{SYMBOLS[value]}</button>{open && rect && createPortal(<div className="filter-operator-menu" role="listbox" aria-label={`${columnLabel}筛选操作符`} style={{ position: "fixed", top: rect.bottom + 3, left: rect.left }} onPointerDown={(event) => event.stopPropagation()}>{options.map((operator) => <button type="button" role="option" aria-selected={operator === value} className={operator === value ? "active" : ""} key={operator} onClick={() => { onChange(operator); setOpen(false) }}><span>{SYMBOLS[operator]}</span>{LABELS[operator]}</button>)}</div>, document.body)}</>
}

export function ListFilterCell({ column, field, options, filter, onChange }: ListFilterCellProps) {
  const [selectedOperator, setSelectedOperator] = useState<ListFilterOperator>(filter?.operator || defaultOperator(column, field))
  useEffect(() => { if (filter?.operator) setSelectedOperator(filter.operator) }, [filter?.operator])
  const available = useMemo(() => operators(column, field), [column, field])
  const needsValue = selectedOperator !== "empty" && selectedOperator !== "notEmpty"
  const selectOptions = column.dataType === "boolean" ? [{ label: "是", value: "true" }, { label: "否", value: "false" }] : options || field?.options
  const inputType = column.dataType === "number" ? "number" : column.dataType === "date" ? "date" : column.dataType === "datetime" ? "datetime-local" : "text"
  const emitValue = (value: string) => {
    if (value === "") { onChange(undefined); return }
    onChange({ columnId: column.id, operator: selectedOperator, value: normalizedValue(value, column), secondValue: filter?.secondValue })
  }
  const changeOperator = (operator: ListFilterOperator) => {
    setSelectedOperator(operator)
    if (operator === "empty" || operator === "notEmpty") onChange({ columnId: column.id, operator })
    else if (filter?.value !== undefined && filter.value !== "") onChange({ ...filter, operator, secondValue: operator === "between" ? filter.secondValue : undefined })
    else onChange(undefined)
  }
  const currentValue = filter?.value === undefined || filter.value === null ? "" : String(filter.value)

  return <div className={`typed-filter ${selectedOperator === "between" ? "between" : ""} ${filter ? "active" : ""}`}>
    <OperatorSelect columnLabel={column.label} value={selectedOperator} options={available} onChange={changeOperator} />
    {!needsValue ? <span className="filter-no-value">{LABELS[selectedOperator]}</span> : selectOptions?.length ? <select aria-label={`${column.label}筛选值`} value={currentValue} onChange={(event) => emitValue(event.target.value)}><option value="">全部</option>{selectOptions.map((option) => <option disabled={option.disabled} value={option.value} key={option.value}>{option.label}</option>)}</select> : <input aria-label={`${column.label}筛选值`} type={inputType} value={currentValue} placeholder="筛选" onChange={(event) => emitValue(event.target.value)} />}
    {selectedOperator === "between" && <><span className="filter-range-separator">~</span><input aria-label={`${column.label}筛选结束值`} type={inputType} value={filter?.secondValue === undefined || filter.secondValue === null ? "" : String(filter.secondValue)} placeholder="至" onChange={(event) => filter && onChange({ ...filter, secondValue: normalizedValue(event.target.value, column) })} /></>}
  </div>
}
