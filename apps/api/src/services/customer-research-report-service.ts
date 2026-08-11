import type { CustomerResearchDecision, DocumentRecord } from "@zform/shared"
import { BusinessError } from "../utils/business-error.js"
import type { UserContext } from "./data-permission-service.js"
import { findDocument } from "./document-service.js"

const PAGE_WIDTH = 595
const PAGE_HEIGHT = 842
const MARGIN = 46
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2
const decisionLabels: Record<CustomerResearchDecision, string> = { yes: "符合", no: "不符合", uncertain: "待确认" }

interface PdfPage { commands: string[] }
interface TextOptions { size?: number; color?: string; lineHeight?: number; maxWidth?: number }

function safeText(value: unknown, fallback = "-"): string {
  if (value === null || value === undefined || value === "") return fallback
  return String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ")
}

function hexText(value: string): string {
  const bytes: number[] = []
  for (const character of value) {
    const code = character.codePointAt(0) || 0x3f
    const normalized = code <= 0xffff ? code : 0x3f
    bytes.push((normalized >> 8) & 0xff, normalized & 0xff)
  }
  return bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase()
}

function literalText(value: string): string { return value.replace(/([\\()])/g, "\\$1") }

function textWidth(value: string, size: number): number {
  return [...value].reduce((width, character) => width + (character.codePointAt(0)! < 128 ? size * 0.55 : size), 0)
}

function wrapText(value: string, size: number, maxWidth: number): string[] {
  const lines: string[] = []
  for (const paragraph of value.replace(/\r/g, "").split("\n")) {
    if (!paragraph) { lines.push(""); continue }
    let line = ""
    for (const character of paragraph) {
      if (line && textWidth(line + character, size) > maxWidth) { lines.push(line); line = character }
      else line += character
    }
    lines.push(line)
  }
  return lines.length ? lines : [""]
}

function color(value: string): string {
  const normalized = value.replace("#", "")
  return [0, 2, 4].map((offset) => (Number.parseInt(normalized.slice(offset, offset + 2), 16) / 255).toFixed(3)).join(" ")
}

class ReportCanvas {
  readonly pages: PdfPage[] = []
  private page: PdfPage = { commands: [] }
  private y = PAGE_HEIGHT - MARGIN

  constructor() { this.pages.push(this.page) }

  private ensure(height: number): void {
    if (this.y - height >= MARGIN + 22) return
    this.page = { commands: [] }
    this.pages.push(this.page)
    this.y = PAGE_HEIGHT - MARGIN
  }

  private rect(x: number, y: number, width: number, height: number, fill: string): void {
    this.page.commands.push(`${color(fill)} rg ${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re f`)
  }

  private line(x1: number, y1: number, x2: number, y2: number, stroke = "D9E2E7"): void {
    this.page.commands.push(`${color(stroke)} RG 0.7 w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`)
  }

  private drawLine(value: string, x: number, y: number, size: number, fill: string): void {
    const segments = [...value].reduce<Array<{ ascii: boolean; value: string }>>((items, character) => {
      const ascii = character.codePointAt(0)! < 128
      const last = items.at(-1)
      if (last?.ascii === ascii) last.value += character
      else items.push({ ascii, value: character })
      return items
    }, [])
    let cursor = x
    segments.forEach((segment) => {
      const font = segment.ascii ? "/F2" : "/F1"
      const content = segment.ascii ? `(${literalText(segment.value)})` : `<${hexText(segment.value)}>`
      this.page.commands.push(`BT ${font} ${size.toFixed(2)} Tf ${color(fill)} rg ${cursor.toFixed(2)} ${y.toFixed(2)} Td ${content} Tj ET`)
      cursor += textWidth(segment.value, size)
    })
  }

  text(value: string, x = MARGIN, options: TextOptions = {}): number {
    const size = options.size || 10
    const lineHeight = options.lineHeight || size * 1.55
    const lines = wrapText(value, size, options.maxWidth || CONTENT_WIDTH - (x - MARGIN))
    const height = lines.length * lineHeight
    this.ensure(height)
    lines.forEach((line, index) => this.drawLine(line, x, this.y - size - index * lineHeight, size, options.color || "26343D"))
    this.y -= height
    return height
  }

  gap(height = 10): void { this.ensure(height); this.y -= height }

  title(value: string): void {
    this.ensure(38)
    this.rect(MARGIN, this.y - 28, CONTENT_WIDTH, 28, "E8F4F2")
    this.rect(MARGIN, this.y - 28, 4, 28, "0F766E")
    this.drawLine(value, MARGIN + 14, this.y - 19, 13, "0F5E59")
    this.y -= 38
  }

