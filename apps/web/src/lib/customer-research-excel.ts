import readXlsxFile from "read-excel-file/browser"
import type { CustomerResearchImportRow } from "@zform/shared"

const aliases = {
  companyName: ["公司名", "公司名称", "客户公司", "企业名称", "company", "companyname", "company name", "business name"],
  country: ["国家", "国家地区", "国家/地区", "地区", "country", "region", "market"],
  website: ["网址", "网站", "官网", "公司网址", "website", "web", "url", "homepage"],
  contactName: ["联系人", "联系人员", "客户姓名", "contact", "contactname", "contact name", "buyer"],
  contactEmail: ["邮箱", "电子邮箱", "邮件", "联系人邮箱", "email", "e-mail", "mail"],
  contactPhone: ["电话", "手机", "联系电话", "联系人电话", "phone", "telephone", "mobile", "tel"],
} as const

function normalize(value: string): string { return value.trim().toLowerCase().replace(/[\s_\-（）()]+/g, "") }
function text(value: unknown): string { return value === null || value === undefined ? "" : String(value).trim() }
function cell(value: unknown): string | number | boolean | null { return value === null || value === undefined || value === "" ? null : typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : String(value) }

export interface CustomerWorkbookResult { sheetName: string; totalRows: number; rows: CustomerResearchImportRow[]; issues: Array<{ row: number; message: string }>; mappedHeaders: Record<string, string> }

export async function parseCustomerWorkbook(data: ArrayBuffer): Promise<CustomerWorkbookResult> {
  const sheets = await readXlsxFile(new Blob([data]))
  const firstSheet = sheets[0]
  if (!firstSheet) throw new Error("Excel 文件中没有可读取的工作表")
  const grid = firstSheet.data
  const headers = (grid[0] || []).map(text)
  if (!headers.length) throw new Error("Excel 文件中没有可读取的表头")
  const rawRows = grid.slice(1).filter((row) => row.some((value) => value !== null && value !== "")).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])))
  if (!rawRows.length) throw new Error("工作表中没有客户数据")
  const mappedHeaders: Record<string, string> = {}
  Object.entries(aliases).forEach(([field, values]) => { const match = headers.find((header) => values.map(normalize).includes(normalize(header))); if (match) mappedHeaders[field] = match })
  if (!mappedHeaders.companyName) throw new Error("未识别到公司名列，请使用“公司名 / 公司名称 / Company Name”等表头")
  const rows: CustomerResearchImportRow[] = []; const issues: CustomerWorkbookResult["issues"] = []
  rawRows.slice(0, 1000).forEach((raw, index) => {
    const companyName = text(raw[mappedHeaders.companyName!])
    if (!companyName) { issues.push({ row: index + 2, message: "公司名为空，已跳过" }); return }
    const value = (field: keyof typeof aliases) => mappedHeaders[field] ? text(raw[mappedHeaders[field]!]) || null : null
    rows.push({ companyName, country: value("country"), website: value("website"), contactName: value("contactName"), contactEmail: value("contactEmail"), contactPhone: value("contactPhone"), rawData: Object.fromEntries(Object.entries(raw).map(([key, item]) => [key, cell(item)])) })
  })
  return { sheetName: firstSheet.sheet, totalRows: rawRows.length, rows, issues, mappedHeaders }
}
