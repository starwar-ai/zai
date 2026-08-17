import { useEffect, useMemo, useState } from "react"
import { ACTION_LABELS, evaluateCondition, isModeReadOnly, type ActivityRecord, type DetailRowData, type DetailTableData, type DetailTableSchema, type DocumentRecord, type DocumentSchema, type FieldSchema, type FormActionDefinition, type FormMode, type ImpactAssessment, type RowSourceReference, type TraceGraph } from "@zform/shared"
import { AlertTriangle, Check, ChevronRight, FileText, LoaderCircle, PanelRightClose, PanelRightOpen, Save, X } from "lucide-react"
import { api } from "@/apis/framework-api"
import { DocumentDetailTable } from "@/components/document-detail-table"
import { FieldRenderer } from "@/components/field-renderer"
import { StatusPill, formatDate } from "@/components/status-pill"
import { Button, ConfirmDialog, IconButton, Tabs, type ButtonVariant } from "@/components/ui"
import { pluginRegistry, renderExtraTab } from "@/core/plugin-registry"
import { useSchemaEffects } from "@/hooks/use-schema-effects"
import { queryClient } from "@/lib/query-client"
import { createClientId } from "@/lib/client-id"

interface EditorDraft { typeId: string; sourceId?: string }
interface EditorProps { documentId?: string; draft?: EditorDraft; schemas: DocumentSchema[]; onBack: () => void; onOpen: (document: DocumentRecord) => void; onOpenSource: (document: DocumentRecord, highlightedRowId?: string) => void; onCreated: (document: DocumentRecord) => void; onChanged: () => Promise<void>; onDirtyChange?: (dirty: boolean) => void; highlightedRowId?: string }
interface ConfirmationRequest { description: string; destructive?: boolean; action: () => Promise<void> }

function fallbackActions(schema: DocumentSchema, document: DocumentRecord): FormActionDefinition[] {
  return (schema.actions?.[document.status] || []).map((action, index) => ({ id: action, label: ACTION_LABELS[action], command: "workflow", workflowAction: action, order: 20 + index }))
}

function actionVariant(action: FormActionDefinition): ButtonVariant {
  if (action.variant === "success") return "success"
  if (action.variant === "danger") return "danger"
  if (action.variant === "secondary") return "secondary"
  return "primary"
}

function defaultMasterData(schema: DocumentSchema): Record<string, unknown> {
  return Object.fromEntries(schema.masterFields.filter((field) => field.defaultValue !== undefined).map((field) => [field.id, field.defaultValue]))
}

function emptyDetailTables(schema: DocumentSchema): DetailTableData[] {
  return schema.detailTables.map((table) => ({ tableId: table.id, rows: [] }))
}

function copyDetailTables(tables: DetailTableData[]): DetailTableData[] {
  return tables.map((table) => ({ tableId: table.tableId, rows: table.rows.map((row) => ({ id: createClientId(), data: { ...row.data } })) }))
}

function DetailRowSelector({ table, onSelect }: { table: DetailTableSchema; onSelect: (rows: Array<Record<string, unknown>>) => void }) {
  const [open, setOpen] = useState(false)
  if (!table.rowSelector) return <button className="secondary-button small-button" onClick={() => onSelect([Object.fromEntries(table.fields.filter((field) => field.defaultValue !== undefined).map((field) => [field.id, field.defaultValue]))])}>+ 添加一行</button>
  const Selector = pluginRegistry.getRowSelector(table.rowSelector.pluginId)
  if (!Selector) return <button className="secondary-button small-button" disabled>选择器未注册</button>
  return <><button className="secondary-button small-button" onClick={() => setOpen(true)}>+ {table.rowSelector.buttonLabel || "添加明细"}</button><Selector definition={table.rowSelector} fields={table.fields} open={open} onOpenChange={setOpen} onSelect={(rows) => { onSelect(rows); setOpen(false) }} /></>
}

