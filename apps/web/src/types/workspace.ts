/** 应用级多标签工作区的可序列化页面目标。 */
export type WorkspaceView =
  | { kind: "dashboard" }
  | { kind: "list"; typeId: string }
  | { kind: "editor"; id: string; returnTypeId: string }
  | { kind: "settings" }
  | { kind: "help" }
  | { kind: "system"; entity: "menus" | "users" | "roles" | "departments" }
  | { kind: "declaration-name" }
  | { kind: "ocr" }

export interface WorkspaceTab { id: string; title: string; view: WorkspaceView; closable: boolean; dirty?: boolean; revision: number }
