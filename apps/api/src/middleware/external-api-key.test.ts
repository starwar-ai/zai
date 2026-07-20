import { afterEach, describe, expect, it } from "vitest"
import { BusinessError } from "../utils/business-error.js"
import { authenticateExternalApiKey } from "./external-api-key.js"

const originalKeys = process.env.EXTERNAL_API_KEYS

afterEach(() => {
  if (originalKeys === undefined) delete process.env.EXTERNAL_API_KEYS
  else process.env.EXTERNAL_API_KEYS = originalKeys
})

describe("外部 API Key", () => {
  it("支持 X-API-Key 和 Bearer 两种传递方式", () => {
    process.env.EXTERNAL_API_KEYS = "key-a,key-b"
    expect(authenticateExternalApiKey(undefined, "key-a")).toMatch(/^external:[a-f0-9]{12}$/)
    expect(authenticateExternalApiKey("Bearer key-b", undefined)).toMatch(/^external:[a-f0-9]{12}$/)
  })

  it("拒绝无效密钥且不泄露已配置密钥", () => {
    process.env.EXTERNAL_API_KEYS = "secret-key"
    expect(() => authenticateExternalApiKey(undefined, "wrong-key")).toThrowError(new BusinessError("API Key 无效。", 401))
  })

  it("未配置时返回服务不可用", () => {
    delete process.env.EXTERNAL_API_KEYS
    expect(() => authenticateExternalApiKey(undefined, "key-a")).toThrowError(new BusinessError("外部接口尚未配置 API Key。", 503))
  })
})
