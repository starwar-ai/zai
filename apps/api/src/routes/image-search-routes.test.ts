import express from "express"
import { afterEach, describe, expect, it } from "vitest"
import { errorHandler } from "../middleware/error-handler.js"
import { imageSearchRoutes } from "./image-search-routes.js"

const originalKeys = process.env.EXTERNAL_API_KEYS
afterEach(() => { if (originalKeys === undefined) delete process.env.EXTERNAL_API_KEYS; else process.env.EXTERNAL_API_KEYS = originalKeys })

function testApp() { const app = express(); app.use(express.json()); app.use("/api", imageSearchRoutes); app.use(errorHandler); return app }

describe("external image search routes", () => {
  it("rejects search without an API key before processing the image", async () => {
    process.env.EXTERNAL_API_KEYS = "test-secret"
    const server = testApp().listen(0)
    try {
      const address = server.address(); if (!address || typeof address === "string") throw new Error("测试服务启动失败")
      const response = await fetch(`http://127.0.0.1:${address.port}/api/external/image-search/search`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })
      expect(response.status).toBe(401)
    } finally { server.close() }
  })

  it("rejects result image access without an API key", async () => {
    process.env.EXTERNAL_API_KEYS = "test-secret"
    const server = testApp().listen(0)
    try {
      const address = server.address(); if (!address || typeof address === "string") throw new Error("测试服务启动失败")
      const response = await fetch(`http://127.0.0.1:${address.port}/api/external/image-search/assets/3ff17ee6-f7b9-4fee-ac69-e69564684f13/image`)
      expect(response.status).toBe(401)
    } finally { server.close() }
  })

  it("validates the request body after API key authentication", async () => {
    process.env.EXTERNAL_API_KEYS = "test-secret"
    const server = testApp().listen(0)
    try {
      const address = server.address(); if (!address || typeof address === "string") throw new Error("测试服务启动失败")
      const response = await fetch(`http://127.0.0.1:${address.port}/api/external/image-search/search`, { method: "POST", headers: { "content-type": "application/json", "x-api-key": "test-secret" }, body: JSON.stringify({ filename: "query.gif", mimeType: "image/gif", base64Data: "AAAA" }) })
      expect(response.status).toBe(400)
    } finally { server.close() }
  })
})
