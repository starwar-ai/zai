import type { Request, Response } from "express"
import { customerResearchBatchSchema, customerResearchImportSchema, customerResearchProcessSchema } from "../documents/customer-research-validator.js"
import { getCustomerResearchModelConfig, getCustomerResearchSummary, importCustomerResearch, processCustomerResearch, processNextCustomerResearch, queueCustomerResearchBatch, retryCustomerResearch } from "../services/customer-research-service.js"
import { exportCustomerResearchReport } from "../services/customer-research-report-service.js"
import { ok, routeParam } from "../utils/http.js"
import { shellIdentity } from "../utils/request-context.js"

export async function importCustomers(request: Request, response: Response): Promise<void> { ok(response, await importCustomerResearch(customerResearchImportSchema.parse(request.body), shellIdentity(request)), "客户导入完成") }
export async function summary(request: Request, response: Response): Promise<void> { ok(response, await getCustomerResearchSummary(shellIdentity(request))) }
export function models(_request: Request, response: Response): void { ok(response, getCustomerResearchModelConfig()) }
export async function processNext(request: Request, response: Response): Promise<void> { ok(response, await processNextCustomerResearch(shellIdentity(request))) }
export async function exportReport(request: Request, response: Response): Promise<void> {
  const report = await exportCustomerResearchReport(routeParam(request.params.id), shellIdentity(request))
  const encodedFilename = encodeURIComponent(report.filename)
  response.set({ "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="customer-research-report.pdf"; filename*=UTF-8''${encodedFilename}`, "Content-Length": String(report.pdf.length) }).send(report.pdf)
}
export async function processBatch(request: Request, response: Response): Promise<void> { ok(response, await queueCustomerResearchBatch(customerResearchBatchSchema.parse(request.body), shellIdentity(request)), "后台调查任务已启动") }
export async function processCustomer(request: Request, response: Response): Promise<void> { const input = customerResearchProcessSchema.parse(request.body); ok(response, await processCustomerResearch(routeParam(request.params.id), shellIdentity(request), input.provider), "客户调查完成") }
export async function processCustomerStream(request: Request, response: Response): Promise<void> {
  response.status(200).set({ "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" })
  response.flushHeaders()
  const send = (event: Record<string, unknown>) => response.write(`${JSON.stringify(event)}\n`)
  const heartbeat = setInterval(() => send({ type: "status", message: "调查仍在进行，请保持窗口打开…" }), 15_000)
  heartbeat.unref()
  try {
    const input = customerResearchProcessSchema.parse(request.body)
    send({ type: "status", message: "已开始调查，正在连接 Tavily…" })
    const result = await processCustomerResearch(routeParam(request.params.id), shellIdentity(request), input.provider, (delta, kind) => send({ type: "delta", kind, delta }))
    if (result.status === "failed") send({ type: "error", message: result.error })
    else send({ type: "complete", documentId: result.document?.id })
  } catch (error) { send({ type: "error", message: error instanceof Error ? error.message : "调查失败" }) }
  finally { clearInterval(heartbeat); response.end() }
}
export async function retry(request: Request, response: Response): Promise<void> { ok(response, await retryCustomerResearch(routeParam(request.params.id), shellIdentity(request)), "已重新加入调查队列") }
