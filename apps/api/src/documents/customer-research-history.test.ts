import { describe, expect, it } from "vitest"
import { appendResearchRun, buildPreviousResearchContext, researchRunRows, replaceResearchTable } from "./customer-research-history.js"

describe("customer research history", () => {
  it("appends runs without losing other detail tables", () => {
    const initial = [{ tableId: "sources", rows: [{ id: "source-1", data: { url: "https://example.com" } }] }]
    const next = appendResearchRun(initial, { id: "run-1", data: { status: "COMPLETED", runNumber: 1, resultJson: "{\"companySummary\":\"第一次\"}" } })
    expect(next.find((table) => table.tableId === "sources")?.rows).toHaveLength(1)
    expect(researchRunRows(next)).toHaveLength(1)
    expect(replaceResearchTable(next, { tableId: "sources", rows: [] }).find((table) => table.tableId === "researchRuns")?.rows).toHaveLength(1)
  })

  it("uses recent completed runs as bounded next-run context", () => {
    const tables = [{ tableId: "researchRuns", rows: [
      { id: "run-1", data: { status: "COMPLETED", runNumber: 1, completedAt: "2026-01-01", provider: "kimi", model: "kimi-k3", resultJson: "第一次结果" } },
      { id: "run-2", data: { status: "REJECTED", runNumber: 2, resultJson: "失败结果" } },
      { id: "run-3", data: { status: "COMPLETED", runNumber: 3, completedAt: "2026-02-01", provider: "minimax", model: "MiniMax-M2.7", resultJson: "第三次结果" } },
    ] }]
    const context = buildPreviousResearchContext(tables, 1)
    expect(context).toContain("第三次结果")
    expect(context).not.toContain("第一次结果")
    expect(context).not.toContain("失败结果")
  })
})
