import type { ActivityRecord, ApiEnvelope, CustomerResearchBatchRequest, CustomerResearchBatchResult, CustomerResearchImportRequest, CustomerResearchImportResult, CustomerResearchModelConfig, CustomerResearchProcessRequest, CustomerResearchProcessResult, CustomerResearchQueueSummary, DashboardData, DeclarationNameApproveRequest, DeclarationNameInput, DeclarationNameJob, DeclarationNameMapping, DeclarationNameRejectRequest, DeclarationNameResolveRequest, DeclarationNameResolveResult, DeclarationNameWritebackRequest, DeclarationNameWritebackResult, DepartmentInput, DepartmentRecord, DocumentAction, DocumentCreateRequest, DocumentListQuery, DocumentQueryRequest, DocumentQueryResult, DocumentRecord, DocumentSchema, DocumentUpdateRequest, ImpactAssessment, ListResponse, OcrExportRequest, OcrExportResult, OcrRecognitionQuery, OcrRecognitionRecord, OcrRecognizeRequest, OcrRecognizeResult, RoleRecord, ShellBootstrapData, SystemManagementData, SystemMenuRecord, TraceGraph, UserRecord, UserShellSettings } from "@zform/shared"

// Framework API 的唯一前端入口，组件中不要散落原始 fetch。

const apiBase = import.meta.env.VITE_API_BASE || ""
const identityHeaders = { "x-user-name": encodeURIComponent("林默"), "x-user-id": "framework-user", "x-user-department-id": "demo-department" }

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${apiBase}${path}`, { ...options, headers: { "Content-Type": "application/json", ...identityHeaders, ...options.headers } })
  } catch (reason) {
    throw new Error(reason instanceof Error && reason.message ? `无法连接 API：${reason.message}` : "无法连接 API，请确认服务正在运行")
  }
  const responseText = await response.text()
  if (!responseText.trim()) throw new Error(`API 未返回数据（HTTP ${response.status}），服务可能已异常退出`)
  let body: ApiEnvelope<T>
  try { body = JSON.parse(responseText) as ApiEnvelope<T> }
  catch { throw new Error(`API 返回了无效数据（HTTP ${response.status}）`) }
  if (!response.ok || !body.success) throw new Error(body.message || "请求失败")
  return body.data
}

async function requestBlob(path: string): Promise<Blob> {
  const response = await fetch(`${apiBase}${path}`, { headers: identityHeaders })
  if (!response.ok) { const body = await response.json() as ApiEnvelope<unknown>; throw new Error(body.message || "请求失败") }
  return response.blob()
}

export type CustomerResearchStreamEvent = { type: "status"; message: string } | { type: "delta"; kind: "search" | "content" | "reasoning"; delta: string } | { type: "complete"; documentId?: string } | { type: "error"; message: string }
async function requestCustomerResearchStream(id: string, input: CustomerResearchProcessRequest, onEvent: (event: CustomerResearchStreamEvent) => void): Promise<void> {
  const response = await fetch(`${apiBase}/api/customer-research/${id}/process-stream`, { method: "POST", headers: { "Content-Type": "application/json", ...identityHeaders }, body: JSON.stringify(input) })
  if (!response.ok || !response.body) throw new Error(`无法启动流式调查（HTTP ${response.status}）`)
  const reader = response.body.getReader(); const decoder = new TextDecoder()
  let buffer = ""; let errorMessage = ""
  const consume = (line: string) => {
    if (!line.trim()) return
    const event = JSON.parse(line) as CustomerResearchStreamEvent
    onEvent(event)
    if (event.type === "error") errorMessage = event.message
  }
  while (true) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done })
    const lines = buffer.split(/\r?\n/); buffer = lines.pop() || ""
    lines.forEach(consume)
    if (done) break
  }
  if (buffer.trim()) consume(buffer)
  if (errorMessage) throw new Error(errorMessage)
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
  ocrRecognitions: (query: OcrRecognitionQuery) => { const params = new URLSearchParams(); Object.entries(query).forEach(([key, value]) => { if (value !== undefined && value !== "") params.set(key, String(value)) }); return request<ListResponse<OcrRecognitionRecord>>(`/api/ocr/recognitions?${params}`) },
  ocrRecognition: (type: "PAYMENT" | "INVOICE", id: string) => request<OcrRecognitionRecord>(`/api/ocr/recognitions/${id}?recognitionType=${type}`),
  ocrImage: (type: "PAYMENT" | "INVOICE", id: string) => requestBlob(`/api/ocr/recognitions/${id}/image?recognitionType=${type}`),
  removeOcrRecognition: (type: "PAYMENT" | "INVOICE", id: string) => request<null>(`/api/ocr/recognitions/${id}?recognitionType=${type}`, { method: "DELETE" }),
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
  create: (input: DocumentCreateRequest) => request<DocumentRecord>("/api/documents", { method: "POST", body: JSON.stringify(input) }),
  update: (id: string, input: DocumentUpdateRequest) => request<DocumentRecord>(`/api/documents/${id}`, { method: "PUT", body: JSON.stringify(input) }),
  action: (id: string, action: DocumentAction, comment?: string) => request<DocumentRecord>(`/api/documents/${id}/actions/${action}`, { method: "POST", body: JSON.stringify({ comment }) }),
  pushDown: (id: string, targetTypeId: string) => request<DocumentRecord>(`/api/documents/${id}/push-down`, { method: "POST", body: JSON.stringify({ targetTypeId }) }),
  remove: (id: string) => request<null>(`/api/documents/${id}`, { method: "DELETE" }),
  customerResearchSummary: () => request<CustomerResearchQueueSummary>("/api/customer-research/summary"),
  customerResearchModels: () => request<CustomerResearchModelConfig>("/api/customer-research/models"),
  importCustomerResearch: (input: CustomerResearchImportRequest) => request<CustomerResearchImportResult>("/api/customer-research/import", { method: "POST", body: JSON.stringify(input) }),
  processCustomerResearchBatch: (input: CustomerResearchBatchRequest) => request<CustomerResearchBatchResult>("/api/customer-research/process-batch", { method: "POST", body: JSON.stringify(input) }),
  processNextCustomerResearch: () => request<CustomerResearchProcessResult>("/api/customer-research/process-next", { method: "POST" }),
  processCustomerResearch: (id: string, input: CustomerResearchProcessRequest) => request<CustomerResearchProcessResult>(`/api/customer-research/${id}/process`, { method: "POST", body: JSON.stringify(input) }),
  streamCustomerResearch: requestCustomerResearchStream,
  retryCustomerResearch: (id: string) => request<DocumentRecord>(`/api/customer-research/${id}/retry`, { method: "POST" }),
  exportCustomerResearchReport: (id: string) => requestBlob(`/api/customer-research/${id}/report.pdf`),
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
