export type FormMode = "create" | "edit" | "copy" | "view"

export type BuiltInFieldType =
  | "text" | "number" | "date" | "select" | "textarea" | "checkbox"
  | "computed" | "combobox" | "dimensions" | "price" | "ratio"

export type FieldType = BuiltInFieldType | `custom:${string}`

export interface SelectOption { label: string; value: string; disabled?: boolean }

export type ConditionOperator = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "notIn" | "contains" | "empty" | "notEmpty"
export type ConditionExpression =
  | { field: string; operator: ConditionOperator; value?: unknown }
  | { all: ConditionExpression[] }
  | { any: ConditionExpression[] }
  | { not: ConditionExpression }

export type FormulaOperator = "sum" | "subtract" | "multiply" | "divide" | "average" | "concat" | "template"
export interface FormulaDefinition {
  operator: FormulaOperator
  fields?: string[]
  values?: Array<string | number | boolean>
  template?: string
  precision?: number
  fallback?: string | number
}

export interface DimensionsConfig { lengthField: string; widthField: string; heightField: string; unit?: string }
export interface PriceConfig { amountField: string; currencyField: string; currencies?: SelectOption[] }
export interface RatioConfig { numeratorField: string; denominatorField: string; suffix?: string }
export interface ComboboxConfig { options?: SelectOption[]; dataSourceId?: string; searchable?: boolean }

export interface FieldSchema {
  id: string
  label: string
  type: FieldType
  required?: boolean
  readOnly?: boolean
  readOnlyModes?: FormMode[]
  placeholder?: string
  helpText?: string
  group?: string
  span?: 1 | 2
  options?: SelectOption[]
  defaultValue?: string | number | boolean
  visibleWhen?: ConditionExpression
  requiredWhen?: ConditionExpression
  readOnlyWhen?: ConditionExpression
  compute?: FormulaDefinition
  effectIds?: string[]
  combobox?: ComboboxConfig
  dimensions?: DimensionsConfig
  price?: PriceConfig
  ratio?: RatioConfig
}

export interface FieldEffectDefinition {
  id: string
  handlerId: string
  watchFields: string[]
  modes?: FormMode[]
  params?: Record<string, unknown>
}

export interface RowSelectorDefinition {
  pluginId: string
  buttonLabel?: string
  multiple?: boolean
  params?: Record<string, unknown>
}

export interface DetailTableSchema {
  id: string
  label: string
  fields: FieldSchema[]
  minRows?: number
  maxRows?: number
  visibleWhen?: ConditionExpression
  rowSelector?: RowSelectorDefinition
}

export type DocumentAction = "submit" | "approve" | "reject" | "complete" | "cancel"
export type ActionVariant = "primary" | "secondary" | "success" | "danger"

export interface FormActionDefinition {
  id: string
  label: string
  command: "save" | "workflow" | "pushDown" | `custom:${string}`
  workflowAction?: DocumentAction
  targetTypeId?: string
  allowedStatuses?: DocumentStatus[]
  modes?: FormMode[]
  visibleWhen?: ConditionExpression
  disabledWhen?: ConditionExpression
  variant?: ActionVariant
  confirmation?: string
  order?: number
}

export interface ListActionDefinition {
  id: string
  label: string
  command: "open" | "delete" | "copy" | `custom:${string}`
  allowedStatuses?: DocumentStatus[]
  variant?: ActionVariant
}

export type ListMode = "document" | "detail"
export type ListColumnSource = "system" | "master" | "detail"
export type ListDataType = "text" | "number" | "date" | "datetime" | "status" | "boolean"
export type ListFilterOperator = "eq" | "neq" | "contains" | "startsWith" | "endsWith" | "gt" | "gte" | "lt" | "lte" | "between" | "in" | "empty" | "notEmpty"
export type ListAggregateFunction = "count" | "sum" | "avg" | "min" | "max"

