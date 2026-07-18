import "dotenv/config"
import { DocumentStatus, PrismaClient, type Prisma } from "@prisma/client"

const prisma = new PrismaClient()

interface SeedDocument {
  typeId: string
  code: string
  status: DocumentStatus
  masterData: Prisma.InputJsonObject
  detailTables: Prisma.InputJsonArray
}

const documents: SeedDocument[] = [
  {
    typeId: "quotation", code: "QT-202607-0001", status: DocumentStatus.PENDING,
    masterData: { customerName: "Nordic Home AB", country: "瑞典", currency: "USD", tradeTerm: "FOB", salesPerson: "张明", validUntil: "2026-08-15", status: "PENDING" },
    detailTables: [{ tableId: "items", rows: [{ id: "seed-quotation-row-1", data: { productCode: "CH-1008", productName: "橡木餐椅", quantity: 600, unit: "PCS", unitPrice: 42.8, currency: "USD" } }] }],
  },
  {
    typeId: "sales_contract", code: "SC-202607-0001", status: DocumentStatus.IN_PROGRESS,
    masterData: { customerName: "Maison Lumière SAS", customerPoNo: "ML-260712", currency: "EUR", tradeTerm: "CIF", salesPerson: "李雯", deliveryDate: "2026-09-08", status: "IN_PROGRESS" },
    detailTables: [{ tableId: "items", rows: [{ id: "seed-contract-row-1", data: { productCode: "LT-2042", productName: "藤编吊灯", quantity: 320, unit: "PCS", unitPrice: 68, purchasedQuantity: 120 } }] }],
  },
  {
    typeId: "purchase_plan", code: "PP-202607-0001", status: DocumentStatus.APPROVED,
    masterData: { planName: "北欧家居七月补货", buyer: "王晨", expectedDate: "2026-08-20", warehouse: "NB-01", priority: "HIGH", status: "APPROVED" },
    detailTables: [{ tableId: "items", rows: [{ id: "seed-plan-row-1", data: { productCode: "CH-1008", productName: "橡木餐椅", quantity: 600, unit: "PCS", supplierName: "安吉森木家居", targetPrice: 188 } }] }],
  },
  {
    typeId: "warehouse_inbound", code: "WI-202607-0001", status: DocumentStatus.COMPLETED,
    masterData: { warehouse: "NB-01", supplierName: "安吉森木家居", inboundDate: "2026-07-16", operator: "赵磊", status: "COMPLETED" },
    detailTables: [{ tableId: "items", rows: [{ id: "seed-inbound-row-1", data: { productCode: "CH-1008", productName: "橡木餐椅", quantity: 120, batchNo: "A260716", qualityStatus: "PASSED" } }] }],
  },
]

