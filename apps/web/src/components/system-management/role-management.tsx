import { useMemo, useState } from "react"
import { Edit3, Plus, Search, ShieldCheck, Trash2 } from "lucide-react"
import type { RoleRecord, SystemMenuRecord } from "@zform/shared"
import { api } from "@/apis/framework-api"
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Checkbox, ConfirmDialog, Dialog, EmptyState, FormField, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui"

interface Props { roles: RoleRecord[]; menus: SystemMenuRecord[]; onChanged: () => Promise<void>; onError: (message: string | null) => void }
interface RoleDraft { id?: string; code: string; name: string; description: string; permissions: string[] }
interface PermissionGroup { id: string; label: string; items: Array<{ code: string; label: string }> }

function permissionGroups(menus: SystemMenuRecord[]): PermissionGroup[] {
  const systemItems = [
    { code: "system:menu:manage", label: "菜单管理" }, { code: "system:department:manage", label: "部门管理" },
    { code: "system:user:manage", label: "用户管理" }, { code: "system:role:manage", label: "角色管理" },
    { code: "settings:use", label: "用户设置" }, { code: "dashboard:view", label: "查看工作台" },
  ]
  const navigation = menus.flatMap((menu) => menu.permissionCode ? [{ code: menu.permissionCode, label: `访问${menu.label}` }] : [])
  const documents = menus.filter((menu) => menu.target === "document-list" && menu.targetId).flatMap((menu) => ["create", "update", "delete", "submit", "approve"].map((action) => ({ code: `document:${menu.targetId}:${action}`, label: `${menu.label}·${({ create: "新建", update: "编辑", delete: "删除", submit: "提交", approve: "审批" } as Record<string, string>)[action]}` })))
  const unique = (items: Array<{ code: string; label: string }>) => [...new Map(items.map((item) => [item.code, item])).values()]
  const ocr = [{ code: "ocr:view", label: "查看识别记录" }, { code: "ocr:recognize", label: "上传并识别" }, { code: "ocr:delete", label: "删除识别记录" }, { code: "ocr:export", label: "导出识别结果" }]
  return [{ id: "system", label: "系统管理", items: unique(systemItems) }, { id: "navigation", label: "页面访问", items: unique(navigation) }, { id: "documents", label: "单据操作", items: unique(documents) }, { id: "ocr", label: "支付截图识别", items: ocr }]
}

