/** 可预期的领域错误，由统一错误中间件转换为 API 响应。 */
export class BusinessError extends Error {
  constructor(message: string, public readonly statusCode = 400) { super(message) }
}
