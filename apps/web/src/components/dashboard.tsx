import type { DashboardData, DashboardWidgetId, DocumentRecord, DocumentSchema } from "@zform/shared"

interface DashboardProps {
  data: DashboardData
  schemas: DocumentSchema[]
  onOpenDocument: (document: DocumentRecord) => void
  onOpenList: (typeId: string) => void
  visibleWidgets: DashboardWidgetId[]
}

export function Dashboard(_props: DashboardProps) {
  return <div className="dashboard-empty" aria-label="工作台" />
}