export interface ListColumnDefinition {
  id: string
  label: string
  source: ListColumnSource
  /** Schema 逻辑路径，由服务端映射到系统字段、masterData 或明细行 data。 */
  path: string
  dataType?: ListDataType
  sortable?: boolean
  filterable?: boolean
  width?: number
}

export interface ListSortDefinition { columnId: string; direction: "asc" | "desc" }
export interface ListFilterCondition { columnId: string; operator: ListFilterOperator; value?: unknown; secondValue?: unknown }
export interface ListFilterGroup { logic: "and" | "or"; conditions: Array<ListFilterCondition | ListFilterGroup> }
export interface ListAggregateDefinition { id: string; label: string; columnId: string; function: ListAggregateFunction }

export interface ToolbarActionDefinition {
  id: string
  label: string
  command: "create" | "export" | "bulkDelete" | `custom:${string}`
  requiresSelection?: boolean
  modes?: ListMode[]
  variant?: ActionVariant
}

export interface DocumentListDefinition {
  columns: ListColumnDefinition[]
  modes?: ListMode[]
  defaultMode?: ListMode
  detailTableId?: string
  defaultSorting?: ListSortDefinition[]
  aggregates?: ListAggregateDefinition[]
  rowActions?: ListActionDefinition[]
  toolbarActions?: ToolbarActionDefinition[]
}

export interface FieldMappingDefinition {
  source: string
  target: string
  defaultValue?: unknown
  formula?: FormulaDefinition
}

export interface DetailMappingDefinition {
  sourceTableId: string
  targetTableId: string
  fields: FieldMappingDefinition[]
  rowFilter?: ConditionExpression
}

export interface PushDownRuleDefinition {
  id: string
  label: string
  targetTypeId: string
  allowedStatuses?: DocumentStatus[]
  masterFields: FieldMappingDefinition[]
  detailTables: DetailMappingDefinition[]
}

export type ImpactLevel = "info" | "warning" | "critical"
export interface ImpactRuleDefinition {
  id: string
  watchFields: string[]
  level: ImpactLevel
  message: string
  blocksSave?: boolean
  downstreamStatuses?: DocumentStatus[]
}

export interface ExtraTabDefinition { id: string; label: string; pluginId: string; params?: Record<string, unknown> }

export interface DocumentSchema {
  typeId: string
  typeName: string
  description: string
  icon: string
  codePrefix: string
  masterFields: FieldSchema[]
  detailTables: DetailTableSchema[]
  effects?: FieldEffectDefinition[]
  formActions?: FormActionDefinition[]
  listActions?: ListActionDefinition[]
  list?: DocumentListDefinition
  pushDownRules?: PushDownRuleDefinition[]
  impactRules?: ImpactRuleDefinition[]
  extraTabs?: ExtraTabDefinition[]
  /** @deprecated 使用 formActions。保留用于兼容旧 Schema。 */
  actions?: Partial<Record<DocumentStatus, DocumentAction[]>>
  /** @deprecated 使用 pushDownRules。 */
  pushDownTargets?: string[]
}

export type DocumentStatus = "DRAFT" | "PENDING" | "APPROVED" | "IN_PROGRESS" | "COMPLETED" | "REJECTED" | "CANCELLED"

export interface SourceReference { documentId: string; typeId: string; code: string }
export interface RowSourceReference extends SourceReference { tableId: string; rowId: string }
export interface DetailRowData { id: string; data: Record<string, unknown>; sourceRef?: RowSourceReference }
export interface DetailTableData { tableId: string; rows: DetailRowData[] }

export interface DocumentRecord {
  id: string
  typeId: string
  code: string
  status: DocumentStatus
  masterData: Record<string, unknown>
  detailTables: DetailTableData[]
  sourceRef?: SourceReference
  createdAt: string
  updatedAt: string
  createdBy: string
  version: number
}

