import { PrismaClient } from "@prisma/client"

declare global {
  // eslint-disable-next-line no-var
  var zformPrisma: PrismaClient | undefined
}

export const prisma = globalThis.zformPrisma ?? new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
})

if (process.env.NODE_ENV !== "production") globalThis.zformPrisma = prisma

export async function connectDatabase(): Promise<void> {
  await prisma.$connect()
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect()
}
