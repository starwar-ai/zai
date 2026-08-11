import { useRef, useState } from "react"
import { Building2, ExternalLink, FileSpreadsheet, Upload } from "lucide-react"
import type { CustomerResearchDecision, CustomerResearchResult } from "@zform/shared"
import { api } from "@/apis/framework-api"
import { Alert, Button, Card, Dialog, FormField, Select, Textarea } from "@/components/ui"
import { pluginRegistry, type ExtraTabPluginProps, type ListRowActionPluginProps, type ToolbarActionPluginProps } from "@/core/plugin-registry"
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
    try { const result = await api.importCustomerResearch({ fileName, rows: parsed.rows }); await Promise.all([onChanged(), reload()]); setParsed(null); setMessage(`新增 ${result.importedRows} 位客户，更新 ${result.updatedRows} 位已有客户，跳过 ${result.skippedRows} 条重复或未变化记录。`) }
    catch (reason) { setError(reason instanceof Error ? reason.message : "导入失败") } finally { setBusy(false) }
  }
  return <><Button variant="primary" onClick={() => setOpen(true)}><Upload size={16} />{action.label}</Button><Dialog open={open} title="批量导入客户" description="自动识别中英文表头，单次最多处理 1,000 位客户。" width={820} onClose={() => !busy && setOpen(false)} footer={<><Button onClick={() => setOpen(false)} disabled={busy}>取消</Button><Button variant="primary" onClick={submit} disabled={busy || !parsed?.rows.length}>{busy ? "正在导入..." : "确认导入并加入队列"}</Button></>}>
    <input ref={inputRef} hidden type="file" accept=".xlsx" onChange={(event) => choose(event.target.files?.[0])} />
    <Button onClick={() => inputRef.current?.click()}><FileSpreadsheet size={16} />选择 Excel 文件</Button>
    {error && <Alert variant="danger">{error}</Alert>}{message && <Alert variant="success">{message}</Alert>}
    {parsed && <div className="research-import-preview"><p><strong>{fileName}</strong> · 工作表 {parsed.sheetName} · 有效 {parsed.rows.length} 行 · 跳过 {parsed.issues.length} 行</p><div className="data-table"><div className="table-row table-head"><span>公司</span><span>国家</span><span>邮箱</span><span>营业地址</span><span>网址</span></div>{parsed.rows.slice(0, 8).map((row, index) => <div className="table-row" key={`${row.companyName}-${index}`}><strong>{row.companyName}</strong><span>{row.country || "—"}</span><span className="truncate">{row.contactEmail || "—"}</span><span className="truncate">{row.businessAddress || "—"}</span><span className="truncate">{row.website || "—"}</span></div>)}</div></div>}
  </Dialog></>
}

