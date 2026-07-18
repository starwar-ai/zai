import type { ActivityRecord, ApiEnvelope, DashboardData, DetailTableData, DocumentAction, DocumentListQuery, DocumentQueryRequest, DocumentQueryResult, DocumentRecord, DocumentSchema, ImpactAssessment, ListResponse, RoleRecord, ShellBootstrapData, SystemManagementData, SystemMenuRecord, TraceGraph, UserRecord, UserShellSettings } from "@zform/shared"

// Framework API 的唯一前端入口，组件中不要散落原始 fetch。

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
  systemManagement: () => request<SystemManagementData>("/api/system-management"),
  createMenu: (input: SystemMenuRecord) => request<SystemMenuRecord>("/api/system-management/menus", { method: "POST", body: JSON.stringify(input) }),
  updateMenu: (id: string, input: Omit<SystemMenuRecord, "id">) => request<SystemMenuRecord>(`/api/system-management/menus/${id}`, { method: "PUT", body: JSON.stringify(input) }),
  removeMenu: (id: string) => request<null>(`/api/system-management/menus/${id}`, { method: "DELETE" }),
  createRole: (input: Pick<RoleRecord, "code" | "name" | "description" | "permissions">) => request<RoleRecord>("/api/system-management/roles", { method: "POST", body: JSON.stringify(input) }),
  updateRole: (id: string, input: Pick<RoleRecord, "name" | "description" | "permissions">) => request<RoleRecord>(`/api/system-management/roles/${id}`, { method: "PUT", body: JSON.stringify(input) }),
  removeRole: (id: string) => request<null>(`/api/system-management/roles/${id}`, { method: "DELETE" }),
  createUser: (input: Omit<UserRecord, "roles" | "createdAt" | "updatedAt"> & { roleIds: string[] }) => request<UserRecord>("/api/system-management/users", { method: "POST", body: JSON.stringify(input) }),
  updateUser: (id: string, input: Omit<UserRecord, "id" | "roles" | "createdAt" | "updatedAt"> & { roleIds: string[] }) => request<UserRecord>(`/api/system-management/users/${id}`, { method: "PUT", body: JSON.stringify(input) }),
  removeUser: (id: string) => request<null>(`/api/system-management/users/${id}`, { method: "DELETE" }),
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
