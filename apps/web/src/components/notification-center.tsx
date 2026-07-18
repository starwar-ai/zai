import { CheckCheck, CircleAlert, CircleCheck, Info, TriangleAlert, X } from "lucide-react"
import type { UserNotification } from "@zform/shared"
import { formatDate } from "@/components/status-pill"
import { EmptyState, IconButton } from "@/components/ui"

interface NotificationCenterProps { notifications: UserNotification[]; onClose: () => void; onRead: (notification: UserNotification) => void; onReadAll: () => void }

const icons = { info: Info, success: CircleCheck, warning: TriangleAlert, error: CircleAlert }

export function NotificationCenter({ notifications, onClose, onRead, onReadAll }: NotificationCenterProps) {
  const unread = notifications.filter((item) => !item.readAt).length
  return <aside className="notification-panel"><header><div><strong>通知中心</strong><span>{unread} 条未读</span></div><IconButton aria-label="关闭通知中心" onClick={onClose}><X /></IconButton></header><div className="notification-tools"><button onClick={onReadAll} disabled={!unread}><CheckCheck />全部已读</button></div><div className="notification-list">{notifications.map((item) => { const Icon = icons[item.level]; return <button key={item.id} className={item.readAt ? "read" : ""} onClick={() => onRead(item)}><Icon className={item.level} /><span><strong>{item.title}</strong><p>{item.content}</p><small>{formatDate(item.createdAt, true)}</small></span>{!item.readAt && <i />}</button> })}{!notifications.length && <EmptyState title="暂时没有通知" className="notification-empty" />}</div></aside>
}
