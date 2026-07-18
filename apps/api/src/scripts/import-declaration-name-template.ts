import "dotenv/config"
import fs from "node:fs/promises"
import path from "node:path"
import { normalizeDeclarationName } from "@zform/shared"
import { prisma } from "../database.js"
import { parseCsv } from "./csv.js"

async function main(): Promise<void> {
  const csvPath = process.argv[2] || path.resolve(process.cwd(), "../../zname/dms_declaration_mapping_template.csv")
  const rows = parseCsv(await fs.readFile(csvPath, "utf8"))
  let imported = 0
  for (const row of rows) {
    const name = row.name?.trim(); const nameEng = row.name_eng?.trim()
    if (!name || !nameEng) continue
    const rowCount = Number(row.row_count || 0)
    await prisma.declarationNameMapping.upsert({
      where: { normalizedName_normalizedNameEng: { normalizedName: normalizeDeclarationName(name), normalizedNameEng: normalizeDeclarationName(nameEng) } },
      update: { rowCount: Number.isFinite(rowCount) ? rowCount : 0, existingDeclarationVariants: row.existing_declaration_variants || null, existingEngVariants: row.existing_eng_variants || null },
      create: { normalizedName: normalizeDeclarationName(name), normalizedNameEng: normalizeDeclarationName(nameEng), rawName: name, rawNameEng: nameEng, rowCount: Number.isFinite(rowCount) ? rowCount : 0, existingDeclarationVariants: row.existing_declaration_variants || null, existingEngVariants: row.existing_eng_variants || null, source: "template" },
    })
    imported += 1
  }
  console.log(`已从 ${csvPath} 幂等导入 ${imported} 条报关名称映射。`)
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1 }).finally(() => prisma.$disconnect())