export interface ActivityRecord { id: string; documentId: string; action: string; operator: string; message: string; createdAt: string }
export interface ListResponse<T> { items: T[]; total: number; page: number; pageSize: number; pageCount: number }
export interface DocumentListQuery { typeId?: string; status?: DocumentStatus; search?: string; page?: number; pageSize?: number; sortBy?: "code" | "status" | "createdAt" | "updatedAt"; sortDirection?: "asc" | "desc" }

export interface DocumentQueryRequest {
  typeId: string
  mode?: ListMode
  detailTableId?: string
  search?: string
  filters?: ListFilterGroup
  sorting?: ListSortDefinition[]
  aggregateIds?: string[]
  page?: number
  pageSize?: number
}

export interface DocumentListRow {
  key: string
  documentId: string
  rowId?: string
  typeId: string
  code: string
  status: DocumentStatus
  createdBy: string
  createdAt: string
  updatedAt: string
  sourceRef?: SourceReference | RowSourceReference
  values: Record<string, unknown>
}

export interface ListAggregateResult { id: string; label: string; function: ListAggregateFunction; value: number | string | null }
export interface DocumentQueryResult extends ListResponse<DocumentListRow> { aggregates: ListAggregateResult[] }

export interface ImpactItem { ruleId: string; level: ImpactLevel; field: string; message: string; downstreamDocuments: SourceReference[]; blocksSave: boolean }
export interface ImpactAssessment { canProceed: boolean; items: ImpactItem[]; summary: string }
export interface TraceGraph { upstream?: SourceReference; downstream: SourceReference[] }

export interface DashboardData {
  totalDocuments: number
  pendingApprovals: number
  inProgress: number
  completedThisMonth: number
  statusCounts: Record<DocumentStatus, number>
  typeCounts: Array<{ typeId: string; typeName: string; count: number }>
  recentDocuments: DocumentRecord[]
  recentActivities: ActivityRecord[]
}

export type ShellTheme = "light" | "system"
export type DashboardWidgetId = "metrics" | "recent-documents" | "business-distribution" | "business-flow" | "recent-activities"

export interface ShellMenuItem {
  id: string
  label: string
  icon: string
  target: "dashboard" | "document-list" | "settings" | "help"
  targetId?: string
  requiredPermissions?: string[]
}

export interface ShellMenuGroup { id: string; label: string; items: ShellMenuItem[] }
export interface DashboardWidgetDefinition { id: DashboardWidgetId; label: string; defaultVisible: boolean; order: number }
export interface ApplicationShellConfig { appName: string; appSubtitle: string; menuGroups: ShellMenuGroup[]; dashboardWidgets: DashboardWidgetDefinition[] }
export interface ShellUser { id: string; name: string; roleName: string; departmentName?: string; permissions: string[] }
export interface UserShellSettings { theme: ShellTheme; compactMode: boolean; sidebarCollapsed: boolean; dashboardWidgetIds: DashboardWidgetId[]; showGlobalStatusBar: boolean }

export type NotificationLevel = "info" | "success" | "warning" | "error"
export interface UserNotification {
  id: string
  title: string
  content: string
  level: NotificationLevel
  readAt?: string
  createdAt: string
  target?: { kind: "dashboard" | "document" | "document-list"; id?: string; typeId?: string }
}

export interface ShellBootstrapData { config: ApplicationShellConfig; user: ShellUser; settings: UserShellSettings; notifications: UserNotification[] }

export interface ApiEnvelope<T> { success: boolean; message: string; data: T }

export const STATUS_LABELS: Record<DocumentStatus, string> = { DRAFT: "草稿", PENDING: "待审批", APPROVED: "已审批", IN_PROGRESS: "执行中", COMPLETED: "已完成", REJECTED: "已驳回", CANCELLED: "已取消" }
export const ACTION_LABELS: Record<DocumentAction, string> = { submit: "提交审批", approve: "审批通过", reject: "驳回", complete: "完成", cancel: "取消" }

export * from "./runtime.js"
