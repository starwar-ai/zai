import type { DocumentQueryRequest, DocumentQueryResult, DocumentSchema } from "@zform/shared"
import type { UserContext } from "./data-permission-service.js"

/** 通用列表的执行边界；可替换为专用 SQL、搜索引擎或数仓适配器。 */
export interface DocumentListQueryAdapter {
  supports(schema: DocumentSchema, request: DocumentQueryRequest): boolean
  query(schema: DocumentSchema, request: DocumentQueryRequest, user: UserContext): Promise<DocumentQueryResult>
}
