import type { Express } from "express"
import swaggerUi from "swagger-ui-express"

export const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "ZForm 外部服务 API",
    version: "1.1.0",
    description: `提供报关品名转换与电子发票识别能力。

## 鉴权

所有外部接口必须提供以下任一请求头：

- \`X-API-Key: <key>\`
- \`Authorization: Bearer <key>\`

密钥由服务端环境变量 \`EXTERNAL_API_KEYS\` 配置。Swagger 页面可点击 **Authorize** 填入密钥。

## 通用响应

接口统一返回 \`{ success, message, data }\`。HTTP 200 表示请求处理完成；批量接口的单项失败位于 \`data.items\`，不会改变整批 HTTP 状态。

## 电子发票文件

文件内容使用标准 Base64，不要包含 \`data:application/pdf;base64,\` 等 Data URL 前缀。单文件解码后最大 10MB。支持 PDF、JPEG、PNG、WebP。`,
  },
  servers: [{ url: "/", description: "当前服务" }],
  tags: [{ name: "报关品名", description: "外部报关品名转换接口" }, { name: "电子发票", description: "外部电子发票识别接口" }],
  paths: {
    "/api/external/invoices/recognize": {
      post: {
        tags: ["电子发票"], summary: "识别单张电子发票", description: "同步识别一张电子发票。原生 PDF 优先提取文本层和二维码；图片或扫描件使用配置的视觉模型。识别记录按调用方 API Key 的哈希身份隔离保存。", operationId: "recognizeExternalInvoice", security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/ExternalInvoiceRecognizeRequest" }, example: { filename: "invoice.pdf", mimeType: "application/pdf", base64Data: "JVBERi0xLjQ...", clientRequestId: "ERP-INV-001" } } } },
        responses: { "200": { description: "识别成功", content: { "application/json": { schema: { $ref: "#/components/schemas/ExternalInvoiceRecognizeResponse" }, example: { success: true, message: "电子发票识别完成", data: { recognitionId: "3ff17ee6-f7b9-4fee-ac69-e69564684f13", originalFilename: "invoice.pdf", clientRequestId: "ERP-INV-001", extractionMethod: "HYBRID", invoiceNumber: "25800001", invoiceDate: "2026-08-13", buyerName: "购买方有限公司", buyerTaxId: "91330000XXXXXXXXXX", sellerName: "销售方有限公司", sellerTaxId: "91310000XXXXXXXXXX", subtotal: "100.00", totalTax: "6.00", totalAmount: "106.00", totalAmountInWords: "壹佰零陆元整", remarks: "项目编号：A001", drawer: "张三", items: [{ itemName: "技术服务费", specification: "", unit: "项", quantity: "1", unitPrice: "100.00", amount: "100.00", taxRate: "6%", taxAmount: "6.00" }] } } } } }, "400": { $ref: "#/components/responses/BadRequest" }, "401": { $ref: "#/components/responses/Unauthorized" }, "413": { $ref: "#/components/responses/PayloadTooLarge" }, "422": { $ref: "#/components/responses/Unprocessable" }, "503": { $ref: "#/components/responses/Unavailable" } },
      },
    },
    "/api/external/invoices/recognize/batch": {
      post: {
        tags: ["电子发票"], summary: "批量识别电子发票", description: "单次最多 10 张，最多并发识别 2 张，单项失败不会中断整批。", operationId: "recognizeExternalInvoicesBatch", security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/ExternalInvoiceBatchRecognizeRequest" }, example: { items: [{ filename: "invoice-001.pdf", mimeType: "application/pdf", base64Data: "JVBERi0xLjQ...", clientRequestId: "ERP-INV-001" }, { filename: "invoice-002.png", mimeType: "image/png", base64Data: "iVBORw0KGgo...", clientRequestId: "ERP-INV-002" }] } } } },
        responses: { "200": { description: "批量处理完成", content: { "application/json": { schema: { $ref: "#/components/schemas/ExternalInvoiceBatchRecognizeResponse" } } } }, "400": { $ref: "#/components/responses/BadRequest" }, "401": { $ref: "#/components/responses/Unauthorized" }, "503": { $ref: "#/components/responses/Unavailable" } },
      },
    },
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
      ApiKeyAuth: { type: "apiKey", in: "header", name: "X-API-Key", description: "在 EXTERNAL_API_KEYS 中配置的调用密钥；输入密钥原文即可" },
      BearerAuth: { type: "http", scheme: "bearer", bearerFormat: "API Key", description: "与 X-API-Key 等价的 Bearer 鉴权" },
    },
    schemas: {
      InvoiceItem: {
        type: "object", description: "发票中的一行货物、服务或应税劳务明细", properties: { itemName: { type: "string", description: "项目名称" }, specification: { type: "string", description: "规格型号" }, unit: { type: "string", description: "单位" }, quantity: { type: "string", description: "数量，保留票面格式" }, unitPrice: { type: "string", description: "单价，保留票面格式" }, amount: { type: "string", description: "不含税金额" }, taxRate: { type: "string", description: "税率，如 6% 或 免税" }, taxAmount: { type: "string", description: "税额" } },
      },
      ExternalInvoiceRecognizeRequest: {
        type: "object", additionalProperties: false, required: ["filename", "mimeType", "base64Data"], properties: { filename: { type: "string", minLength: 1, maxLength: 255, description: "包含扩展名的原文件名" }, mimeType: { type: "string", enum: ["application/pdf", "image/jpeg", "image/png", "image/webp"], description: "必须与实际文件格式一致" }, base64Data: { type: "string", minLength: 4, maxLength: 14000000, pattern: "^[A-Za-z0-9+/]+={0,2}$", description: "标准 Base64 文件内容，不含 Data URL 前缀；解码后最大 10MB" }, clientRequestId: { type: "string", minLength: 1, maxLength: 100, description: "调用方请求号，将原样返回，便于关联业务记录" } },
      },
      ExternalInvoiceRecognizeResult: {
        type: "object", required: ["recognitionId", "originalFilename", "items"], properties: { recognitionId: { type: "string", format: "uuid", description: "服务端识别记录 ID" }, originalFilename: { type: "string" }, clientRequestId: { type: "string" }, extractionMethod: { type: "string", enum: ["QR", "AI", "HYBRID"], description: "QR=二维码、AI=模型、HYBRID=二维码核心字段加模型补全" }, invoiceType: { type: "string", enum: ["VAT_NORMAL", "VAT_SPECIAL"], description: "VAT_NORMAL=普通发票，VAT_SPECIAL=增值税专用发票；无法明确识别时省略" }, invoiceNumber: { type: "string" }, invoiceDate: { type: "string", description: "优先返回 YYYY-MM-DD；无法标准化时保留票面格式" }, buyerName: { type: "string" }, buyerTaxId: { type: "string" }, sellerName: { type: "string" }, sellerTaxId: { type: "string" }, subtotal: { type: "string", description: "金额合计（不含税）" }, totalTax: { type: "string" }, totalAmount: { type: "string", description: "价税合计" }, totalAmountInWords: { type: "string" }, remarks: { type: "string", description: "备注栏原文；票面为空时字段可能省略" }, drawer: { type: "string", description: "开票人" }, items: { type: "array", minItems: 1, items: { $ref: "#/components/schemas/InvoiceItem" } } },
      },
      ExternalInvoiceBatchRecognizeRequest: { type: "object", additionalProperties: false, required: ["items"], properties: { items: { type: "array", minItems: 1, maxItems: 10, items: { $ref: "#/components/schemas/ExternalInvoiceRecognizeRequest" } } } },
      ExternalInvoiceBatchItemResult: { oneOf: [{ type: "object", required: ["index", "success", "data"], properties: { index: { type: "integer" }, success: { type: "boolean", enum: [true] }, clientRequestId: { type: "string" }, data: { $ref: "#/components/schemas/ExternalInvoiceRecognizeResult" } } }, { type: "object", required: ["index", "success", "filename", "error"], properties: { index: { type: "integer" }, success: { type: "boolean", enum: [false] }, filename: { type: "string" }, clientRequestId: { type: "string" }, error: { type: "string" } } }] },
      ExternalInvoiceBatchRecognizeResult: { type: "object", required: ["totalCount", "successCount", "failedCount", "items"], properties: { totalCount: { type: "integer" }, successCount: { type: "integer" }, failedCount: { type: "integer" }, items: { type: "array", items: { $ref: "#/components/schemas/ExternalInvoiceBatchItemResult" } } } },
      ExternalInvoiceRecognizeResponse: { type: "object", required: ["success", "message", "data"], properties: { success: { type: "boolean", example: true }, message: { type: "string", example: "电子发票识别完成" }, data: { $ref: "#/components/schemas/ExternalInvoiceRecognizeResult" } } },
      ExternalInvoiceBatchRecognizeResponse: { type: "object", required: ["success", "message", "data"], properties: { success: { type: "boolean", example: true }, message: { type: "string", example: "批量电子发票识别完成" }, data: { $ref: "#/components/schemas/ExternalInvoiceBatchRecognizeResult" } } },
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
      PayloadTooLarge: { description: "Base64 解码后的单文件超过 10MB", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" }, example: { success: false, message: "单个文件不能超过 10MB。", data: null } } } },
      Unprocessable: { description: "文件已接收但识别失败", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
      Unavailable: { description: "外部接口或模型服务尚未正确配置", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
    },
  },
} as const

export function registerOpenApi(app: Express): void {
  app.get("/api/openapi.json", (_request, response) => response.json(openApiDocument))
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(openApiDocument, { customSiteTitle: "ZForm 外部服务 API" }))
}