  keyValue(rows: Array<[string, string]>): void {
    rows.forEach(([label, value], index) => {
      const lines = wrapText(value, 9.5, CONTENT_WIDTH - 138)
      const rowHeight = Math.max(27, lines.length * 14 + 10)
      this.ensure(rowHeight)
      const top = this.y
      if (index % 2 === 0) this.rect(MARGIN, top - rowHeight, CONTENT_WIDTH, rowHeight, "F6F8F9")
      this.drawLine(label, MARGIN + 10, top - 18, 9, "61717A")
      lines.forEach((line, row) => this.drawLine(line, MARGIN + 128, top - 18 - row * 14, 9.5, "25333B"))
      this.line(MARGIN, top - rowHeight, MARGIN + CONTENT_WIDTH, top - rowHeight)
      this.y -= rowHeight
    })
    this.y -= 4
  }

  decision(label: string, result: string, reason: string, confidence: string): void {
    const reasonLines = wrapText(reason, 9.5, CONTENT_WIDTH - 24)
    const height = 49 + reasonLines.length * 14
    this.ensure(height + 8)
    this.rect(MARGIN, this.y - height, CONTENT_WIDTH, height, "F6F8F9")
    this.rect(MARGIN, this.y - height, 4, height, result === "符合" ? "16856B" : result === "不符合" ? "C2413B" : "C58A18")
    this.drawLine(label, MARGIN + 14, this.y - 19, 11, "25333B")
    this.drawLine(`${result}  |  可信度 ${confidence}%`, MARGIN + 238, this.y - 19, 10, result === "符合" ? "0F766E" : result === "不符合" ? "B42318" : "8A6116")
    reasonLines.forEach((line, index) => this.drawLine(line, MARGIN + 14, this.y - 43 - index * 14, 9.5, "4E606A"))
    this.y -= height + 8
  }

  source(index: number, title: string, claim: string, url: string): void {
    const titleLines = wrapText(`${index}. ${title}`, 10, CONTENT_WIDTH)
    const claimLines = wrapText(claim, 9, CONTENT_WIDTH - 12)
    const urlLines = wrapText(url, 8, CONTENT_WIDTH - 12)
    const height = titleLines.length * 15 + claimLines.length * 13 + urlLines.length * 11 + 11
    this.ensure(height)
    titleLines.forEach((line, row) => this.drawLine(line, MARGIN, this.y - 10 - row * 15, 10, "1C4E80"))
    let offset = 10 + titleLines.length * 15
    claimLines.forEach((line, row) => this.drawLine(line, MARGIN + 12, this.y - offset - row * 13, 9, "344650"))
    offset += claimLines.length * 13
    urlLines.forEach((line, row) => this.drawLine(line, MARGIN + 12, this.y - offset - row * 11, 8, "607D8B"))
    this.y -= height
  }
}

function buildPdf(pages: PdfPage[]): Buffer {
  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "",
    "<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /UniGB-UCS2-H /DescendantFonts [4 0 R] >>",
    "<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 4 >> /DW 1000 >>",
    "<< /Type /Font /Subtype /TrueType /BaseFont /Arial /Encoding /WinAnsiEncoding /FontDescriptor 6 0 R >>",
    "<< /Type /FontDescriptor /FontName /Arial /Flags 32 /FontBBox [-665 -325 2000 1040] /ItalicAngle 0 /Ascent 905 /Descent -212 /CapHeight 716 /StemV 80 >>",
  ]
  const pageIds: number[] = []
  pages.forEach((page) => {
    const pageId = objects.length + 1
    const contentId = pageId + 1
    pageIds.push(pageId)
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 5 0 R >> >> /Contents ${contentId} 0 R >>`)
    const commands = [...page.commands]
    commands.push(`BT /F1 8 Tf ${color("7B8A92")} rg ${MARGIN} 24 Td <${hexText("客户背景调查报告")}> Tj ET`)
    commands.push(`BT /F1 8 Tf ${color("7B8A92")} rg ${PAGE_WIDTH - 92} 24 Td <${hexText(`第 ${pages.indexOf(page) + 1} / ${pages.length} 页`)}> Tj ET`)
    const stream = commands.join("\n")
    objects.push(`<< /Length ${Buffer.byteLength(stream, "ascii")} >>\nstream\n${stream}\nendstream`)
  })
  objects[1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`
  let output = "%PDF-1.7\n%PDFGEN\n"
  const offsets = [0]
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(output, "ascii")); output += `${index + 1} 0 obj\n${object}\nendobj\n` })
  const xref = Buffer.byteLength(output, "ascii")
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  offsets.slice(1).forEach((offset) => { output += `${String(offset).padStart(10, "0")} 00000 n \n` })
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(output, "ascii")
}

