import type { DetailRowData, DetailTableData } from "@zform/shared"

const historyTableId = "researchRuns"

export function researchRunRows(detailTables: DetailTableData[]): DetailRowData[] {
  return detailTables.find((table) => table.tableId === historyTableId)?.rows || []
}

export function appendResearchRun(detailTables: DetailTableData[], row: DetailRowData): DetailTableData[] {
  const rows = [...researchRunRows(detailTables), row]
  const withoutHistory = detailTables.filter((table) => table.tableId !== historyTableId)
  return [...withoutHistory, { tableId: historyTableId, rows }]
}

export function replaceResearchTable(detailTables: DetailTableData[], table: DetailTableData): DetailTableData[] {
  return [...detailTables.filter((item) => item.tableId !== table.tableId), table]
}

export function buildPreviousResearchContext(detailTables: DetailTableData[], maxRuns = 5, maxChars = 16_000): string | undefined {
  const completed = researchRunRows(detailTables).filter((row) => row.data.status === "COMPLETED" && typeof row.data.resultJson === "string")
  const context = completed.slice(-maxRuns).map((row) => `第 ${String(row.data.runNumber || "?")} 次调查（${String(row.data.completedAt || "未知时间")}，${String(row.data.provider || "未知供应商")} · ${String(row.data.model || "未知模型")}）：\n${String(row.data.resultJson)}`).join("\n\n")
  return context ? context.slice(-maxChars) : undefined
}
