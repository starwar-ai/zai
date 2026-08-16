import type { OcrTrainTicketData } from "@zform/shared"

function firstMatch(text: string, joined: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const match = joined.match(pattern) ?? text.match(pattern)
    const value = match?.[1]?.trim()
    if (value) return value
  }
  return undefined
}

/** 从铁路电子客票 PDF 的文本层提取结构化字段。 */
export function parseTrainTicketText(text: string): OcrTrainTicketData {
  const joined = text.split("\n").map((line) => line.trim()).filter(Boolean).join(" ")
  const stationMatch = joined.match(/([^\s]{2,8})站\s+[A-Za-z0-9]+\s+([^\s]{2,8})站/) ?? text.match(/([^\s]{2,8})站\s+[A-Za-z0-9]+\s+([^\s]{2,8})站/)
  const dateTimeMatch = joined.match(/(\d{4}年\d{2}月\d{2}日)\s+(\d{2}:\d{2})[开開]/) ?? text.match(/(\d{4}年\d{2}月\d{2}日)\s+(\d{2}:\d{2})[开開]/)
  const passengerMatch = text.match(/\d{6}\*{4,8}\d{4}\s+([\u3400-\u9fff]{2,5})/) ?? text.match(/\d{6}[\d*]{6,8}\d{4}\s{2,}([\u3400-\u9fff]{2,5})/)
  const value = (patterns: RegExp[]) => firstMatch(text, joined, patterns)
  return {
    trainInvoiceNo: value([/发票号码[：:]\s*(\d{8,25})/, /發票號碼[：:]\s*(\d{8,25})/]),
    trainIssueDate: value([/开票日期[：:]\s*(\d{4}年\d{1,2}月\d{1,2}日)/, /開票日期[：:]\s*(\d{4}年\d{1,2}月\d{1,2}日)/]),
    ...(stationMatch ? { departureStation: `${stationMatch[1]}站`, arrivalStation: `${stationMatch[2]}站` } : {}),
    trainNo: value([/\b([GDCZKTYS]\d{1,4})\b/i]),
    ...(dateTimeMatch ? { departureDate: dateTimeMatch[1], departureTime: dateTimeMatch[2] } : {}),
    seatNo: value([/(\d+车\d+[A-Z号]+号?)/, /(\d+車\d+[A-Z號]+號?)/]),
    seatClass: value([/(一等座|二等座|商务座|商務座|硬卧|硬臥|软卧|軟臥|硬座|无座|無座|动卧|動臥)/]),
    ticketPrice: value([/票价[：:]?\s*[￥¥]?\s*([\d.]+)/, /票價[：:]?\s*[￥¥]?\s*([\d.]+)/]),
    passengerId: value([/(\d{6}[\d*]{4,8}\d{4})/]),
    ...(passengerMatch?.[1] ? { passengerName: passengerMatch[1] } : {}),
    ticketNo: value([/电子客票号[：:]\s*(\d{15,30})/, /電子客票號[：:]\s*(\d{15,30})/]),
    trainBuyerName: value([/购买方名称[：:]\s*([^\n]{2,255}?)(?=\s+(?:统一社会信用代码|統一社會信用代碼|$))/, /購買方名稱[：:]\s*([^\n]{2,255}?)(?=\s+(?:统一社会信用代码|統一社會信用代碼|$))/]),
    trainBuyerCreditCode: value([/统一社会信用代码[：:]\s*([A-Z0-9]{15,20})/, /統一社會信用代碼[：:]\s*([A-Z0-9]{15,20})/]),
  }
}

export function assertTrainTicketText(text: string, data: OcrTrainTicketData): void {
  const railwayMarker = /铁路|鐵路|电子客票|電子客票/.test(text)
  const journeyFields = [data.departureStation, data.arrivalStation, data.trainNo, data.ticketNo].filter(Boolean).length
  if (!railwayMarker || journeyFields < 2) throw new Error("未检测到有效的铁路电子客票，请上传带有可提取文本层的铁路电子客票 PDF")
}
