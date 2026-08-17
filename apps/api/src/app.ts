import cors from "cors"
import express, { type Express } from "express"
import helmet from "helmet"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { errorHandler } from "./middleware/error-handler.js"
import { requireExternalApiKey } from "./middleware/external-api-key.js"
import { registerOpenApi } from "./openapi.js"
import { routes } from "./routes/index.js"

/** 创建 Express 应用；监听端口和数据库生命周期由入口文件负责。 */
export function createApp(): Express {
  const app = express()
  // Swagger UI 自带内联初始化脚本，因此在全局 Helmet/CSP 之前单独挂载。
  registerOpenApi(app)
  app.use(helmet())
  app.use(cors({ origin: process.env.CORS_ORIGIN || "http://localhost:5174" }))
  // 批量抠图最多携带 5 张 8MB 图片；先鉴权再为该路径放宽 JSON 体积，避免扩大其他接口边界。
  app.use("/api/external/image-cutout/remove-background/batch", requireExternalApiKey, express.json({ limit: "60mb" }))
  app.use(express.json({ limit: "15mb" }))
  app.use(routes)

  // 生产构建后由 API 同时托管管理端静态资源。
  const webDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web/dist")
  app.use(express.static(webDist))
  app.use(errorHandler)
  return app
}
