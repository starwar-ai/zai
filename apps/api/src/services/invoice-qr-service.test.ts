import { describe, expect, it } from "vitest"
import { parseInvoiceQr, qrInvoiceData } from "./invoice-qr-service.js"

describe("invoice QR parser", () => {
  it("parses and normalizes a tax invoice QR payload", () => {
    const result = parseInvoiceQr("01,10,031001900111,12345678,100.00,20260813,12345678901234567890,")
    expect(result).toMatchObject({ invoiceCode: "031001900111", invoiceNumber: "12345678", subtotal: "100.00", invoiceDate: "2026-08-13", checkCode: "12345678901234567890" })
    expect(qrInvoiceData(result!)).toEqual({ invoiceNumber: "12345678", invoiceDate: "2026-08-13", subtotal: "100.00", items: [] })
  })

  it("rejects malformed and impossible payloads", () => {
    expect(parseInvoiceQr("https://example.com/invoice")).toBeNull()
    expect(parseInvoiceQr("01,10,031001900111,12345678,100.00,20260230,1234")).toBeNull()
    expect(parseInvoiceQr("01,10,code,invoice,amount,date,check")).toBeNull()
  })
})
