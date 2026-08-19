import { afterEach, describe, expect, it, vi } from "vitest"
import { assertCompleteInvoice, recognizeInvoice } from "./ocr-provider.js"

const environmentNames = ["OPENAI_API_KEY", "OPENAI_MODEL", "OPENAI_BASE_URL", "ARK_API_KEY", "ARK_MODEL", "ARK_BASE_URL", "LLM_PROVIDER_ORDER", "OCR_PROVIDER", "OCR_MODEL"] as const
const original = Object.fromEntries(environmentNames.map((name) => [name, process.env[name]])) as Record<(typeof environmentNames)[number], string | undefined>
afterEach(() => { for (const name of environmentNames) { const value = original[name]; if (value === undefined) delete process.env[name]; else process.env[name] = value }; vi.unstubAllGlobals() })

describe("electronic invoice OCR provider", () => {
  it("extracts invoice headers and line items with structured output", async () => {
    process.env.LLM_PROVIDER_ORDER = "openai"; process.env.OPENAI_API_KEY = "test-key"; process.env.OPENAI_MODEL = "ocr-model"; process.env.OPENAI_BASE_URL = "https://llm.example.test/v1/"
    const output = { invoiceType: "VAT_SPECIAL", invoiceNumber: "25800001", invoiceDate: "2026年8月13日", buyerName: "购买方公司", buyerTaxId: "BUYER001", sellerName: "销售方公司", sellerTaxId: "SELLER001", subtotal: "¥100.00", totalTax: "¥13.00", totalAmount: "¥113.00", totalAmountInWords: "壹佰壹拾叁元整", remarks: null, drawer: "张三", items: [{ itemName: "技术服务", specification: null, unit: "项", quantity: "1", unitPrice: "100.00", amount: "100.00", taxRate: "13%", taxAmount: "13.00" }] }
    const fetchMock = vi.fn(async (_url: string, _request: RequestInit) => ({ ok: true, status: 200, json: async () => ({ output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(output) }] }] }) }))
    vi.stubGlobal("fetch", fetchMock)
    const result = await recognizeInvoice({ recognitionType: "INVOICE", filename: "invoice.png", mimeType: "image/png", base64Data: "aW1hZ2U=" })
    expect(result).toMatchObject({ model: "ocr-model", data: { invoiceType: "VAT_SPECIAL", invoiceNumber: "25800001", totalAmount: "¥113.00", items: [{ itemName: "技术服务", taxRate: "13%" }] } })
    expect(result.data).not.toHaveProperty("remarks")
    const [url, request] = fetchMock.mock.calls[0]!
    expect(url).toBe("https://llm.example.test/v1/responses")
    const body = JSON.parse(String(request.body)) as { input: Array<{ content: Array<{ type: string; image_url?: string }> }> }
    expect(body.input[1]?.content[1]?.image_url).toBe("data:image/png;base64,aW1hZ2U=")
  })

  it("accepts omitted nullable fields and common wrapped aliases", async () => {
    process.env.LLM_PROVIDER_ORDER = "openai"; process.env.OPENAI_API_KEY = "test-key"
    const output = { result: { invoice_type: "增值税专用发票", invoice_number: "25800002", buyer_name: "购买方", seller_name: "销售方", invoice_items: [{ item_name: "技术服务", tax_rate: "6%" }] } }
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ output: [{ content: [{ type: "output_text", text: JSON.stringify(output) }] }] }) })))

    const result = await recognizeInvoice({ recognitionType: "INVOICE", filename: "invoice.png", mimeType: "image/png", base64Data: "aW1hZ2U=" })

    expect(result.data).toMatchObject({ invoiceType: "VAT_SPECIAL", invoiceNumber: "25800002", buyerName: "购买方", sellerName: "销售方", items: [{ itemName: "技术服务", taxRate: "6%" }] })
    expect(result.data).not.toHaveProperty("invoiceDate")
  })

  it("recognizes a toll invoice with its specialized fields", async () => {
    process.env.LLM_PROVIDER_ORDER = "openai"; process.env.OPENAI_API_KEY = "test-key"
    const output = { 类型: "通行费电子发票", 车牌: "浙BF8F89（客车）", 通行费: "¥41.06", 税额: "¥1.23", 价税合计: "¥42.29", 通行日期: "2026-07-30", 销售方: "上海路桥发展有限公司" }
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ output: [{ content: [{ type: "output_text", text: JSON.stringify(output) }] }] }) })))

    const result = await recognizeInvoice({ recognitionType: "INVOICE", filename: "toll.png", mimeType: "image/png", base64Data: "aW1hZ2U=" })

    expect(result.data).toMatchObject({ invoiceType: "VAT_NORMAL", invoiceCategory: "TOLL", vehiclePlate: "浙BF8F89", vehicleType: "客车", tollAmount: "¥41.06", totalTax: "¥1.23", totalAmount: "¥42.29", tollDate: "2026-07-30", sellerName: "上海路桥发展有限公司", items: [] })
  })

  it("uses toll fields over an incorrect standard category and does not require parties", async () => {
    process.env.LLM_PROVIDER_ORDER = "openai"; process.env.OPENAI_API_KEY = "test-key"
    const output = { invoiceCategory: "STANDARD", vehiclePlate: "浙BF8F89", tollAmount: "41.06", tollDate: "2026-07-30" }
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ output: [{ content: [{ type: "output_text", text: JSON.stringify(output) }] }] }) })))

    const result = await recognizeInvoice({ recognitionType: "INVOICE", filename: "toll.png", mimeType: "image/png", base64Data: "aW1hZ2U=" })

    expect(result.data).toMatchObject({ invoiceType: "VAT_NORMAL", invoiceCategory: "TOLL", vehiclePlate: "浙BF8F89", tollAmount: "41.06", tollDate: "2026-07-30", items: [] })
  })

  it("reports an incomplete result instead of exposing schema validation details", async () => {
    process.env.LLM_PROVIDER_ORDER = "openai"; process.env.OPENAI_API_KEY = "test-key"
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ output: [{ content: [{ type: "output_text", text: "{}" }] }] }) })))

    await expect(recognizeInvoice({ recognitionType: "INVOICE", filename: "invoice.png", mimeType: "image/png", base64Data: "aW1hZ2U=" })).rejects.toThrow("发票识别不完整，缺少：购买方名称、销售方名称、商品明细")
  })

  it("retries a transient provider network failure once", async () => {
    process.env.LLM_PROVIDER_ORDER = "openai"; process.env.OPENAI_API_KEY = "test-key"
    const output = { invoiceType: "VAT_NORMAL", invoiceNumber: "25800001", invoiceDate: "2026-08-13", buyerName: "购买方", buyerTaxId: null, sellerName: "销售方", sellerTaxId: null, subtotal: "1.00", totalTax: "0.06", totalAmount: "1.06", totalAmountInWords: null, remarks: null, drawer: null, items: [{ itemName: "服务", specification: null, unit: null, quantity: "1", unitPrice: "1", amount: "1", taxRate: "6%", taxAmount: "0.06" }] }
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ output: [{ content: [{ type: "output_text", text: JSON.stringify(output) }] }] }) })
    vi.stubGlobal("fetch", fetchMock)

    const result = await recognizeInvoice({ recognitionType: "INVOICE", filename: "invoice.png", mimeType: "image/png", base64Data: "aW1hZ2U=" })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.data).toMatchObject({ buyerName: "购买方", sellerName: "销售方" })
  })

  it("reports structured provider error details", async () => {
    process.env.LLM_PROVIDER_ORDER = "openai"; process.env.OPENAI_API_KEY = "test-key"; process.env.OPENAI_MODEL = "ocr-model"
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: "图片格式不受支持", type: "invalid_request_error", code: "invalid_image", param: "input[1]" } }), { status: 400, statusText: "Bad Request", headers: { "x-request-id": "req-ocr-123" } })))

    await expect(recognizeInvoice({ recognitionType: "INVOICE", filename: "invoice.png", mimeType: "image/png", base64Data: "aW1hZ2U=" })).rejects.toThrow("openai 发票识别失败（模型：ocr-model，HTTP 400 Bad Request）：图片格式不受支持；类型：invalid_request_error；代码：invalid_image；参数：input[1]；请求 ID：req-ocr-123")
  })

  it("uses extracted PDF text instead of uploading the original PDF", async () => {
    process.env.LLM_PROVIDER_ORDER = "openai"; process.env.OPENAI_API_KEY = "test-key"
    const empty = { invoiceType: "VAT_NORMAL", invoiceNumber: null, invoiceDate: null, buyerName: null, buyerTaxId: null, sellerName: null, sellerTaxId: null, subtotal: null, totalTax: null, totalAmount: null, totalAmountInWords: null, remarks: null, drawer: null, items: [] }
    const fetchMock = vi.fn(async (_url: string, _request: RequestInit) => ({ ok: true, status: 200, json: async () => ({ output: [{ content: [{ type: "output_text", text: JSON.stringify(empty) }] }] }) }))
    vi.stubGlobal("fetch", fetchMock)
    await expect(recognizeInvoice({ recognitionType: "INVOICE", filename: "发票.pdf", mimeType: "application/pdf", base64Data: "cGRm" }, { pdfText: "购买方：测试公司 销售方：开票公司 商品明细：技术服务", qrText: "01,10,031001900111,12345678,100.00,20260813,1234" })).rejects.toThrow("发票识别不完整")
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1].body)) as { input: Array<{ content: Array<{ type: string; text?: string; filename?: string; file_data?: string }> }> }
    expect(body.input[1]?.content).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "input_text", text: expect.stringContaining("二维码原文") }),
      expect.objectContaining({ type: "input_text", text: expect.stringContaining("购买方：测试公司") }),
    ]))
    expect(body.input[1]?.content.some((item) => item.type === "input_file")).toBe(false)
  })

  it("falls back to the PDF file when no text layer is available", async () => {
    process.env.LLM_PROVIDER_ORDER = "openai"; process.env.OPENAI_API_KEY = "test-key"
    const empty = { invoiceType: "VAT_NORMAL", invoiceNumber: null, invoiceDate: null, buyerName: null, buyerTaxId: null, sellerName: null, sellerTaxId: null, subtotal: null, totalTax: null, totalAmount: null, totalAmountInWords: null, remarks: null, drawer: null, items: [] }
    const fetchMock = vi.fn(async (_url: string, _request: RequestInit) => ({ ok: true, status: 200, json: async () => ({ output: [{ content: [{ type: "output_text", text: JSON.stringify(empty) }] }] }) }))
    vi.stubGlobal("fetch", fetchMock)
    await expect(recognizeInvoice({ recognitionType: "INVOICE", filename: "扫描发票.pdf", mimeType: "application/pdf", base64Data: "cGRm" })).rejects.toThrow("发票识别不完整")
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1].body)) as { input: Array<{ content: Array<{ type: string; filename?: string; file_data?: string }> }> }
    expect(body.input[1]?.content[1]).toMatchObject({ type: "input_file", filename: "扫描发票.pdf", file_data: "data:application/pdf;base64,cGRm" })
  })

  it("uses Ark from the shared provider order", async () => {
    process.env.LLM_PROVIDER_ORDER = "ark,openai"; process.env.ARK_API_KEY = "ark-key"; process.env.ARK_MODEL = "doubao-vision"; process.env.ARK_BASE_URL = "https://ark.example.test/api/v3"; delete process.env.OPENAI_API_KEY
    const output = { invoiceType: "VAT_NORMAL", invoiceNumber: "25800001", invoiceDate: "2026-08-13", buyerName: "购买方公司", buyerTaxId: null, sellerName: "销售方公司", sellerTaxId: null, subtotal: "100.00", totalTax: "6.00", totalAmount: "106.00", totalAmountInWords: null, remarks: "测试备注", drawer: null, items: [{ itemName: "技术服务", specification: null, unit: null, quantity: "1", unitPrice: "100.00", amount: "100.00", taxRate: "6%", taxAmount: "6.00" }] }
    const fetchMock = vi.fn(async (_url: string, _request: RequestInit) => ({ ok: true, status: 200, text: async () => "", json: async () => ({ choices: [{ message: { content: JSON.stringify(output) } }] }) }))
    vi.stubGlobal("fetch", fetchMock)
    const result = await recognizeInvoice({ recognitionType: "INVOICE", filename: "invoice.png", mimeType: "image/png", base64Data: "aW1hZ2U=" })
    expect(result).toMatchObject({ model: "doubao-vision", raw: { provider: "ark" }, data: { buyerName: "购买方公司", remarks: "测试备注" } })
    const [url, request] = fetchMock.mock.calls[0]!
    expect(url).toBe("https://ark.example.test/api/v3/chat/completions")
    const body = JSON.parse(String(request.body)) as { messages: Array<{ content: unknown }>; response_format: { type: string } }
    expect(body.response_format.type).toBe("json_schema")
    expect(body.messages[1]?.content).toEqual(expect.arrayContaining([expect.objectContaining({ type: "image_url", image_url: { url: "data:image/png;base64,aW1hZ2U=" } })]))
  })

  it("uses the module provider and model pair before the shared provider order", async () => {
    process.env.LLM_PROVIDER_ORDER = "openai"; process.env.OPENAI_API_KEY = "openai-key"
    process.env.OCR_PROVIDER = "ark"; process.env.OCR_MODEL = "invoice-ark-model"; process.env.ARK_API_KEY = "ark-key"; process.env.ARK_BASE_URL = "https://ark.example.test/api/v3"
    const output = { invoiceType: "VAT_SPECIAL", invoiceNumber: "25800001", invoiceDate: "2026-08-13", buyerName: "购买方", buyerTaxId: null, sellerName: "销售方", sellerTaxId: null, subtotal: "1.00", totalTax: "0.06", totalAmount: "1.06", totalAmountInWords: null, remarks: null, drawer: null, items: [{ itemName: "服务", specification: null, unit: null, quantity: "1", unitPrice: "1", amount: "1", taxRate: "6%", taxAmount: "0.06" }] }
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, text: async () => "", json: async () => ({ choices: [{ message: { content: JSON.stringify(output) } }] }) }))
    vi.stubGlobal("fetch", fetchMock)
    const result = await recognizeInvoice({ recognitionType: "INVOICE", filename: "invoice.png", mimeType: "image/png", base64Data: "aW1hZ2U=" })
    expect(result).toMatchObject({ model: "invoice-ark-model", raw: { provider: "ark" } })
  })

  it("keeps the invoice type empty when the model cannot identify it", async () => {
    process.env.LLM_PROVIDER_ORDER = "openai"; process.env.OPENAI_API_KEY = "test-key"
    const output = { invoiceType: null, invoiceNumber: "25800001", invoiceDate: "2026-08-13", buyerName: "购买方", buyerTaxId: null, sellerName: "销售方", sellerTaxId: null, subtotal: "1.00", totalTax: "0.06", totalAmount: "1.06", totalAmountInWords: null, remarks: null, drawer: null, items: [{ itemName: "服务", specification: null, unit: null, quantity: "1", unitPrice: "1", amount: "1", taxRate: "6%", taxAmount: "0.06" }] }
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ output: [{ content: [{ type: "output_text", text: JSON.stringify(output) }] }] }) }))
    vi.stubGlobal("fetch", fetchMock)
    const result = await recognizeInvoice({ recognitionType: "INVOICE", filename: "invoice.png", mimeType: "image/png", base64Data: "aW1hZ2U=" })
    expect(result.data).not.toHaveProperty("invoiceType")
    expect(result.data).toMatchObject({ invoiceNumber: "25800001", sellerName: "销售方", items: [{ itemName: "服务" }] })
  })

  it("requires the module provider and model to be configured together", async () => {
    process.env.OCR_PROVIDER = "ark"; delete process.env.OCR_MODEL
    await expect(recognizeInvoice({ recognitionType: "INVOICE", filename: "invoice.png", mimeType: "image/png", base64Data: "aW1hZ2U=" })).rejects.toThrow("必须同时配置或同时留空")
    delete process.env.OCR_PROVIDER; process.env.OCR_MODEL = "invoice-model"
    await expect(recognizeInvoice({ recognitionType: "INVOICE", filename: "invoice.png", mimeType: "image/png", base64Data: "aW1hZ2U=" })).rejects.toThrow("必须同时配置或同时留空")
  })

  it("requires a configured shared provider", async () => { process.env.LLM_PROVIDER_ORDER = "openai,ark"; delete process.env.OPENAI_API_KEY; delete process.env.ARK_API_KEY; await expect(recognizeInvoice({ recognitionType: "INVOICE", filename: "invoice.png", mimeType: "image/png", base64Data: "aW1hZ2U=" })).rejects.toThrow("LLM_PROVIDER_ORDER") })

  it("rejects results without parties or meaningful line items", () => {
    expect(() => assertCompleteInvoice({ invoiceType: "VAT_NORMAL", buyerName: "购买方", sellerName: "销售方", remarks: "", items: [{ itemName: "服务费" }] })).not.toThrow()
    expect(() => assertCompleteInvoice({ buyerName: "购买方", items: [] })).toThrow("销售方名称、商品明细")
  })
})
