import { useEffect, useMemo, useState } from "react"
import { ACTION_LABELS, evaluateCondition, isModeReadOnly, type ActivityRecord, type DetailRowData, type DetailTableData, type DocumentRecord, type DocumentSchema, type FieldSchema, type FormActionDefinition, type FormMode, type ImpactAssessment, type TraceGraph } from "@zform/shared"
import { AlertTriangle, ArrowLeft, Check, ChevronRight, FileClock, GitBranch, Link2, LoaderCircle, Save, Trash2, X } from "lucide-react"
import { api } from "@/apis/framework-api"
import { FieldRenderer } from "@/components/field-renderer"
import { StatusPill, formatDate } from "@/components/status-pill"
import { Button, IconButton, Tabs, type ButtonVariant } from "@/components/ui"
import { pluginRegistry, renderExtraTab } from "@/core/plugin-registry"
import { useSchemaEffects } from "@/hooks/use-schema-effects"

interface EditorProps { documentId: string; schemas: DocumentSchema[]; onBack: () => void; onOpen: (document: DocumentRecord) => void; onChanged: () => Promise<void>; onDirtyChange?: (dirty: boolean) => void }

function fallbackActions(schema: DocumentSchema, document: DocumentRecord): FormActionDefinition[] {
  return (schema.actions?.[document.status] || []).map((action, index) => ({ id: action, label: ACTION_LABELS[action], command: "workflow", workflowAction: action, order: 20 + index }))
}

function actionVariant(action: FormActionDefinition): ButtonVariant {
  if (action.variant === "success") return "success"
  if (action.variant === "danger") return "danger"
  if (action.variant === "secondary") return "secondary"
  return "primary"
}

