import "dotenv/config"
import fs from "node:fs/promises"
import path from "node:path"
import { declarationNameJsonSchema, declarationNameSystemPrompt } from "../services/declaration-name-generator.js"
import { parseCsv, type CsvRow } from "./csv.js"

type BatchProvider = "openai" | "kimi" | "minimax"
const provider = (process.env.BATCH_PROVIDER || "openai").toLowerCase() as BatchProvider
const models: Record<BatchProvider, string> = { openai: process.env.OPENAI_MODEL || "gpt-4.1", kimi: process.env.KIMI_MODEL || "kimi-k2-0711-preview", minimax: process.env.MINIMAX_MODEL || "MiniMax-M2.7" }

function line(row: CsvRow, index: number): Record<string, unknown> {
  const customId = `declaration-name-${row.input_id || index + 1}`
  const content = JSON.stringify({ name: row.name, nameEng: row.name_eng, existingDeclarationVariants: row.existing_declaration_variants, existingEngVariants: row.existing_eng_variants, rowCount: Number(row.row_count || 0) })
  if (provider === "minimax") return { custom_id: customId, method: "POST", url: "/v1/messages", body: { model: models.minimax, max_tokens: 1000, temperature: 0.1, system: `${declarationNameSystemPrompt}\n只返回 JSON 对象。`, messages: [{ role: "user", content }] } }
  if (provider === "kimi") return { custom_id: customId, method: "POST", url: "/v1/chat/completions", body: { model: models.kimi, messages: [{ role: "system", content: declarationNameSystemPrompt }, { role: "user", content }], temperature: 0, response_format: { type: "json_schema", json_schema: { name: "declaration_name_result", strict: true, schema: declarationNameJsonSchema } } } }
  return { custom_id: customId, method: "POST", url: "/v1/responses", body: { model: models.openai, input: [{ role: "system", content: declarationNameSystemPrompt }, { role: "user", content }], text: { format: { type: "json_schema", name: "declaration_name_result", strict: true, schema: declarationNameJsonSchema } } } }
}

async function main(): Promise<void> {
  if (!["openai", "kimi", "minimax"].includes(provider)) throw new Error(`不支持 BATCH_PROVIDER=${provider}`)
  const csvPath = process.argv[2] || path.resolve(process.cwd(), "../../zname/dms_declaration_mapping_template.csv")
  const outputPath = process.argv[3] || path.resolve(process.cwd(), "../../declaration-name-batch.jsonl")
  const rows = parseCsv(await fs.readFile(csvPath, "utf8"))
  await fs.writeFile(outputPath, `${rows.map((row, index) => JSON.stringify(line(row, index))).join("\n")}\n`, "utf8")
  console.log(`已写入 ${rows.length} 条 ${provider} Batch 请求：${outputPath}`)
}

void main().catch((error: unknown) => { console.error(error); process.exitCode = 1 })
