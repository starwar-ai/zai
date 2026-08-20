import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react"
import { ContactRound, Download, FileImage, Mail, MapPin, Phone, RotateCcw, Save, Search, Trash2, UploadCloud } from "lucide-react"
import type { OcrBusinessCardData, OcrBusinessCardUpdateRequest, OcrRecognitionRecord } from "@zform/shared"
import { api } from "@/apis/framework-api"
import { Alert, Badge, Button, Card, CardContent, CardHeader, ConfirmDialog, EmptyState, FormField, Input, PageHeader, Pagination, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Textarea } from "@/components/ui"

const emptyFields: OcrBusinessCardUpdateRequest = { companyName: "", contactName: "", jobTitle: "", phone: "", email: "", address: "", website: "" }
const fieldDefinitions: Array<{ key: keyof OcrBusinessCardData; label: string; placeholder: string }> = [
  { key: "companyName", label: "公司名称", placeholder: "请输入供应商公司名称" },
  { key: "contactName", label: "联系人", placeholder: "请输入联系人姓名" },
  { key: "jobTitle", label: "职称", placeholder: "请输入职称" },
  { key: "phone", label: "电话", placeholder: "请输入电话或手机号码" },
  { key: "email", label: "电子邮箱", placeholder: "请输入电子邮箱" },
  { key: "website", label: "网站", placeholder: "请输入公司网站" },
]

function fileBase64(file: File): Promise<string> { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1] || ""); reader.onerror = () => reject(new Error("无法读取名片图片。")); reader.readAsDataURL(file) }) }
function cardFields(record?: OcrRecognitionRecord | null): OcrBusinessCardUpdateRequest { return { companyName: record?.companyName || "", contactName: record?.contactName || "", jobTitle: record?.jobTitle || "", phone: record?.phone || "", email: record?.email || "", address: record?.address || "", website: record?.website || "" } }

