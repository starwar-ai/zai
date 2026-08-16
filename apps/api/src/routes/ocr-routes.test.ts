import express from "express"
import { afterEach, describe, expect, it } from "vitest"
import { errorHandler } from "../middleware/error-handler.js"
import { ocrRoutes } from "./ocr-routes.js"

const originalKeys = process.env.EXTERNAL_API_KEYS
afterEach(() => { if (originalKeys === undefined) delete process.env.EXTERNAL_API_KEYS; else process.env.EXTERNAL_API_KEYS = originalKeys })

function testApp() { const app = express(); app.use(express.json()); app.use("/api", ocrRoutes); app.use(errorHandler); return app }

describe("external OCR routes", () => {
  it("protects payment recognition and rejects PDF input", async () => {
    process.env.EXTERNAL_API_KEYS = "test-secret"
    const server = testApp().listen(0)
    try {
      const address = server.address(); if (!address || typeof address === "string") throw new Error("测试服务启动失败")
      const unauthorized = await fetch(`http://127.0.0.1:${address.port}/api/external/payments/recognize`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })
      expect(unauthorized.status).toBe(401)
      const invalidMime = await fetch(`http://127.0.0.1:${address.port}/api/external/payments/recognize`, { method: "POST", headers: { "content-type": "application/json", "x-api-key": "test-secret" }, body: JSON.stringify({ filename: "payment.pdf", mimeType: "application/pdf", base64Data: "JVBERg==" }) })
      expect(invalidMime.status).toBe(400)
    } finally { server.close() }
  })

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

  it("protects the navigation route recognition endpoint with an API key", async () => {
    process.env.EXTERNAL_API_KEYS = "test-secret"
    const server = testApp().listen(0)
    try {
      const address = server.address(); if (!address || typeof address === "string") throw new Error("测试服务启动失败")
      const response = await fetch(`http://127.0.0.1:${address.port}/api/external/navigation-routes/recognize`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })
      expect(response.status).toBe(401)
    } finally { server.close() }
  })

  it("protects train-ticket recognition and rejects non-PDF input", async () => {
    process.env.EXTERNAL_API_KEYS = "test-secret"
    const server = testApp().listen(0)
    try {
      const address = server.address(); if (!address || typeof address === "string") throw new Error("测试服务启动失败")
      const unauthorized = await fetch(`http://127.0.0.1:${address.port}/api/external/train-tickets/recognize`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })
      expect(unauthorized.status).toBe(401)
      const invalidMime = await fetch(`http://127.0.0.1:${address.port}/api/external/train-tickets/recognize`, { method: "POST", headers: { "content-type": "application/json", "x-api-key": "test-secret" }, body: JSON.stringify({ filename: "ticket.png", mimeType: "image/png", base64Data: "aW1hZw==" }) })
      expect(invalidMime.status).toBe(400)
    } finally { server.close() }
  })
})
