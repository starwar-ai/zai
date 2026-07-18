import type { HTMLAttributes, ReactNode } from "react"
import { AlertCircle, CheckCircle2, Info, LoaderCircle, TriangleAlert } from "lucide-react"
import { cn } from "./utils"

export type BadgeVariant = "neutral" | "primary" | "success" | "warning" | "danger"
export function Badge({ variant = "neutral", className, ...props }: HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) { return <span className={cn("ui-badge", `ui-badge-${variant}`, className)} {...props} /> }

export type AlertVariant = "info" | "success" | "warning" | "danger"
const alertIcons = { info: Info, success: CheckCircle2, warning: TriangleAlert, danger: AlertCircle }
export function Alert({ variant = "info", title, children, className }: { variant?: AlertVariant; title?: string; children: ReactNode; className?: string }) { const Icon = alertIcons[variant]; return <div className={cn("ui-alert", `ui-alert-${variant}`, className)} role="alert"><Icon /><div>{title && <strong>{title}</strong>}<div>{children}</div></div></div> }

export function Spinner({ label = "正在加载...", className }: { label?: string; className?: string }) { return <span className={cn("ui-spinner", className)} role="status"><LoaderCircle className="spin" /><span>{label}</span></span> }

export function EmptyState({ icon, title, description, action, className }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode; className?: string }) { return <div className={cn("empty-state", "ui-empty-state", className)}>{icon}<p>{title}</p>{description && <span>{description}</span>}{action && <div>{action}</div>}</div> }
