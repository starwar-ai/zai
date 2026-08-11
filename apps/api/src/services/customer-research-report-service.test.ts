import { describe, expect, it } from "vitest"
import type { DocumentRecord } from "@zform/shared"
import { renderCustomerResearchReport } from "./customer-research-report-service.js"

const completedDocument: DocumentRecord = {
  id: "document-1", typeId: "customer_due_diligence", code: "CDD-202608-0001", status: "COMPLETED", createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-02T00:00:00.000Z", createdBy: "测试用户", version: 2,
  masterData: {
    companyName: "测试园林用品有限公司", country: "中国", website: "https://example.com", contactName: "张三", contactEmail: "contact@example.com", businessAddress: "浙江省杭州市",
    companySummary: "该公司公开登记信息有效，主营园林及户外用品。", businessScope: "园林工具、户外家具的生产与出口。", scaleEstimate: "中小型企业。",
    annualSalesEstimateUsd: 1800000, employeeEstimate: 35, overallConfidence: 86, completedAt: "2026-08-02 14:30:00", researchNotes: "建议核验最新审计报表。",
    isVerifiedCompany: "yes", verifiedCompanyReason: "企业登记与官方网站信息相互印证。", verifiedCompanyConfidence: 93,
    isGardenOutdoor: "yes", gardenOutdoorReason: "产品目录包含园林工具与户外家具。", gardenOutdoorConfidence: 91,
    salesOverOneMillion: "uncertain", salesReason: "公开渠道未披露经审计销售额。", salesConfidence: 58,
    employeesOverTen: "yes", employeesReason: "公开招聘及企业规模信息显示员工超过十人。", employeesConfidence: 75,
  },
  detailTables: [{ tableId: "sources", rows: [{ id: "source-1", data: { title: "企业官方网站", claim: "展示公司简介及主营产品。", url: "https://example.com/about" } }] }],
}

describe("客户背景调查 PDF 报告", () => {
  it("生成包含中文 CID 字体与页尾的有效 PDF 数据", () => {
    const pdf = renderCustomerResearchReport(completedDocument, new Date("2026-08-03T08:00:00.000Z"))
    const text = pdf.toString("ascii")
    expect(text.startsWith("%PDF-1.7")).toBe(true)
    expect(text).toContain("/STSong-Light")
    expect(text).toContain("/UniGB-UCS2-H")
    expect(text).toContain("/BaseFont /Arial")
    expect(text).toContain("xref")
    expect(text.endsWith("%%EOF\n")).toBe(true)
  })

  it("拒绝导出未完成的调查", () => {
    expect(() => renderCustomerResearchReport({ ...completedDocument, status: "DRAFT" })).toThrow("调查完成后才能导出")
  })
})
