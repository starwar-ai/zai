let fallbackSequence = 0

/** 生成仅用于前端临时状态的 ID，并兼容 HTTP 非安全上下文。 */
export function createClientId(): string {
  const cryptoApi = globalThis.crypto
  if (typeof cryptoApi?.randomUUID === "function") return cryptoApi.randomUUID()

  if (typeof cryptoApi?.getRandomValues === "function") {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16))
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const value = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
    return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`
  }

  fallbackSequence += 1
  return `local-${Date.now().toString(36)}-${fallbackSequence.toString(36)}`
}
