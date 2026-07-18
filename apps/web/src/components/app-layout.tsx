import { useCallback, useEffect, useState } from "react"
import { Bell, Boxes, CircleHelp, FileText, LayoutDashboard, Menu, MenuSquare, PackageOpen, PanelLeftClose, Search, Settings, ShieldCheck, ShoppingCart, Sparkles, Users, Warehouse } from "lucide-react"
import type { DashboardData, DocumentRecord, DocumentSchema, ShellBootstrapData, ShellMenuItem, UserNotification, UserShellSettings } from "@zform/shared"
import { api } from "@/apis/framework-api"
import { Dashboard } from "@/components/dashboard"
import { DocumentEditor } from "@/components/document-editor"
import { DocumentList } from "@/components/document-list"
import { GlobalStatusBar } from "@/components/global-status-bar"
import { NotificationCenter } from "@/components/notification-center"
import { SystemManagement } from "@/components/system-management"
import { IconButton } from "@/components/ui"
import { UiShowcase } from "@/components/ui/ui-showcase"
import { UserSettings } from "@/components/user-settings"
import { WorkspaceTabs } from "@/components/workspace-tabs"
import type { WorkspaceTab, WorkspaceView } from "@/types/workspace"

const menuIcons = { LayoutDashboard, FileText, PackageOpen, ShoppingCart, Warehouse, Settings, CircleHelp, MenuSquare, Users, ShieldCheck }
const dashboardTab: WorkspaceTab = { id: "dashboard", title: "工作台", view: { kind: "dashboard" }, closable: false, revision: 0 }

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
  const confirmDiscard = (tab: WorkspaceTab) => !tab.dirty || window.confirm(`“${tab.title}”有未保存的更改，确认放弃吗？`)
  const closeTab = (id: string): boolean => {
    const tab = tabs.find((item) => item.id === id); if (!tab || !tab.closable || !confirmDiscard(tab)) return false
    const next = tabs.filter((item) => item.id !== id); setTabs(next)
    if (activeId === id) setActiveId(next[next.length - 1]?.id || "dashboard")
    return true
  }
  const closeOthers = (id: string) => {
    const closing = tabs.filter((tab) => tab.id !== id && tab.closable); if (closing.some((tab) => !confirmDiscard(tab))) return
    setTabs((current) => current.filter((tab) => tab.id === id || !tab.closable)); setActiveId(id)
  }
  const closeAll = () => {
    const closing = tabs.filter((tab) => tab.closable); if (closing.some((tab) => !confirmDiscard(tab))) return
    setTabs(tabs.filter((tab) => !tab.closable)); setActiveId("dashboard")
  }
  const refreshTab = (id: string) => {
    const tab = tabs.find((item) => item.id === id); if (!tab || !confirmDiscard(tab)) return
    setTabs((current) => current.map((item) => item.id === id ? { ...item, dirty: false, revision: item.revision + 1 } : item))
  }
  const setDirty = useCallback((id: string, dirty: boolean) => setTabs((current) => current.map((tab) => tab.id === id && tab.dirty !== dirty ? { ...tab, dirty } : tab)), [])
  const openMenu = (item: ShellMenuItem) => {
    if (item.target === "dashboard") setActiveId("dashboard")
    if (item.target === "document-list") openList(item.targetId)
    if (item.target === "settings") openView({ kind: "settings" }, "用户设置", "settings")
    if (item.target === "help") openView({ kind: "help" }, "使用帮助", "help")
    if (item.target === "menu-management") openView({ kind: "system", entity: "menus" }, "菜单管理", "system:menus")
    if (item.target === "user-management") openView({ kind: "system", entity: "users" }, "用户管理", "system:users")
    if (item.target === "role-management") openView({ kind: "system", entity: "roles" }, "角色管理", "system:roles")
  }
  const isMenuActive = (item: ShellMenuItem) => {
    if (item.target === "dashboard") return activeTab.view.kind === "dashboard"
    if (item.target === "document-list") return (activeTab.view.kind === "list" && activeTab.view.typeId === item.targetId) || (activeTab.view.kind === "editor" && activeTab.view.returnTypeId === item.targetId)
    if (item.target === "menu-management") return activeTab.view.kind === "system" && activeTab.view.entity === "menus"
    if (item.target === "user-management") return activeTab.view.kind === "system" && activeTab.view.entity === "users"
    if (item.target === "role-management") return activeTab.view.kind === "system" && activeTab.view.entity === "roles"
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
    if (view.kind === "editor") return <DocumentEditor key={tab.revision} documentId={view.id} schemas={schemas} onDirtyChange={(dirty) => setDirty(tab.id, dirty)} onBack={() => { if (closeTab(tab.id)) openList(view.returnTypeId) }} onOpen={openDocument} onChanged={refreshDashboard} />
    if (view.kind === "settings" && shell && settings) return <UserSettings config={shell.config} settings={settings} onChange={setSettings} onSave={saveUserSettings} />
    if (view.kind === "system") return <SystemManagement entity={view.entity} onShellChanged={async () => { const next = await api.shell(); setShell(next) }} />
    return <UiShowcase />
  }

  if (loading) return <div className="splash"><div className="brand-mark"><Sparkles size={22} /></div><span>ZForm 正在准备工作空间...</span></div>
  if (error || !shell || !settings) return <div className="splash error-state"><strong>暂时无法连接服务</strong><span>{error}</span><span className="muted">请先在 framework 目录运行 npm run dev</span></div>

  return <div className={`app-shell ${sidebarOpen ? "" : "sidebar-collapsed"} ${settings.compactMode ? "compact-shell" : ""} ${settings.showGlobalStatusBar ? "has-status-bar" : ""}`}>
    <aside className="sidebar"><div className="brand"><div className="brand-mark"><Boxes size={20} /></div><div><strong>{shell.config.appName}</strong><span>{shell.config.appSubtitle}</span></div></div><nav>{shell.config.menuGroups.map((group) => { const items = group.items.filter(hasPermission); return items.length ? <div key={group.id}><p className="nav-label">{group.label}</p>{items.map((item) => { const Icon = menuIcons[item.icon as keyof typeof menuIcons] || FileText; return <button key={item.id} className={isMenuActive(item) ? "nav-item active" : "nav-item"} onClick={() => openMenu(item)}><Icon /><span>{item.label}</span>{item.targetId && dashboard && <em>{dashboard.typeCounts.find((count) => count.typeId === item.targetId)?.count || 0}</em>}</button>})}</div> : null })}</nav><button className="sidebar-footer" onClick={() => openView({ kind: "settings" }, "用户设置", "settings")}><div className="avatar">{shell.user.name.slice(0, 1)}</div><div><strong>{shell.user.name}</strong><span>{shell.user.roleName}</span></div><Settings /></button></aside>
    <main className="main-area"><header className="topbar"><div className="topbar-left"><IconButton aria-label={sidebarOpen ? "收起侧边栏" : "展开侧边栏"} onClick={() => setSidebarOpen((value) => !value)}>{sidebarOpen ? <PanelLeftClose /> : <Menu />}</IconButton><div className="breadcrumb"><span>{shell.config.appName}</span><b>/</b><strong>{activeTab.title}</strong></div></div><div className="topbar-actions"><div className="global-search"><Search /><input placeholder="搜索单据、客户、产品..." /><kbd>⌘ K</kbd></div><IconButton className="notification" onClick={() => setNotificationsOpen((value) => !value)} title="通知中心"><Bell />{unreadCount > 0 && <i />}</IconButton><button className="avatar small avatar-button" onClick={() => openView({ kind: "settings" }, "用户设置", "settings")}>{shell.user.name.slice(0, 1)}</button></div></header>
      <WorkspaceTabs tabs={tabs} activeId={activeId} onActivate={setActiveId} onClose={closeTab} onCloseOthers={closeOthers} onCloseAll={closeAll} onRefresh={refreshTab} />
      <section className="page-content workspace-content">{tabs.map((tab) => <div className="workspace-page" hidden={tab.id !== activeId} key={tab.id}>{renderTab(tab)}</div>)}</section>
      {settings.showGlobalStatusBar && <GlobalStatusBar user={shell.user} tabCount={tabs.length} />}
    </main>{notificationsOpen && <NotificationCenter notifications={shell.notifications} onClose={() => setNotificationsOpen(false)} onRead={readNotification} onReadAll={readAll} />}
  </div>
}
