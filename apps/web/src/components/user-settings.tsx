import { Save } from "lucide-react"
import type { ApplicationShellConfig, DashboardWidgetId, UserShellSettings } from "@zform/shared"
import { Button, Card, Checkbox, PageHeader } from "@/components/ui"

interface UserSettingsProps { config: ApplicationShellConfig; settings: UserShellSettings; onChange: (settings: UserShellSettings) => void; onSave: () => Promise<void> }

export function UserSettings({ config, settings, onChange, onSave }: UserSettingsProps) {
  const toggleWidget = (id: DashboardWidgetId) => onChange({ ...settings, dashboardWidgetIds: settings.dashboardWidgetIds.includes(id) ? settings.dashboardWidgetIds.filter((item) => item !== id) : [...settings.dashboardWidgetIds, id] })
  return <><PageHeader eyebrow="应用外壳 / 个性化" title="用户设置" description="配置自己的工作区布局和显示偏好。" actions={<Button variant="primary" onClick={onSave}><Save />保存设置</Button>} /><div className="settings-grid"><Card className="settings-card"><h2>界面偏好</h2><label><span>紧凑模式<small>缩小页面间距，展示更多内容</small></span><Checkbox checked={settings.compactMode} onChange={(event) => onChange({ ...settings, compactMode: event.target.checked })} /></label><label><span>全局状态栏<small>显示连接状态、环境和当前用户</small></span><Checkbox checked={settings.showGlobalStatusBar} onChange={(event) => onChange({ ...settings, showGlobalStatusBar: event.target.checked })} /></label><label><span>默认收起侧边栏<small>下次登录时应用</small></span><Checkbox checked={settings.sidebarCollapsed} onChange={(event) => onChange({ ...settings, sidebarCollapsed: event.target.checked })} /></label></Card><Card className="settings-card"><h2>工作台组件</h2>{[...config.dashboardWidgets].sort((left, right) => left.order - right.order).map((widget) => <label key={widget.id}><span>{widget.label}</span><Checkbox checked={settings.dashboardWidgetIds.includes(widget.id)} onChange={() => toggleWidget(widget.id)} /></label>)}</Card></div></>
}
