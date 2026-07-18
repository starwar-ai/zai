import type { ActivityRecord, ApiEnvelope, DashboardData, DetailTableData, DocumentAction, DocumentListQuery, DocumentQueryRequest, DocumentQueryResult, DocumentRecord, DocumentSchema, ImpactAssessment, ListResponse, ShellBootstrapData, TraceGraph, UserShellSettings } from "@zform/shared"

const apiBase = import.meta.env.VITE_API_BASE || ""

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", "x-user-name": encodeURIComponent("林默"), "x-user-id": "framework-user", "x-user-department-id": "demo-department", ...options.headers },
  })
  const body = await response.json() as ApiEnvelope<T>
  if (!response.ok || !body.success) throw new Error(body.message || "请求失败")
  return body.data
}

export const api = {
  shell: () => request<ShellBootstrapData>("/api/shell/bootstrap"),
  saveSettings: (settings: UserShellSettings) => request<UserShellSettings>("/api/shell/settings", { method: "PUT", body: JSON.stringify(settings) }),
  readNotification: (id: string) => request<null>(`/api/shell/notifications/${id}/read`, { method: "POST" }),
  readAllNotifications: () => request<null>("/api/shell/notifications/read-all", { method: "POST" }),
  schemas: () => request<DocumentSchema[]>("/api/schemas"),
  dashboard: () => request<DashboardData>("/api/dashboard"),
  documents: (query: DocumentListQuery = {}) => {
    const params = new URLSearchParams()
    Object.entries(query).forEach(([key, value]) => { if (value !== undefined && value !== "") params.set(key, String(value)) })
    return request<ListResponse<DocumentRecord>>(`/api/documents?${params}`)
  },
  queryDocuments: (query: DocumentQueryRequest) => request<DocumentQueryResult>("/api/documents/query", { method: "POST", body: JSON.stringify(query) }),
  document: (id: string) => request<DocumentRecord>(`/api/documents/${id}`),
  activities: (documentId: string) => request<ActivityRecord[]>(`/api/activities?documentId=${documentId}`),
  trace: (documentId: string) => request<TraceGraph>(`/api/documents/${documentId}/trace`),
  impact: (documentId: string, masterData: Record<string, unknown>) => request<ImpactAssessment>(`/api/documents/${documentId}/impact`, { method: "POST", body: JSON.stringify({ masterData }) }),
  create: (typeId: string) => request<DocumentRecord>("/api/documents", { method: "POST", body: JSON.stringify({ typeId }) }),
  update: (id: string, input: { masterData: Record<string, unknown>; detailTables: DetailTableData[]; version: number }) => request<DocumentRecord>(`/api/documents/${id}`, { method: "PUT", body: JSON.stringify(input) }),
  action: (id: string, action: DocumentAction, comment?: string) => request<DocumentRecord>(`/api/documents/${id}/actions/${action}`, { method: "POST", body: JSON.stringify({ comment }) }),
  pushDown: (id: string, targetTypeId: string) => request<DocumentRecord>(`/api/documents/${id}/push-down`, { method: "POST", body: JSON.stringify({ targetTypeId }) }),
  remove: (id: string) => request<null>(`/api/documents/${id}`, { method: "DELETE" }),
}
