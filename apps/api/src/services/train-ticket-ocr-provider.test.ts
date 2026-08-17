import { afterEach, describe, expect, it, vi } from "vitest"
import { recognizeTrainTicketText, trainTicketProvider } from "./train-ticket-ocr-provider.js"

const names = ["TRAIN_TICKET_OCR_PROVIDER", "TRAIN_TICKET_OCR_MODEL", "LLM_PROVIDER_ORDER", "OPENAI_API_KEY", "OPENAI_MODEL", "OPENAI_BASE_URL", "ARK_API_KEY", "ARK_MODEL", "ARK_BASE_URL"] as const
const original = Object.fromEntries(names.map((name) => [name, process.env[name]])) as Record<(typeof names)[number], string | undefined>
afterEach(() => { for (const name of names) { const value = original[name]; if (value === undefined) delete process.env[name]; else process.env[name] = value }; vi.unstubAllGlobals() })

const output = { trainInvoiceNo: "25112000000000123456", trainIssueDate: "2026年08月15日", departureStation: "北京南站", arrivalStation: "上海虹桥站", trainNo: "G101", departureDate: "2026年08月14日", departureTime: "08:00", seatNo: "03车12A号", seatClass: "二等座", ticketPrice: "553.00", passengerId: "140102******1453", passengerName: "张凯", ticketNo: "123456789012345678", trainBuyerName: "示例公司", trainBuyerCreditCode: "91110000123456789X" }

describe("train ticket OCR provider", () => {
  it("falls back to the shared provider and model", async () => {
    process.env.LLM_PROVIDER_ORDER = "openai"; process.env.OPENAI_API_KEY = "shared-key"; process.env.OPENAI_MODEL = "shared-model"; process.env.OPENAI_BASE_URL = "https://llm.example.test/v1"
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ output: [{ content: [{ type: "output_text", text: JSON.stringify(output) }] }] }), { status: 200 })))
    await expect(recognizeTrainTicketText("铁路电子客票 G101")).resolves.toMatchObject({ model: "shared-model", raw: { provider: "openai" }, data: { trainNo: "G101", ticketPrice: "553.00" } })
  })

  it("uses the dedicated provider and model before shared configuration", () => {
    process.env.LLM_PROVIDER_ORDER = "openai"; process.env.OPENAI_API_KEY = "shared-key"; process.env.TRAIN_TICKET_OCR_PROVIDER = "ark"; process.env.TRAIN_TICKET_OCR_MODEL = "train-ticket-model"; process.env.ARK_API_KEY = "ark-key"
    expect(trainTicketProvider()).toMatchObject({ provider: "ark", model: "train-ticket-model", apiKey: "ark-key" })
  })

  it("requires the dedicated provider and model to be configured together", () => {
    process.env.TRAIN_TICKET_OCR_PROVIDER = "ark"; delete process.env.TRAIN_TICKET_OCR_MODEL
    expect(() => trainTicketProvider()).toThrow("必须同时配置或同时留空")
  })
})
