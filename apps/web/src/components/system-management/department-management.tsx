import { useEffect, useMemo, useState } from "react"
import { Building2, ChevronDown, ChevronRight, Edit3, FolderPlus, Plus, Search, Trash2 } from "lucide-react"
import type { DepartmentInput, DepartmentRecord, DepartmentTreeNode } from "@zform/shared"
import { api } from "@/apis/framework-api"
import { formatDate } from "@/components/status-pill"
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, ConfirmDialog, Dialog, EmptyState, FormField, IconButton, Input, Select, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui"

interface Props { departments: DepartmentRecord[]; onChanged: () => Promise<void>; onError: (message: string | null) => void }
interface FlatDepartment extends DepartmentTreeNode { level: number }

function departmentTree(departments: DepartmentRecord[]): DepartmentTreeNode[] {
  const nodes = new Map<string, DepartmentTreeNode>(departments.map((department) => [department.id, { ...department, children: [] }]))
  const roots: DepartmentTreeNode[] = []
  nodes.forEach((node) => { const parent = node.parentId ? nodes.get(node.parentId) : undefined; if (parent) parent.children.push(node); else roots.push(node) })
  const sort = (items: DepartmentTreeNode[]) => { items.sort((left, right) => left.order - right.order || left.code.localeCompare(right.code)); items.forEach((item) => sort(item.children)) }
  sort(roots)
  return roots
}
function flatten(nodes: DepartmentTreeNode[], expanded: Set<string>, level = 0): FlatDepartment[] { return nodes.flatMap((node) => [{ ...node, level }, ...(expanded.has(node.id) ? flatten(node.children, expanded, level + 1) : [])]) }
function countDescendants(node: DepartmentTreeNode): number { return node.children.reduce((count, child) => count + 1 + countDescendants(child), 0) }

export function DepartmentManagement({ departments, onChanged, onError }: Props) {
  const tree = useMemo(() => departmentTree(departments), [departments])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [keyword, setKeyword] = useState("")
  const [draft, setDraft] = useState<(DepartmentInput & { id?: string }) | null>(null)
  const [deleting, setDeleting] = useState<DepartmentRecord | null>(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => { setExpanded(new Set(departments.filter((department) => departments.some((child) => child.parentId === department.id)).map((department) => department.id))) }, [departments])
  const rows = flatten(tree, expanded).filter((department) => !keyword.trim() || `${department.name} ${department.code}`.toLowerCase().includes(keyword.trim().toLowerCase()))
  const options = flatten(tree, new Set(departments.map((department) => department.id)))
  const create = (parentId?: string) => setDraft({ code: "", name: "", ...(parentId ? { parentId } : {}), order: 0 })
  const edit = (department: DepartmentRecord) => setDraft({ id: department.id, code: department.code, name: department.name, ...(department.parentId ? { parentId: department.parentId } : {}), order: department.order })
  const save = async () => { if (!draft) return; setSaving(true); onError(null); const { id, ...input } = draft; try { if (id) await api.updateDepartment(id, input); else await api.createDepartment(input); setDraft(null); await onChanged() } catch (reason) { onError(reason instanceof Error ? reason.message : "保存部门失败") } finally { setSaving(false) } }
  const remove = async () => { if (!deleting) return; setSaving(true); onError(null); try { await api.removeDepartment(deleting.id); setDeleting(null); await onChanged() } catch (reason) { setDeleting(null); onError(reason instanceof Error ? reason.message : "删除部门失败") } finally { setSaving(false) } }

  return <><Card className="management-table"><CardHeader><div><CardTitle>部门列表 <Badge>{departments.length}</Badge></CardTitle><p>按组织层级展开，支持直接添加下级部门。</p></div><div className="management-toolbar"><div className="management-search"><Search /><Input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索部门名称或编码" /></div><Button variant="primary" onClick={() => create()}><Plus />新建部门</Button></div></CardHeader><CardContent>
    {!rows.length ? <EmptyState icon={<Building2 />} title="暂无部门" description="创建第一个顶级部门后即可分配用户" /> : <Table><TableHeader><TableRow><TableHead>部门名称</TableHead><TableHead>部门编码</TableHead><TableHead>下级部门</TableHead><TableHead>用户数</TableHead><TableHead>排序</TableHead><TableHead>创建时间</TableHead><TableHead>操作</TableHead></TableRow></TableHeader><TableBody>{rows.map((department) => <TableRow key={department.id}><TableCell><div className="tree-cell" style={{ paddingLeft: department.level * 22 }}>{department.children.length ? <IconButton aria-label={expanded.has(department.id) ? "折叠" : "展开"} onClick={() => setExpanded((current) => { const next = new Set(current); if (next.has(department.id)) next.delete(department.id); else next.add(department.id); return next })}>{expanded.has(department.id) ? <ChevronDown /> : <ChevronRight />}</IconButton> : <span className="tree-spacer" />}<Building2 /><strong>{department.name}</strong></div></TableCell><TableCell><code>{department.code}</code></TableCell><TableCell>{countDescendants(department) || "—"}</TableCell><TableCell><Badge variant={department.userCount ? "primary" : "neutral"}>{department.userCount}</Badge></TableCell><TableCell>{department.order}</TableCell><TableCell>{formatDate(department.createdAt, true)}</TableCell><TableCell><div className="management-actions"><Button size="sm" variant="ghost" onClick={() => create(department.id)}><FolderPlus />子级</Button><Button size="sm" variant="ghost" onClick={() => edit(department)}><Edit3 />编辑</Button><Button size="sm" variant="ghost" onClick={() => setDeleting(department)}><Trash2 />删除</Button></div></TableCell></TableRow>)}</TableBody></Table>}
  </CardContent></Card>
  <Dialog open={Boolean(draft)} title={draft?.id ? "编辑部门" : "新建部门"} description="部门编码用于权限和数据范围引用，保存后不建议随意修改。" width={620} onClose={() => setDraft(null)} footer={<><Button onClick={() => setDraft(null)}>取消</Button><Button variant="primary" loading={saving} disabled={!draft?.code.trim() || !draft?.name.trim()} onClick={() => void save()}>{draft?.id ? "保存" : "创建"}</Button></>}>{draft && <div className="management-form"><FormField label="部门编码" required><Input value={draft.code} onChange={(event) => setDraft({ ...draft, code: event.target.value.toUpperCase() })} placeholder="例如 SALES" /></FormField><FormField label="部门名称" required><Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="例如 销售部" /></FormField><FormField label="上级部门" className="span-2"><Select value={draft.parentId || ""} onChange={(event) => setDraft({ ...draft, parentId: event.target.value || undefined })}><option value="">无（顶级部门）</option>{options.filter((option) => option.id !== draft.id).map((option) => <option key={option.id} value={option.id}>{"　".repeat(option.level)}{option.name}</option>)}</Select></FormField><FormField label="排序号"><Input type="number" value={draft.order} onChange={(event) => setDraft({ ...draft, order: Number(event.target.value) || 0 })} /></FormField></div>}</Dialog>
  <ConfirmDialog open={Boolean(deleting)} title="确认删除部门" description={`确认删除“${deleting?.name || ""}”？存在下级部门或关联用户时服务端将拒绝删除。`} destructive confirmLabel="删除" onClose={() => setDeleting(null)} onConfirm={() => void remove()} />
  </>
}
