import type { Express } from "express"
import swaggerUi from "swagger-ui-express"

export const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "ZForm 外部服务 API",
    version: "1.6.0",
    description: `提供报关品名转换、支付截图识别、电子发票识别、火车票识别、导航截图识别、以图搜图与智能抠图能力。

## 鉴权

所有外部接口必须提供以下任一请求头：

- \`X-API-Key: <key>\`
- \`Authorization: Bearer <key>\`

密钥由服务端环境变量 \`EXTERNAL_API_KEYS\` 配置。Swagger 页面可点击 **Authorize** 填入密钥。

## 通用响应

接口统一返回 \`{ success, message, data }\`。HTTP 200 表示请求处理完成；批量接口的单项失败位于 \`data.items\`，不会改变整批 HTTP 状态。

## 图片、电子发票与火车票文件

文件内容使用标准 Base64，不要包含 \`data:image/png;base64,\` 等 Data URL 前缀。支付截图、导航截图、电子发票、火车票和智能抠图单文件解码后最大 10MB；以图搜图输入图片最大 8MB。图片支持 JPEG、PNG、WebP，电子发票还支持 PDF；火车票仅支持带可提取文本层的铁路电子客票 PDF，扫描件暂不支持。

智能抠图由服务端本地完整 ISNet 模型处理。模型默认保存在 \`apps/api/.models/isnet.onnx\`，后续启动直接复用；本地文件缺失时首次请求会下载约 168MiB 模型并在完整校验后原子落盘。以图搜图结果中的 \`imagePath\` 是相对路径，读取结果原图时必须继续携带有效 API Key。`,
  },
  servers: [{ url: "/", description: "当前服务" }],
  tags: [{ name: "报关品名", description: "外部报关品名转换接口" }, { name: "支付截图", description: "外部支付截图识别接口" }, { name: "电子发票", description: "外部电子发票识别接口" }, { name: "火车票", description: "外部铁路电子客票识别接口" }, { name: "导航截图", description: "外部导航路线截图识别接口" }, { name: "以图搜图", description: "基于公共已索引图库的相似图片检索接口" }, { name: "智能抠图", description: "服务端本地模型背景移除与规格化输出接口" }],
  paths: {
    "/api/external/payments/recognize": {
      post: {
        tags: ["支付截图"], summary: "识别单张支付截图", description: "同步识别一张支付截图，提取平台、订单号、商品名称、金额、支付时间、支付状态、支付方式和收款方。识别记录按调用方 API Key 的哈希身份隔离保存。", operationId: "recognizeExternalPayment", security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/ExternalPaymentRecognizeRequest" }, example: { filename: "payment.png", mimeType: "image/png", base64Data: "iVBORw0KGgo...", clientRequestId: "ERP-PAY-001" } } } },
        responses: { "200": { description: "识别成功", content: { "application/json": { schema: { $ref: "#/components/schemas/ExternalPaymentRecognizeResponse" }, example: { success: true, message: "支付截图识别完成", data: { recognitionId: "2d813213-d6b4-4e8c-b4f0-1158014a35d4", originalFilename: "payment.png", clientRequestId: "ERP-PAY-001", platform: "支付宝", orderNo: "202608160001", productName: "技术服务", amount: "128.00", paymentTime: "2026-08-16 12:30:00", paymentStatus: "支付成功", paymentMethod: "余额", receiver: "示例科技有限公司" } } } } }, "400": { $ref: "#/components/responses/BadRequest" }, "401": { $ref: "#/components/responses/Unauthorized" }, "413": { $ref: "#/components/responses/PayloadTooLarge" }, "422": { $ref: "#/components/responses/Unprocessable" }, "503": { $ref: "#/components/responses/Unavailable" } },
      },
    },
    "/api/external/payments/recognize/batch": {
      post: {
        tags: ["支付截图"], summary: "批量识别支付截图", description: "单次最多 10 张，最多并发识别 2 张，按输入顺序逐项返回；单项失败不会中断整批。", operationId: "recognizeExternalPaymentsBatch", security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/ExternalPaymentBatchRecognizeRequest" }, example: { items: [{ filename: "payment-001.png", mimeType: "image/png", base64Data: "iVBORw0KGgo...", clientRequestId: "ERP-PAY-001" }, { filename: "payment-002.jpg", mimeType: "image/jpeg", base64Data: "/9j/4AAQSk...", clientRequestId: "ERP-PAY-002" }] } } } },
        responses: { "200": { description: "批量处理完成；items 中包含每项的成功结果或失败原因。", content: { "application/json": { schema: { $ref: "#/components/schemas/ExternalPaymentBatchRecognizeResponse" } } } }, "400": { $ref: "#/components/responses/BadRequest" }, "401": { $ref: "#/components/responses/Unauthorized" }, "503": { $ref: "#/components/responses/Unavailable" } },
      },
    },
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
    "/api/external/train-tickets/recognize": {
      post: {
        tags: ["火车票"], summary: "识别单张铁路电子客票", description: "同步解析一份带文本层的铁路电子客票 PDF，提取发票、行程、车次座位、乘客、票价和购买方字段。优先使用 TRAIN_TICKET_OCR_PROVIDER 与 TRAIN_TICKET_OCR_MODEL；未配置时回退到项目公共 LLM_PROVIDER_ORDER。扫描件或非铁路电子客票返回 HTTP 422。识别记录按调用方 API Key 的哈希身份隔离保存。", operationId: "recognizeExternalTrainTicket", security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/ExternalTrainTicketRecognizeRequest" }, example: { filename: "railway-ticket.pdf", mimeType: "application/pdf", base64Data: "JVBERi0xLjQ...", clientRequestId: "ERP-TRAIN-001" } } } },
        responses: { "200": { description: "识别成功；票面缺失或无法可靠提取的可选字段会省略。", content: { "application/json": { schema: { $ref: "#/components/schemas/ExternalTrainTicketRecognizeResponse" }, example: { success: true, message: "火车票识别完成", data: { recognitionId: "6b552553-6487-40fc-bd1d-123e7706d513", originalFilename: "railway-ticket.pdf", extractionMethod: "PDF_TEXT_AI", clientRequestId: "ERP-TRAIN-001", trainInvoiceNo: "25112000000000123456", trainIssueDate: "2026年08月15日", departureStation: "北京南站", arrivalStation: "上海虹桥站", trainNo: "G101", departureDate: "2026年08月14日", departureTime: "08:00", seatNo: "03车12A号", seatClass: "二等座", ticketPrice: "553.00", passengerId: "140102******1453", passengerName: "张凯", ticketNo: "123456789012345678", trainBuyerName: "示例科技有限公司", trainBuyerCreditCode: "91110000123456789X" } } } } }, "400": { $ref: "#/components/responses/BadRequest" }, "401": { $ref: "#/components/responses/Unauthorized" }, "413": { $ref: "#/components/responses/PayloadTooLarge" }, "422": { $ref: "#/components/responses/Unprocessable" }, "503": { $ref: "#/components/responses/Unavailable" } },
      },
    },
    "/api/external/train-tickets/recognize/batch": {
      post: {
        tags: ["火车票"], summary: "批量识别铁路电子客票", description: "单次最多 10 份 PDF，最多并发解析 2 份，按输入顺序逐项返回；单项失败不会中断整批。", operationId: "recognizeExternalTrainTicketsBatch", security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/ExternalTrainTicketBatchRecognizeRequest" }, example: { items: [{ filename: "ticket-001.pdf", mimeType: "application/pdf", base64Data: "JVBERi0xLjQ...", clientRequestId: "ERP-TRAIN-001" }, { filename: "ticket-002.pdf", mimeType: "application/pdf", base64Data: "JVBERi0xLjQ...", clientRequestId: "ERP-TRAIN-002" }] } } } },
        responses: { "200": { description: "批量处理完成；items 中包含每项的成功结果或失败原因。", content: { "application/json": { schema: { $ref: "#/components/schemas/ExternalTrainTicketBatchRecognizeResponse" } } } }, "400": { $ref: "#/components/responses/BadRequest" }, "401": { $ref: "#/components/responses/Unauthorized" }, "503": { $ref: "#/components/responses/Unavailable" } },
      },
    },
    "/api/external/navigation-routes/recognize": {
      post: {
        tags: ["导航截图"], summary: "识别单张导航截图", description: "同步识别画面中明确选中的单一路线，提取目的地、按行程顺序排列的途经地、距离、人民币通行费、置信度及选中依据。模型无法可靠确认时仍返回识别结果，并通过 routeResultStatus 标记 uncertain 或 not_found。识别记录按调用方 API Key 的哈希身份隔离保存。", operationId: "recognizeExternalNavigationRoute", security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/ExternalNavigationRouteRecognizeRequest" }, example: { filename: "navigation-route.png", mimeType: "image/png", base64Data: "iVBORw0KGgo...", clientRequestId: "TMS-ROUTE-001" } } } },
        responses: { "200": { description: "识别请求完成；请根据 routeResultStatus 和 confidence 判断是否需要人工复核。", content: { "application/json": { schema: { $ref: "#/components/schemas/ExternalNavigationRouteRecognizeResponse" }, example: { success: true, message: "导航截图识别完成", data: { recognitionId: "34cd13a5-7f68-4f31-9f81-93e814612a58", originalFilename: "navigation-route.png", clientRequestId: "TMS-ROUTE-001", extractionMethod: "AI", routeResultStatus: "success", distanceKm: 95.2, tollYuan: 36, destination: "苏州中心", waypoints: ["阳澄湖服务区", "苏州工业园区"], confidence: 0.93, selectedRouteEvidence: "路线卡片带有蓝色外框并显示为当前方案" } } } } }, "400": { $ref: "#/components/responses/BadRequest" }, "401": { $ref: "#/components/responses/Unauthorized" }, "413": { $ref: "#/components/responses/PayloadTooLarge" }, "422": { $ref: "#/components/responses/Unprocessable" }, "503": { $ref: "#/components/responses/Unavailable" } },
      },
    },
    "/api/external/navigation-routes/recognize/batch": {
      post: {
        tags: ["导航截图"], summary: "批量识别导航截图", description: "单次最多 10 张，最多并发识别 2 张，按输入顺序逐项返回；单项失败不会中断整批。", operationId: "recognizeExternalNavigationRoutesBatch", security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/ExternalNavigationRouteBatchRecognizeRequest" }, example: { items: [{ filename: "route-001.png", mimeType: "image/png", base64Data: "iVBORw0KGgo...", clientRequestId: "TMS-001" }, { filename: "route-002.jpg", mimeType: "image/jpeg", base64Data: "/9j/4AAQSk...", clientRequestId: "TMS-002" }] } } } },
        responses: { "200": { description: "批量处理完成；items 中包含每项的成功结果或失败原因。", content: { "application/json": { schema: { $ref: "#/components/schemas/ExternalNavigationRouteBatchRecognizeResponse" } } } }, "400": { $ref: "#/components/responses/BadRequest" }, "401": { $ref: "#/components/responses/Unauthorized" }, "503": { $ref: "#/components/responses/Unavailable" } },
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
    "/api/external/image-cutout/remove-background": {
      post: {
        tags: ["智能抠图"], summary: "移除单张图片背景", description: "同步移除一张图片背景，并按指定底色、方形画布、留白和格式输出 Base64 图片。edge 省略时保留原始画布尺寸；JPG 不支持透明通道，backgroundMode=transparent 时自动使用白底。图片不会写入数据库。", operationId: "removeExternalImageBackground", security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/ExternalImageCutoutRequest" }, example: { filename: "product.webp", mimeType: "image/webp", base64Data: "UklGRiQAAABXRUJQVlA4...", backgroundMode: "transparent", outputFormat: "png", edge: 1600, padding: 0.08, clientRequestId: "PIM-CUTOUT-001" } } } },
        responses: { "200": { description: "抠图及规格化输出完成", content: { "application/json": { schema: { $ref: "#/components/schemas/ExternalImageCutoutResponse" }, example: { success: true, message: "图片抠图完成", data: { originalFilename: "product.webp", outputFilename: "product_cutout.png", mimeType: "image/png", base64Data: "iVBORw0KGgo...", originalWidth: 1200, originalHeight: 900, outputWidth: 1600, outputHeight: 1600, engine: "isnet", processingMs: 2380, clientRequestId: "PIM-CUTOUT-001" } } } } }, "400": { $ref: "#/components/responses/BadRequest" }, "401": { $ref: "#/components/responses/Unauthorized" }, "413": { $ref: "#/components/responses/CutoutPayloadTooLarge" }, "422": { $ref: "#/components/responses/Unprocessable" }, "503": { $ref: "#/components/responses/Unavailable" } },
      },
    },
    "/api/external/image-cutout/remove-background/batch": {
      post: {
        tags: ["智能抠图"], summary: "批量移除图片背景", description: "单次最多 5 张，按输入顺序串行处理并逐项返回；串行执行用于控制 1024×1024 模型推理的内存峰值。单项失败不会中断整批。", operationId: "removeExternalImageBackgroundsBatch", security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/ExternalImageCutoutBatchRequest" }, example: { items: [{ filename: "product-001.jpg", mimeType: "image/jpeg", base64Data: "/9j/4AAQSk...", backgroundMode: "white", outputFormat: "jpg", edge: 1600, padding: 0.08, clientRequestId: "PIM-CUTOUT-001" }, { filename: "product-002.png", mimeType: "image/png", base64Data: "iVBORw0KGgo...", backgroundMode: "color", backgroundColor: "#F4F0E9", outputFormat: "png", edge: 1000, padding: 0.1, clientRequestId: "PIM-CUTOUT-002" }] } } } },
        responses: { "200": { description: "整批处理完成；items 中包含每项成品或失败原因。", content: { "application/json": { schema: { $ref: "#/components/schemas/ExternalImageCutoutBatchResponse" } } } }, "400": { $ref: "#/components/responses/BadRequest" }, "401": { $ref: "#/components/responses/Unauthorized" }, "503": { $ref: "#/components/responses/Unavailable" } },
      },
    },
    "/api/external/image-search/search": {
      post: {
        tags: ["以图搜图"],
        summary: "按图片搜索相似图片",
        description: "上传一张查询图片，使用视觉模型生成固定 64 维特征，并按余弦相似度从公共已索引图库返回 Top-K。查询原图和结果快照按 API Key 哈希身份隔离保存。该接口同步处理，耗时取决于视觉模型响应速度。",
        operationId: "searchExternalByImage",
        security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/ExternalImageSearchRequest" }, example: { filename: "query-product.jpg", mimeType: "image/jpeg", base64Data: "/9j/4AAQSkZJRgABAQ...", topK: 12, clientRequestId: "ERP-IMG-20260816-001" } } },
        },
        responses: {
          "200": { description: "搜索完成；results 已按 score 降序排列。图库没有已索引图片时 results 为空数组。", content: { "application/json": { schema: { $ref: "#/components/schemas/ExternalImageSearchResponse" }, example: { success: true, message: "以图搜图完成", data: { searchId: "3ff17ee6-f7b9-4fee-ac69-e69564684f13", clientRequestId: "ERP-IMG-20260816-001", resultCount: 1, results: [{ id: "9e6bd626-d88e-45f4-a9db-fcaeb238f8d7", title: "橡木餐椅", tags: ["家具", "木质"], description: "浅色背景中的橡木餐椅产品图", score: 0.9264, rank: 1, imagePath: "/api/external/image-search/assets/9e6bd626-d88e-45f4-a9db-fcaeb238f8d7/image" }] } } } } },
          "400": { $ref: "#/components/responses/BadRequest" }, "401": { $ref: "#/components/responses/Unauthorized" }, "413": { $ref: "#/components/responses/ImagePayloadTooLarge" }, "422": { $ref: "#/components/responses/Unprocessable" }, "503": { $ref: "#/components/responses/Unavailable" },
        },
      },
    },
    "/api/external/image-search/assets/{id}/image": {
      get: {
        tags: ["以图搜图"], summary: "获取搜索结果原图", description: "读取搜索结果中指定图库图片的原始二进制内容。请直接使用搜索响应返回的 imagePath，并继续携带有效 API Key。", operationId: "getExternalImageSearchAssetImage", security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, description: "图库图片 UUID", schema: { type: "string", format: "uuid" } }],
        responses: {
          "200": { description: "图片二进制内容；Content-Type 为 image/jpeg、image/png 或 image/webp。", content: { "image/jpeg": { schema: { type: "string", format: "binary" } }, "image/png": { schema: { type: "string", format: "binary" } }, "image/webp": { schema: { type: "string", format: "binary" } } } },
          "400": { $ref: "#/components/responses/BadRequest" }, "401": { $ref: "#/components/responses/Unauthorized" }, "404": { $ref: "#/components/responses/NotFound" }, "503": { $ref: "#/components/responses/Unavailable" },
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
      ExternalPaymentRecognizeRequest: {
        type: "object", additionalProperties: false, required: ["filename", "mimeType", "base64Data"], properties: { filename: { type: "string", minLength: 1, maxLength: 255, description: "包含扩展名的原文件名" }, mimeType: { type: "string", enum: ["image/jpeg", "image/png", "image/webp"], description: "必须与实际图片格式一致；不支持 PDF" }, base64Data: { type: "string", minLength: 4, maxLength: 14000000, pattern: "^[A-Za-z0-9+/]+={0,2}$", description: "标准 Base64 图片内容，不含 Data URL 前缀；解码后最大 10MB" }, clientRequestId: { type: "string", minLength: 1, maxLength: 100, description: "调用方请求号，将原样返回，便于关联业务记录" } },
      },
      ExternalPaymentRecognizeResult: {
        type: "object", required: ["recognitionId", "originalFilename"], properties: { recognitionId: { type: "string", format: "uuid", description: "服务端识别记录 ID" }, originalFilename: { type: "string" }, clientRequestId: { type: "string" }, platform: { type: "string", description: "截图来源平台，如支付宝、微信支付、淘宝或京东" }, orderNo: { type: "string", description: "订单号或交易号" }, productName: { type: "string", description: "商品或服务名称" }, amount: { type: "string", description: "支付金额，保留截图中的原始格式" }, paymentTime: { type: "string", description: "支付时间，保留截图中的原始格式" }, paymentStatus: { type: "string", description: "支付成功、已完成、待付款等状态" }, paymentMethod: { type: "string", description: "余额、银行卡、微信支付、支付宝等支付方式" }, receiver: { type: "string", description: "收款方或商家名称" } },
      },
      ExternalPaymentBatchRecognizeRequest: { type: "object", additionalProperties: false, required: ["items"], properties: { items: { type: "array", minItems: 1, maxItems: 10, items: { $ref: "#/components/schemas/ExternalPaymentRecognizeRequest" } } } },
      ExternalPaymentBatchItemResult: { oneOf: [{ type: "object", required: ["index", "success", "data"], properties: { index: { type: "integer", minimum: 0 }, success: { type: "boolean", enum: [true] }, clientRequestId: { type: "string" }, data: { $ref: "#/components/schemas/ExternalPaymentRecognizeResult" } } }, { type: "object", required: ["index", "success", "filename", "error"], properties: { index: { type: "integer", minimum: 0 }, success: { type: "boolean", enum: [false] }, filename: { type: "string" }, clientRequestId: { type: "string" }, error: { type: "string" } } }] },
      ExternalPaymentBatchRecognizeResult: { type: "object", required: ["totalCount", "successCount", "failedCount", "items"], properties: { totalCount: { type: "integer", minimum: 0 }, successCount: { type: "integer", minimum: 0 }, failedCount: { type: "integer", minimum: 0 }, items: { type: "array", items: { $ref: "#/components/schemas/ExternalPaymentBatchItemResult" } } } },
      ExternalPaymentRecognizeResponse: { type: "object", required: ["success", "message", "data"], properties: { success: { type: "boolean", example: true }, message: { type: "string", example: "支付截图识别完成" }, data: { $ref: "#/components/schemas/ExternalPaymentRecognizeResult" } } },
      ExternalPaymentBatchRecognizeResponse: { type: "object", required: ["success", "message", "data"], properties: { success: { type: "boolean", example: true }, message: { type: "string", example: "批量支付截图识别完成" }, data: { $ref: "#/components/schemas/ExternalPaymentBatchRecognizeResult" } } },
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
      ExternalTrainTicketRecognizeRequest: {
        type: "object", additionalProperties: false, required: ["filename", "mimeType", "base64Data"], properties: { filename: { type: "string", minLength: 1, maxLength: 255, description: "包含 .pdf 扩展名的铁路电子客票文件名" }, mimeType: { type: "string", enum: ["application/pdf"], description: "固定为 application/pdf" }, base64Data: { type: "string", minLength: 4, maxLength: 14000000, pattern: "^[A-Za-z0-9+/]+={0,2}$", description: "标准 Base64 PDF 内容，不含 Data URL 前缀；解码后最大 10MB" }, clientRequestId: { type: "string", minLength: 1, maxLength: 100, description: "调用方请求号，将原样返回，便于关联业务记录" } },
      },
      ExternalTrainTicketRecognizeResult: {
        type: "object", required: ["recognitionId", "originalFilename", "extractionMethod"], properties: { recognitionId: { type: "string", format: "uuid", description: "服务端识别记录 ID" }, originalFilename: { type: "string" }, clientRequestId: { type: "string" }, extractionMethod: { type: "string", enum: ["PDF_TEXT_AI"], description: "PDF 文本层提取结合专用或公共模型结构化识别" }, trainInvoiceNo: { type: "string", description: "铁路电子客票发票号码" }, trainIssueDate: { type: "string", description: "开票日期，保留票面格式" }, departureStation: { type: "string" }, arrivalStation: { type: "string" }, trainNo: { type: "string", description: "车次，如 G101" }, departureDate: { type: "string", description: "乘车日期，保留票面格式" }, departureTime: { type: "string", description: "发车时间，如 08:00" }, seatNo: { type: "string", description: "车厢与座位号" }, seatClass: { type: "string", description: "席别，如二等座、商务座" }, ticketPrice: { type: "string", description: "票价数值，保留票面精度，不含货币符号" }, passengerId: { type: "string", description: "票面身份证号，通常为脱敏格式" }, passengerName: { type: "string" }, ticketNo: { type: "string", description: "电子客票号" }, trainBuyerName: { type: "string", description: "购买方名称" }, trainBuyerCreditCode: { type: "string", description: "购买方统一社会信用代码" } },
      },
      ExternalTrainTicketBatchRecognizeRequest: { type: "object", additionalProperties: false, required: ["items"], properties: { items: { type: "array", minItems: 1, maxItems: 10, items: { $ref: "#/components/schemas/ExternalTrainTicketRecognizeRequest" } } } },
      ExternalTrainTicketBatchItemResult: { oneOf: [{ type: "object", required: ["index", "success", "data"], properties: { index: { type: "integer", minimum: 0 }, success: { type: "boolean", enum: [true] }, clientRequestId: { type: "string" }, data: { $ref: "#/components/schemas/ExternalTrainTicketRecognizeResult" } } }, { type: "object", required: ["index", "success", "filename", "error"], properties: { index: { type: "integer", minimum: 0 }, success: { type: "boolean", enum: [false] }, filename: { type: "string" }, clientRequestId: { type: "string" }, error: { type: "string" } } }] },
      ExternalTrainTicketBatchRecognizeResult: { type: "object", required: ["totalCount", "successCount", "failedCount", "items"], properties: { totalCount: { type: "integer", minimum: 0 }, successCount: { type: "integer", minimum: 0 }, failedCount: { type: "integer", minimum: 0 }, items: { type: "array", items: { $ref: "#/components/schemas/ExternalTrainTicketBatchItemResult" } } } },
      ExternalTrainTicketRecognizeResponse: { type: "object", required: ["success", "message", "data"], properties: { success: { type: "boolean", example: true }, message: { type: "string", example: "火车票识别完成" }, data: { $ref: "#/components/schemas/ExternalTrainTicketRecognizeResult" } } },
      ExternalTrainTicketBatchRecognizeResponse: { type: "object", required: ["success", "message", "data"], properties: { success: { type: "boolean", example: true }, message: { type: "string", example: "批量火车票识别完成" }, data: { $ref: "#/components/schemas/ExternalTrainTicketBatchRecognizeResult" } } },
      ExternalNavigationRouteRecognizeRequest: {
        type: "object", additionalProperties: false, required: ["filename", "mimeType", "base64Data"], properties: { filename: { type: "string", minLength: 1, maxLength: 255, description: "包含扩展名的导航截图文件名" }, mimeType: { type: "string", enum: ["image/jpeg", "image/png", "image/webp"], description: "必须与实际图片格式一致" }, base64Data: { type: "string", minLength: 4, maxLength: 14000000, pattern: "^[A-Za-z0-9+/]+={0,2}$", description: "标准 Base64 图片内容，不含 Data URL 前缀；解码后最大 10MB" }, clientRequestId: { type: "string", minLength: 1, maxLength: 100, description: "调用方请求号，将原样返回，便于关联业务记录" } },
      },
      ExternalNavigationRouteRecognizeResult: {
        type: "object", required: ["recognitionId", "originalFilename", "extractionMethod", "routeResultStatus", "waypoints", "confidence", "selectedRouteEvidence"], properties: { recognitionId: { type: "string", format: "uuid", description: "服务端识别记录 ID" }, originalFilename: { type: "string" }, clientRequestId: { type: "string" }, extractionMethod: { type: "string", enum: ["AI"], description: "导航截图当前统一使用视觉模型识别" }, routeResultStatus: { type: "string", enum: ["success", "uncertain", "not_found"], description: "success=选中路线明确；uncertain=存在路线但结果需复核；not_found=未找到明确选中的路线" }, distanceKm: { type: "number", minimum: 0, description: "选中路线距离，统一换算为公里；无法确认时省略" }, tollYuan: { type: "number", minimum: 0, description: "选中路线通行费，单位人民币元；免费返回 0，无法确认时省略" }, destination: { type: "string", maxLength: 240, description: "截图中清晰可见的目的地；无法确认时省略" }, waypoints: { type: "array", maxItems: 20, items: { type: "string", maxLength: 240 }, description: "截图中清晰可见的途经地，按行程顺序返回；无途经地时为空数组" }, confidence: { type: "number", minimum: 0, maximum: 1, description: "模型对当前结果的置信度" }, selectedRouteEvidence: { type: "string", maxLength: 1000, description: "判断当前路线被选中的画面依据" } },
      },
      ExternalNavigationRouteBatchRecognizeRequest: { type: "object", additionalProperties: false, required: ["items"], properties: { items: { type: "array", minItems: 1, maxItems: 10, items: { $ref: "#/components/schemas/ExternalNavigationRouteRecognizeRequest" } } } },
      ExternalNavigationRouteBatchItemResult: { oneOf: [{ type: "object", required: ["index", "success", "data"], properties: { index: { type: "integer", minimum: 0 }, success: { type: "boolean", enum: [true] }, clientRequestId: { type: "string" }, data: { $ref: "#/components/schemas/ExternalNavigationRouteRecognizeResult" } } }, { type: "object", required: ["index", "success", "filename", "error"], properties: { index: { type: "integer", minimum: 0 }, success: { type: "boolean", enum: [false] }, filename: { type: "string" }, clientRequestId: { type: "string" }, error: { type: "string" } } }] },
      ExternalNavigationRouteBatchRecognizeResult: { type: "object", required: ["totalCount", "successCount", "failedCount", "items"], properties: { totalCount: { type: "integer", minimum: 0 }, successCount: { type: "integer", minimum: 0 }, failedCount: { type: "integer", minimum: 0 }, items: { type: "array", items: { $ref: "#/components/schemas/ExternalNavigationRouteBatchItemResult" } } } },
      ExternalNavigationRouteRecognizeResponse: { type: "object", required: ["success", "message", "data"], properties: { success: { type: "boolean", example: true }, message: { type: "string", example: "导航截图识别完成" }, data: { $ref: "#/components/schemas/ExternalNavigationRouteRecognizeResult" } } },
      ExternalNavigationRouteBatchRecognizeResponse: { type: "object", required: ["success", "message", "data"], properties: { success: { type: "boolean", example: true }, message: { type: "string", example: "批量导航截图识别完成" }, data: { $ref: "#/components/schemas/ExternalNavigationRouteBatchRecognizeResult" } } },
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
      ExternalImageCutoutRequest: {
        type: "object", additionalProperties: false, required: ["filename", "mimeType", "base64Data"],
        properties: {
          filename: { type: "string", minLength: 1, maxLength: 255, description: "包含扩展名的原图片文件名" },
          mimeType: { type: "string", enum: ["image/jpeg", "image/png", "image/webp"], description: "必须与图片魔数对应" },
          base64Data: { type: "string", minLength: 4, maxLength: 14000000, pattern: "^[A-Za-z0-9+/]+={0,2}$", description: "标准 Base64 图片内容，不含 Data URL 前缀；解码后最大 10MB" },
          backgroundMode: { type: "string", enum: ["transparent", "white", "color"], default: "transparent", description: "透明、纯白或自定义底色；JPG 输出时 transparent 按白底处理" },
          backgroundColor: { type: "string", pattern: "^#[0-9a-fA-F]{6}$", example: "#F4F0E9", description: "backgroundMode=color 时必填" },
          outputFormat: { type: "string", enum: ["png", "jpg"], default: "png" },
          edge: { type: "integer", minimum: 256, maximum: 4096, description: "输出方形画布边长；省略时保留原图宽高" },
          padding: { type: "number", minimum: 0, maximum: 0.2, default: 0.08, description: "主体相对画布每侧留白比例" },
          clientRequestId: { type: "string", minLength: 1, maxLength: 100, description: "调用方请求号，将原样返回" },
        },
      },
      ExternalImageCutoutResult: {
        type: "object", required: ["originalFilename", "outputFilename", "mimeType", "base64Data", "originalWidth", "originalHeight", "outputWidth", "outputHeight", "engine", "processingMs"],
        properties: {
          originalFilename: { type: "string" }, outputFilename: { type: "string" }, mimeType: { type: "string", enum: ["image/png", "image/jpeg"] },
          base64Data: { type: "string", description: "抠图成品的标准 Base64 内容，不含 Data URL 前缀" },
          originalWidth: { type: "integer", minimum: 1 }, originalHeight: { type: "integer", minimum: 1 }, outputWidth: { type: "integer", minimum: 1 }, outputHeight: { type: "integer", minimum: 1 },
          engine: { type: "string", enum: ["isnet"], description: "完整精度 ISNet 模型" }, processingMs: { type: "integer", minimum: 1, description: "包含排队、本地模型加载和推理导出的总耗时" }, clientRequestId: { type: "string" },
        },
      },
      ExternalImageCutoutBatchRequest: { type: "object", additionalProperties: false, required: ["items"], properties: { items: { type: "array", minItems: 1, maxItems: 5, items: { $ref: "#/components/schemas/ExternalImageCutoutRequest" } } } },
      ExternalImageCutoutBatchItemResult: { oneOf: [{ type: "object", required: ["index", "success", "data"], properties: { index: { type: "integer", minimum: 0 }, success: { type: "boolean", enum: [true] }, clientRequestId: { type: "string" }, data: { $ref: "#/components/schemas/ExternalImageCutoutResult" } } }, { type: "object", required: ["index", "success", "filename", "error"], properties: { index: { type: "integer", minimum: 0 }, success: { type: "boolean", enum: [false] }, filename: { type: "string" }, clientRequestId: { type: "string" }, error: { type: "string" } } }] },
      ExternalImageCutoutBatchResult: { type: "object", required: ["totalCount", "successCount", "failedCount", "items"], properties: { totalCount: { type: "integer", minimum: 0 }, successCount: { type: "integer", minimum: 0 }, failedCount: { type: "integer", minimum: 0 }, items: { type: "array", items: { $ref: "#/components/schemas/ExternalImageCutoutBatchItemResult" } } } },
      ExternalImageCutoutResponse: { type: "object", required: ["success", "message", "data"], properties: { success: { type: "boolean", example: true }, message: { type: "string", example: "图片抠图完成" }, data: { $ref: "#/components/schemas/ExternalImageCutoutResult" } } },
      ExternalImageCutoutBatchResponse: { type: "object", required: ["success", "message", "data"], properties: { success: { type: "boolean", example: true }, message: { type: "string", example: "批量图片抠图完成" }, data: { $ref: "#/components/schemas/ExternalImageCutoutBatchResult" } } },
      ExternalImageSearchRequest: {
        type: "object", additionalProperties: false, required: ["filename", "mimeType", "base64Data"],
        properties: {
          filename: { type: "string", minLength: 1, maxLength: 255, description: "包含扩展名的查询图片原文件名" },
          mimeType: { type: "string", enum: ["image/jpeg", "image/png", "image/webp"], description: "必须与实际图片格式一致" },
          base64Data: { type: "string", minLength: 4, maxLength: 14000000, pattern: "^[A-Za-z0-9+/]+={0,2}$", description: "标准 Base64 图片内容，不含 Data URL 前缀；解码后最大 8MB" },
          topK: { type: "integer", minimum: 1, maximum: 50, default: 12, description: "最多返回的相似图片数量" },
          clientRequestId: { type: "string", minLength: 1, maxLength: 100, description: "调用方请求号，将原样返回，便于关联业务记录" },
        },
      },
      ExternalImageSearchResultItem: {
        type: "object", required: ["id", "title", "tags", "score", "rank", "imagePath"],
        properties: {
          id: { type: "string", format: "uuid", description: "图库图片 ID" }, title: { type: "string" }, tags: { type: "array", items: { type: "string" } }, description: { type: "string" },
          score: { type: "number", minimum: -1, maximum: 1, description: "余弦相似度，越接近 1 越相似" }, rank: { type: "integer", minimum: 1, description: "从 1 开始的结果排名" },
          imagePath: { type: "string", description: "受 API Key 保护的相对原图路径" },
        },
      },
      ExternalImageSearchResult: {
        type: "object", required: ["searchId", "resultCount", "results"],
        properties: { searchId: { type: "string", format: "uuid", description: "服务端搜索记录 ID" }, clientRequestId: { type: "string" }, resultCount: { type: "integer", minimum: 0 }, results: { type: "array", items: { $ref: "#/components/schemas/ExternalImageSearchResultItem" } } },
      },
      ExternalImageSearchResponse: {
        type: "object", required: ["success", "message", "data"], properties: { success: { type: "boolean", example: true }, message: { type: "string", example: "以图搜图完成" }, data: { $ref: "#/components/schemas/ExternalImageSearchResult" } },
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
      ImagePayloadTooLarge: { description: "Base64 解码后的查询图片超过 8MB", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" }, example: { success: false, message: "单张图片不能超过 8MB。", data: null } } } },
      CutoutPayloadTooLarge: { description: "抠图输入超过 10MB，或图片尺寸超过默认的 8192×8192 / 3200 万像素（服务端可通过环境变量调整）", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" }, example: { success: false, message: "单张图片不能超过 10MB。", data: null } } } },
      Unprocessable: { description: "文件已接收但识别失败", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
      NotFound: { description: "指定资源不存在", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
      Unavailable: { description: "外部接口或模型服务尚未正确配置", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
    },
  },
} as const

export function registerOpenApi(app: Express): void {
  app.get("/api/openapi.json", (_request, response) => response.json(openApiDocument))
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(openApiDocument, { customSiteTitle: "ZForm 外部服务 API" }))
}
