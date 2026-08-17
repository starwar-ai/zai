import express from "express"
import { afterEach, describe, expect, it } from "vitest"
import { errorHandler } from "../middleware/error-handler.js"
import { imageCutoutRoutes } from "./image-cutout-routes.js"

const originalKeys = process.env.EXTERNAL_API_KEYS
afterEach(() => { if (originalKeys === undefined) delete process.env.EXTERNAL_API_KEYS; else process.env.EXTERNAL_API_KEYS = originalKeys })

function testApp() { const app = express(); app.use(express.json()); app.use("/api", imageCutoutRoutes); app.use(errorHandler); return app }

describe("external image cutout routes", () => {
  it("rejects cutout without an API key before loading the model", async () => {
    process.env.EXTERNAL_API_KEYS = "test-secret"
    const server = testApp().listen(0)
    try {
      const address = server.address(); if (!address || typeof address === "string") throw new Error("测试服务启动失败")
      const response = await fetch(`http://127.0.0.1:${address.port}/api/external/image-cutout/remove-background`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })
      expect(response.status).toBe(401)
    } finally { server.close() }
  })

  it("validates image format and custom background after authentication", async () => {
    process.env.EXTERNAL_API_KEYS = "test-secret"
    const server = testApp().listen(0)
    try {
      const address = server.address(); if (!address || typeof address === "string") throw new Error("测试服务启动失败")
      const response = await fetch(`http://127.0.0.1:${address.port}/api/external/image-cutout/remove-background`, { method: "POST", headers: { "content-type": "application/json", "x-api-key": "test-secret" }, body: JSON.stringify({ filename: "product.gif", mimeType: "image/gif", base64Data: "AAAA", backgroundMode: "color" }) })
      expect(response.status).toBe(400)
    } finally { server.close() }
  })

  it("limits a batch to five images before loading the model", async () => {
    process.env.EXTERNAL_API_KEYS = "test-secret"
    const server = testApp().listen(0)
    try {
      const address = server.address(); if (!address || typeof address === "string") throw new Error("测试服务启动失败")
      const item = { filename: "product.png", mimeType: "image/png", base64Data: "iVBORw0KGgo=" }
      const response = await fetch(`http://127.0.0.1:${address.port}/api/external/image-cutout/remove-background/batch`, { method: "POST", headers: { "content-type": "application/json", "x-api-key": "test-secret" }, body: JSON.stringify({ items: Array.from({ length: 6 }, () => item) }) })
      expect(response.status).toBe(400)
    } finally { server.close() }
  })
})
