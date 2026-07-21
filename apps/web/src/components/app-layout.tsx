import { useCallback, useEffect, useState } from "react"
import { Bell, Boxes, Building2, ChevronLeft, ChevronRight, CircleHelp, FileText, Languages, LayoutDashboard, MenuSquare, PackageOpen, ScanLine, SearchCheck, Settings, ShieldCheck, ShoppingCart, Sparkles, Users, Warehouse } from "lucide-react"
import type { DashboardData, DocumentRecord, DocumentSchema, ShellBootstrapData, ShellMenuItem, UserNotification, UserShellSettings } from "@zform/shared"
import { api } from "@/apis/framework-api"
import { Dashboard } from "@/components/dashboard"
import { DeclarationNameReview } from "@/components/declaration-name-review"
import { DocumentEditor } from "@/components/document-editor"
import { DocumentList } from "@/components/document-list"
import { GlobalStatusBar } from "@/components/global-status-bar"
import { NotificationCenter } from "@/components/notification-center"
import { OcrRecognition } from "@/components/ocr-recognition"
import { SystemManagement } from "@/components/system-management"
import { ConfirmDialog, IconButton } from "@/components/ui"
import { UiShowcase } from "@/components/ui/ui-showcase"
import { UserSettings } from "@/components/user-settings"
import { WorkspaceTabs } from "@/components/workspace-tabs"
import type { WorkspaceTab, WorkspaceView } from "@/types/workspace"

const menuIcons = { LayoutDashboard, FileText, PackageOpen, ShoppingCart, Warehouse, SearchCheck, Settings, CircleHelp, MenuSquare, Building2, Users, ShieldCheck, Languages, ScanLine }
const dashboardTab: WorkspaceTab = { id: "dashboard", title: "工作台", view: { kind: "dashboard" }, closable: false, revision: 0 }
interface DiscardRequest { description: string; action: () => void }

