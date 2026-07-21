import type { ComponentType, ReactNode } from "react"
import type { DetailTableData, DocumentRecord, DocumentSchema, FieldEffectDefinition, FieldSchema, FormMode, RowSelectorDefinition, ToolbarActionDefinition } from "@zform/shared"

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

export interface ToolbarActionPluginProps {
  action: ToolbarActionDefinition
  schema: DocumentSchema
  onChanged: () => Promise<void>
  reload: () => Promise<void>
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
const toolbarActionPlugins = new Map<string, ComponentType<ToolbarActionPluginProps>>()

export const pluginRegistry = {
  registerField(type: `custom:${string}`, component: ComponentType<FieldPluginProps>) { fieldPlugins.set(type, component) },
  getField(type: string) { return fieldPlugins.get(type) },
  registerRowSelector(id: string, component: ComponentType<RowSelectorPluginProps>) { rowSelectorPlugins.set(id, component) },
  getRowSelector(id: string) { return rowSelectorPlugins.get(id) },
  registerExtraTab(id: string, component: ComponentType<ExtraTabPluginProps>) { extraTabPlugins.set(id, component) },
  getExtraTab(id: string) { return extraTabPlugins.get(id) },
  registerEffect(id: string, handler: EffectHandler) { effectHandlers.set(id, handler) },
  getEffect(id: string) { return effectHandlers.get(id) },
  registerToolbarAction(id: string, component: ComponentType<ToolbarActionPluginProps>) { toolbarActionPlugins.set(id, component) },
  getToolbarAction(id: string) { return toolbarActionPlugins.get(id) },
}

export function renderExtraTab(pluginId: string, props: ExtraTabPluginProps): ReactNode {
  const Plugin = pluginRegistry.getExtraTab(pluginId)
  return Plugin ? <Plugin {...props} /> : <div className="inline-error">扩展 Tab 插件“{pluginId}”未注册。</div>
}
