import { STATUS_LABELS, type DocumentStatus } from "@zform/shared"

export function StatusPill({ status }: { status: DocumentStatus }) {
  return <span className={`status-pill status-${status.toLowerCase()}`}><i />{STATUS_LABELS[status]}</span>
}

export function formatDate(value: string, includeTime = false): string {
  return new Intl.DateTimeFormat("zh-CN", includeTime ? { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" } : { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value))
}
