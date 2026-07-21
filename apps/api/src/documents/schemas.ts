import type { DocumentListDefinition, DocumentSchema, FieldSchema, FormActionDefinition, ListActionDefinition } from "@zform/shared"
import { BusinessError } from "../utils/business-error.js"

// 单据定义只包含可序列化元数据，业务接入不需要新增路由或控制器。

const statusField: FieldSchema = {
  id: "status",
  label: "单据状态",
  type: "select",
  readOnly: true,
  group: "基本信息",
  options: [
    { label: "草稿", value: "DRAFT" },
    { label: "待审批", value: "PENDING" },
    { label: "已审批", value: "APPROVED" },
    { label: "执行中", value: "IN_PROGRESS" },
    { label: "已完成", value: "COMPLETED" },
    { label: "已驳回", value: "REJECTED" },
    { label: "已取消", value: "CANCELLED" },
  ],
}

const commonActions: DocumentSchema["actions"] = {
  DRAFT: ["submit", "cancel"],
  REJECTED: ["submit", "cancel"],
  PENDING: ["approve", "reject"],
  APPROVED: ["complete", "cancel"],
  IN_PROGRESS: ["complete", "cancel"],
}

const commonFormActions: FormActionDefinition[] = [
  { id: "save", label: "保存", command: "save", modes: ["create", "edit", "copy"], allowedStatuses: ["DRAFT", "REJECTED"], variant: "primary", order: 10 },
  { id: "submit", label: "提交审批", command: "workflow", workflowAction: "submit", allowedStatuses: ["DRAFT", "REJECTED"], confirmation: "确认提交审批？提交后将不能直接编辑。", variant: "primary", order: 20 },
  { id: "approve", label: "审批通过", command: "workflow", workflowAction: "approve", allowedStatuses: ["PENDING"], variant: "success", order: 30 },
  { id: "reject", label: "驳回", command: "workflow", workflowAction: "reject", allowedStatuses: ["PENDING"], variant: "danger", order: 40 },
  { id: "complete", label: "完成", command: "workflow", workflowAction: "complete", allowedStatuses: ["APPROVED", "IN_PROGRESS"], confirmation: "确认将单据标记为完成？", variant: "success", order: 50 },
  { id: "cancel", label: "取消", command: "workflow", workflowAction: "cancel", allowedStatuses: ["DRAFT", "REJECTED", "APPROVED", "IN_PROGRESS"], confirmation: "确认取消当前单据？", variant: "danger", order: 90 },
]

const commonListActions: ListActionDefinition[] = [
  { id: "open", label: "打开", command: "open" },
  { id: "copy", label: "复制编号", command: "copy" },
  { id: "delete", label: "删除", command: "delete", allowedStatuses: ["DRAFT"], variant: "danger" },
]

function createListDefinition(subjectPath: string, subjectLabel: string): DocumentListDefinition {
  return {
    modes: ["document", "detail"], defaultMode: "document", detailTableId: "items",
    columns: [
      { id: "code", label: "单据编号", source: "system", path: "code", dataType: "text", sortable: true, filterable: true, width: 170 },
      { id: "subject", label: subjectLabel, source: "master", path: subjectPath, dataType: "text", sortable: true, filterable: true, width: 200 },
      { id: "status", label: "状态", source: "system", path: "status", dataType: "status", sortable: true, filterable: true, width: 100 },
      { id: "productCode", label: "产品编码", source: "detail", path: "productCode", dataType: "text", sortable: true, filterable: true, width: 130 },
      { id: "productName", label: "产品名称", source: "detail", path: "productName", dataType: "text", sortable: true, filterable: true, width: 180 },
      { id: "quantity", label: "数量", source: "detail", path: "quantity", dataType: "number", sortable: true, filterable: true, width: 100 },
      { id: "createdBy", label: "创建人", source: "system", path: "createdBy", dataType: "text", sortable: true, filterable: true, width: 110 },
      { id: "updatedAt", label: "最后更新", source: "system", path: "updatedAt", dataType: "datetime", sortable: true, filterable: true, width: 170 },
    ],
    defaultSorting: [{ columnId: "updatedAt", direction: "desc" }],
    aggregates: [{ id: "row-count", label: "记录数", columnId: "code", function: "count" }, { id: "quantity-sum", label: "数量合计", columnId: "quantity", function: "sum" }],
    rowActions: commonListActions,
    toolbarActions: [
      { id: "create", label: "新建", command: "create", modes: ["document"], variant: "primary" },
      { id: "export", label: "导出当前结果", command: "export" },
      { id: "bulk-delete", label: "批量删除草稿", command: "bulkDelete", requiresSelection: true, modes: ["document"], variant: "danger" },
    ],
  }
}

