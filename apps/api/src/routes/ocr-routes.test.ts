import express from "express"
import { afterEach, describe, expect, it } from "vitest"
import { errorHandler } from "../middleware/error-handler.js"
import { ocrRoutes } from "./ocr-routes.js"

const originalKeys = process.env.EXTERNAL_API_KEYS
afterEach(() => { if (originalKeys === undefined) delete process.env.EXTERNAL_API_KEYS; else process.env.EXTERNAL_API_KEYS = originalKeys })

function testApp() { const app = express(); app.use(express.json()); app.use("/api", ocrRoutes); app.use(errorHandler); return app }

describe("external invoice routes", () => {
  it("rejects requests without an API key", async () => {
    process.env.EXTERNAL_API_KEYS = "test-secret"
    const server = testApp().listen(0)
    try {
      const address = server.address(); if (!address || typeof address === "string") throw new Error("测试服务启动失败")
      const response = await fetch(`http://127.0.0.1:${address.port}/api/external/invoices/recognize`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })
      expect(response.status).toBe(401)
    } finally { server.close() }
  })

  it("returns unavailable when external keys are not configured", async () => {
    delete process.env.EXTERNAL_API_KEYS
    const server = testApp().listen(0)
    try {
      const address = server.address(); if (!address || typeof address === "string") throw new Error("测试服务启动失败")
      const response = await fetch(`http://127.0.0.1:${address.port}/api/external/invoices/recognize`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })
      expect(response.status).toBe(503)
    } finally { server.close() }
  })
})
