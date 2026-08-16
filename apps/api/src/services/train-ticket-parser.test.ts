import { describe, expect, it } from "vitest"
import { assertTrainTicketText, parseTrainTicketText } from "./train-ticket-parser.js"

describe("train ticket parser", () => {
  it("extracts railway e-ticket fields", () => {
    const text = `电子发票（铁路电子客票）\n发票号码：25112000000000123456\n开票日期：2026年08月15日\n北京南站 G101 上海虹桥站\n2026年08月14日 08:00开\n03车12A号 二等座 票价：¥553.00\n140102******1453 张凯\n电子客票号：123456789012345678\n购买方名称：示例科技有限公司 统一社会信用代码：91110000123456789X`
    const data = parseTrainTicketText(text)
    assertTrainTicketText(text, data)
    expect(data).toMatchObject({ trainNo: "G101", departureStation: "北京南站", arrivalStation: "上海虹桥站", departureTime: "08:00", seatNo: "03车12A号", passengerName: "张凯", ticketPrice: "553.00" })
  })

  it("rejects ordinary invoices", () => {
    const text = "电子发票 发票号码：12345678 价税合计：100.00"
    expect(() => assertTrainTicketText(text, parseTrainTicketText(text))).toThrow("铁路电子客票")
  })
})