export function renderCustomerResearchReport(document: DocumentRecord, generatedAt = new Date()): Buffer {
  if (document.typeId !== "customer_due_diligence") throw new BusinessError("当前单据不是客户背景调查。", 400)
  if (document.status !== "COMPLETED") throw new BusinessError("调查完成后才能导出 PDF 报告。", 409)
  const data = document.masterData
  const sources = document.detailTables.find((table) => table.tableId === "sources")?.rows || []
  const report = new ReportCanvas()
  report.text("客户背景调查报告", MARGIN, { size: 24, color: "0F5E59", lineHeight: 34 })
  report.text(`${safeText(data.companyName, document.code)}  |  综合可信度 ${safeText(data.overallConfidence, "0")}%`, MARGIN, { size: 12, color: "526670", lineHeight: 21 })
  report.text(`调查编号：${document.code}    报告生成：${generatedAt.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}`, MARGIN, { size: 8.5, color: "788890", lineHeight: 17 })
  report.gap(10)

  report.title("一、客户基本信息")
  report.keyValue([
    ["公司名称", safeText(data.companyName)], ["国家/地区", safeText(data.country)], ["公司网址", safeText(data.website)],
    ["联系人", safeText(data.contactName)], ["联系邮箱", safeText(data.contactEmail)], ["联系电话", safeText(data.contactPhone)],
    ["营业地址", safeText(data.businessAddress)], ["调查完成时间", safeText(data.completedAt)],
  ])

  report.title("二、调查摘要")
  report.text(safeText(data.companySummary, "暂无公司简介"), MARGIN, { size: 10, lineHeight: 16 })
  report.gap(12)

  report.title("三、关键判定")
  const decisions: Array<[string, string, string, string]> = [
    ["真实有效公司", "isVerifiedCompany", "verifiedCompanyReason", "verifiedCompanyConfidence"],
    ["园林户外业务", "isGardenOutdoor", "gardenOutdoorReason", "gardenOutdoorConfidence"],
    ["年销售额超过 100 万美元", "salesOverOneMillion", "salesReason", "salesConfidence"],
    ["员工人数超过 10 人", "employeesOverTen", "employeesReason", "employeesConfidence"],
  ]
  decisions.forEach(([label, field, reason, confidence]) => {
    const rawDecision = data[field]
    const result = typeof rawDecision === "string" && rawDecision in decisionLabels ? decisionLabels[rawDecision as CustomerResearchDecision] : "待确认"
    report.decision(label, result, safeText(data[reason], "暂无可靠依据"), safeText(data[confidence], "0"))
  })

  report.title("四、业务与规模")
  report.keyValue([
    ["业务范围", safeText(data.businessScope)], ["规模估算", safeText(data.scaleEstimate)],
    ["年销售额估算", data.annualSalesEstimateUsd ? `$${Number(data.annualSalesEstimateUsd).toLocaleString("en-US")}` : "暂无可靠数据"],
    ["员工人数估算", data.employeeEstimate ? `${safeText(data.employeeEstimate)} 人` : "暂无可靠数据"],
  ])
  if (data.researchNotes) { report.text(`调查备注：${safeText(data.researchNotes)}`, MARGIN, { size: 9.5, color: "526670", lineHeight: 15 }); report.gap(8) }

  report.title("五、公开信息来源")
  if (!sources.length) report.text("未返回可验证的公开链接。", MARGIN, { size: 10, color: "61717A" })
  sources.forEach((row, index) => report.source(index + 1, safeText(row.data.title, "未命名来源"), safeText(row.data.claim, "未注明支持结论"), safeText(row.data.url)))
  report.gap(8)
  report.text("免责声明：本报告基于调查时点可获取的公开信息及模型综合分析生成，仅供业务评估参考，不构成法律、财务或信用保证。重要决策前请对关键事实进行人工复核。", MARGIN, { size: 8.5, color: "788890", lineHeight: 14 })
  return buildPdf(report.pages)
}

export async function exportCustomerResearchReport(id: string, user: UserContext): Promise<{ pdf: Buffer; filename: string }> {
  const document = await findDocument(id, user)
  const companyName = safeText(document.masterData.companyName, document.code).replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 60)
  return { pdf: renderCustomerResearchReport(document), filename: `${companyName}_${document.code}_背景调查报告.pdf` }
}