export const schemas: DocumentSchema[] = [
  {
    typeId: "customer_due_diligence",
    typeName: "客户背景调查",
    description: "批量导入客户资料，执行联网背景调查并保留结构化结论与公开来源",
    icon: "SearchCheck",
    codePrefix: "CDD",
    statusLabels: { DRAFT: "等待调查", IN_PROGRESS: "调查中", COMPLETED: "调查完成", REJECTED: "调查失败", CANCELLED: "已跳过" },
    includeInBusinessFlow: false,
    formActions: [
      { id: "save", label: "保存客户资料", command: "save", modes: ["create", "edit"], allowedStatuses: ["DRAFT", "REJECTED"], variant: "primary", order: 10 },
    ],
    listActions: [{ id: "open", label: "打开", command: "open" }],
    list: {
      modes: ["document"], defaultMode: "document",
      columns: [
        { id: "code", label: "调查编号", source: "system", path: "code", dataType: "text", sortable: true, filterable: true, width: 170 },
        { id: "companyName", label: "客户公司", source: "master", path: "companyName", dataType: "text", sortable: true, filterable: true, width: 220 },
        { id: "country", label: "国家/地区", source: "master", path: "country", dataType: "text", sortable: true, filterable: true, width: 130 },
        { id: "status", label: "调查状态", source: "system", path: "status", dataType: "status", sortable: true, filterable: true, width: 110 },
        { id: "verified", label: "真实有效", source: "master", path: "isVerifiedCompany", dataType: "text", sortable: true, filterable: true, width: 110 },
        { id: "garden", label: "园林户外", source: "master", path: "isGardenOutdoor", dataType: "text", sortable: true, filterable: true, width: 110 },
        { id: "sales", label: "销售额 > $1M", source: "master", path: "salesOverOneMillion", dataType: "text", sortable: true, filterable: true, width: 130 },
        { id: "employees", label: "员工 > 10", source: "master", path: "employeesOverTen", dataType: "text", sortable: true, filterable: true, width: 110 },
        { id: "confidence", label: "综合可信度", source: "master", path: "overallConfidence", dataType: "number", sortable: true, filterable: true, width: 120 },
        { id: "updatedAt", label: "最后更新", source: "system", path: "updatedAt", dataType: "datetime", sortable: true, filterable: true, width: 170 },
      ],
      defaultSorting: [{ columnId: "updatedAt", direction: "desc" }],
      aggregates: [{ id: "row-count", label: "客户数", columnId: "code", function: "count" }],
      rowActions: [{ id: "open", label: "查看", command: "open" }],
      toolbarActions: [
        { id: "import", label: "导入客户", command: "custom:customer-research-import", variant: "primary", modes: ["document"] },
        { id: "export", label: "导出当前结果", command: "export" },
      ],
    },
    extraTabs: [{ id: "research-report", label: "调查报告", pluginId: "customer-research-report" }],
    masterFields: [
      statusField,
      { id: "companyName", label: "公司名称", type: "text", required: true, group: "客户资料", span: 2 },
      { id: "country", label: "国家/地区", type: "text", group: "客户资料" },
      { id: "website", label: "公司网址", type: "text", group: "客户资料" },
      { id: "contactName", label: "联系人", type: "text", group: "客户资料" },
      { id: "contactEmail", label: "联系邮箱", type: "text", group: "客户资料" },
      { id: "contactPhone", label: "联系电话", type: "text", group: "客户资料" },
      { id: "importFileName", label: "导入文件", type: "text", readOnly: true, group: "客户资料" },
      { id: "customerFingerprint", label: "客户指纹", type: "text", readOnly: true, group: "运行信息" },
      { id: "companySummary", label: "公司简介", type: "textarea", readOnly: true, group: "调查概况", span: 2 },
      { id: "businessScope", label: "业务范围", type: "textarea", readOnly: true, group: "调查概况", span: 2 },
      { id: "scaleEstimate", label: "规模估算", type: "textarea", readOnly: true, group: "调查概况", span: 2 },
      { id: "annualSalesEstimateUsd", label: "年销售额估算（美元）", type: "number", readOnly: true, group: "调查概况" },
      { id: "employeeEstimate", label: "员工人数估算", type: "number", readOnly: true, group: "调查概况" },
      { id: "overallConfidence", label: "综合可信度", type: "number", readOnly: true, group: "调查概况" },
      { id: "researchNotes", label: "调查备注", type: "textarea", readOnly: true, group: "调查概况", span: 2 },
      ...["isVerifiedCompany", "isGardenOutdoor", "salesOverOneMillion", "employeesOverTen"].map((id, index): FieldSchema => ({ id, label: ["真实有效公司", "园林户外业务", "年销售额超过 100 万美元", "员工人数超过 10 人"][index]!, type: "select", readOnly: true, group: "关键判定", options: [{ label: "符合", value: "yes" }, { label: "不符合", value: "no" }, { label: "待确认", value: "uncertain" }] })),
      ...["verifiedCompanyReason", "gardenOutdoorReason", "salesReason", "employeesReason"].map((id, index): FieldSchema => ({ id, label: ["公司真实性依据", "园林户外依据", "销售额依据", "员工人数依据"][index]!, type: "textarea", readOnly: true, group: "判定依据", span: 2 })),
      ...["verifiedCompanyConfidence", "gardenOutdoorConfidence", "salesConfidence", "employeesConfidence"].map((id, index): FieldSchema => ({ id, label: ["公司真实性可信度", "园林户外可信度", "销售额可信度", "员工人数可信度"][index]!, type: "number", readOnly: true, group: "判定可信度" })),
      { id: "attempts", label: "调查次数", type: "number", readOnly: true, defaultValue: 0, group: "运行信息" },
      { id: "failureMessage", label: "失败原因", type: "textarea", readOnly: true, group: "运行信息", span: 2 },
      { id: "startedAt", label: "开始时间", type: "text", readOnly: true, group: "运行信息" },
      { id: "completedAt", label: "完成时间", type: "text", readOnly: true, group: "运行信息" },
      { id: "promptVersion", label: "提示词版本", type: "text", readOnly: true, group: "运行信息" },
      { id: "modelVersion", label: "模型版本", type: "text", readOnly: true, group: "运行信息" },
    ],
    detailTables: [{ id: "sources", label: "公开信息来源", maxRows: 100, readOnly: true, visibleWhen: { field: "status", operator: "eq", value: "COMPLETED" }, fields: [
      { id: "title", label: "来源标题", type: "text", required: true, readOnly: true },
      { id: "url", label: "来源链接", type: "text", required: true, readOnly: true },
      { id: "claim", label: "支持的结论", type: "textarea", required: true, readOnly: true },
    ] }],
  },
  {
    typeId: "quotation",
    typeName: "客户报价单",
    description: "记录客户询价、产品报价与贸易条款",
    icon: "FileText",
    codePrefix: "QT",
    actions: commonActions,
    pushDownTargets: ["sales_contract"],
    formActions: commonFormActions,
    listActions: commonListActions,
    list: createListDefinition("customerName", "客户名称"),
    pushDownRules: [{
      id: "quotation-to-contract", label: "生成销售合同", targetTypeId: "sales_contract", allowedStatuses: ["APPROVED", "IN_PROGRESS", "COMPLETED"],
      masterFields: [
        { source: "customerName", target: "customerName" }, { source: "currency", target: "currency" },
        { source: "tradeTerm", target: "tradeTerm" }, { source: "salesPerson", target: "salesPerson" },
      ],
      detailTables: [{ sourceTableId: "items", targetTableId: "items", fields: [
        { source: "productCode", target: "productCode" }, { source: "productName", target: "productName" },
        { source: "quantity", target: "quantity" }, { source: "unit", target: "unit" }, { source: "unitPrice", target: "unitPrice" },
      ] }],
    }],
    impactRules: [{ id: "quotation-core-change", watchFields: ["customerName", "currency", "tradeTerm"], level: "warning", message: "字段 {field} 已下推到下游单据，修改后请同步确认。", downstreamStatuses: ["PENDING", "APPROVED", "IN_PROGRESS", "COMPLETED"] }],
    extraTabs: [{ id: "schema", label: "Schema 信息", pluginId: "schema-inspector" }],
    effects: [{ id: "mirror-country", handlerId: "copy-field", watchFields: ["country"], modes: ["create", "edit", "copy"], params: { source: "country", target: "countryMirror" } }],
    masterFields: [
      statusField,
      { id: "customerName", label: "客户名称", type: "text", required: true, group: "客户信息", placeholder: "请输入客户名称" },
      { id: "country", label: "国家/地区", type: "text", group: "客户信息" },
      { id: "countryMirror", label: "联动结果", type: "text", group: "客户信息", readOnly: true, helpText: "由 copy-field 插件监听国家字段后自动填写" },
      { id: "contact", label: "客户联系人", type: "text", group: "客户信息", visibleWhen: { field: "customerName", operator: "notEmpty" } },
      { id: "currency", label: "币种", type: "select", required: true, defaultValue: "USD", group: "交易信息", options: [{ label: "USD", value: "USD" }, { label: "CNY", value: "CNY" }, { label: "EUR", value: "EUR" }] },
      { id: "tradeTerm", label: "贸易条款", type: "select", defaultValue: "FOB", group: "交易信息", options: [{ label: "FOB", value: "FOB" }, { label: "CIF", value: "CIF" }, { label: "EXW", value: "EXW" }, { label: "DDP", value: "DDP" }] },
      { id: "validUntil", label: "有效期至", type: "date", group: "交易信息" },
      { id: "salesPerson", label: "业务员", type: "text", required: true, group: "内部信息" },
      { id: "remark", label: "备注", type: "textarea", group: "内部信息" },
      { id: "summary", label: "摘要", type: "computed", group: "内部信息", compute: { operator: "template", template: "{customerName} · {currency} · {tradeTerm}" }, readOnly: true },
    ],
    detailTables: [{
      id: "items", label: "报价明细", minRows: 1,
      rowSelector: { pluginId: "blank-row", buttonLabel: "添加明细" },
      fields: [
        { id: "productCode", label: "产品编码", type: "text", required: true },
        { id: "productName", label: "产品名称", type: "text", required: true },
        { id: "quantity", label: "数量", type: "number", required: true },
        { id: "unit", label: "单位", type: "text", defaultValue: "PCS" },
        { id: "price", label: "单价", type: "price", required: true, price: { amountField: "unitPrice", currencyField: "currency", currencies: [{ label: "USD", value: "USD" }, { label: "CNY", value: "CNY" }, { label: "EUR", value: "EUR" }] } },
        { id: "deliveryDate", label: "交期", type: "date" },
      ],
    }],
  },
  {
    typeId: "sales_contract",
    typeName: "销售合同",
    description: "管理客户订单、收款约束与合同履约",
    icon: "ScrollText",
    codePrefix: "SC",
    actions: commonActions,
    pushDownTargets: ["purchase_plan"],
    formActions: commonFormActions,
    listActions: commonListActions,
    list: createListDefinition("customerName", "客户名称"),
    pushDownRules: [{
      id: "contract-to-plan", label: "生成采购计划", targetTypeId: "purchase_plan", allowedStatuses: ["APPROVED", "IN_PROGRESS", "COMPLETED"],
      masterFields: [{ source: "customerName", target: "planName", formula: { operator: "template", template: "{customerName} 采购计划" } }, { source: "salesPerson", target: "buyer" }, { source: "deliveryDate", target: "expectedDate" }],
      detailTables: [{ sourceTableId: "items", targetTableId: "items", fields: [
        { source: "productCode", target: "productCode" }, { source: "productName", target: "productName" },
        { source: "quantity", target: "quantity" }, { source: "unit", target: "unit" }, { source: "unitPrice", target: "targetPrice" },
      ] }],
    }],
    impactRules: [{ id: "contract-demand-change", watchFields: ["deliveryDate", "customerName"], level: "critical", message: "字段 {field} 会影响已生成的采购计划。", blocksSave: true, downstreamStatuses: ["APPROVED", "IN_PROGRESS", "COMPLETED"] }],
    masterFields: [
      statusField,
      { id: "customerName", label: "客户名称", type: "text", required: true, group: "客户信息" },
      { id: "customerPoNo", label: "客户 PO 号", type: "text", group: "客户信息" },
      { id: "contractType", label: "合同类型", type: "select", defaultValue: "EXPORT", group: "合同信息", options: [{ label: "外销合同", value: "EXPORT" }, { label: "内销合同", value: "DOMESTIC" }, { label: "联营合同", value: "JOINT" }] },
      { id: "currency", label: "币种", type: "select", required: true, defaultValue: "USD", group: "合同信息", options: [{ label: "USD", value: "USD" }, { label: "CNY", value: "CNY" }, { label: "EUR", value: "EUR" }] },
      { id: "tradeTerm", label: "贸易条款", type: "text", group: "合同信息" },
      { id: "salesPerson", label: "业务员", type: "text", required: true, group: "内部信息" },
      { id: "deliveryDate", label: "要求交期", type: "date", group: "内部信息" },
      { id: "remark", label: "合同备注", type: "textarea", group: "内部信息" },
    ],
    detailTables: [{
      id: "items", label: "合同产品", minRows: 1,
      fields: [
        { id: "productCode", label: "产品编码", type: "text", required: true },
        { id: "productName", label: "产品名称", type: "text", required: true },
        { id: "quantity", label: "合同数量", type: "number", required: true },
        { id: "unit", label: "单位", type: "text", defaultValue: "PCS" },
        { id: "unitPrice", label: "成交单价", type: "number", required: true },
        { id: "purchasedQuantity", label: "已采购", type: "number", readOnly: true, defaultValue: 0 },
      ],
    }],
  },
  {
    typeId: "purchase_plan",
    typeName: "采购计划",
    description: "按销售需求组织采购任务并跟踪执行",
    icon: "ShoppingCart",
    codePrefix: "PP",
    actions: commonActions,
    formActions: commonFormActions,
    listActions: commonListActions,
    list: createListDefinition("planName", "计划名称"),
    masterFields: [
      statusField,
      { id: "planName", label: "计划名称", type: "text", required: true, group: "计划信息" },
      { id: "buyer", label: "采购员", type: "text", required: true, group: "计划信息" },
      { id: "expectedDate", label: "计划到货日", type: "date", group: "计划信息" },
      { id: "warehouse", label: "目标仓库", type: "combobox", group: "收货信息", combobox: { searchable: true, options: [{ label: "宁波一号仓", value: "NB-01" }, { label: "上海外贸仓", value: "SH-01" }, { label: "义乌集货仓", value: "YW-01" }] } },
      { id: "priority", label: "优先级", type: "select", defaultValue: "NORMAL", group: "收货信息", options: [{ label: "普通", value: "NORMAL" }, { label: "紧急", value: "HIGH" }] },
      { id: "remark", label: "采购说明", type: "textarea", group: "其他" },
    ],
    detailTables: [{
      id: "items", label: "采购需求", minRows: 1,
      fields: [
        { id: "productCode", label: "产品编码", type: "text", required: true },
        { id: "productName", label: "产品名称", type: "text", required: true },
        { id: "quantity", label: "采购数量", type: "number", required: true },
        { id: "unit", label: "单位", type: "text", defaultValue: "PCS" },
        { id: "supplierName", label: "建议供应商", type: "text" },
        { id: "targetPrice", label: "目标单价", type: "number" },
      ],
    }],
  },
  {
    typeId: "warehouse_inbound",
    typeName: "入库单",
    description: "登记仓库收货、批次和质检结果",
    icon: "Warehouse",
    codePrefix: "WI",
    actions: commonActions,
    formActions: commonFormActions,
    listActions: commonListActions,
    list: createListDefinition("supplierName", "供应商"),
    masterFields: [
      statusField,
      { id: "warehouse", label: "入库仓库", type: "select", required: true, group: "入库信息", options: [{ label: "宁波一号仓", value: "NB-01" }, { label: "上海外贸仓", value: "SH-01" }, { label: "义乌集货仓", value: "YW-01" }] },
      { id: "supplierName", label: "供应商", type: "text", required: true, group: "入库信息" },
      { id: "inboundDate", label: "入库日期", type: "date", required: true, group: "入库信息" },
      { id: "operator", label: "经办人", type: "text", group: "内部信息" },
      { id: "remark", label: "收货备注", type: "textarea", group: "内部信息" },
    ],
    detailTables: [{
      id: "items", label: "入库明细", minRows: 1,
      fields: [
        { id: "productCode", label: "产品编码", type: "text", required: true },
        { id: "productName", label: "产品名称", type: "text", required: true },
        { id: "quantity", label: "实收数量", type: "number", required: true },
        { id: "batchNo", label: "批次号", type: "text" },
        { id: "qualityStatus", label: "质检结果", type: "select", options: [{ label: "待检", value: "PENDING" }, { label: "合格", value: "PASSED" }, { label: "不合格", value: "FAILED" }] },
      ],
    }],
  },
]

export function getSchema(typeId: string): DocumentSchema {
  const schema = schemas.find((item) => item.typeId === typeId)
  if (!schema) throw new BusinessError(`单据类型“${typeId}”未注册。`)
  return schema
}