export function DocumentEditor({ documentId, schemas, onBack, onOpen, onChanged, onDirtyChange }: EditorProps) {
  const [document, setDocument] = useState<DocumentRecord | null>(null)
  const [masterData, setMasterData] = useState<Record<string, unknown>>({})
  const [detailTables, setDetailTables] = useState<DetailTableData[]>([])
  const [activities, setActivities] = useState<ActivityRecord[]>([])
  const [trace, setTrace] = useState<TraceGraph>({ downstream: [] })
  const [impact, setImpact] = useState<ImpactAssessment | null>(null)
  const [tab, setTab] = useState("form")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const schema = useMemo(() => schemas.find((item) => item.typeId === document?.typeId), [document?.typeId, schemas])
  const mode: FormMode = document?.status === "DRAFT" || document?.status === "REJECTED" ? "edit" : "view"

  useEffect(() => {
    Promise.all([api.document(documentId), api.activities(documentId), api.trace(documentId)])
      .then(([data, activityData, traceData]) => { setDocument(data); setMasterData(data.masterData); setDetailTables(data.detailTables); setActivities(activityData); setTrace(traceData) })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "加载失败"))
  }, [documentId])

  useEffect(() => {
    const dirty = Boolean(document && mode !== "view" && (JSON.stringify(masterData) !== JSON.stringify(document.masterData) || JSON.stringify(detailTables) !== JSON.stringify(document.detailTables)))
    onDirtyChange?.(dirty)
  }, [detailTables, document, masterData, mode, onDirtyChange])

  const updateField = (fieldId: string, value: unknown) => setMasterData((current) => ({ ...current, [fieldId]: value }))
  const rowsFor = (tableId: string) => detailTables.find((table) => table.tableId === tableId)?.rows || []
  const setRows = (tableId: string, rows: DetailRowData[]) => setDetailTables((tables) => [...tables.filter((table) => table.tableId !== tableId), { tableId, rows }])
  const setPluginRows = (tableId: string, rows: Array<Record<string, unknown>>) => setRows(tableId, [...rowsFor(tableId), ...rows.map((data) => ({ id: crypto.randomUUID(), data }))])
  const updateRow = (tableId: string, rowId: string, fieldId: string, value: unknown) => setRows(tableId, rowsFor(tableId).map((row) => row.id === rowId ? { ...row, data: { ...row.data, [fieldId]: value } } : row))

  useSchemaEffects({ effects: schema?.effects || [], mode, data: masterData, detailTables, setField: updateField, setDetailRows: setPluginRows })

  const groupedFields = useMemo(() => {
    const groups = new Map<string, FieldSchema[]>()
    schema?.masterFields.filter((field) => field.id !== "status" && evaluateCondition(field.visibleWhen, masterData)).forEach((field) => {
      const group = field.group || "其他"
      groups.set(group, [...(groups.get(group) || []), field])
    })
    return [...groups.entries()]
  }, [masterData, schema])

  const visibleActions = useMemo(() => {
    if (!document || !schema) return []
    const configured = schema.formActions || fallbackActions(schema, document)
    return configured.filter((action) => (!action.allowedStatuses || action.allowedStatuses.includes(document.status)) && (!action.modes || action.modes.includes(mode)) && evaluateCondition(action.visibleWhen, masterData)).sort((left, right) => (left.order || 100) - (right.order || 100))
  }, [document, masterData, mode, schema])

  const refreshDocument = async (updated: DocumentRecord) => {
    setDocument(updated); setMasterData(updated.masterData); setDetailTables(updated.detailTables)
    const [activityData, traceData] = await Promise.all([api.activities(updated.id), api.trace(updated.id)])
    setActivities(activityData); setTrace(traceData); await onChanged()
  }
  const run = async (operation: () => Promise<DocumentRecord>) => {
    setBusy(true); setError(null); setImpact(null)
    try { await refreshDocument(await operation()) }
    catch (reason) { setError(reason instanceof Error ? reason.message : "操作失败") }
    finally { setBusy(false) }
  }

  const save = async () => {
    if (!document) return
    setBusy(true); setError(null)
    try {
      const assessment = await api.impact(document.id, masterData)
      setImpact(assessment.items.length ? assessment : null)
      if (!assessment.canProceed) { setError(assessment.summary); return }
      if (assessment.items.length && !window.confirm(`${assessment.summary}，是否继续保存？`)) return
      await refreshDocument(await api.update(document.id, { masterData, detailTables, version: document.version }))
    } catch (reason) { setError(reason instanceof Error ? reason.message : "保存失败") }
    finally { setBusy(false) }
  }

  const executeAction = async (action: FormActionDefinition) => {
    if (!document || (action.confirmation && !window.confirm(action.confirmation))) return
    if (action.command === "save") { await save(); return }
    if (action.command === "workflow" && action.workflowAction) { await run(() => api.action(document.id, action.workflowAction!, action.workflowAction === "reject" ? "请修改后重新提交" : undefined)); return }
    if (action.command === "pushDown" && action.targetTypeId) { await pushDown(action.targetTypeId); return }
    setError(`自定义操作“${action.command}”尚未注册执行器。`)
  }

  const pushDown = async (targetTypeId: string) => {
    if (!document) return
    setBusy(true); setError(null)
    try { const target = await api.pushDown(document.id, targetTypeId); await onChanged(); onOpen(target) }
    catch (reason) { setError(reason instanceof Error ? reason.message : "下推失败") }
    finally { setBusy(false) }
  }

  if (!document || !schema) return <div className="editor-loading">{error ? <p>{error}</p> : <><LoaderCircle className="spin" /><p>正在打开单据...</p></>}</div>

  return <>
    <div className="editor-heading"><IconButton aria-label="返回" onClick={onBack}><ArrowLeft /></IconButton><div><div className="editor-title"><h1>{document.code}</h1><StatusPill status={document.status} /></div><p>{schema.typeName} · 创建于 {formatDate(document.createdAt, true)} · V{document.version}</p></div><div className="heading-actions"><Button onClick={onBack}>返回列表</Button>{visibleActions.map((action) => <Button key={action.id} variant={actionVariant(action)} onClick={() => executeAction(action)} disabled={busy || Boolean(action.disabledWhen && evaluateCondition(action.disabledWhen, masterData))}>{action.command === "save" && <Save size={16} />}{action.variant === "success" && <Check size={16} />}{action.variant === "danger" && <X size={16} />}{action.label}</Button>)}</div></div>
    {error && <div className="inline-error editor-error">{error}<button onClick={() => setError(null)}><X /></button></div>}
    {impact && <div className={`impact-banner ${impact.canProceed ? "warning" : "critical"}`}><AlertTriangle /><div><strong>{impact.summary}</strong>{impact.items.map((item) => <p key={`${item.ruleId}-${item.field}`}>{item.message}（{item.downstreamDocuments.map((doc) => doc.code).join("、")}）</p>)}</div></div>}
    <Tabs className="editor-tabs" value={tab} onChange={setTab} items={[{ id: "form", label: "单据内容" }, { id: "trace", label: <><GitBranch />来源与下推</> }, { id: "history", label: <><FileClock />操作记录 <span>{activities.length}</span></> }, ...(schema.extraTabs || []).map((extraTab) => ({ id: `extra:${extraTab.id}`, label: extraTab.label }))]} />

    {tab === "form" && <div className="editor-body"><div className="form-column">{groupedFields.map(([group, fields]) => <article className="form-section" key={group}><div className="section-title"><span /><h2>{group}</h2></div><div className="field-grid">{fields.map((field) => { const required = field.required || Boolean(field.requiredWhen && evaluateCondition(field.requiredWhen, masterData)); const readOnly = isModeReadOnly(field.readOnly, field.readOnlyModes, mode) || Boolean(field.readOnlyWhen && evaluateCondition(field.readOnlyWhen, masterData)); return <label className={field.span === 2 || field.type === "textarea" ? "field span-2" : "field"} key={field.id}><span>{field.label}{required && <i>*</i>}</span><FieldRenderer field={field} data={masterData} mode={mode} disabled={readOnly} onChange={updateField} />{field.helpText && <small>{field.helpText}</small>}</label> })}</div></article>)}
      {schema.detailTables.filter((table) => evaluateCondition(table.visibleWhen, masterData)).map((table) => { const rows = rowsFor(table.id); const Selector = table.rowSelector ? pluginRegistry.getRowSelector(table.rowSelector.pluginId) : undefined; return <article className="form-section detail-section" key={table.id}><div className="section-title"><span /><h2>{table.label}</h2><em>共 {rows.length} 行</em>{mode !== "view" && (Selector && table.rowSelector ? <Selector definition={table.rowSelector} fields={table.fields} onSelect={(selectedRows) => setPluginRows(table.id, selectedRows)} /> : <button className="secondary-button small-button" onClick={() => setPluginRows(table.id, [Object.fromEntries(table.fields.filter((field) => field.defaultValue !== undefined).map((field) => [field.id, field.defaultValue]))])}>+ 添加一行</button>)}</div><div className="detail-table"><div className="detail-row detail-head" style={{ gridTemplateColumns: `28px repeat(${table.fields.length}, minmax(110px, 1fr)) 30px` }}><b>#</b>{table.fields.map((field) => <span key={field.id}>{field.label}{field.required && " *"}</span>)}<b /></div>{rows.map((row, rowIndex) => <div className="detail-row" style={{ gridTemplateColumns: `28px repeat(${table.fields.length}, minmax(110px, 1fr)) 30px` }} key={row.id}><b title={row.sourceRef ? `来源：${row.sourceRef.code}/${row.sourceRef.rowId}` : undefined}>{row.sourceRef ? <Link2 /> : rowIndex + 1}</b>{table.fields.map((field) => evaluateCondition(field.visibleWhen, row.data) ? <FieldRenderer key={field.id} field={field} data={row.data} mode={mode} onChange={(fieldId, value) => updateRow(table.id, row.id, fieldId, value)} /> : <span key={field.id} />)}{mode !== "view" && <button className="row-delete" onClick={() => setRows(table.id, rows.filter((item) => item.id !== row.id))}><Trash2 /></button>}</div>)}</div>{rows.length === 0 && <div className="detail-empty">暂无明细</div>}</article> })}</div>
      <aside className="summary-column"><article className="summary-card"><h3>单据信息</h3><dl><div><dt>当前状态</dt><dd><StatusPill status={document.status} /></dd></div><div><dt>表单模式</dt><dd>{mode}</dd></div><div><dt>创建人</dt><dd>{document.createdBy}</dd></div><div><dt>最后更新</dt><dd>{formatDate(document.updatedAt, true)}</dd></div><div><dt>数据版本</dt><dd>V{document.version}</dd></div></dl></article></aside></div>}

    {tab === "trace" && <div className="trace-view"><article className="panel"><div className="panel-header"><div><h2>单据关系</h2><p>整单和明细行均保留来源信息</p></div></div><div className="trace-line">{trace.upstream ? <div className="trace-node source"><span>上游来源</span><strong>{trace.upstream.code}</strong><small>{schemas.find((item) => item.typeId === trace.upstream?.typeId)?.typeName}</small></div> : <div className="trace-node empty"><span>上游来源</span><strong>业务起点</strong><small>没有来源单据</small></div>}<ChevronRight /><div className="trace-node current"><span>当前单据</span><strong>{document.code}</strong><small>{schema.typeName}</small></div>{schema.pushDownRules?.map((rule) => <div className="trace-target" key={rule.id}><ChevronRight /><button className="trace-node" disabled={busy || Boolean(rule.allowedStatuses && !rule.allowedStatuses.includes(document.status))} onClick={() => pushDown(rule.targetTypeId)}><span>可下推</span><strong>{rule.label}</strong><small>{schemas.find((item) => item.typeId === rule.targetTypeId)?.typeName}</small></button></div>)}</div>{trace.downstream.length > 0 && <div className="downstream-list"><strong>已生成下游</strong>{trace.downstream.map((item) => <span key={item.documentId}>{item.code}</span>)}</div>}</article></div>}
    {tab === "history" && <div className="history-view panel"><div className="panel-header"><div><h2>操作记录</h2><p>记录单据从创建到完成的全部动作</p></div></div><div className="timeline">{activities.map((activity) => <div key={activity.id}><i /><span>{activity.operator.slice(0, 1)}</span><p><strong>{activity.message}</strong><small>{activity.operator} · {formatDate(activity.createdAt, true)}</small></p></div>)}</div></div>}
    {schema.extraTabs?.map((extraTab) => tab === `extra:${extraTab.id}` ? <div key={extraTab.id}>{renderExtraTab(extraTab.pluginId, { document, schema, params: extraTab.params })}</div> : null)}
  </>
}
