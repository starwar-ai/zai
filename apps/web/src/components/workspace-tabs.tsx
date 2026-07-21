import { useEffect, useState, type ReactNode } from "react"
import { MoreHorizontal, RefreshCw, X } from "lucide-react"
import type { WorkspaceTab } from "@/types/workspace"

interface WorkspaceTabsProps {
  tabs: WorkspaceTab[]
  activeId: string
  onActivate: (id: string) => void
  onClose: (id: string) => void
  onCloseOthers: (id: string) => void
  onCloseAll: () => void
  onRefresh: (id: string) => void
  onMove?: (sourceId: string, targetId: string) => void
  endActions?: ReactNode
}

export function WorkspaceTabs({ tabs, activeId, onActivate, onClose, onCloseOthers, onCloseAll, onRefresh, onMove, endActions }: WorkspaceTabsProps) {
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  useEffect(() => { const close = () => setMenu(null); window.addEventListener("click", close); return () => window.removeEventListener("click", close) }, [])
  const activeMenuTab = tabs.find((tab) => tab.id === menu?.id)
  return <div className="workspace-tabs">
    <div className="workspace-tab-scroll">{tabs.map((tab) => <button key={tab.id} draggable={Boolean(tab.closable && onMove)} className={`${tab.id === activeId ? "workspace-tab active" : "workspace-tab"}${draggingId === tab.id ? " dragging" : ""}`} onDragStart={() => setDraggingId(tab.id)} onDragEnd={() => setDraggingId(null)} onDragOver={(event) => { if (draggingId && tab.closable) event.preventDefault() }} onDrop={() => { if (draggingId && draggingId !== tab.id && tab.closable) onMove?.(draggingId, tab.id); setDraggingId(null) }} onClick={() => onActivate(tab.id)} onContextMenu={(event) => { event.preventDefault(); setMenu({ id: tab.id, x: event.clientX, y: event.clientY }) }}><span>{tab.title}</span>{tab.dirty && <i title="有未保存的更改" />}{tab.closable && <X onClick={(event) => { event.stopPropagation(); onClose(tab.id) }} />}</button>)}</div>
    <div className="workspace-tab-actions">{endActions}<button className="tabs-more" title="标签操作" onClick={(event) => setMenu({ id: activeId, x: event.clientX - 120, y: event.clientY + 8 })}><MoreHorizontal /></button></div>
    {menu && activeMenuTab && <div className="tab-context-menu" style={{ left: menu.x, top: menu.y }} onClick={(event) => event.stopPropagation()}><button onClick={() => { onRefresh(menu.id); setMenu(null) }}><RefreshCw />刷新标签</button><button disabled={!activeMenuTab.closable} onClick={() => { onClose(menu.id); setMenu(null) }}><X />关闭标签</button><button onClick={() => { onCloseOthers(menu.id); setMenu(null) }}>关闭其他</button><button onClick={() => { onCloseAll(); setMenu(null) }}>关闭全部</button></div>}
  </div>
}
