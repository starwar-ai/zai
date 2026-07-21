import type { ActivityRecord, ApiEnvelope, CustomerResearchImportRequest, CustomerResearchImportResult, CustomerResearchProcessResult, CustomerResearchQueueSummary, DashboardData, DeclarationNameApproveRequest, DeclarationNameInput, DeclarationNameJob, DeclarationNameMapping, DeclarationNameRejectRequest, DeclarationNameResolveRequest, DeclarationNameResolveResult, DeclarationNameWritebackRequest, DeclarationNameWritebackResult, DepartmentInput, DepartmentRecord, DocumentAction, DocumentListQuery, DocumentQueryRequest, DocumentQueryResult, DocumentRecord, DocumentSchema, DocumentUpdateRequest, ImpactAssessment, ListResponse, OcrExportRequest, OcrExportResult, OcrRecognitionQuery, OcrRecognitionRecord, OcrRecognizeRequest, OcrRecognizeResult, RoleRecord, ShellBootstrapData, SystemManagementData, SystemMenuRecord, TraceGraph, UserRecord, UserShellSettings } from "@zform/shared"

// Framework API 的唯一前端入口，组件中不要散落原始 fetch。

const apiBase = import.meta.env.VITE_API_BASE || ""
const identityHeaders = { "x-user-name": encodeURIComponent("林默"), "x-user-id": "framework-user", "x-user-department-id": "demo-department" }

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...identityHeaders, ...options.headers },
  })
  const body = await response.json() as ApiEnvelope<T>
  if (!response.ok || !body.success) throw new Error(body.message || "请求失败")
  return body.data
}

async function requestBlob(path: string): Promise<Blob> {
  const response = await fetch(`${apiBase}${path}`, { headers: identityHeaders })
  if (!response.ok) { const body = await response.json() as ApiEnvelope<unknown>; throw new Error(body.message || "请求失败") }
  return response.blob()
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
  createDepartment: (input: DepartmentInput) => request<DepartmentRecord>("/api/system-management/departments", { method: "POST", body: JSON.stringify(input) }),
  updateDepartment: (id: string, input: DepartmentInput) => request<DepartmentRecord>(`/api/system-management/departments/${id}`, { method: "PUT", body: JSON.stringify(input) }),
  removeDepartment: (id: string) => request<null>(`/api/system-management/departments/${id}`, { method: "DELETE" }),
  recognizeOcr: (input: OcrRecognizeRequest) => request<OcrRecognizeResult>("/api/ocr/recognitions", { method: "POST", body: JSON.stringify(input) }),
  ocrRecognitions: (query: OcrRecognitionQuery = {}) => { const params = new URLSearchParams(); Object.entries(query).forEach(([key, value]) => { if (value !== undefined && value !== "") params.set(key, String(value)) }); return request<ListResponse<OcrRecognitionRecord>>(`/api/ocr/recognitions?${params}`) },
  ocrRecognition: (id: string) => request<OcrRecognitionRecord>(`/api/ocr/recognitions/${id}`),
  ocrImage: (id: string) => requestBlob(`/api/ocr/recognitions/${id}/image`),
  removeOcrRecognition: (id: string) => request<null>(`/api/ocr/recognitions/${id}`, { method: "DELETE" }),
  exportOcrRecognitions: (input: OcrExportRequest) => request<OcrExportResult>("/api/ocr/recognitions/export", { method: "POST", body: JSON.stringify(input) }),
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
  update: (id: string, input: DocumentUpdateRequest) => request<DocumentRecord>(`/api/documents/${id}`, { method: "PUT", body: JSON.stringify(input) }),
  action: (id: string, action: DocumentAction, comment?: string) => request<DocumentRecord>(`/api/documents/${id}/actions/${action}`, { method: "POST", body: JSON.stringify({ comment }) }),
  pushDown: (id: string, targetTypeId: string) => request<DocumentRecord>(`/api/documents/${id}/push-down`, { method: "POST", body: JSON.stringify({ targetTypeId }) }),
  remove: (id: string) => request<null>(`/api/documents/${id}`, { method: "DELETE" }),
  customerResearchSummary: () => request<CustomerResearchQueueSummary>("/api/customer-research/summary"),
  importCustomerResearch: (input: CustomerResearchImportRequest) => request<CustomerResearchImportResult>("/api/customer-research/import", { method: "POST", body: JSON.stringify(input) }),
  processNextCustomerResearch: () => request<CustomerResearchProcessResult>("/api/customer-research/process-next", { method: "POST" }),
  retryCustomerResearch: (id: string) => request<DocumentRecord>(`/api/customer-research/${id}/retry`, { method: "POST" }),
  resolveDeclarationNames: (input: DeclarationNameResolveRequest) => request<DeclarationNameResolveResult>("/api/declaration-names/resolve", { method: "POST", body: JSON.stringify(input) }),
  generateDeclarationNames: (items: DeclarationNameInput[]) => request<{ jobId: string; inputCount: number }>("/api/declaration-names/generate", { method: "POST", body: JSON.stringify({ items }) }),
  declarationNameJob: (id: string) => request<DeclarationNameJob>(`/api/declaration-names/jobs/${id}`),
  declarationNameReviews: (query: { keyword?: string; page?: number; pageSize?: number } = {}) => {
    const params = new URLSearchParams()
    Object.entries(query).forEach(([key, value]) => { if (value !== undefined && value !== "") params.set(key, String(value)) })
    return request<ListResponse<DeclarationNameMapping>>(`/api/declaration-names/reviews?${params}`)
  },
  approveDeclarationName: (id: string, input: DeclarationNameApproveRequest) => request<DeclarationNameMapping>(`/api/declaration-names/mappings/${id}/approve`, { method: "POST", body: JSON.stringify(input) }),
  rejectDeclarationName: (id: string, input: DeclarationNameRejectRequest) => request<DeclarationNameMapping>(`/api/declaration-names/mappings/${id}/reject`, { method: "POST", body: JSON.stringify(input) }),
  writebackDeclarationNames: (input: DeclarationNameWritebackRequest) => request<DeclarationNameWritebackResult>("/api/declaration-names/writeback", { method: "POST", body: JSON.stringify(input) }),
}
