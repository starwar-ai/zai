import { beforeEach, describe, expect, it, vi } from "vitest"

const database = vi.hoisted(() => ({
  dataPermissionPolicy: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
  document: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    groupBy: vi.fn(),
    delete: vi.fn(),
    updateMany: vi.fn(),
  },
  activityRecord: {
    findMany: vi.fn(),
    create: vi.fn(),
  },
  $transaction: vi.fn(),
}))

vi.mock("../database.js", () => ({ prisma: database }))

import { assessImpact, executeAction, findDocument, getDashboard, getTrace, listActivities, pushDown, removeDocument, updateDocument } from "./document-service.js"

const user = { userId: "user-a", departmentId: "department-a" }
const headers = { "x-user-id": "user-a", "x-user-department-id": "department-a" }

describe("单据对象级授权", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    database.dataPermissionPolicy.findMany.mockResolvedValue([])
    database.document.findFirst.mockResolvedValue(null)
    database.$transaction.mockImplementation(async (operation: (client: typeof database) => unknown) => operation(database))
  })

  it("详情查询使用所有已注册类型的数据范围，并对无权对象返回 404", async () => {
    await expect(findDocument("document-b", user)).rejects.toMatchObject({ statusCode: 404 })

    expect(database.document.findFirst).toHaveBeenCalledWith({
      where: {
        id: "document-b",
        OR: expect.arrayContaining([
          { typeId: "quotation", OR: [{ createdById: { in: ["user-a"] } }] },
          { typeId: "sales_contract", OR: [{ createdById: { in: ["user-a"] } }] },
          { typeId: "purchase_plan", OR: [{ createdById: { in: ["user-a"] } }] },
          { typeId: "warehouse_inbound", OR: [{ createdById: { in: ["user-a"] } }] },
        ]),
      },
    })
  })

  it.each([
    ["指定单据活动", () => listActivities(user, "document-b")],
    ["影响评估", () => assessImpact("document-b", {}, user)],
    ["追溯", () => getTrace("document-b", user)],
    ["修改", () => updateDocument("document-b", {}, headers, user)],
    ["删除", () => removeDocument("document-b", user)],
    ["流程", () => executeAction("document-b", "submit", headers, user)],
    ["下推", () => pushDown("document-b", "sales_contract", headers, user)],
  ])("%s 在无对象权限时停止处理", async (_label, operation) => {
    await expect(operation()).rejects.toMatchObject({ statusCode: 404 })
    expect(database.document.delete).not.toHaveBeenCalled()
    expect(database.document.updateMany).not.toHaveBeenCalled()
    expect(database.activityRecord.create).not.toHaveBeenCalled()
  })

  it("全局活动记录只查询可见单据的关联记录", async () => {
    database.activityRecord.findMany.mockResolvedValue([])

    await listActivities(user)

    expect(database.activityRecord.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { document: { is: { OR: expect.any(Array) } } },
    }))
  })

  it("工作台的指标、分组、最近单据和活动都应用可见范围", async () => {
    database.document.count.mockResolvedValue(0)
    database.document.groupBy.mockResolvedValue([])
    database.document.findMany.mockResolvedValue([])
    database.activityRecord.findMany.mockResolvedValue([])

    await getDashboard(user)

    expect(database.document.count).toHaveBeenNthCalledWith(1, { where: { OR: expect.any(Array) } })
    expect(database.document.groupBy).toHaveBeenCalledTimes(2)
    expect(database.document.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: { OR: expect.any(Array) } }))
    expect(database.document.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { OR: expect.any(Array) } }))
    expect(database.activityRecord.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { document: { is: { OR: expect.any(Array) } } },
    }))
  })
})
