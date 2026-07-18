export type CsvRow = Record<string, string>

export function parseCsv(content: string): CsvRow[] {
  const rows: string[][] = []
  let field = ""; let row: string[] = []; let quoted = false
  for (let index = 0; index < content.length; index += 1) {
    const character = content[index]; const next = content[index + 1]
    if (character === '"' && quoted && next === '"') { field += '"'; index += 1; continue }
    if (character === '"') { quoted = !quoted; continue }
    if (character === "," && !quoted) { row.push(field); field = ""; continue }
    if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1
      row.push(field); field = ""
      if (row.some(Boolean)) rows.push(row)
      row = []; continue
    }
    field += character
  }
  row.push(field); if (row.some(Boolean)) rows.push(row)
  const [headers, ...dataRows] = rows
  if (!headers) return []
  const names = headers.map((header) => header.replace(/^\uFEFF/, "").trim())
  return dataRows.map((values) => Object.fromEntries(names.map((name, index) => [name, values[index] || ""])))
}
