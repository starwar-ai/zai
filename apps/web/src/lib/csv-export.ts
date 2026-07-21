export interface CsvColumn<T> { label: string; value: (row: T) => unknown }

function csvCell(value: unknown): string {
  const text = value === undefined || value === null ? "" : typeof value === "boolean" ? value ? "是" : "否" : String(value)
  return `"${text.replaceAll('"', '""')}"`
}

export function exportCsv<T>(fileName: string, columns: CsvColumn<T>[], rows: T[]): void {
  const csv = [columns.map((column) => csvCell(column.label)).join(","), ...rows.map((row) => columns.map((column) => csvCell(column.value(row))).join(","))].join("\r\n")
  const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" }))
  const link = document.createElement("a")
  link.href = url
  link.download = fileName.endsWith(".csv") ? fileName : `${fileName}.csv`
  link.click()
  URL.revokeObjectURL(url)
}
