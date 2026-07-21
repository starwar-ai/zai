import { beforeEach, describe, expect, it, vi } from "vitest"

const database = vi.hoisted(() => ({
  department: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), create: vi.fn(), delete: vi.fn(), count: vi.fn() },
  appUser: { count: vi.fn() },
  $transaction: vi.fn(),
}))

vi.mock("../database.js", () => ({ prisma: database }))

import { removeDepartment, updateDepartment } from "./system-management-service.js"

describe("部门管理领域规则", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    database.$transaction.mockImplementation(async (operation: (client: typeof database) => unknown) => operation(database))
  })

  it("禁止把部门移动到自己的下级", async () => {
    database.department.findMany.mockResolvedValue([
      { id: "parent", parentId: null },
      { id: "child", parentId: "parent" },
    ])
    await expect(updateDepartment("parent", { code: "PARENT", name: "上级", parentId: "child", order: 0 })).rejects.toThrow("不能将部门移动到自己的下级部门")
    expect(database.department.update).not.toHaveBeenCalled()
  })

  it("存在下级部门时拒绝删除", async () => {
    database.department.findUnique.mockResolvedValue({ id: "parent" })
    database.department.count.mockResolvedValue(1)
    database.appUser.count.mockResolvedValue(0)
    await expect(removeDepartment("parent")).rejects.toThrow("存在下级部门")
    expect(database.department.delete).not.toHaveBeenCalled()
  })

  it("存在关联用户时拒绝删除", async () => {
    database.department.findUnique.mockResolvedValue({ id: "department" })
    database.department.count.mockResolvedValue(0)
    database.appUser.count.mockResolvedValue(2)
    await expect(removeDepartment("department")).rejects.toThrow("仍有关联用户")
    expect(database.department.delete).not.toHaveBeenCalled()
  })
})