async function main(): Promise<void> {
  for (const item of documents) {
    await prisma.document.upsert({
      where: { code: item.code },
      update: {},
      create: {
        ...item,
        searchText: `${item.code} ${JSON.stringify(item.masterData)} ${JSON.stringify(item.detailTables)}`,
        createdBy: "系统管理员",
        createdById: "system",
        departmentId: "demo-department",
        activities: { create: { action: "create", operator: "系统管理员", message: `创建了${item.code}` } },
      },
    })
    await prisma.documentSequence.upsert({
      where: { typeId_period: { typeId: item.typeId, period: "202607" } },
      create: { typeId: item.typeId, period: "202607", value: 1 },
      update: { value: { set: 1 } },
    })
  }
  await prisma.dataPermissionPolicy.upsert({
    where: { userId_typeId: { userId: "framework-user", typeId: "*" } },
    update: { scope: "ALL" },
    create: { userId: "framework-user", typeId: "*", scope: "ALL" },
  })
  await prisma.userPreference.upsert({
    where: { userId: "framework-user" }, update: {},
    create: { userId: "framework-user", settings: { theme: "light", compactMode: false, sidebarCollapsed: false, dashboardWidgetIds: ["metrics", "recent-documents", "business-distribution", "business-flow", "recent-activities"], showGlobalStatusBar: true } },
  })
  const notificationCount = await prisma.userNotification.count({ where: { userId: "framework-user" } })
  if (!notificationCount) await prisma.userNotification.createMany({ data: [
    { userId: "framework-user", title: "有 1 项审批等待处理", content: "客户报价单 QT-202607-0001 正在等待审批。", level: "warning", target: { kind: "document-list", typeId: "quotation" } },
    { userId: "framework-user", title: "框架初始化完成", content: "应用外壳、Schema 表单与 PostgreSQL 已准备就绪。", level: "success", readAt: new Date() },
  ] })
  const menus = [
    { id: "dashboard", groupId: "workspace", groupLabel: "工作空间", label: "工作台", icon: "LayoutDashboard", target: "dashboard", permissionCode: "dashboard:view", order: 10 },
    { id: "document:quotation", groupId: "documents", groupLabel: "业务单据", label: "客户报价单", icon: "FileText", target: "document-list", targetId: "quotation", permissionCode: "document:quotation:view", order: 20 },
    { id: "document:sales_contract", groupId: "documents", groupLabel: "业务单据", label: "销售合同", icon: "PackageOpen", target: "document-list", targetId: "sales_contract", permissionCode: "document:sales_contract:view", order: 30 },
    { id: "document:purchase_plan", groupId: "documents", groupLabel: "业务单据", label: "采购计划", icon: "ShoppingCart", target: "document-list", targetId: "purchase_plan", permissionCode: "document:purchase_plan:view", order: 40 },
    { id: "document:warehouse_inbound", groupId: "documents", groupLabel: "业务单据", label: "入库单", icon: "Warehouse", target: "document-list", targetId: "warehouse_inbound", permissionCode: "document:warehouse_inbound:view", order: 50 },
    { id: "system:menus", groupId: "system", groupLabel: "系统管理", label: "菜单管理", icon: "MenuSquare", target: "menu-management", permissionCode: "system:menu:manage", order: 70 },
    { id: "system:users", groupId: "system", groupLabel: "系统管理", label: "用户管理", icon: "Users", target: "user-management", permissionCode: "system:user:manage", order: 80 },
    { id: "system:roles", groupId: "system", groupLabel: "系统管理", label: "角色管理", icon: "ShieldCheck", target: "role-management", permissionCode: "system:role:manage", order: 90 },
    { id: "settings", groupId: "system", groupLabel: "系统管理", label: "用户设置", icon: "Settings", target: "settings", permissionCode: "settings:use", order: 100 },
    { id: "help", groupId: "system", groupLabel: "系统管理", label: "使用帮助", icon: "CircleHelp", target: "help", order: 110 },
  ]
  for (const menu of menus) await prisma.systemMenu.upsert({ where: { id: menu.id }, update: menu, create: menu })
  const adminRole = await prisma.role.upsert({ where: { code: "SYSTEM_ADMIN" }, update: { name: "系统管理员", permissions: ["*"] }, create: { code: "SYSTEM_ADMIN", name: "系统管理员", description: "拥有 framework 全部管理和业务权限", permissions: ["*"] } })
  await prisma.role.upsert({ where: { code: "BUSINESS_VIEWER" }, update: {}, create: { code: "BUSINESS_VIEWER", name: "业务查看员", description: "可查看工作台与业务单据", permissions: ["dashboard:view", "document:quotation:view", "document:sales_contract:view", "document:purchase_plan:view", "document:warehouse_inbound:view", "settings:use"] } })
  await prisma.appUser.upsert({ where: { id: "framework-user" }, update: { name: "林默", status: "ACTIVE" }, create: { id: "framework-user", name: "林默", email: "linmo@example.local", departmentId: "demo-department", departmentName: "演示部门", status: "ACTIVE" } })
  await prisma.userRole.upsert({ where: { userId_roleId: { userId: "framework-user", roleId: adminRole.id } }, update: {}, create: { userId: "framework-user", roleId: adminRole.id } })
  console.log(`已初始化 ${documents.length} 张演示单据。`)
}

main().finally(() => prisma.$disconnect())
