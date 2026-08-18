import type { Request, Response } from "express"
import { z } from "zod"
import { removeExternalImageBackground, removeExternalImageBackgroundsBatch } from "../services/image-cutout-service.js"
import { ok } from "../utils/http.js"

const cutoutItemSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  base64Data: z.string().min(4).max(14_000_000).regex(/^[A-Za-z0-9+/]+={0,2}$/, "base64Data 必须是不带 Data URL 前缀的标准 Base64"),
  backgroundMode: z.enum(["transparent", "white", "color"]).default("transparent"),
  backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "backgroundColor 必须是 #RRGGBB").optional(),
  outputFormat: z.enum(["png", "jpg"]).default("png"),
  edge: z.number().int().min(256).max(4096).optional(),
  padding: z.number().min(0).max(.2).default(.08),
  clientRequestId: z.string().trim().min(1).max(100).optional(),
}).strict().superRefine((input, context) => {
  if (input.backgroundMode === "color" && !input.backgroundColor) context.addIssue({ code: z.ZodIssueCode.custom, path: ["backgroundColor"], message: "自定义底色时必须提供 backgroundColor" })
})

export async function postExternalImageCutout(request: Request, response: Response): Promise<void> {
  ok(response, await removeExternalImageBackground(cutoutItemSchema.parse(request.body)), "图片抠图完成")
}

export async function postExternalImageCutoutBatch(request: Request, response: Response): Promise<void> {
  const body = z.object({ items: z.array(cutoutItemSchema).min(1).max(5) }).strict().parse(request.body)
  ok(response, await removeExternalImageBackgroundsBatch(body), "批量图片抠图完成")
}
