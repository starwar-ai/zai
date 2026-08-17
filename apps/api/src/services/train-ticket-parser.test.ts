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

  it("accepts railway PDF text with layout whitespace", () => {
    const text = `发票号码 :26319166100007282589
Shanghaihongqiao
G742
2026 年 05 月 15 日
电子发票（铁路电子客票）
12:32 开 07 车 05D 号
票价 : ￥ 56.00
二等座
1401021976****1453 张凯
电子客票号 :6610094086051593011392026
上海思亦加网络科技有限公司 统一社会信用代码 :91310120MAC26XK78E
开票日期 :2026 年 06 月 07 日
Wuxidong
无锡东 站 上海虹桥 站`
    const data = parseTrainTicketText(text)
    expect(() => assertTrainTicketText(text, data)).not.toThrow()
    expect(data).toMatchObject({
      trainInvoiceNo: "26319166100007282589",
      trainIssueDate: "2026年06月07日",
      trainNo: "G742",
      departureDate: "2026年05月15日",
      departureTime: "12:32",
      seatNo: "07车05D号",
      ticketPrice: "56.00",
      passengerId: "1401021976****1453",
      ticketNo: "6610094086051593011392026",
    })
  })
})
