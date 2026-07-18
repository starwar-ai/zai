import type { Request, Response } from "express"
import { prisma } from "../database.js"
import { ok } from "../utils/http.js"

export async function health(_request: Request, response: Response): Promise<void> {
  await prisma.$queryRaw`SELECT 1`
  ok(response, { status: "ok", database: "postgresql", timestamp: new Date().toISOString() })
}
