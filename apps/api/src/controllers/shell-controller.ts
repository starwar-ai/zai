import type { Request, Response } from "express"
import { z } from "zod"
import { getShellBootstrap, markAllNotificationsRead, markNotificationRead, saveSettings } from "../services/app-shell-service.js"
import { ok, routeParam } from "../utils/http.js"
import { requestUser, shellIdentity } from "../utils/request-context.js"

const settingsSchema = z.object({
  theme: z.enum(["light", "system"]), compactMode: z.boolean(), sidebarCollapsed: z.boolean(),
  dashboardWidgetIds: z.array(z.enum(["metrics", "recent-documents", "business-distribution", "business-flow", "recent-activities"])),
  showGlobalStatusBar: z.boolean(),
})

export async function bootstrapShell(request: Request, response: Response): Promise<void> {
  ok(response, await getShellBootstrap(shellIdentity(request)))
}

export async function updateSettings(request: Request, response: Response): Promise<void> {
  ok(response, await saveSettings(requestUser(request).userId, settingsSchema.parse(request.body)), "用户设置已保存")
}

export async function readAllNotifications(request: Request, response: Response): Promise<void> {
  await markAllNotificationsRead(requestUser(request).userId)
  ok(response, null)
}

export async function readNotification(request: Request, response: Response): Promise<void> {
  await markNotificationRead(requestUser(request).userId, routeParam(request.params.id))
  ok(response, null)
}