export function SupplierBusinessCardRecognition({ onDirtyChange }: { onDirtyChange?: (dirty: boolean) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const onDirtyChangeRef = useRef(onDirtyChange)
  const [records, setRecords] = useState<OcrRecognitionRecord[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [keyword, setKeyword] = useState("")
  const [loading, setLoading] = useState(true)
  const [recognizing, setRecognizing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [selected, setSelected] = useState<OcrRecognitionRecord | null>(null)
  const [fields, setFields] = useState<OcrBusinessCardUpdateRequest>(emptyFields)
  const [imageUrl, setImageUrl] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<OcrRecognitionRecord | null>(null)
  const pageSize = 10

  const load = useCallback(async () => {
    setLoading(true)
    try { const data = await api.ocrRecognitions({ recognitionType: "BUSINESS_CARD", keyword: keyword.trim() || undefined, page, pageSize }); setRecords(data.items); setTotal(data.total) }
    catch (reason) { setError(reason instanceof Error ? reason.message : "供应商名片记录加载失败。") }
    finally { setLoading(false) }
  }, [keyword, page])
  useEffect(() => { void load() }, [load])
  useEffect(() => { onDirtyChangeRef.current = onDirtyChange }, [onDirtyChange])
  useEffect(() => { onDirtyChangeRef.current?.(Boolean(selected) && JSON.stringify(fields) !== JSON.stringify(cardFields(selected))) }, [fields, selected])
  useEffect(() => () => onDirtyChangeRef.current?.(false), [])
  useEffect(() => {
    if (!selected) { setImageUrl(""); return }
    let active = true; let url = ""
    void api.ocrImage("BUSINESS_CARD", selected.id).then((blob) => { if (active) { url = URL.createObjectURL(blob); setImageUrl(url) } }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "名片原图加载失败。") })
    return () => { active = false; if (url) URL.revokeObjectURL(url) }
  }, [selected])

  const chooseRecord = (record: OcrRecognitionRecord) => { setSelected(record); setFields(cardFields(record)); setError(null); setNotice(null) }
  const recognize = async (file: File) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setError("仅支持 JPG、PNG 或 WebP 格式的名片图片。"); return }
    if (!file.size || file.size > 8 * 1024 * 1024) { setError("名片图片大小必须在 1 字节到 8MB 之间。"); return }
    setRecognizing(true); setError(null); setNotice(null)
    try {
      const result = await api.recognizeOcr({ recognitionType: "BUSINESS_CARD", filename: file.name, mimeType: file.type as "image/jpeg" | "image/png" | "image/webp", base64Data: await fileBase64(file) })
      if (!result.success) throw new Error(result.record.errorMessage || "供应商名片识别失败。")
      chooseRecord(result.record); setNotice("名片识别完成，请核对字段并保存。"); setPage(1); await load()
    } catch (reason) { setError(reason instanceof Error ? reason.message : "供应商名片识别失败。") }
    finally { setRecognizing(false); if (inputRef.current) inputRef.current.value = "" }
  }
  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (file) void recognize(file) }
  const onDrop = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setDragging(false); const file = event.dataTransfer.files[0]; if (file) void recognize(file) }
  const updateField = (key: keyof OcrBusinessCardUpdateRequest, value: string) => setFields((current) => ({ ...current, [key]: value }))
  const save = async () => {
    if (!selected || !fields.companyName.trim()) { setError("公司名称不能为空。"); return }
    setSaving(true); setError(null)
    try { const updated = await api.updateBusinessCard(selected.id, fields); chooseRecord(updated); setNotice("供应商名片资料已校对保存。"); await load() }
    catch (reason) { setError(reason instanceof Error ? reason.message : "供应商名片保存失败。") }
    finally { setSaving(false) }
  }
  const remove = async () => {
    if (!deleteTarget) return
    try { await api.removeOcrRecognition("BUSINESS_CARD", deleteTarget.id); if (selected?.id === deleteTarget.id) { setSelected(null); setFields(emptyFields) }; setDeleteTarget(null); setNotice("识别记录已删除。"); await load() }
    catch (reason) { setError(reason instanceof Error ? reason.message : "识别记录删除失败。"); setDeleteTarget(null) }
  }
  const exportRecords = async () => {
    try { const result = await api.exportOcrRecognitions({ recognitionType: "BUSINESS_CARD" }); const bytes = Uint8Array.from(atob(result.base64), (char) => char.charCodeAt(0)); const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = result.filename; anchor.click(); URL.revokeObjectURL(url) }
    catch (reason) { setError(reason instanceof Error ? reason.message : "供应商名片导出失败。") }
  }

  return <>
    <PageHeader eyebrow="智能工具 / OCR" title="供应商名片识别" description="上传供应商名片，自动提取公司和联系人信息；识别结果可校对、检索并导出。" actions={<Button onClick={() => void exportRecords()} disabled={!total}><Download />导出 Excel</Button>} />
    {error && <Alert className="ocr-alert" variant="danger" title="操作未完成">{error}</Alert>}
    {notice && <Alert className="ocr-alert" variant="success">{notice}</Alert>}
    <div className="business-card-workspace">
      <Card className={`ocr-drop-zone business-card-drop-zone ${dragging ? "active" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={onDrop} onClick={() => !recognizing && inputRef.current?.click()}>
        <CardContent><span className="ocr-upload-icon"><UploadCloud /></span><strong>{recognizing ? "正在识别名片…" : "拖放名片图片到这里"}</strong><p>或点击选择文件，支持 JPG、PNG、WebP，单张不超过 8MB</p><Button variant="primary" loading={recognizing} disabled={recognizing}><FileImage />{recognizing ? "AI 识别中" : "选择名片图片"}</Button><input ref={inputRef} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={onFileChange} /></CardContent>
      </Card>
      {selected && <Card className="business-card-editor">
        <CardHeader><div><h2>{selected.companyName || "待校对的供应商名片"}</h2><p>{selected.originalFilename}</p></div><Badge variant={selected.status === "SUCCESS" ? "success" : "danger"}>{selected.status === "SUCCESS" ? "识别成功" : "识别失败"}</Badge></CardHeader>
        <CardContent><div className="business-card-detail"><div><span>名片原图</span>{imageUrl ? <img src={imageUrl} alt={`${selected.companyName || "供应商"}名片`} /> : <div className="ocr-image-loading">正在加载原图…</div>}</div><div className="business-card-form"><div className="business-card-field-grid">{fieldDefinitions.map((field) => <FormField key={field.key} label={field.label} required={field.key === "companyName"} htmlFor={`card-${field.key}`}><Input id={`card-${field.key}`} value={fields[field.key] || ""} placeholder={field.placeholder} onChange={(event) => updateField(field.key, event.target.value)} /></FormField>)}</div><FormField label="地址" htmlFor="card-address"><Textarea id="card-address" value={fields.address || ""} placeholder="请输入公司地址" onChange={(event) => updateField("address", event.target.value)} /></FormField><div className="business-card-editor-actions"><Button onClick={() => setFields(cardFields(selected))}><RotateCcw />恢复识别结果</Button><Button variant="primary" loading={saving} onClick={() => void save()}><Save />确认并保存</Button></div></div></div></CardContent>
      </Card>}
    </div>
    <Card className="ocr-history business-card-history">
      <CardHeader><div><h2>供应商名片记录</h2><p>记录按当前用户隔离保存，共 {total} 条</p></div><div className="management-search"><Search /><Input value={keyword} placeholder="搜索公司、联系人、电话或邮箱" onChange={(event) => { setKeyword(event.target.value); setPage(1) }} /></div></CardHeader>
      <CardContent>{loading ? <div className="ocr-image-loading">正在加载记录…</div> : records.length ? <><Table><TableHeader><TableRow><TableHead>公司 / 联系人</TableHead><TableHead>联系方式</TableHead><TableHead>文件名</TableHead><TableHead>识别时间</TableHead><TableHead>操作</TableHead></TableRow></TableHeader><TableBody>{records.map((record) => <TableRow key={record.id} onClick={() => chooseRecord(record)} className={selected?.id === record.id ? "selected" : ""}><TableCell><strong>{record.companyName || "未识别公司"}</strong><small>{record.contactName || "未识别联系人"}{record.jobTitle ? ` · ${record.jobTitle}` : ""}</small></TableCell><TableCell>{record.phone && <span><Phone />{record.phone}</span>}{record.email && <span><Mail />{record.email}</span>}{record.address && <span><MapPin />{record.address}</span>}</TableCell><TableCell>{record.originalFilename}</TableCell><TableCell>{new Date(record.createdAt).toLocaleString("zh-CN")}</TableCell><TableCell><Button size="icon" variant="ghost" title="删除" onClick={(event) => { event.stopPropagation(); setDeleteTarget(record) }}><Trash2 /></Button></TableCell></TableRow>)}</TableBody></Table><Pagination page={page} pageCount={Math.max(1, Math.ceil(total / pageSize))} total={total} pageSize={pageSize} onPageChange={setPage} /></> : <EmptyState icon={<ContactRound />} title="暂无供应商名片记录" description="上传第一张名片后，识别结果会显示在这里。" />}</CardContent>
    </Card>
    <ConfirmDialog open={Boolean(deleteTarget)} title="删除供应商名片记录" description={`确认删除“${deleteTarget?.companyName || deleteTarget?.originalFilename || "该记录"}”吗？删除后无法恢复。`} confirmLabel="删除" destructive onClose={() => setDeleteTarget(null)} onConfirm={() => void remove()} />
  </>
}
