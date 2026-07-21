import { useRef, useState } from "react"
import { Building2, ExternalLink, FileSpreadsheet, Upload } from "lucide-react"
import type { CustomerResearchDecision } from "@zform/shared"
import { api } from "@/apis/framework-api"
import { Alert, Button, Card, Dialog } from "@/components/ui"
import { pluginRegistry, type ExtraTabPluginProps, type ToolbarActionPluginProps } from "@/core/plugin-registry"
import { parseCustomerWorkbook, type CustomerWorkbookResult } from "@/lib/customer-research-excel"

const decisionLabels: Record<CustomerResearchDecision, string> = { yes: "符合", no: "不符合", uncertain: "待确认" }
function decision(value: unknown): string { return typeof value === "string" && value in decisionLabels ? decisionLabels[value as CustomerResearchDecision] : "尚未调查" }

function CustomerResearchImportAction({ action, onChanged, reload }: ToolbarActionPluginProps) {
  const inputRef = useRef<HTMLInputElement>(null); const [open, setOpen] = useState(false); const [fileName, setFileName] = useState(""); const [parsed, setParsed] = useState<CustomerWorkbookResult | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null); const [message, setMessage] = useState<string | null>(null)
  const choose = async (file?: File) => {
    if (!file) return
    setError(null); setMessage(null)
    if (!/\.xlsx$/i.test(file.name)) { setError("请选择 .xlsx 文件"); return }
    try { setFileName(file.name); setParsed(await parseCustomerWorkbook(await file.arrayBuffer())) } catch (reason) { setParsed(null); setError(reason instanceof Error ? reason.message : "Excel 解析失败") }
  }
  const submit = async () => {
    if (!parsed?.rows.length) return
    setBusy(true); setError(null)
    try { const result = await api.importCustomerResearch({ fileName, rows: parsed.rows }); await Promise.all([onChanged(), reload()]); setParsed(null); setMessage(`成功导入 ${result.importedRows} 位客户，跳过 ${result.skippedRows} 条重复记录。`) }
    catch (reason) { setError(reason instanceof Error ? reason.message : "导入失败") } finally { setBusy(false) }
  }
  return <><Button variant="primary" onClick={() => setOpen(true)}><Upload size={16} />{action.label}</Button><Dialog open={open} title="批量导入客户" description="自动识别中英文表头，单次最多处理 1,000 位客户。" width={820} onClose={() => !busy && setOpen(false)} footer={<><Button onClick={() => setOpen(false)} disabled={busy}>取消</Button><Button variant="primary" onClick={submit} disabled={busy || !parsed?.rows.length}>{busy ? "正在导入..." : "确认导入并加入队列"}</Button></>}>
    <input ref={inputRef} hidden type="file" accept=".xlsx" onChange={(event) => choose(event.target.files?.[0])} />
    <Button onClick={() => inputRef.current?.click()}><FileSpreadsheet size={16} />选择 Excel 文件</Button>
    {error && <Alert variant="danger">{error}</Alert>}{message && <Alert variant="success">{message}</Alert>}
    {parsed && <div className="research-import-preview"><p><strong>{fileName}</strong> · 工作表 {parsed.sheetName} · 有效 {parsed.rows.length} 行 · 跳过 {parsed.issues.length} 行</p><div className="data-table"><div className="table-row table-head"><span>公司</span><span>国家</span><span>网址</span><span>联系人</span><span>邮箱</span></div>{parsed.rows.slice(0, 8).map((row, index) => <div className="table-row" key={`${row.companyName}-${index}`}><strong>{row.companyName}</strong><span>{row.country || "—"}</span><span className="truncate">{row.website || "—"}</span><span>{row.contactName || "—"}</span><span className="truncate">{row.contactEmail || "—"}</span></div>)}</div></div>}
  </Dialog></>
}

function CustomerResearchReport({ document }: ExtraTabPluginProps) {
  const data = document.masterData; const sources = document.detailTables.find((table) => table.tableId === "sources")?.rows || []
  const decisions = [
    ["真实有效公司", "isVerifiedCompany", "verifiedCompanyReason", "verifiedCompanyConfidence"], ["园林户外业务", "isGardenOutdoor", "gardenOutdoorReason", "gardenOutdoorConfidence"],
    ["年销售额超过 100 万美元", "salesOverOneMillion", "salesReason", "salesConfidence"], ["员工人数超过 10 人", "employeesOverTen", "employeesReason", "employeesConfidence"],
  ] as const
  if (document.status !== "COMPLETED") return <Alert variant={document.status === "REJECTED" ? "danger" : "info"}>{document.status === "REJECTED" ? `调查失败：${String(data.failureMessage || "未知原因")}` : "调查完成后将在这里展示结构化报告。"}</Alert>
  return <div className="customer-research-report"><Card><div className="research-report-hero"><Building2 /><div><span>综合可信度 {String(data.overallConfidence || 0)}%</span><h2>{String(data.companyName || document.code)}</h2><p>{String(data.companySummary || "暂无公司简介")}</p></div></div></Card><div className="research-decision-grid">{decisions.map(([label, value, reason, confidence]) => <Card key={value}><div className="research-decision-title"><strong>{label}</strong><span>{decision(data[value])}</span></div><p>{String(data[reason] || "暂无依据")}</p><small>可信度 {String(data[confidence] || 0)}%</small></Card>)}</div><div className="dashboard-grid"><Card className="span-2"><div className="panel-header"><div><h2>业务与规模</h2><p>公开信息的综合归纳</p></div></div><p>{String(data.businessScope || "—")}</p><p>{String(data.scaleEstimate || "—")}</p><p>年销售额估算：{data.annualSalesEstimateUsd ? `$${Number(data.annualSalesEstimateUsd).toLocaleString("zh-CN")}` : "暂无可靠数据"}　员工人数估算：{data.employeeEstimate ? `${String(data.employeeEstimate)} 人` : "暂无可靠数据"}</p></Card><Card><div className="panel-header"><div><h2>公开来源</h2><p>结论可追溯依据</p></div></div>{sources.length ? sources.map((row) => <a className="research-source" href={String(row.data.url)} target="_blank" rel="noreferrer" key={row.id}><strong>{String(row.data.title)}</strong><span>{String(row.data.claim)}</span><ExternalLink size={14} /></a>) : <p>未返回可验证的公开链接。</p>}</Card></div></div>
}

let registered = false
export function registerCustomerResearchPlugins(): void { if (registered) return; registered = true; pluginRegistry.registerToolbarAction("customer-research-import", CustomerResearchImportAction); pluginRegistry.registerExtraTab("customer-research-report", CustomerResearchReport) }
