import type { ExtraTabPluginProps, RowSelectorPluginProps } from "@/core/plugin-registry"
import { pluginRegistry } from "@/core/plugin-registry"

function BlankRowSelector({ definition, fields, onSelect }: RowSelectorPluginProps) {
  const defaults = Object.fromEntries(fields.filter((field) => field.defaultValue !== undefined).map((field) => [field.id, field.defaultValue]))
  return <button className="secondary-button small-button" onClick={() => onSelect([defaults])}>+ {definition.buttonLabel || "添加一行"}</button>
}

function SchemaInspector({ document, schema }: ExtraTabPluginProps) {
  return <article className="panel schema-inspector"><div className="panel-header"><div><h2>Schema 运行信息</h2><p>用于验证扩展 Tab 插件，无业务依赖</p></div></div><dl><div><dt>类型标识</dt><dd>{schema.typeId}</dd></div><div><dt>主字段</dt><dd>{schema.masterFields.length}</dd></div><div><dt>明细表</dt><dd>{schema.detailTables.length}</dd></div><div><dt>数据版本</dt><dd>V{document.version}</dd></div></dl></article>
}

let registered = false

/** 注册框架内置插件；业务插件应在独立 registration 文件中注册。 */
export function registerDefaultPlugins(): void {
  if (registered) return
  registered = true
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
}