export function RoleManagement({ roles, menus, onChanged, onError }: Props) {
  const [keyword, setKeyword] = useState("")
  const [draft, setDraft] = useState<RoleDraft | null>(null)
  const [deleting, setDeleting] = useState<RoleRecord | null>(null)
  const [saving, setSaving] = useState(false)
  const groups = useMemo(() => permissionGroups(menus), [menus])
  const filtered = roles.filter((role) => !keyword.trim() || `${role.name} ${role.code} ${role.description || ""}`.toLowerCase().includes(keyword.trim().toLowerCase()))
  const edit = (role: RoleRecord) => setDraft({ id: role.id, code: role.code, name: role.name, description: role.description || "", permissions: role.permissions })
  const save = async () => { if (!draft) return; setSaving(true); onError(null); try { if (draft.id) await api.updateRole(draft.id, { name: draft.name, ...(draft.description ? { description: draft.description } : {}), permissions: draft.permissions }); else await api.createRole({ code: draft.code, name: draft.name, ...(draft.description ? { description: draft.description } : {}), permissions: draft.permissions }); setDraft(null); await onChanged() } catch (reason) { onError(reason instanceof Error ? reason.message : "保存角色失败") } finally { setSaving(false) } }
  const remove = async () => { if (!deleting) return; setSaving(true); onError(null); try { await api.removeRole(deleting.id); setDeleting(null); await onChanged() } catch (reason) { setDeleting(null); onError(reason instanceof Error ? reason.message : "删除角色失败") } finally { setSaving(false) } }
  const togglePermission = (code: string, checked: boolean) => { if (draft) setDraft({ ...draft, permissions: checked ? [...new Set([...draft.permissions, code])] : draft.permissions.filter((permission) => permission !== code) }) }

  return <><Card className="management-table"><CardHeader><div><CardTitle>角色列表 <Badge>{filtered.length}</Badge></CardTitle><p>权限码由后端执行，页面隐藏不能替代服务端授权。</p></div><div className="management-toolbar"><div className="management-search"><Search /><Input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索角色名称或编码" /></div><Button variant="primary" onClick={() => setDraft({ code: "", name: "", description: "", permissions: [] })}><Plus />新建角色</Button></div></CardHeader><CardContent>
    {!filtered.length ? <EmptyState icon={<ShieldCheck />} title="暂无角色" /> : <Table><TableHeader><TableRow><TableHead>角色</TableHead><TableHead>说明</TableHead><TableHead>权限</TableHead><TableHead>用户数</TableHead><TableHead>操作</TableHead></TableRow></TableHeader><TableBody>{filtered.map((role) => <TableRow key={role.id}><TableCell><strong>{role.name}</strong><small>{role.code}</small></TableCell><TableCell>{role.description || "—"}</TableCell><TableCell><div className="permission-tags">{role.permissions.includes("*") ? <Badge variant="danger">全部权限</Badge> : <>{role.permissions.slice(0, 5).map((permission) => <Badge key={permission} variant="primary">{permission}</Badge>)}{role.permissions.length > 5 && <Badge>+{role.permissions.length - 5}</Badge>}</>}</div></TableCell><TableCell><Badge variant={role.userCount ? "primary" : "neutral"}>{role.userCount}</Badge></TableCell><TableCell><div className="management-actions"><Button size="sm" variant="ghost" onClick={() => edit(role)}><Edit3 />编辑</Button><Button size="sm" variant="ghost" onClick={() => setDeleting(role)} disabled={role.code === "SYSTEM_ADMIN"}><Trash2 />删除</Button></div></TableCell></TableRow>)}</TableBody></Table>}
  </CardContent></Card>
  <Dialog open={Boolean(draft)} title={draft?.id ? "编辑角色" : "新建角色"} description="勾选角色可执行的页面访问和业务操作。" width={860} onClose={() => setDraft(null)} footer={<><Button onClick={() => setDraft(null)}>取消</Button><Button variant="primary" loading={saving} disabled={!draft?.code.trim() || !draft?.name.trim() || !draft.permissions.length} onClick={() => void save()}>{draft?.id ? "保存" : "创建"}</Button></>}>{draft && <div className="role-editor"><div className="management-form"><FormField label="角色编码" required><Input value={draft.code} disabled={Boolean(draft.id)} onChange={(event) => setDraft({ ...draft, code: event.target.value.toUpperCase() })} placeholder="SALES_MANAGER" /></FormField><FormField label="角色名称" required><Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></FormField><FormField label="角色说明" className="span-2"><Input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></FormField></div><div className="permission-editor"><header><strong>权限配置</strong><span>已选择 {draft.permissions.length} 项</span></header>{draft.permissions.includes("*") ? <div className="wildcard-permission"><Badge variant="danger">*</Badge><span>系统管理员拥有全部权限，通配权限不在普通角色中配置。</span></div> : groups.map((group) => <section key={group.id}><h3>{group.label}</h3><div>{group.items.map((permission) => <label className={draft.permissions.includes(permission.code) ? "selected" : ""} key={permission.code}><Checkbox checked={draft.permissions.includes(permission.code)} onChange={(event) => togglePermission(permission.code, event.target.checked)} /><span>{permission.label}<small>{permission.code}</small></span></label>)}</div></section>)}</div></div>}</Dialog>
  <ConfirmDialog open={Boolean(deleting)} title="确认删除角色" description={`确认删除“${deleting?.name || ""}”？有关联用户时数据库将阻止删除。`} destructive confirmLabel="删除" onClose={() => setDeleting(null)} onConfirm={() => void remove()} />
  </>
}
