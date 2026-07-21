import type { Request, Response } from "express"
import { customerResearchImportSchema } from "../documents/customer-research-validator.js"
import { getCustomerResearchSummary, importCustomerResearch, processNextCustomerResearch, retryCustomerResearch } from "../services/customer-research-service.js"
import { ok, routeParam } from "../utils/http.js"
import { shellIdentity } from "../utils/request-context.js"

export async function importCustomers(request: Request, response: Response): Promise<void> { ok(response, await importCustomerResearch(customerResearchImportSchema.parse(request.body), shellIdentity(request)), "客户导入完成") }
export async function summary(request: Request, response: Response): Promise<void> { ok(response, await getCustomerResearchSummary(shellIdentity(request))) }
export async function processNext(request: Request, response: Response): Promise<void> { ok(response, await processNextCustomerResearch(shellIdentity(request))) }
export async function retry(request: Request, response: Response): Promise<void> { ok(response, await retryCustomerResearch(routeParam(request.params.id), shellIdentity(request)), "已重新加入调查队列") }
