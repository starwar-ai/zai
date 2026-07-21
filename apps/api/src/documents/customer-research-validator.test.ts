import { describe, expect, it } from "vitest"
import { customerResearchImportSchema, customerResearchResultSchema } from "./customer-research-validator.js"

describe("customer research validation", () => {
  it("normalizes a valid imported customer", () => {
    const parsed = customerResearchImportSchema.parse({ fileName: " customers.xlsx ", rows: [{ companyName: " Example Ltd ", country: " UK " }] })
    expect(parsed).toMatchObject({ fileName: "customers.xlsx", rows: [{ companyName: "Example Ltd", country: "UK" }] })
  })

  it("rejects an empty customer name and oversized batches", () => {
    expect(() => customerResearchImportSchema.parse({ fileName: "a.xlsx", rows: [{ companyName: "" }] })).toThrow()
    expect(() => customerResearchImportSchema.parse({ fileName: "a.xlsx", rows: Array.from({ length: 1001 }, () => ({ companyName: "A" })) })).toThrow()
  })

  it("rejects invalid research decisions and confidence", () => {
    const base = {
      companySummary: "简介", businessScope: "业务", scaleEstimate: "规模", annualSalesEstimateUsd: null, employeeEstimate: null,
      isVerifiedCompany: "yes", verifiedCompanyReason: "依据", verifiedCompanyConfidence: 90,
      isGardenOutdoor: "uncertain", gardenOutdoorReason: "依据", gardenOutdoorConfidence: 70,
      salesOverOneMillion: "uncertain", salesReason: "依据", salesConfidence: 60,
      employeesOverTen: "no", employeesReason: "依据", employeesConfidence: 80,
      overallConfidence: 75, sources: [], researchNotes: "备注",
    }
    expect(customerResearchResultSchema.parse(base).overallConfidence).toBe(75)
    expect(() => customerResearchResultSchema.parse({ ...base, overallConfidence: 101 })).toThrow()
    expect(() => customerResearchResultSchema.parse({ ...base, isVerifiedCompany: "maybe" })).toThrow()
  })
})
