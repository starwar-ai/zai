import { strFromU8, unzipSync } from "fflate"
import { describe, expect, it } from "vitest"
import { createXlsx } from "./xlsx.js"

describe("xlsx exporter", () => {
  it("creates an Excel-compatible archive and escapes cell text", () => {
    const output = createXlsx("支付&记录", [["平台", "金额"], ["A&B", "<100"]])

    expect(output.subarray(0, 2).toString()).toBe("PK")
    const files = unzipSync(output)
    expect(Object.keys(files)).toContain("xl/worksheets/sheet1.xml")
    expect(strFromU8(files["xl/workbook.xml"]!)).toContain('name="支付&amp;记录"')
    const worksheet = strFromU8(files["xl/worksheets/sheet1.xml"]!)
    expect(worksheet).toContain("A&amp;B")
    expect(worksheet).toContain("&lt;100")
    expect(worksheet).toContain('autoFilter ref="A1:B2"')
  })
})
