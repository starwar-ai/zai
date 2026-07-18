import { describe, expect, it } from "vitest"
import { applyPushDownRule, assessDocumentImpact, evaluateCondition, evaluateFormula } from "./runtime.js"
import type { DocumentRecord, PushDownRuleDefinition } from "./index.js"

const source: DocumentRecord = {
  id: "source-1", typeId: "source", code: "SRC-001", status: "APPROVED",
  masterData: { customer: "示例客户", amount: 12.345, enabled: true },
  detailTables: [{ tableId: "items", rows: [{ id: "row-1", data: { sku: "A-01", quantity: 3, selected: true } }, { id: "row-2", data: { sku: "A-02", quantity: 1, selected: false } }] }],
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", createdBy: "tester", version: 1,
}

describe("声明式运行时", () => {
  it("支持嵌套条件", () => {
    expect(evaluateCondition({ all: [{ field: "enabled", operator: "eq", value: true }, { field: "amount", operator: "gt", value: 10 }] }, source.masterData)).toBe(true)
  })

  it("支持公式和模板", () => {
    expect(evaluateFormula({ operator: "multiply", fields: ["amount"], values: [2], precision: 2 }, source.masterData)).toBe(24.69)
    expect(evaluateFormula({ operator: "template", template: "{customer}-{amount}" }, source.masterData)).toBe("示例客户-12.345")
  })

  it("按映射下推并保留行级来源", () => {
    const rule: PushDownRuleDefinition = {
      id: "demo", label: "生成目标", targetTypeId: "target", masterFields: [{ source: "customer", target: "buyer" }],
      detailTables: [{ sourceTableId: "items", targetTableId: "lines", rowFilter: { field: "selected", operator: "eq", value: true }, fields: [{ source: "sku", target: "code" }, { source: "quantity", target: "count" }] }],
    }
    const mapped = applyPushDownRule(source, rule, () => "new-row")
    expect(mapped.masterData).toEqual({ buyer: "示例客户" })
    expect(mapped.detailTables[0].rows).toHaveLength(1)
    expect(mapped.detailTables[0].rows[0].sourceRef?.rowId).toBe("row-1")
  })

  it("评估下游变更影响", () => {
    const downstream = { ...source, id: "downstream-1", typeId: "target", code: "TGT-001", status: "IN_PROGRESS" as const }
    const assessment = assessDocumentImpact(source, { ...source.masterData, customer: "新客户" }, [{ id: "customer-change", watchFields: ["customer"], level: "critical", message: "{field} 已变化", blocksSave: true }], [downstream])
    expect(assessment.canProceed).toBe(false)
    expect(assessment.items[0].downstreamDocuments[0].code).toBe("TGT-001")
  })
})
