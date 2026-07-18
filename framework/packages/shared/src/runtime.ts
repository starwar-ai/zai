import type { ConditionExpression, DetailRowData, DetailTableData, DocumentRecord, FieldMappingDefinition, FormulaDefinition, FormMode, ImpactAssessment, ImpactItem, ImpactRuleDefinition, PushDownRuleDefinition } from "./index.js"

export function getPathValue(data: Record<string, unknown>, path: string): unknown {
  const normalized = path.startsWith("master.") ? path.slice(7) : path
  return normalized.split(".").reduce<unknown>((value, key) => value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined, data)
}

export function evaluateCondition(condition: ConditionExpression | undefined, data: Record<string, unknown>): boolean {
  if (!condition) return true
  if ("all" in condition) return condition.all.every((item) => evaluateCondition(item, data))
  if ("any" in condition) return condition.any.some((item) => evaluateCondition(item, data))
  if ("not" in condition) return !evaluateCondition(condition.not, data)
  const actual = getPathValue(data, condition.field)
  const expected = condition.value
  switch (condition.operator) {
    case "eq": return actual === expected
    case "neq": return actual !== expected
    case "gt": return Number(actual) > Number(expected)
    case "gte": return Number(actual) >= Number(expected)
    case "lt": return Number(actual) < Number(expected)
    case "lte": return Number(actual) <= Number(expected)
    case "in": return Array.isArray(expected) && expected.includes(actual)
    case "notIn": return Array.isArray(expected) && !expected.includes(actual)
    case "contains": return Array.isArray(actual) ? actual.includes(expected) : String(actual ?? "").includes(String(expected ?? ""))
    case "empty": return actual === undefined || actual === null || actual === "" || (Array.isArray(actual) && actual.length === 0)
    case "notEmpty": return !(actual === undefined || actual === null || actual === "" || (Array.isArray(actual) && actual.length === 0))
  }
}

export function evaluateFormula(formula: FormulaDefinition, data: Record<string, unknown>): unknown {
  const operands = [...(formula.fields || []).map((field) => getPathValue(data, field)), ...(formula.values || [])]
  const numbers = operands.map(Number).filter(Number.isFinite)
  let result: unknown
  switch (formula.operator) {
    case "sum": result = numbers.reduce((sum, value) => sum + value, 0); break
    case "subtract": result = numbers.length ? numbers.slice(1).reduce((value, item) => value - item, numbers[0]) : formula.fallback; break
    case "multiply": result = numbers.reduce((value, item) => value * item, numbers.length ? 1 : 0); break
    case "divide": result = numbers.length >= 2 && numbers[1] !== 0 ? numbers[0] / numbers[1] : formula.fallback; break
    case "average": result = numbers.length ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length : formula.fallback; break
    case "concat": result = operands.map((value) => value ?? "").join(""); break
    case "template": result = (formula.template || "").replace(/\{([^}]+)\}/g, (_match, field: string) => String(getPathValue(data, field) ?? "")); break
  }
  return typeof result === "number" && formula.precision !== undefined ? Number(result.toFixed(formula.precision)) : result
}

export function isModeReadOnly(readOnly: boolean | undefined, readOnlyModes: FormMode[] | undefined, mode: FormMode): boolean {
  return Boolean(readOnly || readOnlyModes?.includes(mode) || mode === "view")
}

function mappedValue(mapping: FieldMappingDefinition, source: Record<string, unknown>): unknown {
  if (mapping.formula) return evaluateFormula(mapping.formula, source)
  return getPathValue(source, mapping.source) ?? mapping.defaultValue
}

export function applyPushDownRule(source: DocumentRecord, rule: PushDownRuleDefinition, createId: () => string): { masterData: Record<string, unknown>; detailTables: DetailTableData[] } {
  const masterData = Object.fromEntries(rule.masterFields.map((mapping) => [mapping.target, mappedValue(mapping, source.masterData)]).filter(([, value]) => value !== undefined))
  const detailTables = rule.detailTables.map((mapping) => {
    const sourceRows = source.detailTables.find((table) => table.tableId === mapping.sourceTableId)?.rows || []
    const rows: DetailRowData[] = sourceRows.filter((row) => !mapping.rowFilter || evaluateCondition(mapping.rowFilter, row.data)).map((row) => ({
      id: createId(),
      data: Object.fromEntries(mapping.fields.map((field) => [field.target, mappedValue(field, row.data)]).filter(([, value]) => value !== undefined)),
      sourceRef: { documentId: source.id, typeId: source.typeId, code: source.code, tableId: mapping.sourceTableId, rowId: row.id },
    }))
    return { tableId: mapping.targetTableId, rows }
  })
  return { masterData, detailTables }
}

export function assessDocumentImpact(oldDocument: DocumentRecord, nextMasterData: Record<string, unknown>, rules: ImpactRuleDefinition[], downstreamDocuments: DocumentRecord[]): ImpactAssessment {
  const items: ImpactItem[] = []
  for (const rule of rules) {
    const changedFields = rule.watchFields.filter((field) => JSON.stringify(getPathValue(oldDocument.masterData, field)) !== JSON.stringify(getPathValue(nextMasterData, field)))
    if (!changedFields.length) continue
    const affected = downstreamDocuments.filter((document) => !rule.downstreamStatuses || rule.downstreamStatuses.includes(document.status))
    if (!affected.length) continue
    for (const field of changedFields) items.push({
      ruleId: rule.id, level: rule.level, field, message: rule.message.replace("{field}", field), blocksSave: Boolean(rule.blocksSave),
      downstreamDocuments: affected.map((document) => ({ documentId: document.id, typeId: document.typeId, code: document.code })),
    })
  }
  return { canProceed: !items.some((item) => item.blocksSave), items, summary: items.length ? `检测到 ${items.length} 项下游影响` : "未检测到下游影响" }
}
