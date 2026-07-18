import type { DetailTableData } from "@zform/shared"
import { describe, expect, it } from "vitest"
import { getSchema } from "./schemas.js"
import { documentActionInputSchema, documentCreateSchema, documentImpactInputSchema, documentUpdateSchema, pushDownSchema } from "./validators.js"

const quotation = getSchema("quotation")

function validDetailTables(): DetailTableData[] {
  return [{
    tableId: "items",
    rows: [{
      id: "row-a",
      data: {
        productCode: "P-001",
        productName: "产品甲",
        quantity: 10,
        unit: "PCS",
        unitPrice: 12.5,
        currency: "USD",
        deliveryDate: "2026-08-01",
      },
    }],
  }]
}

describe("documentCreateSchema", () => {
  it("允许只用 typeId 创建空草稿", () => {
    expect(documentCreateSchema(quotation).parse({ typeId: "quotation" })).toEqual({ typeId: "quotation" })
  })

  it("拒绝未知根字段、未知主字段和客户端来源引用", () => {
    expect(() => documentCreateSchema(quotation).parse({ typeId: "quotation", admin: true })).toThrow()
    expect(() => documentCreateSchema(quotation).parse({ typeId: "quotation", masterData: { hiddenField: "value" } })).toThrow()
    expect(() => documentCreateSchema(quotation).parse({
      typeId: "quotation",
      detailTables: [{
        tableId: "items",
        rows: [{
          id: "row-a",
          data: { productCode: "P-001" },
          sourceRef: { documentId: "71f0114c-4c21-4bb4-9c68-320b19384b6e", typeId: "quotation", code: "QT-001", tableId: "items", rowId: "source-row" },
        }],
      }],
    })).toThrow()
  })
})

describe("documentUpdateSchema", () => {
  it("按照 Schema 接受合法主数据、复合字段和明细来源结构", () => {
    const detailTables = validDetailTables()
    detailTables[0].rows[0] = {
      ...detailTables[0].rows[0],
      sourceRef: { documentId: "71f0114c-4c21-4bb4-9c68-320b19384b6e", typeId: "quotation", code: "QT-001", tableId: "items", rowId: "source-row" },
    }
    const result = documentUpdateSchema(quotation).parse({
      version: 2,
      masterData: { status: "DRAFT", customerName: "示例客户", currency: "USD", salesPerson: "用户甲", remark: "备注" },
      detailTables,
    })

    expect(result.version).toBe(2)
    expect(result.detailTables?.[0].rows[0].data.unitPrice).toBe(12.5)
  })

  it("拒绝缺少版本、空更新、错误类型和未声明字段", () => {
    expect(() => documentUpdateSchema(quotation).parse({ masterData: {} })).toThrow()
    expect(() => documentUpdateSchema(quotation).parse({ version: 1 })).toThrow()
    expect(() => documentUpdateSchema(quotation).parse({ version: 1, masterData: { customerName: 123 } })).toThrow()
    expect(() => documentUpdateSchema(quotation).parse({ version: 1, detailTables: [{ tableId: "items", rows: [{ id: "row-a", data: { internalPrice: 10 } }] }] })).toThrow()
  })

  it("拒绝重复明细表、重复行和超过 Schema 上限的行数", () => {
    const table = validDetailTables()[0]
    expect(() => documentUpdateSchema(quotation).parse({ version: 1, detailTables: [table, table] })).toThrow()
    expect(() => documentUpdateSchema(quotation).parse({ version: 1, detailTables: [{ ...table, rows: [table.rows[0], table.rows[0]] }] })).toThrow()
    expect(() => documentUpdateSchema(quotation).parse({
      version: 1,
      detailTables: [{ tableId: "items", rows: Array.from({ length: 501 }, (_, index) => ({ id: `row-${index}`, data: {} })) }],
    })).toThrow()
  })
})

describe("其他单据写入 Schema", () => {
  it("限制影响评估字段、流程备注和下推请求", () => {
    expect(() => documentImpactInputSchema(quotation).parse({ masterData: { hiddenField: true } })).toThrow()
    expect(documentActionInputSchema.parse({ comment: "  同意  " })).toEqual({ comment: "同意" })
    expect(() => documentActionInputSchema.parse({ comment: "x".repeat(501) })).toThrow()
    expect(() => documentActionInputSchema.parse({ comment: "同意", force: true })).toThrow()
    expect(() => pushDownSchema.parse({ targetTypeId: "sales_contract", force: true })).toThrow()
  })
})
