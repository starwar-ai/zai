import { Prisma } from "@prisma/client"
import type { ApplicationShellConfig, DashboardWidgetId, ShellBootstrapData, UserNotification, UserShellSettings } from "@zform/shared"
import { prisma } from "./database.js"
import { schemas } from "./schemas.js"

const DEFAULT_WIDGETS: DashboardWidgetId[] = ["metrics", "recent-documents", "business-distribution", "business-flow", "recent-activities"]
const DEFAULT_SETTINGS: UserShellSettings = { theme: "light", compactMode: false, sidebarCollapsed: false, dashboardWidgetIds: DEFAULT_WIDGETS, showGlobalStatusBar: true }

export function shellConfig(): ApplicationShellConfig {
  return {
    appName: "ZForm", appSubtitle: "业务协同平台",
    menuGroups: [
      { id: "workspace", label: "工作空间", items: [{ id: "dashboard", label: "工作台", icon: "LayoutDashboard", target: "dashboard", requiredPermissions: ["dashboard:view"] }] },
      { id: "documents", label: "业务单据", items: schemas.map((schema) => ({ id: `document:${schema.typeId}`, label: schema.typeName, icon: schema.icon, target: "document-list", targetId: schema.typeId, requiredPermissions: [`document:${schema.typeId}:view`] })) },
      { id: "system", label: "系统", items: [{ id: "settings", label: "用户设置", icon: "Settings", target: "settings", requiredPermissions: ["settings:use"] }, { id: "help", label: "使用帮助", icon: "CircleHelp", target: "help" }] },
    ],
    dashboardWidgets: [
      { id: "metrics", label: "核心指标", defaultVisible: true, order: 10 },
      { id: "recent-documents", label: "最近单据", defaultVisible: true, order: 20 },
      { id: "business-distribution", label: "业务分布", defaultVisible: true, order: 30 },
      { id: "business-flow", label: "业务链路", defaultVisible: true, order: 40 },
      { id: "recent-activities", label: "最近动态", defaultVisible: true, order: 50 },
    ],
  }
}

function normalizeSettings(value: unknown): UserShellSettings {
  if (!value || typeof value !== "object") return DEFAULT_SETTINGS
  const item = value as Partial<UserShellSettings>
  return {
    theme: item.theme === "system" ? "system" : "light",
    compactMode: Boolean(item.compactMode), sidebarCollapsed: Boolean(item.sidebarCollapsed),
    dashboardWidgetIds: Array.isArray(item.dashboardWidgetIds) ? item.dashboardWidgetIds.filter((id): id is DashboardWidgetId => DEFAULT_WIDGETS.includes(id as DashboardWidgetId)) : DEFAULT_WIDGETS,
    showGlobalStatusBar: item.showGlobalStatusBar !== false,
  }
}

function toNotification(row: { id: string; title: string; content: string; level: string; target: Prisma.JsonValue | null; readAt: Date | null; createdAt: Date }): UserNotification {
  const level = ["info", "success", "warning", "error"].includes(row.level) ? row.level as UserNotification["level"] : "info"
  const target = row.target && typeof row.target === "object" && !Array.isArray(row.target) ? row.target as unknown as UserNotification["target"] : undefined
  return { id: row.id, title: row.title, content: row.content, level, ...(target ? { target } : {}), ...(row.readAt ? { readAt: row.readAt.toISOString() } : {}), createdAt: row.createdAt.toISOString() }
}

export async function getSettings(userId: string): Promise<UserShellSettings> {
  const preference = await prisma.userPreference.findUnique({ where: { userId } })
  return normalizeSettings(preference?.settings)
}

export async function saveSettings(userId: string, settings: UserShellSettings): Promise<UserShellSettings> {
  const normalized = normalizeSettings(settings)
  await prisma.userPreference.upsert({ where: { userId }, create: { userId, settings: normalized as unknown as Prisma.InputJsonValue }, update: { settings: normalized as unknown as Prisma.InputJsonValue } })
  return normalized
}

export async function listNotifications(userId: string): Promise<UserNotification[]> {
  return (await prisma.userNotification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 50 })).map(toNotification)
}

export async function markNotificationRead(userId: string, id: string): Promise<void> {
  await prisma.userNotification.updateMany({ where: { id, userId }, data: { readAt: new Date() } })
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  await prisma.userNotification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } })
}

export async function getShellBootstrap(input: { userId: string; userName: string; permissions: string[] }): Promise<ShellBootstrapData> {
  const [settings, notifications] = await Promise.all([getSettings(input.userId), listNotifications(input.userId)])
  return { config: shellConfig(), user: { id: input.userId, name: input.userName, roleName: "系统管理员", departmentName: "演示部门", permissions: input.permissions }, settings, notifications }
}
