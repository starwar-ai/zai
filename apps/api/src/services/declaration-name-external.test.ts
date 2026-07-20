import { beforeEach, describe, expect, it, vi } from "vitest"

const { database, generate } = vi.hoisted(() => ({
  database: {
    declarationNameMapping: { findUnique: vi.fn() },
    declarationNameAuditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
  generate: vi.fn(),
}))

vi.mock("../database.js", () => ({ prisma: database }))
vi.mock("./declaration-name-generator.js", () => ({ generateDeclarationName: generate, sanitizeProviderError: (message: string) => message }))

import { convertExternalDeclarationName } from "./declaration-name-service.js"

describe("外部报关品名转换", () => {
  beforeEach(() => vi.clearAllMocks())

  it("优先返回已审核缓存，不重复调用模型", async () => {
    database.declarationNameMapping.findUnique.mockResolvedValue({
      id: "mapping-1", normalizedName: "塑料工具箱", normalizedNameEng: "plastic tool box",
      rawName: "塑料工具箱", rawNameEng: "Plastic Tool Box", declarationName: "塑料工具箱",
      customsDeclarationNameEng: "PLASTIC TOOL BOX", confidence: 0.96, reviewRequired: false,
      reviewReason: "", status: "APPROVED", modelVersion: "openai:model", updatedAt: new Date(),
    })

    const result = await convertExternalDeclarationName({ name: "塑料工具箱", nameEng: "Plastic Tool Box" }, "external:test")

    expect(result).toMatchObject({ qualified: true, source: "CACHE", customsDeclarationNameEng: "PLASTIC TOOL BOX" })
    expect(generate).not.toHaveBeenCalled()
  })

  it("模型结果仍经过敏感品类强制复核并写审计", async () => {
    database.declarationNameMapping.findUnique.mockResolvedValue(null)
    generate.mockResolvedValue({
      declarationName: "锂电池", customsDeclarationNameEng: "LITHIUM BATTERY", confidence: 0.98,
      reviewRequired: false, reviewReason: "", provider: "openai", model: "test-model",
    })
    const client = {
      declarationNameMapping: { upsert: vi.fn().mockResolvedValue({ id: "mapping-2" }) },
      declarationNameAuditLog: { create: vi.fn().mockResolvedValue({}) },
    }
    database.$transaction.mockImplementation(async (callback: (value: typeof client) => Promise<void>) => callback(client))

    const result = await convertExternalDeclarationName({ name: "18V 锂电池", nameEng: "18V lithium battery", clientRequestId: "REQ-1" }, "external:test")

    expect(result).toMatchObject({ qualified: false, reviewRequired: true, source: "MODEL" })
    expect(result.reviewReason).toContain("命中强制复核品类关键词")
    expect(client.declarationNameAuditLog.create).toHaveBeenCalledOnce()
  })
})
