import { useEffect, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"
import { Button, IconButton } from "./button"

interface DialogProps { open: boolean; title: string; description?: string; children: ReactNode; footer?: ReactNode; onClose: () => void; width?: number }

export function Dialog({ open, title, description, children, footer, onClose, width = 520 }: DialogProps) {
  useEffect(() => { if (!open) return; const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose() }; window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close) }, [onClose, open])
  if (!open) return null
  return createPortal(<div className="ui-dialog-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="ui-dialog" role="dialog" aria-modal="true" aria-labelledby="ui-dialog-title" style={{ width }}><header><div><h2 id="ui-dialog-title">{title}</h2>{description && <p>{description}</p>}</div><IconButton aria-label="关闭" onClick={onClose}><X /></IconButton></header><div className="ui-dialog-content">{children}</div>{footer && <footer>{footer}</footer>}</section></div>, document.body)
}

interface ConfirmDialogProps { open: boolean; title: string; description: string; confirmLabel?: string; destructive?: boolean; onConfirm: () => void; onClose: () => void }
export function ConfirmDialog({ open, title, description, confirmLabel = "确认", destructive, onConfirm, onClose }: ConfirmDialogProps) { return <Dialog open={open} title={title} onClose={onClose} footer={<><Button onClick={onClose}>取消</Button><Button variant={destructive ? "danger" : "primary"} onClick={onConfirm}>{confirmLabel}</Button></>}><p className="ui-confirm-description">{description}</p></Dialog> }
