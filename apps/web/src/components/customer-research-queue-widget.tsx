import { useCallback, useEffect, useRef, useState } from "react"
import { CirclePause, FileSpreadsheet, Play, RefreshCw, SearchCheck } from "lucide-react"
import type { CustomerResearchQueueSummary } from "@zform/shared"
import { api } from "@/apis/framework-api"
import { Alert, Button, Card } from "@/components/ui"

const empty: CustomerResearchQueueSummary = { pending: 0, researching: 0, completed: 0, failed: 0, total: 0 }
export function CustomerResearchQueueWidget({ onOpenList }: { onOpenList: (typeId: string) => void }) {
  const [summary, setSummary] = useState(empty); const [running, setRunning] = useState(false); const [error, setError] = useState<string | null>(null); const keepRunning = useRef(false)
  const refresh = useCallback(async () => { try { setSummary(await api.customerResearchSummary()); setError(null) } catch (reason) { setError(reason instanceof Error ? reason.message : "队列加载失败") } }, [])
  useEffect(() => { void refresh(); const timer = window.setInterval(refresh, running ? 1500 : 6000); return () => window.clearInterval(timer) }, [refresh, running])
  const start = async () => {
    if (running) return; keepRunning.current = true; setRunning(true); setError(null)
    try {
      while (keepRunning.current) {
        const result = await api.processNextCustomerResearch(); await refresh()
        if (result.status === "empty") break
        if (result.status === "failed") { setError(`${String(result.document.masterData.companyName || result.document.code)}：${result.error}`); break }
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "调查队列中断") }
    finally { keepRunning.current = false; setRunning(false); await refresh() }
  }
  const settled = summary.completed + summary.failed; const progress = summary.total ? Math.round(settled / summary.total * 100) : 0
  return <Card className="span-2 customer-research-queue"><div className="panel-header"><div><h2>客户背景调查</h2><p>逐条联网核验客户并保存结构化结论</p></div><div className="research-queue-actions"><Button onClick={() => onOpenList("customer_due_diligence")}><FileSpreadsheet size={16} />客户与报告</Button>{running ? <Button onClick={() => { keepRunning.current = false }}><CirclePause size={16} />当前完成后暂停</Button> : <Button variant="primary" disabled={!summary.pending} onClick={start}><Play size={16} />开始调查</Button>}<Button onClick={refresh} aria-label="刷新"><RefreshCw size={16} /></Button></div></div>
    {error && <Alert variant="danger">{error}</Alert>}
    <div className="research-queue-body"><div className="research-current"><SearchCheck /><div><small>当前客户</small><strong>{summary.current?.companyName || (running ? "正在领取下一位客户…" : "暂无正在执行的调查")}</strong><span>{summary.current?.code || `总体进度 ${progress}%`}</span></div></div><div className="research-queue-stats"><div><strong>{summary.total}</strong><span>客户总数</span></div><div><strong>{summary.pending}</strong><span>等待调查</span></div><div><strong>{summary.completed}</strong><span>已完成</span></div><div><strong>{summary.failed}</strong><span>需重试</span></div></div></div><div className="research-progress"><i style={{ width: `${progress}%` }} /></div>
  </Card>
}
