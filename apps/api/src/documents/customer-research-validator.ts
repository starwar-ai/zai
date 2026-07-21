import type { CustomerResearchImportRequest, CustomerResearchResult } from "@zform/shared"
import { z } from "zod"

const nullableText = (max: number) => z.string().trim().max(max).optional().nullable()
export const customerResearchImportSchema: z.ZodType<CustomerResearchImportRequest> = z.object({
  fileName: z.string().trim().min(1).max(255),
  rows: z.array(z.object({
    companyName: z.string().trim().min(1).max(255),
    country: nullableText(120), website: nullableText(500), contactName: nullableText(255),
    contactEmail: nullableText(320), contactPhone: nullableText(120),
    rawData: z.record(z.union([z.string().max(5000), z.number().finite(), z.boolean(), z.null()])).optional(),
  }).strict()).min(1).max(1000),
}).strict()

const decision = z.enum(["yes", "no", "uncertain"])
const confidence = z.number().int().min(0).max(100)
export const customerResearchResultSchema: z.ZodType<CustomerResearchResult> = z.object({
  companySummary: z.string().max(5000), businessScope: z.string().max(5000), scaleEstimate: z.string().max(5000),
  annualSalesEstimateUsd: z.number().int().nonnegative().nullable(), employeeEstimate: z.number().int().nonnegative().nullable(),
  isVerifiedCompany: decision, verifiedCompanyReason: z.string().max(5000), verifiedCompanyConfidence: confidence,
  isGardenOutdoor: decision, gardenOutdoorReason: z.string().max(5000), gardenOutdoorConfidence: confidence,
  salesOverOneMillion: decision, salesReason: z.string().max(5000), salesConfidence: confidence,
  employeesOverTen: decision, employeesReason: z.string().max(5000), employeesConfidence: confidence,
  overallConfidence: confidence,
  sources: z.array(z.object({ title: z.string().max(500), url: z.string().url().max(2000), claim: z.string().max(5000) }).strict()).max(100),
  researchNotes: z.string().max(5000),
}).strict()
