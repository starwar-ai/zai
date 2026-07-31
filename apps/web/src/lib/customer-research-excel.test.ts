import { describe, expect, it } from "vitest"
import { mapCustomerWorksheet } from "./customer-research-excel"

describe("customer research Excel mapping", () => {
  it("imports 电子邮件 and 营业地址 columns", () => {
    const result = mapCustomerWorksheet([
      ["公司名称", "电子邮件", "营业地址"],
      ["示例公司", "sales@example.com", "浙江省宁波市示例路 1 号"],
    ], "客户")

    expect(result.mappedHeaders).toMatchObject({ contactEmail: "电子邮件", businessAddress: "营业地址" })
    expect(result.rows[0]).toMatchObject({
      companyName: "示例公司",
      contactEmail: "sales@example.com",
      businessAddress: "浙江省宁波市示例路 1 号",
    })
  })
})
