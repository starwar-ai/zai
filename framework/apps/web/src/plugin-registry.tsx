import { useEffect, useRef, type ComponentType, type ReactNode } from "react"
import type { DetailTableData, DocumentRecord, DocumentSchema, FieldEffectDefinition, FieldSchema, FormMode, RowSelectorDefinition } from "@zform/shared"

export interface FieldPluginProps {
  field: FieldSchema
  data: Record<string, unknown>
  mode: FormMode
  disabled: boolean
  onChange: (fieldId: string, value: unknown) => void
}

export interface RowSelectorPluginProps {
  definition: RowSelectorDefinition
  fields: FieldSchema[]
  onSelect: (rows: Array<Record<string, unknown>>) => void
}

export interface ExtraTabPluginProps {
  document: DocumentRecord
  schema: DocumentSchema
  params?: Record<string, unknown>
}

export interface EffectContext {
  definition: FieldEffectDefinition
  data: Record<string, unknown>
  detailTables: DetailTableData[]
  setField: (fieldId: string, value: unknown) => void
  setDetailRows: (tableId: string, rows: Array<Record<string, unknown>>) => void
}

export type EffectHandler = (context: EffectContext) => void | Promise<void>

const fieldPlugins = new Map<string, ComponentType<FieldPluginProps>>()
const rowSelectorPlugins = new Map<string, ComponentType<RowSelectorPluginProps>>()
const extraTabPlugins = new Map<string, ComponentType<ExtraTabPluginProps>>()
const effectHandlers = new Map<string, EffectHandler>()

export const pluginRegistry = {
  registerField(type: `custom:${string}`, component: ComponentType<FieldPluginProps>) { fieldPlugins.set(type, component) },
  getField(type: string) { return fieldPlugins.get(type) },
  registerRowSelector(id: string, component: ComponentType<RowSelectorPluginProps>) { rowSelectorPlugins.set(id, component) },
  getRowSelector(id: string) { return rowSelectorPlugins.get(id) },
  registerExtraTab(id: string, component: ComponentType<ExtraTabPluginProps>) { extraTabPlugins.set(id, component) },
  getExtraTab(id: string) { return extraTabPlugins.get(id) },
  registerEffect(id: string, handler: EffectHandler) { effectHandlers.set(id, handler) },
  getEffect(id: string) { return effectHandlers.get(id) },
}

function BlankRowSelector({ definition, fields, onSelect }: RowSelectorPluginProps) {
  const defaults = Object.fromEntries(fields.filter((field) => field.defaultValue !== undefined).map((field) => [field.id, field.defaultValue]))
  return <button className="secondary-button small-button" onClick={() => onSelect([defaults])}>+ {definition.buttonLabel || "添加一行"}</button>
}

function SchemaInspector({ document, schema }: ExtraTabPluginProps) {
  return <article className="panel schema-inspector"><div className="panel-header"><div><h2>Schema 运行信息</h2><p>用于验证扩展 Tab 插件，无业务依赖</p></div></div><dl><div><dt>类型标识</dt><dd>{schema.typeId}</dd></div><div><dt>主字段</dt><dd>{schema.masterFields.length}</dd></div><div><dt>明细表</dt><dd>{schema.detailTables.length}</dd></div><div><dt>数据版本</dt><dd>V{document.version}</dd></div></dl></article>
}

pluginRegistry.registerRowSelector("blank-row", BlankRowSelector)
pluginRegistry.registerExtraTab("schema-inspector", SchemaInspector)
pluginRegistry.registerEffect("copy-field", ({ definition, data, setField }) => {
  const source = String(definition.params?.source || "")
  const target = String(definition.params?.target || "")
  if (source && target) setField(target, data[source])
})
pluginRegistry.registerEffect("clear-fields", ({ definition, setField }) => {
  const fields = Array.isArray(definition.params?.fields) ? definition.params.fields : []
  fields.forEach((field) => setField(String(field), ""))
})

export function useSchemaEffects(options: {
  effects: FieldEffectDefinition[]
  mode: FormMode
  data: Record<string, unknown>
  detailTables: DetailTableData[]
  setField: (fieldId: string, value: unknown) => void
  setDetailRows: (tableId: string, rows: Array<Record<string, unknown>>) => void
}): void {
  const snapshots = useRef(new Map<string, string>())
  const running = useRef(new Set<string>())
  const latest = useRef(options)
  latest.current = options

  useEffect(() => {
    for (const definition of options.effects) {
      if (definition.modes && !definition.modes.includes(options.mode)) continue
      const snapshot = JSON.stringify(definition.watchFields.map((field) => options.data[field]))
      if (snapshots.current.get(definition.id) === snapshot || running.current.has(definition.id)) continue
      snapshots.current.set(definition.id, snapshot)
      const handler = pluginRegistry.getEffect(definition.handlerId)
      if (!handler) { console.warn(`字段联动处理器“${definition.handlerId}”未注册。`); continue }
      running.current.add(definition.id)
      Promise.resolve(handler({ definition, data: options.data, detailTables: options.detailTables, setField: latest.current.setField, setDetailRows: latest.current.setDetailRows }))
        .catch((error: unknown) => console.warn(`字段联动“${definition.id}”执行失败：`, error))
        .finally(() => running.current.delete(definition.id))
    }
  }, [options.data, options.detailTables, options.effects, options.mode])
}

export function renderExtraTab(pluginId: string, props: ExtraTabPluginProps): ReactNode {
  const Plugin = pluginRegistry.getExtraTab(pluginId)
  return Plugin ? <Plugin {...props} /> : <div className="inline-error">扩展 Tab 插件“{pluginId}”未注册。</div>
}
