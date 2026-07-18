import { useCallback, useEffect, useState } from "react"
import { Languages, Plus, RefreshCw, Search } from "lucide-react"
import type { DeclarationNameJob, DeclarationNameMapping, ListResponse } from "@zform/shared"
import { api } from "@/apis/framework-api"
import { Alert, Badge, Button, Card, CardContent, CardHeader, Dialog, EmptyState, FormField, Input, PageHeader, Pagination, Spinner, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Textarea } from "@/components/ui"

const emptyPage: ListResponse<DeclarationNameMapping> = { items: [], total: 0, page: 1, pageSize: 50, pageCount: 1 }
const percent = (value?: number) => value === undefined ? "—" : `${Math.round(value * 100)}%`

export function DeclarationNameReview() {
  const [data, setData] = useState(emptyPage)
  const [keyword, setKeyword] = useState("")
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ variant: "success" | "danger" | "info"; text: string } | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState("")
  const [nameEng, setNameEng] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [job, setJob] = useState<DeclarationNameJob | null>(null)
  const [editing, setEditing] = useState<DeclarationNameMapping | null>(null)
  const [declarationName, setDeclarationName] = useState("")
  const [declarationNameEng, setDeclarationNameEng] = useState("")
  const [rejecting, setRejecting] = useState<DeclarationNameMapping | null>(null)
  const [rejectReason, setRejectReason] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    try { setData(await api.declarationNameReviews({ keyword: keyword || undefined, page, pageSize: 50 })) }
    catch (error) { setMessage({ variant: "danger", text: error instanceof Error ? error.message : "加载失败" }) }
    finally { setLoading(false) }
  }, [keyword, page])
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!job || !["PENDING", "RUNNING"].includes(job.status)) return
    const timer = window.setInterval(() => { void api.declarationNameJob(job.id).then((next) => {
      setJob(next)
      if (["COMPLETED", "FAILED"].includes(next.status)) { setMessage({ variant: next.status === "COMPLETED" ? "success" : "danger", text: `生成任务已结束：成功 ${next.successCount}，待复核 ${next.reviewCount}，失败 ${next.failedCount}` }); void load() }
    }).catch((error: unknown) => setMessage({ variant: "danger", text: error instanceof Error ? error.message : "任务查询失败" })) }, 1200)
    return () => window.clearInterval(timer)
  }, [job, load])

  const create = async () => {
    setSubmitting(true); setMessage(null)
    try {
      const result = await api.resolveDeclarationNames({ items: [{ name, nameEng }], createMissing: true })
      setCreateOpen(false); setName(""); setNameEng("")
      if (result.jobId) setJob(await api.declarationNameJob(result.jobId))
      else setMessage({ variant: "info", text: `已命中现有映射：${result.items[0]?.status || "未知状态"}` })
      await load()
    } catch (error) { setMessage({ variant: "danger", text: error instanceof Error ? error.message : "创建失败" }) }
    finally { setSubmitting(false) }
  }
  const approve = async (writeback: boolean) => {
    if (!editing) return
    setSubmitting(true)
    try {
      const approved = await api.approveDeclarationName(editing.id, { declarationName, customsDeclarationNameEng: declarationNameEng })
      let text = "映射已审核通过。"
      if (writeback) { const result = await api.writebackDeclarationNames({ mappingIds: [approved.id] }); text = `审核并回写完成：发货明细 ${result.shipmentItemsAffected} 条，报关明细 ${result.declarationItemsAffected} 条。` }
      setEditing(null); setMessage({ variant: "success", text }); await load()
    }
    catch (error) { setMessage({ variant: "danger", text: error instanceof Error ? error.message : "审核失败" }) }
    finally { setSubmitting(false) }
  }
  const reject = async () => {
    if (!rejecting) return
    setSubmitting(true)
    try { await api.rejectDeclarationName(rejecting.id, { reason: rejectReason }); setRejecting(null); setRejectReason(""); setMessage({ variant: "success", text: "映射已驳回。" }); await load() }
    catch (error) { setMessage({ variant: "danger", text: error instanceof Error ? error.message : "驳回失败" }) }
    finally { setSubmitting(false) }
  }
  const beginApprove = (item: DeclarationNameMapping) => { setEditing(item); setDeclarationName(item.declarationName || ""); setDeclarationNameEng(item.customsDeclarationNameEng || "") }

  return <div className="declaration-name-page">
    <PageHeader eyebrow="AI STANDARDIZATION" title="报关名称审核" description="按中英文销售名去重生成标准映射，敏感和低置信结果由人工复核后再显式回写。" actions={<><Button onClick={() => void load()}><RefreshCw />刷新</Button><Button variant="primary" onClick={() => setCreateOpen(true)}><Plus />新增生成</Button></>} />
    {message && <Alert variant={message.variant}>{message.text}</Alert>}
    {job && ["PENDING", "RUNNING"].includes(job.status) && <Alert variant="info" title="模型任务运行中"><Spinner label={`正在处理 ${job.inputCount} 条映射`} /></Alert>}
    <Card className="declaration-review-card"><CardHeader><div className="declaration-review-toolbar"><div className="declaration-search"><Search /><Input value={keyword} placeholder="搜索商品名或复核原因" onChange={(event) => { setKeyword(event.target.value); setPage(1) }} /></div></div></CardHeader><CardContent>
      {loading ? <div className="management-loading"><Spinner /></div> : data.items.length === 0 ? <EmptyState icon={<Languages />} title="暂无待复核映射" description="新增商品名称后，风险项和低置信结果会出现在这里。" /> : <Table><TableHeader><TableRow><TableHead>销售名称</TableHead><TableHead>模型建议</TableHead><TableHead>置信度</TableHead><TableHead>复核原因</TableHead><TableHead>操作</TableHead></TableRow></TableHeader><TableBody>{data.items.map((item) => <TableRow key={item.id}>
        <TableCell><strong>{item.name}</strong><small>{item.nameEng}</small></TableCell><TableCell><strong>{item.declarationName || "—"}</strong><small>{item.customsDeclarationNameEng || "—"}</small></TableCell>
        <TableCell><Badge variant={(item.confidence || 0) >= 0.9 ? "success" : "warning"}>{percent(item.confidence)}</Badge></TableCell><TableCell className="declaration-reason">{item.reviewReason || "模型建议复核"}</TableCell>
        <TableCell><div className="declaration-actions"><Button size="sm" variant="success" onClick={() => beginApprove(item)}>审核通过</Button><Button size="sm" variant="danger" onClick={() => setRejecting(item)}>驳回</Button></div></TableCell>
      </TableRow>)}</TableBody></Table>}
    </CardContent><Pagination page={data.page} pageCount={data.pageCount} total={data.total} pageSize={data.pageSize} onPageChange={setPage} /></Card>
    <Dialog open={createOpen} title="生成报关名称" description="中英文销售名会作为一个组合键查询；缺失时创建模型任务。" onClose={() => setCreateOpen(false)} footer={<><Button onClick={() => setCreateOpen(false)}>取消</Button><Button variant="primary" loading={submitting} disabled={!name.trim() || !nameEng.trim()} onClick={() => void create()}>开始生成</Button></>}><div className="declaration-form"><FormField label="中文销售名" required><Input value={name} maxLength={255} onChange={(event) => setName(event.target.value)} /></FormField><FormField label="英文销售名" required><Input value={nameEng} maxLength={255} onChange={(event) => setNameEng(event.target.value)} /></FormField></div></Dialog>
    <Dialog open={Boolean(editing)} title="审核报关名称" description={editing ? `${editing.name} / ${editing.nameEng}` : undefined} onClose={() => setEditing(null)} footer={<><Button onClick={() => setEditing(null)}>取消</Button><Button variant="success" loading={submitting} disabled={!declarationName.trim() || !declarationNameEng.trim()} onClick={() => void approve(false)}>仅审核通过</Button><Button variant="primary" loading={submitting} disabled={!declarationName.trim() || !declarationNameEng.trim()} onClick={() => void approve(true)}>通过并回写</Button></>}><div className="declaration-form"><FormField label="中文报关名" required><Input value={declarationName} maxLength={100} onChange={(event) => setDeclarationName(event.target.value)} /></FormField><FormField label="英文报关名" required hint="保存时自动转换为大写"><Input value={declarationNameEng} maxLength={100} onChange={(event) => setDeclarationNameEng(event.target.value)} /></FormField></div></Dialog>
    <Dialog open={Boolean(rejecting)} title="驳回映射" description="驳回原因会保留在审计日志中。" onClose={() => setRejecting(null)} footer={<><Button onClick={() => setRejecting(null)}>取消</Button><Button variant="danger" loading={submitting} disabled={!rejectReason.trim()} onClick={() => void reject()}>确认驳回</Button></>}><FormField label="驳回原因" required><Textarea value={rejectReason} maxLength={500} onChange={(event) => setRejectReason(event.target.value)} /></FormField></Dialog>
  </div>
}
