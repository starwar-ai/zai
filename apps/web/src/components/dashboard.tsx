import { ArrowRight, CheckCircle2, CircleDollarSign, Clock3, FileStack, MoreHorizontal, TrendingUp } from "lucide-react"
import type { DashboardData, DashboardWidgetId, DocumentRecord, DocumentSchema } from "@zform/shared"
import { StatusPill, formatDate } from "@/components/status-pill"
import { Button, Card, PageHeader } from "@/components/ui"

interface DashboardProps {
  data: DashboardData
  schemas: DocumentSchema[]
  onOpenDocument: (document: DocumentRecord) => void
  onOpenList: (typeId: string) => void
  visibleWidgets: DashboardWidgetId[]
}

export function Dashboard({ data, schemas, onOpenDocument, onOpenList, visibleWidgets }: DashboardProps) {
  const metrics = [
    { label: "全部单据", value: data.totalDocuments, note: "覆盖 4 个业务模块", icon: FileStack, tone: "teal" },
    { label: "待我审批", value: data.pendingApprovals, note: "请及时处理流程", icon: Clock3, tone: "amber" },
    { label: "执行中", value: data.inProgress, note: "业务履约进行中", icon: TrendingUp, tone: "blue" },
    { label: "本月完成", value: data.completedThisMonth, note: "流程已闭环", icon: CheckCircle2, tone: "green" },
  ]
  const maxCount = Math.max(...data.typeCounts.map((item) => item.count), 1)

  return <>
    <PageHeader compact={false} eyebrow="2026 年 7 月 18 日 · 星期六" title="早上好，林默" description={<>这里是今天的业务概览，有 <strong>{data.pendingApprovals}</strong> 项审批等待处理。</>} actions={<Button variant="primary"><CircleDollarSign size={17} />查看经营分析</Button>} />
    {visibleWidgets.includes("metrics") && <div className="metric-grid">{metrics.map(({ label, value, note, icon: Icon, tone }) => <article className="metric-card" key={label}><div className={`metric-icon ${tone}`}><Icon /></div><div><p>{label}</p><strong>{String(value).padStart(2, "0")}</strong><span>{note}</span></div><MoreHorizontal className="card-more" /></article>)}</div>}
    <div className="dashboard-grid">
      {visibleWidgets.includes("recent-documents") && <Card className="span-2"><div className="panel-header"><div><h2>最近单据</h2><p>跨业务模块的最新进展</p></div><button className="text-button" onClick={() => onOpenList(schemas[0]?.typeId)}>查看全部 <ArrowRight /></button></div>
        <div className="data-table"><div className="table-row table-head"><span>单据编号</span><span>业务类型</span><span>往来单位 / 主题</span><span>状态</span><span>更新时间</span></div>
          {data.recentDocuments.map((document) => { const schema = schemas.find((item) => item.typeId === document.typeId); const subject = String(document.masterData.customerName || document.masterData.planName || document.masterData.supplierName || "—"); return <button className="table-row" key={document.id} onClick={() => onOpenDocument(document)}><strong>{document.code}</strong><span>{schema?.typeName}</span><span className="truncate">{subject}</span><StatusPill status={document.status} /><span>{formatDate(document.updatedAt)}</span></button> })}
        </div>
      </Card>}
      {visibleWidgets.includes("business-distribution") && <Card><div className="panel-header"><div><h2>业务分布</h2><p>各类单据当前数量</p></div></div><div className="distribution-list">{data.typeCounts.map((item, index) => <button key={item.typeId} onClick={() => onOpenList(item.typeId)}><span className={`dot dot-${index + 1}`} /><div><p><strong>{item.typeName}</strong><b>{item.count}</b></p><div className="progress"><i style={{ width: `${Math.max((item.count / maxCount) * 100, 8)}%` }} /></div></div></button>)}</div></Card>}
      {visibleWidgets.includes("business-flow") && <Card className="span-2"><div className="panel-header"><div><h2>业务链路</h2><p>从客户需求到仓库收货的可追溯流程</p></div></div><div className="process-flow">{schemas.map((schema, index) => <div key={schema.typeId}><button onClick={() => onOpenList(schema.typeId)}><span>0{index + 1}</span><strong>{schema.typeName}</strong><small>{data.typeCounts.find((item) => item.typeId === schema.typeId)?.count || 0} 张单据</small></button>{index < schemas.length - 1 && <ArrowRight />}</div>)}</div></Card>}
      {visibleWidgets.includes("recent-activities") && <Card><div className="panel-header"><div><h2>最近动态</h2><p>团队业务操作记录</p></div></div><div className="activity-list">{data.recentActivities.slice(0, 5).map((activity) => <div key={activity.id}><span className="activity-avatar">{activity.operator.slice(0, 1)}</span><p><strong>{activity.operator}</strong><span>{activity.message}</span><small>{formatDate(activity.createdAt, true)}</small></p></div>)}</div></Card>}
    </div>
  </>
}
