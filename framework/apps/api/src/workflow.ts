import type { DocumentStatus } from "@zform/shared"

export const statusTransitions: Record<string, DocumentStatus> = {
  submit: "PENDING",
  approve: "APPROVED",
  reject: "REJECTED",
  complete: "COMPLETED",
  cancel: "CANCELLED",
}
