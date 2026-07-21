import { useEffect, useId, useRef, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"
import { Button, IconButton } from "./button"

interface DialogProps { open: boolean; title: string; description?: string; children: ReactNode; footer?: ReactNode; onClose: () => void; width?: number }

export function Dialog({ open, title, description, children, footer, onClose, width = 520 }: DialogProps) {
  const titleId = useId()
  const dialogRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!open) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    window.requestAnimationFrame(() => {
      const focusable = dialogRef.current?.querySelector<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')
      focusable?.focus()
    })
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
      if (event.key !== "Tab" || !dialogRef.current) return
      const items = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => { window.removeEventListener("keydown", handleKeyDown); document.body.style.overflow = previousOverflow; previousFocus?.focus() }
  }, [onClose, open])
  if (!open) return null
  return createPortal(<div className="ui-dialog-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section ref={dialogRef} className="ui-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} style={{ width }}><header><div><h2 id={titleId}>{title}</h2>{description && <p>{description}</p>}</div><IconButton aria-label="关闭" onClick={onClose}><X /></IconButton></header><div className="ui-dialog-content">{children}</div>{footer && <footer>{footer}</footer>}</section></div>, document.body)
}

interface ConfirmDialogProps { open: boolean; title: string; description: string; confirmLabel?: string; destructive?: boolean; onConfirm: () => void; onClose: () => void }
export function ConfirmDialog({ open, title, description, confirmLabel = "确认", destructive, onConfirm, onClose }: ConfirmDialogProps) { return <Dialog open={open} title={title} onClose={onClose} footer={<><Button onClick={onClose}>取消</Button><Button variant={destructive ? "danger" : "primary"} onClick={onConfirm}>{confirmLabel}</Button></>}><p className="ui-confirm-description">{description}</p></Dialog> }
