import { DataScope, type PrismaClient } from "@prisma/client"
import { describe, expect, it, vi } from "vitest"
import { getSchema } from "../documents/schemas.js"
import { buildPostgresListQueries, PostgresDocumentListQueryAdapter } from "./postgres-list-query-adapter.js"
import { queryDocumentsWithAdapter } from "./list-query-service.js"
import type { DocumentListQueryAdapter } from "./list-query-adapter.js"

const allPermission = { scope: DataScope.ALL, userIds: ["user-a"], departmentIds: [], extraDepartmentIds: [] }

describe("buildPostgresListQueries", () => {
  it("在明细模式下把递归过滤、排序、聚合和分页下推到参数化 SQL", () => {
    const queries = buildPostgresListQueries(getSchema("quotation"), {
      typeId: "quotation",
      mode: "detail",
      search: "客户%_\\测试",
      filters: {
        logic: "and",
        conditions: [
          { columnId: "subject", operator: "contains", value: "Acme' OR TRUE --" },
          { logic: "or", conditions: [
            { columnId: "quantity", operator: "gte", value: 10 },
            { columnId: "productCode", operator: "in", value: ["A-1", "B-2"] },
          ] },
        ],
      },
      sorting: [{ columnId: "quantity", direction: "desc" }],
      aggregateIds: ["row-count", "quantity-sum"],
      page: 3,
      pageSize: 20,
    }, allPermission)

    expect(queries.pageQuery.sql).toContain("jsonb_array_elements")
    expect(queries.pageQuery.sql).toContain("ORDER BY")
    expect(queries.pageQuery.sql).toContain("LIMIT")
    expect(queries.summaryQuery.sql).toContain("COUNT(*)")
    expect(queries.summaryQuery.sql).toContain("SUM")
    expect(queries.pageQuery.sql).not.toContain("Acme' OR TRUE --")
    expect(queries.pageQuery.values).toEqual(expect.arrayContaining(["quotation", "items", "%Acme' OR TRUE --%", 10, "A-1", "B-2", 20, 40]))
    expect(queries.pageQuery.values).toContain("%客户\\%\\_\\\\测试%")
  })

  it("把个人范围和附加部门作为数据库谓词", () => {
    const queries = buildPostgresListQueries(getSchema("sales_contract"), {
      typeId: "sales_contract",
      mode: "document",
    }, {
      scope: DataScope.PERSONAL,
      userIds: ["user-a", "user-b"],
      departmentIds: ["department-a"],
      extraDepartmentIds: ["department-extra"],
    })

    expect(queries.pageQuery.sql).toContain("created_by_id IN")
    expect(queries.pageQuery.sql).toContain("department_id IN")
    expect(queries.pageQuery.values).toEqual(expect.arrayContaining(["user-a", "user-b", "department-extra"]))
  })
})

describe("PostgresDocumentListQueryAdapter", () => {
  it("将数据库页结果与聚合结果映射回既有查询协议", async () => {
    const queryRaw = vi.fn()
      .mockResolvedValueOnce([{
        id: "document-a",
        typeId: "quotation",
        code: "QT-001",
        status: "DRAFT",
        masterData: { customerName: "示例客户" },
        sourceDocumentId: null,
        sourceTypeId: null,
        sourceCode: null,
        createdBy: "用户甲",
        createdAt: new Date("2026-07-18T01:00:00.000Z"),
        updatedAt: new Date("2026-07-18T02:00:00.000Z"),
        version: 1,
        detailRow: { id: "row-a", data: { productCode: "A-1", productName: "产品甲", quantity: 12 } },
      }])
      .mockResolvedValueOnce([{ total: 21n, aggregates: { "row-count": 21, "quantity-sum": 120 } }])
    const transaction = {
      dataPermissionPolicy: { findUnique: vi.fn().mockResolvedValue({ scope: DataScope.ALL, extraUserIds: [], extraDepartmentIds: [] }) },
      $queryRaw: queryRaw,
    }
    const client = {
      $transaction: vi.fn(async (operation: (value: typeof transaction) => unknown) => operation(transaction)),
    } as unknown as PrismaClient
    const adapter = new PostgresDocumentListQueryAdapter(client)

    const result = await adapter.query(getSchema("quotation"), {
      typeId: "quotation",
      mode: "detail",
      page: 2,
      pageSize: 20,
    }, { userId: "user-a" })

    expect(result).toMatchObject({ total: 21, page: 2, pageSize: 20, pageCount: 2 })
    expect(result.items[0]).toMatchObject({
      key: "document-a:row-a",
      documentId: "document-a",
      rowId: "row-a",
      values: { code: "QT-001", subject: "示例客户", productCode: "A-1", quantity: 12 },
    })
    expect(result.aggregates).toEqual(expect.arrayContaining([
      { id: "row-count", label: "记录数", function: "count", value: 21 },
      { id: "quantity-sum", label: "数量合计", function: "sum", value: 120 },
    ]))
    expect(queryRaw).toHaveBeenCalledTimes(2)
  })
})

describe("DocumentListQueryAdapter", () => {
  it("允许在不改变共享查询协议的情况下替换执行适配器", async () => {
    const expected = { items: [], total: 0, page: 1, pageSize: 20, pageCount: 1, aggregates: [] }
    const adapter = {
      supports: vi.fn().mockReturnValue(true),
      query: vi.fn().mockResolvedValue(expected),
    } satisfies DocumentListQueryAdapter

    const result = await queryDocumentsWithAdapter({ typeId: "quotation" }, { userId: "user-a" }, adapter)

    expect(result).toBe(expected)
    expect(adapter.supports).toHaveBeenCalledOnce()
    expect(adapter.query).toHaveBeenCalledOnce()
  })
})
