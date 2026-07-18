import { describe, expect, it } from "vitest"
import { evaluateDeclarationNameReview, normalizeDeclarationName } from "./index.js"

describe("报关名称规则", () => {
  it("按 NFKC、空白和大小写归一化", () => {
    expect(normalizeDeclarationName("  ＰＰ   Rope ")).toBe("pp rope")
    expect(normalizeDeclarationName("喷枪；配件")).toBe("喷枪,配件")
  })

  it("高置信普通品类自动通过", () => {
    expect(evaluateDeclarationNameReview({
      name: "塑料工具箱 M",
      nameEng: "plastic tool box",
      generated: { declarationName: "塑料工具箱", customsDeclarationNameEng: "PLASTIC TOOL BOX", confidence: 0.95, reviewRequired: false, reviewReason: "" },
    }).status).toBe("APPROVED")
  })

  it("敏感品类强制复核并合并原因", () => {
    const decision = evaluateDeclarationNameReview({
      name: "20V 2AH电池包",
      nameEng: "battery pack",
      generated: { declarationName: "电池包", customsDeclarationNameEng: "BATTERY", confidence: 0.7, reviewRequired: true, reviewReason: "历史候选冲突" },
    })
    expect(decision.status).toBe("REVIEW_REQUIRED")
    expect(decision.reviewReason).toContain("模型置信度低于")
    expect(decision.reviewReason).toContain("命中强制复核品类关键词")
  })
})