export function AppLayout() {
  const [schemas, setSchemas] = useState<DocumentSchema[]>([])
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [shell, setShell] = useState<ShellBootstrapData | null>(null)
  const [settings, setSettings] = useState<UserShellSettings | null>(null)
  const [tabs, setTabs] = useState<WorkspaceTab[]>([dashboardTab])
  const [activeId, setActiveId] = useState("dashboard")
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [discardRequest, setDiscardRequest] = useState<DiscardRequest | null>(null)

  const refreshDashboard = useCallback(async () => setDashboard(await api.dashboard()), [])
  useEffect(() => {
    Promise.all([api.schemas(), api.dashboard(), api.shell()])
      .then(([schemaData, dashboardData, shellData]) => { setSchemas(schemaData); setDashboard(dashboardData); setShell(shellData); setSettings(shellData.settings); setSidebarOpen(!shellData.settings.sidebarCollapsed) })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "加载失败"))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => {
    const listener = (event: BeforeUnloadEvent) => { if (tabs.some((tab) => tab.dirty)) event.preventDefault() }
    window.addEventListener("beforeunload", listener); return () => window.removeEventListener("beforeunload", listener)
  }, [tabs])

  const activeTab = tabs.find((tab) => tab.id === activeId) || tabs[0] || dashboardTab
  const unreadCount = shell?.notifications.filter((item) => !item.readAt).length || 0
  const hasPermission = useCallback((item: ShellMenuItem) => !item.requiredPermissions?.length || shell?.user.permissions.includes("*") || item.requiredPermissions.every((permission) => shell?.user.permissions.includes(permission)), [shell?.user.permissions])
  const activateOrAdd = useCallback((tab: WorkspaceTab) => { setTabs((current) => current.some((item) => item.id === tab.id) ? current : [...current, tab]); setActiveId(tab.id) }, [])
  const openView = useCallback((view: WorkspaceView, title: string, id: string, closable = true) => activateOrAdd({ id, title, view, closable, revision: 0 }), [activateOrAdd])
  const openList = useCallback((typeId?: string) => { const schema = schemas.find((item) => item.typeId === typeId); if (schema) openView({ kind: "list", typeId: schema.typeId }, schema.typeName, `list:${schema.typeId}`) }, [openView, schemas])
  const openDocument = useCallback((document: DocumentRecord) => openView({ kind: "editor", id: document.id, returnTypeId: document.typeId }, document.code, `editor:${document.id}`), [openView])
  const requestDiscard = (targets: WorkspaceTab[], action: () => void) => {
    const dirty = targets.filter((tab) => tab.dirty)
    if (!dirty.length) { action(); return }
    setDiscardRequest({ description: dirty.length === 1 ? `“${dirty[0]?.title}”有未保存的更改，确认放弃吗？` : `${dirty.length} 个标签有未保存的更改，确认全部放弃吗？`, action })
  }
  const closeTab = (id: string, afterClose?: () => void) => {
    const tab = tabs.find((item) => item.id === id); if (!tab || !tab.closable) return
    requestDiscard([tab], () => { const next = tabs.filter((item) => item.id !== id); setTabs(next); if (activeId === id) setActiveId(next[next.length - 1]?.id || "dashboard"); afterClose?.() })
  }
  const closeOthers = (id: string) => {
    const closing = tabs.filter((tab) => tab.id !== id && tab.closable)
    requestDiscard(closing, () => { setTabs((current) => current.filter((tab) => tab.id === id || !tab.closable)); setActiveId(id) })
  }
  const closeAll = () => {
    const closing = tabs.filter((tab) => tab.closable)
    requestDiscard(closing, () => { setTabs(tabs.filter((tab) => !tab.closable)); setActiveId("dashboard") })
  }
  const refreshTab = (id: string) => {
    const tab = tabs.find((item) => item.id === id); if (!tab) return
    requestDiscard([tab], () => setTabs((current) => current.map((item) => item.id === id ? { ...item, dirty: false, revision: item.revision + 1 } : item)))
  }
  const moveTab = (sourceId: string, targetId: string) => setTabs((current) => { const sourceIndex = current.findIndex((tab) => tab.id === sourceId); const targetIndex = current.findIndex((tab) => tab.id === targetId); if (sourceIndex <= 0 || targetIndex <= 0) return current; const next = [...current]; const [source] = next.splice(sourceIndex, 1); if (!source) return current; next.splice(targetIndex, 0, source); return next })
  const setDirty = useCallback((id: string, dirty: boolean) => setTabs((current) => {
    const target = current.find((tab) => tab.id === id)
    if (!target || Boolean(target.dirty) === dirty) return current
    return current.map((tab) => tab.id === id ? { ...tab, dirty } : tab)
  }), [])
  const openMenu = (item: ShellMenuItem) => {
    if (item.target === "dashboard") setActiveId("dashboard")
    if (item.target === "document-list") openList(item.targetId)
    if (item.target === "settings") openView({ kind: "settings" }, "用户设置", "settings")
    if (item.target === "help") openView({ kind: "help" }, "使用帮助", "help")
    if (item.target === "menu-management") openView({ kind: "system", entity: "menus" }, "菜单管理", "system:menus")
    if (item.target === "department-management") openView({ kind: "system", entity: "departments" }, "部门管理", "system:departments")
    if (item.target === "user-management") openView({ kind: "system", entity: "users" }, "用户管理", "system:users")
    if (item.target === "role-management") openView({ kind: "system", entity: "roles" }, "角色管理", "system:roles")
    if (item.target === "declaration-name") openView({ kind: "declaration-name" }, "报关名称审核", "declaration-name")
    if (item.target === "ocr-recognition") openView({ kind: "ocr" }, "支付截图识别", "ocr-recognition")
  }
  const isMenuActive = (item: ShellMenuItem) => {
    if (item.target === "dashboard") return activeTab.view.kind === "dashboard"
    if (item.target === "document-list") return (activeTab.view.kind === "list" && activeTab.view.typeId === item.targetId) || (activeTab.view.kind === "editor" && activeTab.view.returnTypeId === item.targetId)
    if (item.target === "menu-management") return activeTab.view.kind === "system" && activeTab.view.entity === "menus"
    if (item.target === "department-management") return activeTab.view.kind === "system" && activeTab.view.entity === "departments"
    if (item.target === "user-management") return activeTab.view.kind === "system" && activeTab.view.entity === "users"
    if (item.target === "role-management") return activeTab.view.kind === "system" && activeTab.view.entity === "roles"
    if (item.target === "declaration-name") return activeTab.view.kind === "declaration-name"
    if (item.target === "ocr-recognition") return activeTab.view.kind === "ocr"
    return activeTab.view.kind === item.target
  }
  const saveUserSettings = async () => { if (settings) { const saved = await api.saveSettings(settings); setSettings(saved); setSidebarOpen(!saved.sidebarCollapsed) } }
  const readNotification = async (notification: UserNotification) => {
    if (!notification.readAt) { await api.readNotification(notification.id); setShell((current) => current ? { ...current, notifications: current.notifications.map((item) => item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item) } : current) }
    if (notification.target?.kind === "dashboard") setActiveId("dashboard")
    if (notification.target?.kind === "document-list") openList(notification.target.typeId)
    if (notification.target?.kind === "document" && notification.target.id) { try { openDocument(await api.document(notification.target.id)) } catch { /* 通知目标可能已删除。 */ } }
    setNotificationsOpen(false)
  }
  const readAll = async () => { await api.readAllNotifications(); setShell((current) => current ? { ...current, notifications: current.notifications.map((item) => ({ ...item, readAt: item.readAt || new Date().toISOString() })) } : current) }
  const renderTab = (tab: WorkspaceTab) => {
    const view = tab.view
    if (view.kind === "dashboard") return dashboard && <Dashboard key={tab.revision} data={dashboard} schemas={schemas} visibleWidgets={settings?.dashboardWidgetIds || []} onOpenDocument={openDocument} onOpenList={openList} />
    if (view.kind === "list") return <DocumentList key={tab.revision} schema={schemas.find((schema) => schema.typeId === view.typeId)!} onOpen={openDocument} onChanged={refreshDashboard} />
    if (view.kind === "editor") return <DocumentEditor key={tab.revision} documentId={view.id} schemas={schemas} onDirtyChange={(dirty) => setDirty(tab.id, dirty)} onBack={() => closeTab(tab.id, () => openList(view.returnTypeId))} onOpen={openDocument} onChanged={refreshDashboard} />
    if (view.kind === "settings" && shell && settings) return <UserSettings config={shell.config} settings={settings} onChange={setSettings} onSave={saveUserSettings} />
    if (view.kind === "system") return <SystemManagement entity={view.entity} onShellChanged={async () => { const next = await api.shell(); setShell(next) }} />
    if (view.kind === "declaration-name") return <DeclarationNameReview key={tab.revision} />
    if (view.kind === "ocr") return <OcrRecognition key={tab.revision} />
    return <UiShowcase />
  }

  if (loading) return <div className="splash"><div className="brand-mark"><Sparkles size={22} /></div><span>ZForm 正在准备工作空间...</span></div>
  if (error || !shell || !settings) return <div className="splash error-state"><strong>暂时无法连接服务</strong><span>{error}</span><span className="muted">请先在 framework 目录运行 npm run dev</span></div>

  return <div className={`app-shell ${sidebarOpen ? "" : "sidebar-collapsed"} ${settings.compactMode ? "compact-shell" : ""} ${settings.showGlobalStatusBar ? "has-status-bar" : ""}`}>
    <aside className="sidebar"><div className="brand"><div className="brand-title"><div className="brand-mark"><Boxes size={18} /></div><div><strong>{shell.config.appName}</strong><span>{shell.config.appSubtitle}</span></div></div><IconButton aria-label={sidebarOpen ? "收起侧边栏" : "展开侧边栏"} onClick={() => setSidebarOpen((value) => !value)}>{sidebarOpen ? <ChevronLeft /> : <ChevronRight />}</IconButton></div><nav>{shell.config.menuGroups.map((group) => { const items = group.items.filter(hasPermission); return items.length ? <div key={group.id}><p className="nav-label">{group.label}</p>{items.map((item) => { const Icon = menuIcons[item.icon as keyof typeof menuIcons] || FileText; return <button key={item.id} className={isMenuActive(item) ? "nav-item active" : "nav-item"} onClick={() => openMenu(item)} title={item.label}><Icon /><span>{item.label}</span>{item.targetId && dashboard && <em>{dashboard.typeCounts.find((count) => count.typeId === item.targetId)?.count || 0}</em>}</button>})}</div> : null })}</nav></aside>
    <main className="main-area"><WorkspaceTabs tabs={tabs} activeId={activeId} onActivate={setActiveId} onClose={closeTab} onCloseOthers={closeOthers} onCloseAll={closeAll} onRefresh={refreshTab} onMove={moveTab} endActions={<IconButton className="notification" onClick={() => setNotificationsOpen((value) => !value)} title="通知中心"><Bell />{unreadCount > 0 && <i>{unreadCount > 9 ? "9+" : unreadCount}</i>}</IconButton>} />
      <section className="page-content workspace-content">{tabs.map((tab) => <div className="workspace-page" hidden={tab.id !== activeId} key={tab.id}>{renderTab(tab)}</div>)}</section>
      {settings.showGlobalStatusBar && <GlobalStatusBar user={shell.user} tabCount={tabs.length} />}
    </main>{notificationsOpen && <NotificationCenter notifications={shell.notifications} onClose={() => setNotificationsOpen(false)} onRead={readNotification} onReadAll={readAll} />}<ConfirmDialog open={Boolean(discardRequest)} title="放弃未保存的更改" description={discardRequest?.description || ""} confirmLabel="放弃更改" destructive onClose={() => setDiscardRequest(null)} onConfirm={() => { const action = discardRequest?.action; setDiscardRequest(null); action?.() }} />
  </div>
}
