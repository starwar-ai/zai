import { describe, expect, it } from "vitest"
import { openApiDocument } from "./openapi.js"

function collectRefs(value: unknown, refs: string[]): void {
  if (!value || typeof value !== "object") return
  if ("$ref" in value && typeof (value as { $ref?: unknown }).$ref === "string") refs.push((value as { $ref: string }).$ref)
  for (const child of Object.values(value)) collectRefs(child, refs)
}

describe("OpenAPI document", () => {
  it("contains documented external recognition endpoints and resolvable references", () => {
    expect(openApiDocument.paths).toHaveProperty("/api/external/payments/recognize")
    expect(openApiDocument.paths).toHaveProperty("/api/external/payments/recognize/batch")
    expect(openApiDocument.paths).toHaveProperty("/api/external/invoices/recognize")
    expect(openApiDocument.paths).toHaveProperty("/api/external/invoices/recognize/batch")
    expect(openApiDocument.paths).toHaveProperty("/api/external/train-tickets/recognize")
    expect(openApiDocument.paths).toHaveProperty("/api/external/train-tickets/recognize/batch")
    expect(openApiDocument.paths).toHaveProperty("/api/external/navigation-routes/recognize")
    expect(openApiDocument.paths).toHaveProperty("/api/external/navigation-routes/recognize/batch")
    expect(openApiDocument.paths).toHaveProperty("/api/external/image-search/search")
    expect(openApiDocument.paths).toHaveProperty("/api/external/image-search/assets/{id}/image")
    const refs: string[] = []; collectRefs(openApiDocument, refs)
    for (const ref of refs) {
      expect(ref.startsWith("#/components/")).toBe(true)
      const segments = ref.slice(2).split("/")
      let target: unknown = openApiDocument
      for (const segment of segments) target = target && typeof target === "object" ? (target as Record<string, unknown>)[segment] : undefined
      expect(target, `OpenAPI 引用不存在：${ref}`).toBeDefined()
    }
  })
})
