import type { HTMLAttributes, ReactNode } from "react"
import { cn } from "./utils"

export function Card({ className, ...props }: HTMLAttributes<HTMLElement>) { return <article className={cn("panel ui-card", className)} {...props} /> }
export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) { return <div className={cn("panel-header ui-card-header", className)} {...props} /> }
export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) { return <div className={cn("ui-card-content", className)} {...props} /> }
export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) { return <div className={cn("ui-card-footer", className)} {...props} /> }
export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) { return <h2 className={cn("ui-card-title", className)} {...props} /> }
export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) { return <p className={cn("ui-card-description", className)} {...props} /> }

interface PageHeaderProps {
  eyebrow?: string
  title: string
  description?: ReactNode
  actions?: ReactNode
  compact?: boolean
}

export function PageHeader({ eyebrow, title, description, actions, compact = true }: PageHeaderProps) {
  return <div className={cn("page-heading", compact && "compact", "ui-page-header")}><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className="heading-actions">{actions}</div>}</div>
}