function CustomerResearchBatchAction({ action, selectedRows, onChanged, reload }: ToolbarActionPluginProps) {
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState<Array<{ provider: string; model: string; label: string }>>([])
  const [provider, setProvider] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const eligibleRows = selectedRows.filter((row) => row.status === "DRAFT" || row.status === "COMPLETED")
  const unavailableCount = selectedRows.length - eligibleRows.length
  const show = async () => {
    setOpen(true); setBusy(true); setError(null); setMessage(null)
    try { const config = await api.customerResearchModels(); setOptions(config.options); setProvider(config.defaultProvider) }
    catch (reason) { setError(reason instanceof Error ? reason.message : "加载可选模型失败") }
    finally { setBusy(false) }
  }
  const submit = async () => {
    if (!provider || !eligibleRows.length) return
    setBusy(true); setError(null); setMessage(null)
    try {
      const result = await api.processCustomerResearchBatch({ documentIds: eligibleRows.map((row) => row.documentId), provider })
      setMessage(`已受理 ${result.acceptedCount} 位客户。后台将按勾选顺序逐条调查，每完成一条立即保存结果。`)
      await Promise.all([onChanged(), reload()])
    } catch (reason) { setError(reason instanceof Error ? reason.message : "启动后台调查失败") }
    finally { setBusy(false) }
  }
  return <><Button size="sm" variant={action.variant || "secondary"} disabled={!selectedRows.length} onClick={() => void show()}>{action.label}</Button><Dialog open={open} title="调查所选客户" description="任务提交后可关闭窗口；后台一次只处理一位客户，并在处理下一位前保存本条结果。" width={620} onClose={() => !busy && setOpen(false)} footer={<><Button disabled={busy} onClick={() => setOpen(false)}>关闭</Button><Button variant="primary" disabled={busy || !provider || !eligibleRows.length || Boolean(message)} onClick={() => void submit()}>{busy ? "正在提交…" : "启动后台调查"}</Button></>}>
    <Alert variant="info">已选择 {selectedRows.length} 位客户，可调查 {eligibleRows.length} 位。{unavailableCount ? `另有 ${unavailableCount} 位正在调查或调查失败，本次不会提交。` : ""}</Alert>
    <FormField label="调查模型" hint="同一批次按勾选顺序使用此模型。"><Select value={provider} disabled={busy || !options.length || Boolean(message)} onChange={(event) => setProvider(event.target.value)}>{options.map((item) => <option value={item.provider} key={item.provider}>{item.label}</option>)}</Select></FormField>
    {error && <Alert variant="danger">{error}</Alert>}{message && <Alert variant="success">{message}</Alert>}
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

function parsedResearchResult(value: unknown): CustomerResearchResult | null {
  if (typeof value !== "string" || !value) return null
  try { return JSON.parse(value) as CustomerResearchResult } catch { return null }
}

function CustomerResearchHistory({ document }: ExtraTabPluginProps) {
  const runs = [...(document.detailTables.find((table) => table.tableId === "researchRuns")?.rows || [])].reverse()
  if (!runs.length) return <Alert variant="info">完成首次调查后，这里会保存每次调查的完整结果。</Alert>
  return <div className="customer-research-history">{runs.map((row) => {
    const result = parsedResearchResult(row.data.resultJson)
    const completed = row.data.status === "COMPLETED"
    return <Card key={row.id}><div className="panel-header"><div><h2>第 {String(row.data.runNumber || "?")} 次调查</h2><p>{String(row.data.provider || "未知供应商")} · {String(row.data.model || "未知模型")} · {String(row.data.completedAt || "未知时间")}</p></div><span>{completed ? "调查完成" : "调查失败"}</span></div>
      {completed ? <><p>{result?.companySummary || String(row.data.companySummary || "暂无公司简介")}</p><p>综合可信度：{String(result?.overallConfidence ?? row.data.overallConfidence ?? 0)}%　公开来源：{String(result?.sources.length ?? row.data.sourceCount ?? 0)} 个</p><details><summary>查看完整调查结果</summary><pre>{JSON.stringify(result || row.data.resultJson, null, 2)}</pre></details></> : <Alert variant="danger">{String(row.data.errorMessage || "未知失败原因")}</Alert>}
    </Card>
  })}</div>
}

function CustomerResearchNowAction({ action, row, onChanged, reload }: ListRowActionPluginProps) {
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState<Array<{ provider: string; model: string; label: string }>>([])
  const [defaultProvider, setDefaultProvider] = useState("")
  const [provider, setProvider] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [streamOutput, setStreamOutput] = useState("")
  const [reasoningOutput, setReasoningOutput] = useState("")
  const [searchOutput, setSearchOutput] = useState("")
  const [streamStatus, setStreamStatus] = useState("")
  const [completed, setCompleted] = useState(false)
  const show = async () => {
    setOpen(true); setBusy(true); setError(null); setStreamOutput(""); setReasoningOutput(""); setSearchOutput(""); setStreamStatus(""); setCompleted(false)
    try { const config = await api.customerResearchModels(); setOptions(config.options); setDefaultProvider(config.defaultProvider); setProvider(config.defaultProvider) }
    catch (reason) { setError(reason instanceof Error ? reason.message : "加载可选模型失败") }
    finally { setBusy(false) }
  }
  const submit = async () => {
    if (!provider) return
    setBusy(true); setError(null); setStreamOutput(""); setReasoningOutput(""); setSearchOutput(""); setStreamStatus("正在连接 Tavily…"); setCompleted(false)
    try {
      await api.streamCustomerResearch(row.documentId, { provider }, (event) => {
        if (event.type === "status") setStreamStatus(event.message)
        if (event.type === "delta") {
          setStreamStatus(event.kind === "search" ? "Tavily 正在查询公开信息…" : event.kind === "reasoning" ? "模型正在分析客户信息…" : "模型正在生成结构化调查报告…")
          if (event.kind === "search") setSearchOutput((current) => current + event.delta)
          else if (event.kind === "reasoning") setReasoningOutput((current) => current + event.delta)
          else setStreamOutput((current) => current + event.delta)
        }
        if (event.type === "complete") { setStreamStatus("调查完成，报告已保存。"); setCompleted(true) }
      })
    } catch (reason) { setError(reason instanceof Error ? reason.message : "调查失败") }
    finally { setBusy(false) }
  }
  const close = () => { if (busy) return; setOpen(false); void Promise.all([onChanged(), reload()]) }
  return <><button onClick={() => void show()}>{action.label}</button><Dialog open={open} title={`立即调查 ${row.code}`} description="选择本次调查使用的供应商和模型；模型返回内容会实时显示。" width={760} onClose={close} footer={<><Button disabled={busy} onClick={close}>{completed ? "关闭并刷新" : "取消"}</Button>{!completed && <Button variant="primary" disabled={busy || !provider} onClick={() => void submit()}>{busy ? "调查中…" : "开始调查"}</Button>}</>}>
    <FormField label="调查模型" hint="选项及顺序来自服务端 LLM_PROVIDER_ORDER。"><Select value={provider} disabled={busy || !options.length} onChange={(event) => setProvider(event.target.value)}>{options.map((item) => <option value={item.provider} key={item.provider}>{item.label}{item.provider === defaultProvider ? "（默认）" : ""}</option>)}</Select></FormField>
    {(busy || searchOutput) && <FormField label="实时联网查询" hint="Tavily 搜索关键词及命中来源"><Textarea value={searchOutput} readOnly rows={9} placeholder="等待 Tavily 开始搜索…" /></FormField>}
    {(busy || reasoningOutput) && <FormField label="模型实时分析" hint={streamStatus}><Textarea value={reasoningOutput} readOnly rows={8} placeholder="等待模型开始分析…" /></FormField>}
    {(busy || streamOutput) && <FormField label="结构化报告输出"><Textarea value={streamOutput} readOnly rows={12} placeholder="分析完成后将实时生成 JSON 报告…" /></FormField>}
    {error && <Alert variant="danger">{error}</Alert>}
  </Dialog></>
}

function CustomerResearchRetryAction({ action, row, onChanged, reload }: ListRowActionPluginProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const retry = async () => {
    setBusy(true); setError(null)
    try { await api.retryCustomerResearch(row.documentId); await Promise.all([onChanged(), reload()]) }
    catch (reason) { setError(reason instanceof Error ? reason.message : "重新加入失败") }
    finally { setBusy(false) }
  }
  return <><button disabled={busy} onClick={() => void retry()}>{busy ? "处理中…" : action.label}</button>{error && <span className="inline-error" title={error}>失败</span>}</>
}

let registered = false
export function registerCustomerResearchPlugins(): void {
  if (registered) return
  registered = true
  pluginRegistry.registerToolbarAction("customer-research-import", CustomerResearchImportAction)
  pluginRegistry.registerToolbarAction("customer-research-batch", CustomerResearchBatchAction)
  pluginRegistry.registerListRowAction("customer-research-now", CustomerResearchNowAction)
  pluginRegistry.registerListRowAction("customer-research-retry", CustomerResearchRetryAction)
  pluginRegistry.registerExtraTab("customer-research-report", CustomerResearchReport)
  pluginRegistry.registerExtraTab("customer-research-history", CustomerResearchHistory)
}
