import type { Express } from "express"
import swaggerUi from "swagger-ui-express"

export const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "ZForm 外部报关品名 API",
    version: "1.0.0",
    description: "将中英文商品销售名标准化为报关中英文品名。`qualified=false` 表示命中风险规则，需要人工复核后再用于正式申报。",
  },
  servers: [{ url: "/", description: "当前服务" }],
  tags: [{ name: "报关品名", description: "外部系统调用接口" }],
  paths: {
    "/api/external/declaration-names/convert": {
      post: {
        tags: ["报关品名"],
        summary: "转换中英文商品名",
        description: "优先返回已审核的历史映射；未命中时同步调用模型生成，并执行置信度、英文大写、长度和敏感品类复核规则。",
        operationId: "convertDeclarationName",
        security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ExternalDeclarationNameConvertRequest" },
              example: { name: "18V 无刷充电式电钻套装 蓝色", nameEng: "18V Brushless Cordless Drill Kit Blue", clientRequestId: "ERP-20260719-0001" },
            },
          },
        },
        responses: {
          "200": {
            description: "转换成功；请根据 qualified 和 reviewRequired 决定是否可自动使用。",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ExternalDeclarationNameConvertResponse" } } },
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "503": { $ref: "#/components/responses/Unavailable" },
        },
      },
    },
    "/api/external/declaration-names/convert/batch": {
      post: {
        tags: ["报关品名"],
        summary: "批量转换中英文商品名",
        description: "单次最多处理 100 条，按输入顺序逐项返回结果；单项失败不会中断整批处理。历史映射复用和人工复核规则与单条接口一致。",
        operationId: "convertDeclarationNamesBatch",
        security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ExternalDeclarationNameBatchConvertRequest" },
              example: {
                items: [
                  { name: "18V 无刷充电式电钻套装 蓝色", nameEng: "18V Brushless Cordless Drill Kit Blue", clientRequestId: "ERP-001" },
                  { name: "塑料工具箱", nameEng: "Plastic Tool Box", clientRequestId: "ERP-002" },
                ],
              },
            },
          },
        },
        responses: {
          "200": {
            description: "批量处理完成；items 中包含每一项的成功结果或失败原因。",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ExternalDeclarationNameBatchConvertResponse" } } },
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "503": { $ref: "#/components/responses/Unavailable" },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      ApiKeyAuth: { type: "apiKey", in: "header", name: "X-API-Key", description: "在 EXTERNAL_API_KEYS 中配置的调用密钥" },
      BearerAuth: { type: "http", scheme: "bearer", bearerFormat: "API Key" },
    },
    schemas: {
      ExternalDeclarationNameConvertRequest: {
        type: "object", additionalProperties: false, required: ["name", "nameEng"],
        properties: {
          name: { type: "string", minLength: 1, maxLength: 255, description: "中文商品销售名" },
          nameEng: { type: "string", minLength: 1, maxLength: 255, description: "英文商品销售名" },
          clientRequestId: { type: "string", minLength: 1, maxLength: 100, description: "调用方请求号，用于审计追踪" },
        },
      },
      ExternalDeclarationNameConvertResult: {
        type: "object", required: ["name", "nameEng", "declarationName", "customsDeclarationNameEng", "confidence", "qualified", "reviewRequired", "reviewReason", "source"],
        properties: {
          name: { type: "string" }, nameEng: { type: "string" },
          declarationName: { type: "string", description: "规范中文报关品名" },
          customsDeclarationNameEng: { type: "string", description: "规范英文报关品名，统一大写" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          qualified: { type: "boolean", description: "是否通过当前自动审核规则" },
          reviewRequired: { type: "boolean" }, reviewReason: { type: "string" },
          source: { type: "string", enum: ["CACHE", "MODEL"] }, modelVersion: { type: "string" },
        },
      },
      ExternalDeclarationNameBatchConvertRequest: {
        type: "object", additionalProperties: false, required: ["items"],
        properties: {
          items: { type: "array", minItems: 1, maxItems: 100, items: { $ref: "#/components/schemas/ExternalDeclarationNameConvertRequest" } },
        },
      },
      ExternalDeclarationNameBatchItemResult: {
        oneOf: [
          {
            type: "object", additionalProperties: false, required: ["index", "success", "data"],
            properties: {
              index: { type: "integer", minimum: 0 }, success: { type: "boolean", enum: [true] }, clientRequestId: { type: "string" },
              data: { $ref: "#/components/schemas/ExternalDeclarationNameConvertResult" },
            },
          },
          {
            type: "object", additionalProperties: false, required: ["index", "success", "name", "nameEng", "error"],
            properties: {
              index: { type: "integer", minimum: 0 }, success: { type: "boolean", enum: [false] },
              name: { type: "string" }, nameEng: { type: "string" }, clientRequestId: { type: "string" }, error: { type: "string" },
            },
          },
        ],
      },
      ExternalDeclarationNameBatchConvertResult: {
        type: "object", required: ["totalCount", "successCount", "failedCount", "items"],
        properties: {
          totalCount: { type: "integer", minimum: 0 }, successCount: { type: "integer", minimum: 0 }, failedCount: { type: "integer", minimum: 0 },
          items: { type: "array", items: { $ref: "#/components/schemas/ExternalDeclarationNameBatchItemResult" } },
        },
      },
      ExternalDeclarationNameConvertResponse: {
        type: "object", required: ["success", "message", "data"],
        properties: { success: { type: "boolean", example: true }, message: { type: "string", example: "报关品名转换完成" }, data: { $ref: "#/components/schemas/ExternalDeclarationNameConvertResult" } },
      },
      ExternalDeclarationNameBatchConvertResponse: {
        type: "object", required: ["success", "message", "data"],
        properties: { success: { type: "boolean", example: true }, message: { type: "string", example: "批量报关品名转换完成" }, data: { $ref: "#/components/schemas/ExternalDeclarationNameBatchConvertResult" } },
      },
      ErrorResponse: {
        type: "object", required: ["success", "message", "data"],
        properties: { success: { type: "boolean", example: false }, message: { type: "string" }, data: { nullable: true, example: null } },
      },
    },
    responses: {
      BadRequest: { description: "请求参数错误", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
      Unauthorized: { description: "API Key 缺失或无效", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
      Unavailable: { description: "外部接口或模型服务尚未正确配置", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
    },
  },
} as const

export function registerOpenApi(app: Express): void {
  app.get("/api/openapi.json", (_request, response) => response.json(openApiDocument))
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(openApiDocument, { customSiteTitle: "ZForm 外部报关品名 API" }))
}
