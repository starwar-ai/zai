import { useEffect, useRef } from "react"
import type { DetailTableData, FieldEffectDefinition, FormMode } from "@zform/shared"
import { pluginRegistry } from "@/core/plugin-registry"

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
