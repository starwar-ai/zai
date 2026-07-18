export type WorkspaceView =
  | { kind: "dashboard" }
  | { kind: "list"; typeId: string }
  | { kind: "editor"; id: string; returnTypeId: string }
  | { kind: "settings" }
  | { kind: "help" }

export interface WorkspaceTab { id: string; title: string; view: WorkspaceView; closable: boolean; dirty?: boolean; revision: number }