export function DocumentEditor({ documentId, draft, schemas, onOpen, onOpenSource, onCreated, onChanged, onDirtyChange, highlightedRowId }: EditorProps) {
  const [document, setDocument] = useState<DocumentRecord | null>(null)
  const [masterData, setMasterData] = useState<Record<string, unknown>>({})
  const [detailTables, setDetailTables] = useState<DetailTableData[]>([])
  const [activities, setActivities] = useState<ActivityRecord[]>([])
  const [trace, setTrace] = useState<TraceGraph>({ downstream: [] })
  const [impact, setImpact] = useState<ImpactAssessment | null>(null)
  const [contentTab, setContentTab] = useState("master")
  const [sideTab, setSideTab] = useState("trace")
  const [sidePanelCollapsed, setSidePanelCollapsed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState<ConfirmationRequest | null>(null)
  const [baseline, setBaseline] = useState("")
  const schema = useMemo(() => schemas.find((item) => item.typeId === (document?.typeId || draft?.typeId)), [document?.typeId, draft?.typeId, schemas])
  const mode: FormMode = draft ? (draft.sourceId ? "copy" : "create") : document?.status === "DRAFT" || document?.status === "REJECTED" ? "edit" : "view"

  useEffect(() => {
    if (documentId) {
      Promise.all([api.document(documentId), api.activities(documentId), api.trace(documentId)])
        .then(([data, activityData, traceData]) => { setDocument(data); setMasterData(data.masterData); setDetailTables(data.detailTables); setBaseline(JSON.stringify({ masterData: data.masterData, detailTables: data.detailTables })); setActivities(activityData); setTrace(traceData) })
        .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "加载失败"))
      return
    }
    if (!draft || !schema) return
    if (draft.sourceId) {
      api.document(draft.sourceId).then((source) => { const nextMaster = { ...source.masterData, status: "DRAFT" }; const nextDetails = copyDetailTables(source.detailTables); setMasterData(nextMaster); setDetailTables(nextDetails); setBaseline(JSON.stringify({ masterData: nextMaster, detailTables: nextDetails })) }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "加载复制来源失败"))
    } else {
      const nextMaster = defaultMasterData(schema); const nextDetails = emptyDetailTables(schema)
      setMasterData(nextMaster); setDetailTables(nextDetails); setBaseline(JSON.stringify({ masterData: nextMaster, detailTables: nextDetails }))
    }
  }, [documentId, draft?.sourceId, draft?.typeId, schema])

  useEffect(() => {
    const dirty = mode !== "view" && Boolean(baseline) && JSON.stringify({ masterData, detailTables }) !== baseline
    onDirtyChange?.(dirty)
  }, [baseline, detailTables, masterData, mode, onDirtyChange])

  const updateField = (fieldId: string, value: unknown) => setMasterData((current) => ({ ...current, [fieldId]: value }))
  const rowsFor = (tableId: string) => detailTables.find((table) => table.tableId === tableId)?.rows || []
  const setRows = (tableId: string, rows: DetailRowData[]) => setDetailTables((tables) => [...tables.filter((table) => table.tableId !== tableId), { tableId, rows }])
  const setPluginRows = (tableId: string, rows: Array<Record<string, unknown>>) => setRows(tableId, [...rowsFor(tableId), ...rows.map((data) => ({ id: createClientId(), data }))])
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
  const visibleDetailTables = useMemo(() => schema?.detailTables.filter((table) => evaluateCondition(table.visibleWhen, masterData)) || [], [masterData, schema])
  useEffect(() => {
    const available = new Set(["master", ...visibleDetailTables.map((table) => table.id), ...(document ? (schema?.extraTabs || []).map((extraTab) => `extra:${extraTab.id}`) : [])])
    if (!available.has(contentTab)) setContentTab("master")
  }, [contentTab, document, schema?.extraTabs, visibleDetailTables])
  useEffect(() => {
    if (!highlightedRowId) return
    const target = detailTables.find((table) => table.rows.some((row) => row.id === highlightedRowId))
    if (target) setContentTab(target.tableId)
  }, [detailTables, highlightedRowId])

  const visibleActions = useMemo(() => {
    if (!schema) return []
    const status = document?.status || "DRAFT"
    const configured = schema.formActions || (document ? fallbackActions(schema, document) : [])
    return configured.filter((action) => (!action.allowedStatuses || action.allowedStatuses.includes(status)) && (!action.modes || action.modes.includes(mode)) && evaluateCondition(action.visibleWhen, masterData)).sort((left, right) => (left.order || 100) - (right.order || 100))
  }, [document, masterData, mode, schema])

  const refreshDocument = async (updated: DocumentRecord) => {
    void queryClient.invalidateQueries({ queryKey: ["documents", updated.typeId] })
    setDocument(updated); setMasterData(updated.masterData); setDetailTables(updated.detailTables)
    setBaseline(JSON.stringify({ masterData: updated.masterData, detailTables: updated.detailTables }))
    const [activityData, traceData] = await Promise.all([api.activities(updated.id), api.trace(updated.id)])
    setActivities(activityData); setTrace(traceData); await onChanged()
  }
  const run = async (operation: () => Promise<DocumentRecord>) => {
    setBusy(true); setError(null); setImpact(null)
    try { await refreshDocument(await operation()) }
    catch (reason) { setError(reason instanceof Error ? reason.message : "操作失败") }
    finally { setBusy(false) }
  }

  const save = async (impactConfirmed = false) => {
    if (!schema) return
    setBusy(true); setError(null)
    try {
      if (!document) {
        const created = await api.create({ typeId: schema.typeId, masterData, detailTables })
        void queryClient.invalidateQueries({ queryKey: ["documents", created.typeId] }); setBaseline(JSON.stringify({ masterData: created.masterData, detailTables: created.detailTables })); await onChanged(); onCreated(created); return
      }
      const assessment = await api.impact(document.id, masterData)
      setImpact(assessment.items.length ? assessment : null)
      if (!assessment.canProceed) { setError(assessment.summary); return }
      if (assessment.items.length && !impactConfirmed) { setConfirmation({ description: `${assessment.summary}，是否继续保存？`, action: () => save(true) }); return }
      await refreshDocument(await api.update(document.id, { masterData, detailTables, version: document.version }))
    } catch (reason) { setError(reason instanceof Error ? reason.message : "保存失败") }
    finally { setBusy(false) }
  }

  const executeAction = async (action: FormActionDefinition) => {
    if (action.confirmation) { setConfirmation({ description: action.confirmation, destructive: action.variant === "danger", action: () => executeAction({ ...action, confirmation: undefined }) }); return }
    if (action.command === "save") { await save(); return }
    if (!document && (action.command === "workflow" || action.command === "pushDown")) { setError("请先保存单据，再执行该操作。"); return }
    if (action.command === "workflow" && action.workflowAction && document) { await run(() => api.action(document.id, action.workflowAction!, action.workflowAction === "reject" ? "请修改后重新提交" : undefined)); return }
    if (action.command === "pushDown" && action.targetTypeId) { await pushDown(action.targetTypeId); return }
    if (action.command.startsWith("custom:") && schema) {
      const handler = pluginRegistry.getFormAction(action.command.slice("custom:".length))
      if (!handler) { setError(`自定义操作“${action.command}”尚未注册执行器。`); return }
      setBusy(true); setError(null)
      try { const result = await handler({ action, schema, document: document || undefined, mode, masterData, detailTables, setField: updateField, setDetailRows: setPluginRows }); if (result) await refreshDocument(result) }
      catch (reason) { setError(reason instanceof Error ? reason.message : "自定义操作失败") }
      finally { setBusy(false) }
    }
  }

  const pushDown = async (targetTypeId: string) => {
    if (!document) return
    setBusy(true); setError(null)
    try { const target = await api.pushDown(document.id, targetTypeId); await onChanged(); onOpen(target) }
    catch (reason) { setError(reason instanceof Error ? reason.message : "下推失败") }
    finally { setBusy(false) }
  }

  const openSource = async (source: RowSourceReference) => {
    setError(null)
    try { onOpenSource(await api.document(source.documentId), source.rowId) }
    catch (reason) { setError(reason instanceof Error ? reason.message : "来源单据无法打开") }
  }

  if (!schema || (!document && !draft)) return <div className="editor-loading">{error ? <p>{error}</p> : <><LoaderCircle className="spin" /><p>正在打开单据...</p></>}</div>

  const status = document?.status || "DRAFT"
  return <>
    <div className="editor-heading zform-document-heading"><div className="zform-document-title"><FileText /><h1>{schema.typeName}</h1><StatusPill status={status} label={schema.statusLabels?.[status]} /></div><div className="heading-actions">{visibleActions.map((action) => <Button size="sm" key={action.id} variant={actionVariant(action)} onClick={() => executeAction(action)} disabled={busy || Boolean(action.disabledWhen && evaluateCondition(action.disabledWhen, masterData))}>{action.command === "save" && <Save size={16} />}{action.variant === "success" && <Check size={16} />}{action.variant === "danger" && <X size={16} />}{action.label}</Button>)}{document && <IconButton aria-label={sidePanelCollapsed ? "展开详情面板" : "隐藏详情面板"} title={sidePanelCollapsed ? "展开详情面板" : "隐藏详情面板"} onClick={() => setSidePanelCollapsed((value) => !value)}>{sidePanelCollapsed ? <PanelRightOpen /> : <PanelRightClose />}</IconButton>}</div></div>
    {error && <div className="inline-error editor-error">{error}<button onClick={() => setError(null)}><X /></button></div>}
    {impact && <div className={`impact-banner ${impact.canProceed ? "warning" : "critical"}`}><AlertTriangle /><div><strong>{impact.summary}</strong>{impact.items.map((item) => <p key={`${item.ruleId}-${item.field}`}>{item.message}（{item.downstreamDocuments.map((doc) => doc.code).join("、")}）</p>)}</div></div>}
    <div className={`zform-document-layout ${!document || sidePanelCollapsed ? "single-panel" : ""}`}>
      <section className="zform-document-main"><article className="zform-document-card">
        <Tabs className="zform-content-tabs" value={contentTab} onChange={setContentTab} items={[{ id: "master", label: "主信息" }, ...visibleDetailTables.map((table) => ({ id: table.id, label: table.label })), ...(document ? (schema.extraTabs || []).map((extraTab) => ({ id: `extra:${extraTab.id}`, label: extraTab.label })) : [])]} />
        <div className="zform-content-panel">
          {contentTab === "master" && <div className="zform-master-form">{groupedFields.map(([group, fields]) => <section className="zform-master-group" key={group}><h3>{group}</h3><div className="field-grid">{fields.map((field) => { const required = field.required || Boolean(field.requiredWhen && evaluateCondition(field.requiredWhen, masterData)); const readOnly = isModeReadOnly(field.readOnly, field.readOnlyModes, mode) || Boolean(field.readOnlyWhen && evaluateCondition(field.readOnlyWhen, masterData)); return <label className={field.span === 2 || field.type === "textarea" ? "field span-2" : "field"} key={field.id}><span>{field.label}{required && <i>*</i>}</span><FieldRenderer field={field} data={masterData} mode={mode} disabled={readOnly} onChange={updateField} />{field.helpText && <small>{field.helpText}</small>}</label> })}</div></section>)}</div>}
          {visibleDetailTables.map((table) => { if (contentTab !== table.id) return null; const rows = rowsFor(table.id); const addAction = mode !== "view" ? <DetailRowSelector table={table} onSelect={(selectedRows) => setPluginRows(table.id, selectedRows)} /> : undefined; return <DocumentDetailTable key={table.id} storageId={schema.typeId} table={table} rows={rows} mode={mode} addAction={addAction} highlightedRowId={highlightedRowId} onTraceRow={(source) => void openSource(source)} onDeleteRow={(rowId) => setRows(table.id, rows.filter((item) => item.id !== rowId))} onUpdateCell={(rowId, fieldId, value) => updateRow(table.id, rowId, fieldId, value)} onReorderRows={(nextRows) => setRows(table.id, nextRows)} /> })}
          {document && schema.extraTabs?.map((extraTab) => contentTab === `extra:${extraTab.id}` ? <div key={extraTab.id}>{renderExtraTab(extraTab.pluginId, { document, schema, params: extraTab.params })}</div> : null)}
        </div>
      </article></section>
      {document && !sidePanelCollapsed && <aside className="zform-document-side"><Tabs className="zform-side-tabs" value={sideTab} onChange={setSideTab} items={[{ id: "trace", label: "关联单据" }, { id: "history", label: <>操作记录 <span>{activities.length}</span></> }]} />
        <div className="zform-side-content">{sideTab === "trace" && <div className="trace-view"><div className="trace-line">{trace.upstream ? <div className="trace-node source"><span>上游来源</span><strong>{trace.upstream.code}</strong><small>{schemas.find((item) => item.typeId === trace.upstream?.typeId)?.typeName}</small></div> : <div className="trace-node empty"><span>上游来源</span><strong>业务起点</strong><small>没有来源单据</small></div>}<ChevronRight /><div className="trace-node current"><span>当前单据</span><strong>{document.code}</strong><small>{schema.typeName}</small></div>{schema.pushDownRules?.map((rule) => <div className="trace-target" key={rule.id}><ChevronRight /><button className="trace-node" disabled={busy || Boolean(rule.allowedStatuses && !rule.allowedStatuses.includes(document.status))} onClick={() => pushDown(rule.targetTypeId)}><span>可下推</span><strong>{rule.label}</strong><small>{schemas.find((item) => item.typeId === rule.targetTypeId)?.typeName}</small></button></div>)}</div>{trace.downstream.length > 0 && <div className="downstream-list"><strong>已生成下游</strong>{trace.downstream.map((item) => <span key={item.documentId}>{item.code}</span>)}</div>}</div>}
          {sideTab === "history" && <div className="history-view"><div className="timeline">{activities.map((activity) => <div key={activity.id}><i /><span>{activity.operator.slice(0, 1)}</span><p><strong>{activity.message}</strong><small>{activity.operator} · {formatDate(activity.createdAt, true)}</small></p></div>)}</div></div>}
        </div>
      </aside>}
    </div>
    <ConfirmDialog open={Boolean(confirmation)} title="确认执行操作" description={confirmation?.description || ""} destructive={confirmation?.destructive} onClose={() => setConfirmation(null)} onConfirm={() => { const action = confirmation?.action; setConfirmation(null); if (action) void action() }} />
  </>
}
