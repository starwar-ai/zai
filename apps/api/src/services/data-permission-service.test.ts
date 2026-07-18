import { DataScope } from "@prisma/client"
import { describe, expect, it } from "vitest"
import { permissionWhereForPolicy, visibleDocumentsWhereForPolicies } from "./data-permission-service.js"

describe("permissionWhereForPolicy", () => {
  it("没有策略时默认只允许本人单据", () => {
    expect(permissionWhereForPolicy(null, { userId: "user-a" })).toEqual({
      OR: [{ createdById: { in: ["user-a"] } }],
    })
  })

  it("部门范围同时包含本部门、附加部门和附加用户", () => {
    expect(permissionWhereForPolicy({
      typeId: "sales_contract",
      scope: DataScope.DEPARTMENT,
      extraDepartmentIds: ["department-b"],
      extraUserIds: ["user-b"],
    }, { userId: "user-a", departmentId: "department-a" })).toEqual({
      OR: [
        { departmentId: { in: ["department-a", "department-b"] } },
        { createdById: { in: ["user-a", "user-b"] } },
      ],
    })
  })
})

describe("visibleDocumentsWhereForPolicies", () => {
  it("按单据类型应用精确策略、通配策略和默认个人范围", () => {
    const where = visibleDocumentsWhereForPolicies([
      "quotation",
      "sales_contract",
      "purchase_plan",
    ], { userId: "user-a" }, [{
      typeId: "quotation",
      scope: DataScope.PERSONAL,
      extraDepartmentIds: [],
      extraUserIds: ["user-b"],
    }], {
      typeId: "*",
      scope: DataScope.ALL,
      extraDepartmentIds: [],
      extraUserIds: [],
    })

    expect(where).toEqual({
      OR: [
        { typeId: "quotation", OR: [{ createdById: { in: ["user-a", "user-b"] } }] },
        { typeId: "sales_contract" },
        { typeId: "purchase_plan" },
      ],
    })
  })

  it("无通配策略时每种单据都保持默认个人范围", () => {
    expect(visibleDocumentsWhereForPolicies(["quotation", "sales_contract"], { userId: "user-a" }, [])).toEqual({
      OR: [
        { typeId: "quotation", OR: [{ createdById: { in: ["user-a"] } }] },
        { typeId: "sales_contract", OR: [{ createdById: { in: ["user-a"] } }] },
      ],
    })
  })
})
