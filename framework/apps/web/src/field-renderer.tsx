import { evaluateFormula, isModeReadOnly, type FieldSchema, type FormMode } from "@zform/shared"
import { pluginRegistry } from "./plugin-registry"

interface FieldRendererProps {
  field: FieldSchema
  data: Record<string, unknown>
  mode: FormMode
  disabled?: boolean
  onChange: (fieldId: string, value: unknown) => void
}

function textValue(value: unknown): string { return value === undefined || value === null ? "" : String(value) }

export function FieldRenderer({ field, data, mode, disabled = false, onChange }: FieldRendererProps) {
  const readOnly = disabled || isModeReadOnly(field.readOnly, field.readOnlyModes, mode)
  const value = field.compute ? evaluateFormula(field.compute, data) : data[field.id]
  const change = (nextValue: unknown) => onChange(field.id, nextValue)

  if (field.type.startsWith("custom:")) {
    const Plugin = pluginRegistry.getField(field.type)
    return Plugin ? <Plugin field={field} data={data} mode={mode} disabled={readOnly} onChange={onChange} /> : <span className="field-plugin-missing">未注册 {field.type}</span>
  }
  if (field.type === "computed") return <output className="computed-value">{textValue(value) || "—"}</output>
  if (field.type === "select" || field.type === "combobox") {
    const options = field.type === "combobox" ? field.combobox?.options || field.options : field.options
    return <select disabled={readOnly} value={textValue(value)} onChange={(event) => change(event.target.value)}><option value="">请选择</option>{options?.map((option) => <option value={option.value} disabled={option.disabled} key={option.value}>{option.label}</option>)}</select>
  }
  if (field.type === "textarea") return <textarea disabled={readOnly} value={textValue(value)} rows={3} placeholder={field.placeholder} onChange={(event) => change(event.target.value)} />
  if (field.type === "checkbox") return <label className="checkbox-control"><input type="checkbox" disabled={readOnly} checked={Boolean(value)} onChange={(event) => change(event.target.checked)} /><span>{value ? "是" : "否"}</span></label>
  if (field.type === "dimensions" && field.dimensions) {
    const config = field.dimensions
    return <div className="compound-field dimensions-control">{[config.lengthField, config.widthField, config.heightField].map((fieldId, index) => <label key={fieldId}><input type="number" min="0" disabled={readOnly} value={textValue(data[fieldId])} placeholder={["长", "宽", "高"][index]} onChange={(event) => onChange(fieldId, event.target.value === "" ? "" : Number(event.target.value))} /></label>)}<span>{config.unit || ""}</span></div>
  }
  if (field.type === "price" && field.price) {
    return <div className="compound-field price-control"><input type="number" min="0" disabled={readOnly} value={textValue(data[field.price.amountField])} placeholder="金额" onChange={(event) => onChange(field.price!.amountField, event.target.value === "" ? "" : Number(event.target.value))} /><select disabled={readOnly} value={textValue(data[field.price.currencyField])} onChange={(event) => onChange(field.price!.currencyField, event.target.value)}>{(field.price.currencies || [{ label: "CNY", value: "CNY" }, { label: "USD", value: "USD" }]).map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></div>
  }
  if (field.type === "ratio" && field.ratio) {
    return <div className="compound-field ratio-control"><input type="number" min="0" disabled={readOnly} value={textValue(data[field.ratio.numeratorField])} onChange={(event) => onChange(field.ratio!.numeratorField, Number(event.target.value))} /><span>:</span><input type="number" min="0" disabled={readOnly} value={textValue(data[field.ratio.denominatorField])} onChange={(event) => onChange(field.ratio!.denominatorField, Number(event.target.value))} /><span>{field.ratio.suffix || ""}</span></div>
  }
  return <input disabled={readOnly} value={textValue(value)} type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"} placeholder={field.placeholder} onChange={(event) => change(field.type === "number" ? (event.target.value === "" ? "" : Number(event.target.value)) : event.target.value)} />
}
