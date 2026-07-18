import type { DocumentStatus } from "@zform/shared"

// 通用单据状态机由服务层统一执行。
export const statusTransitions: Record<string, DocumentStatus> = {
  submit: "PENDING",
  approve: "APPROVED",
  reject: "REJECTED",
  complete: "COMPLETED",
  cancel: "CANCELLED",
}
