# ZForm Framework

从 ZForm 业务能力中抽取的 Schema 驱动全栈框架。仓库采用 npm workspaces 组织共享协议、Express API 和 React 管理端，通过 PostgreSQL 保存单据、权限、菜单、偏好与审计数据。新增业务单据应优先扩展可序列化的 `DocumentSchema`，复用统一列表、编辑器、流程和应用外壳。

## 快速启动

环境要求：Node.js 20+、PostgreSQL 14+。本地推荐使用 Docker Compose 中的 PostgreSQL 16。

```bash
npm install
npm run db:up
cp apps/api/.env.example apps/api/.env
npm run db:deploy
npm run db:seed
npm run dev
```

- 管理端：http://localhost:5174
- API：http://localhost:3100
- 健康检查：http://localhost:3100/health

Compose 将 PostgreSQL 映射到本机 `5433` 端口，数据保存在具名卷 `zform_postgres_data`。如使用已有 PostgreSQL，只需修改 `apps/api/.env` 中的 `DATABASE_URL`，无需启动 Compose。

## 目录结构

```text
.
├── apps/
│   ├── api/                 # Express + TypeScript 后端
│   │   ├── prisma/          # PostgreSQL 模型、迁移与种子数据
│   │   └── src/
│   │       ├── controllers/ # HTTP 输入输出编排
│   │       ├── routes/      # Express 路由声明
│   │       ├── middleware/  # 错误、异步和权限中间件
│   │       ├── services/    # 事务化领域服务
│   │       ├── documents/   # 单据 Schema、工作流和校验
│   │       ├── utils/       # HTTP 与请求上下文工具
│   │       └── database.ts  # Prisma 数据库连接
│   └── web/                 # React + Vite 管理端
│       └── src/
│           ├── apis/        # 有类型的 API 客户端
│           ├── components/  # 外壳、页面组件和共通 UI
│           ├── core/        # 前端插件注册表
│           ├── hooks/       # React 状态与副作用复用
│           ├── registrations/ # 框架及业务插件注册
│           ├── types/       # 前端专用类型
│           ├── App.tsx      # 前端初始化入口
│           ├── main.tsx     # React 挂载入口
│           └── index.css    # 全局主题和样式
├── packages/
│   └── shared/              # 可序列化协议、状态常量和纯运行时函数
├── docker-compose.yml       # 本地 PostgreSQL 16
├── AGENTS.md                # 框架开发约束和验收要求
└── package.json             # workspace 统一命令
```

`packages/shared/src/index.ts` 是前后端共享协议的唯一来源；API 和 Web 不应各自复制同类业务类型。API 按 Route → Controller → Service → Prisma 分层，Web 通过 `apps/web/src/apis/framework-api.ts` 统一访问后端。

## 已实现能力

- Schema 驱动：主表字段、明细表、下拉选项和必填规则均由后端元数据描述
- 可序列化规则：条件显隐、动态必填、动态只读、公式计算和字段联动不依赖 Schema 中的函数
- 高级字段：计算值、可搜索下拉、尺寸、价格、配比，以及 `custom:*` 自定义字段插件
- 插件注册表：支持字段渲染器、字段联动处理器、明细行选择器、列表工具栏动作和扩展 Tab
- 前端共通组件：按钮、卡片、表单、反馈、对话框、页头、标签、语义表格和分页均由 `components/ui` 统一提供
- 通用单据 API：Schema、列表、搜索、创建、详情、修改、删除、流程、下推、影响评估和追溯
- Schema 通用列表：逻辑列映射到系统字段、JSONB 主表字段或明细行字段，无需为每类单据编写列表页
- 服务端列表：PostgreSQL 适配器执行分页、递归 AND/OR 多条件过滤、多字段排序、全文搜索和聚合统计，保留可替换适配器与兼容回退边界
- 双列表模式：同一份 Schema 可在“一张单据一行”和“一条明细一行”之间切换
- 声明式列表操作：行操作、工具栏按钮、适用状态、适用模式和选中行约束由 Schema 配置
- 数据权限：PostgreSQL 权限策略支持全部、部门和本人范围，并可附加授权部门或用户；无策略时默认仅本人可见
- 应用外壳：多标签工作区、标签右键菜单、脏数据标记和未保存变更拦截
- 数据库菜单：菜单组、图标、跳转目标、排序、启停和权限码在 PostgreSQL 中维护，外壳按当前用户权限生成侧边栏
- 组织与 RBAC：提供 ZTrade 风格的用户、树形部门、分类角色权限和可拖动菜单管理页面及完整 CRUD API
- RBAC 权限：当前用户权限由数据库角色合并产生，系统管理写接口在服务端再次校验；`*` 仅用于系统管理员
- 可配置工作台：核心指标、最近单据、业务分布、业务链路和最近动态可按用户开关
- 通知与偏好：通知已读状态、紧凑模式、侧边栏、状态栏和工作台组件配置持久化到 PostgreSQL
- 全局状态栏：展示 API/数据库状态、标签数、用户部门和框架版本
- 状态机：提交、审批、驳回、完成和取消由统一工作流执行；当前内置流转覆盖草稿、待审批、已审批、已驳回、已完成和已取消，数据模型同时预留执行中状态
- 审批边界：只有草稿和驳回单可编辑，提交时统一校验必填项和明细行
- 乐观锁：通过 `version` 防止多人编辑时覆盖较新的数据
- 单据下推：报价单 → 销售合同 → 采购计划，保留 `sourceRef` 来源关系
- 映射下推：支持主字段映射、明细表映射、行过滤、公式转换和明细行级来源
- 重复下推保护：同一来源、同一目标类型只能生成一次
- 变更影响评估：监控字段变更，识别下游单据并支持 warning/critical 级别和阻断保存
- 审计记录：创建、修改、审批和下推均记录操作人、时间与说明
- 可操作管理端：工作台、跨模块数据概览、列表筛选、动态编辑器、审批、追溯、操作记录
- 预置示例：客户报价单、销售合同、采购计划、入库单
- PostgreSQL 持久化：主数据和明细使用 JSONB，状态、来源、版本和审计信息使用强类型列
- 事务安全：单号生成、状态流转、审计记录和下推操作在数据库事务中提交
- 报关名称标准化：按 `name + nameEng` 归一化去重，支持多模型故障切换、结构化输出、强制复核规则、人工审核、来源明细回写和独立审计日志
- 客户背景调查：通过 Schema 单据承载客户资料、四项判定、可信度和公开来源，支持 Excel 批量去重导入、表格勾选后由后台单队列顺序调查并逐条持久化、权限内队列领取、按 `LLM_PROVIDER_ORDER` 选择供应商与模型立即调查、模型返回实时展示、多次调查历史留档及作为后续调查上下文、失败重试、工作台进度和报告 Tab；复用 OpenAI、火山方舟、Kimi、MiniMax 的现有模型配置
- 电子发票识别（移植自 `zinvoice`）：在 ZAI 外壳中提供 PDF/图片发票批量拖拽上传；原生 PDF 优先提取全部页面文本层并读取首页发票二维码，仅在没有有效文本层时回退到 PDF 视觉识别。AI 会区分普通发票、增值税专用发票和通行费电子发票；标准发票校验购销方与商品明细，通行费发票按车牌、通行费和通行日期判定并校验，不再强制要求购销方，同时单独提取车辆类型、销售方、税额及价税合计。支持个人历史、原件详情、删除与明细级 Excel 导出，文件与结果保存在 PostgreSQL，并按当前用户隔离
- 支付截图自动识别：保留原有电商及支付凭证批量识别能力，与电子发票识别使用独立菜单和分类历史，提取平台、订单、金额、时间、支付方式及收款方
- 以图搜图（移植自 `zimage`）：共享图库支持 JPG、PNG、WebP 上传、单张或批量生成 64 维结构化视觉索引，并以余弦相似度返回 Top-K 结果；查询图片和结果快照保存在 PostgreSQL，搜索历史按当前用户隔离
- 智能抠图（移植自 `zcutout`）：在 ZAI 工作区内批量移除 JPG、PNG、WebP 背景，支持透明、纯白或自定义底色、预设方形画布、主体留白、PNG/JPG 输出、单张下载和 ZIP 打包；推理与画布处理均在浏览器本地完成，首次使用会从 IMG.LY 下载并缓存 ONNX/WASM 模型资源

## 常用命令

```bash
npm run dev         # 同时启动前端和后端
npm run build       # 依次构建共享包、API 和管理端
npm run typecheck   # 严格 TypeScript 检查
npm test            # 运行 shared 与 API workspace 的 Vitest 测试
npm run start       # 启动已构建应用（API 同时托管管理端）
npm run db:up       # 启动 Compose PostgreSQL
npm run db:down     # 停止 Compose 服务（不删除数据卷）
npm run db:migrate  # 开发环境创建并执行迁移
npm run db:deploy   # 部署已有迁移
npm run db:seed     # 写入幂等演示数据
npm run db:studio   # 打开 Prisma Studio
npm run declaration:import -- path/to/template.csv  # 幂等导入历史映射模板
npm run declaration:batch -- input.csv output.jsonl # 构建模型 Batch JSONL
```

## API 概览

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/api/schemas` | 获取所有单据 Schema |
| GET | `/api/shell/bootstrap` | 获取外壳配置、当前用户、偏好和通知 |
| PUT | `/api/shell/settings` | 保存用户界面与工作台偏好 |
| POST | `/api/shell/notifications/:id/read` | 将通知标为已读 |
| POST | `/api/shell/notifications/read-all` | 将全部通知标为已读 |
| GET | `/api/system-management` | 获取菜单、部门、用户和角色管理数据 |
| POST/PUT/DELETE | `/api/system-management/menus[/:id]` | 新建、修改、删除菜单 |
| POST/PUT/DELETE | `/api/system-management/users[/:id]` | 新建、修改、删除用户及角色分配 |
| POST/PUT/DELETE | `/api/system-management/roles[/:id]` | 新建、修改、删除角色及权限码 |
| POST/PUT/DELETE | `/api/system-management/departments[/:id]` | 新建、修改、删除树形部门 |
| GET | `/api/dashboard` | 获取工作台聚合数据 |
| GET | `/api/activities?documentId=...` | 获取最近操作记录或指定单据的操作记录 |
| GET | `/api/documents` | 按类型、状态、关键词查询 |
| POST | `/api/documents/query` | 通用列表分页、过滤、排序、聚合和数据权限查询 |
| GET | `/api/customer-research/summary` | 查询当前权限范围内的客户调查队列摘要 |
| GET | `/api/customer-research/models` | 查询允许用于客户调查的模型白名单 |
| POST | `/api/customer-research/import` | 批量导入并去重客户调查单 |
| POST | `/api/customer-research/process-next` | 原子领取并调查下一位客户 |
| POST | `/api/customer-research/:id/process` | 使用请求体中的可选 `provider` 立即调查指定客户 |
| POST | `/api/customer-research/:id/process-stream` | 以 NDJSON 事件流实时调查指定客户 |
| POST | `/api/customer-research/:id/retry` | 将失败调查重新加入队列 |
| GET | `/api/customer-research/:id/report.pdf` | 导出权限范围内已完成的客户背景调查 PDF 报告 |
| POST | `/api/ocr/recognitions` | 上传火车票 PDF、电子发票或截图并执行对应类型识别 |
| GET | `/api/ocr/model` | 返回发票识别当前实际使用的供应商与模型 |
| GET | `/api/ocr/recognitions` | 分页查询当前用户的识别历史 |
| GET | `/api/ocr/recognitions/:id` | 获取当前用户的识别详情 |
| GET | `/api/ocr/recognitions/:id/image` | 获取识别记录的原始图片 |
| DELETE | `/api/ocr/recognitions/:id` | 删除当前用户的识别记录 |
| POST | `/api/ocr/recognitions/export` | 按记录或日期导出 Excel |
| GET/POST | `/api/image-search/assets` | 分页查询或上传公共图库图片 |
| GET/DELETE | `/api/image-search/assets/:id[/image]` | 读取原图或删除图库图片 |
| POST | `/api/image-search/assets/:id/index` | 为单张图库图片生成视觉索引 |
| POST | `/api/image-search/assets/index-pending` | 批量处理待索引图片，单次最多 50 张 |
| POST | `/api/image-search/search` | 上传查询图片并返回 Top-K 相似图片 |
| GET | `/api/image-search/history` | 分页查询当前用户的搜索历史 |
| GET | `/api/image-search/history/:id/query-image` | 获取当前用户历史中的查询图片 |
| DELETE | `/api/image-search/history/:id` | 删除当前用户的搜索历史 |
| POST | `/api/documents` | 创建单据 |
| GET/PUT/DELETE | `/api/documents/:id` | 详情、修改、删除 |
| GET | `/api/documents/:id/trace` | 查询上下游追溯关系 |
| POST | `/api/documents/:id/impact` | 保存前评估下游影响 |
| POST | `/api/documents/:id/actions/:action` | 提交、审批、驳回、完成、取消 |
| POST | `/api/documents/:id/push-down` | 生成下游单据 |
| POST | `/api/declaration-names/resolve` | 查询或创建报关名称映射 |
| POST | `/api/declaration-names/generate` | 创建批量模型生成任务 |
| GET | `/api/declaration-names/jobs/:id` | 查询生成任务进度 |
| GET | `/api/declaration-names/reviews` | 分页查询待人工复核映射 |
| POST | `/api/declaration-names/mappings/:id/approve` | 审核并可修正中英文报关名 |
| POST | `/api/declaration-names/mappings/:id/reject` | 驳回映射并记录原因 |
| POST | `/api/declaration-names/writeback` | 将已审核映射显式回写到已登记来源项 |
| POST | `/api/external/declaration-names/convert` | 使用 API Key 同步转换中英文商品名 |
| POST | `/api/external/declaration-names/convert/batch` | 使用 API Key 批量转换中英文商品名，逐项返回结果 |
| POST | `/api/external/payments/recognize` | 使用 API Key 同步识别单张支付截图 |
| POST | `/api/external/payments/recognize/batch` | 使用 API Key 批量识别最多 10 张支付截图，逐项返回结果 |
| POST | `/api/external/navigation-routes/recognize` | 使用 API Key 同步识别单张导航路线截图 |
| POST | `/api/external/navigation-routes/recognize/batch` | 使用 API Key 批量识别导航路线截图，逐项返回结果 |
| POST | `/api/external/image-search/search` | 使用 API Key 上传查询图片并返回 Top-K 相似图片 |
| GET | `/api/external/image-search/assets/:id/image` | 使用 API Key 获取搜索结果原图 |
| POST | `/api/external/image-cutout/remove-background` | 使用 API Key 对单张图片执行本地模型抠图并返回 Base64 成品 |
| POST | `/api/external/image-cutout/remove-background/batch` | 使用 API Key 批量抠图最多 5 张，逐项返回结果 |
| POST | `/api/external/invoices/recognize` | 使用 API Key 同步识别单张 PDF/图片电子发票 |
| POST | `/api/external/invoices/recognize/batch` | 使用 API Key 批量识别最多 10 张电子发票，逐项返回结果 |
| POST | `/api/external/train-tickets/recognize` | 使用 API Key 同步识别单张铁路电子客票 PDF |
| POST | `/api/external/train-tickets/recognize/batch` | 使用 API Key 批量识别最多 10 张铁路电子客票，逐项返回结果 |
| GET | `/api-docs` | Swagger 外部接口调试页 |
| GET | `/api/openapi.json` | OpenAPI 3.0 接口定义 |

所有响应使用统一结构：

```json
{
  "success": true,
  "message": "操作成功",
  "data": {}
}
```

外部报关品名、支付截图、电子发票、导航截图、以图搜图和智能抠图接口使用 `X-API-Key`（也支持 `Authorization: Bearer <key>`）鉴权。开发环境在 `apps/api/.env` 配置 `EXTERNAL_API_KEYS` 后，可打开 `http://localhost:3100/api-docs`，点击 **Authorize** 输入密钥并直接调试。多个调用方密钥以英文逗号分隔。报关品名接口优先复用已审核映射，未命中时同步调用模型；`qualified=false` 或 `reviewRequired=true` 的结果必须进入人工复核，不能直接用于正式申报。导航截图接口仅接受 JPEG、PNG、WebP 的标准 Base64 内容，单张解码后最大 10MB；调用方应根据 `routeResultStatus` 与 `confidence` 判断是否需要人工复核。

外部支付截图接口仅接受 JPEG、PNG、WebP 的标准 Base64 内容，单张解码后最大 10MB。结果包含平台、订单号、商品名称、金额、支付时间、支付状态、支付方式和收款方；批量接口单次最多 10 张、并发 2 张，单项失败不会中断其余项目，识别记录按 API Key 哈希后的调用方身份隔离保存。

外部以图搜图接口仅接受 JPEG、PNG、WebP，查询图片解码后最大 8MB，`topK` 范围为 1–50。查询原图和结果快照按 API Key 哈希身份隔离保存；结果中的 `imagePath` 为相对地址，读取原图时需要继续携带有效 API Key。

外部智能抠图接口仅接受 JPEG、PNG、WebP，单张解码后最大 10MB，默认尺寸不超过 8192×8192 且总像素不超过 3200 万；可通过 `IMAGE_CUTOUT_MAX_DIMENSION` 和 `IMAGE_CUTOUT_MAX_PIXELS` 调整。接口支持透明、白色或 `#RRGGBB` 自定义底色，PNG/JPG 输出、0–20% 留白及可选 256–4096 方形画布；省略 `edge` 时保留原图宽高。服务端使用完整精度 `isnet` 本地推理，图片不写入数据库；模型约 168MiB，默认缓存到 `apps/api/.models/isnet.onnx`，后续进程直接复用，批量接口最多 5 张并串行推理。

外部电子发票接口复用同一套 `EXTERNAL_API_KEYS` 鉴权与统一响应结构。文件通过不带 Data URL 前缀的 Base64 传入，单文件最大 10MB；识别记录按 API Key 哈希后的外部调用方身份隔离保存。批量接口单次最多 10 张、并发 2 张，单项失败不会中断其余项目。

批量转换接口请求体为 `{ "items": [...] }`，单次最多 100 条，返回顺序与输入顺序一致。每个结果通过 `success` 区分成功数据与失败原因；单项失败不会中断其他项。

## 添加新的单据类型

1. 在 `apps/api/src/documents/schemas.ts` 增加一个 `DocumentSchema`。
2. 配置 `masterFields`、`detailTables`、`list` 和声明式 `formActions`。
3. 如需下推，配置 `pushDownRules` 的主字段与明细字段映射。
4. 如需变更控制，配置 `impactRules`；如需扩展 UI，注册插件后配置其 `pluginId`。
5. 通过 `apps/api/prisma/seed.ts`、菜单管理页或系统管理 API 增加 `document-list` 菜单，并设置稳定的 `targetId` 与权限码。
6. 重启开发服务。通用列表和表单无需增加专用页面路由；数据库菜单不会仅因新增 Schema 自动创建。

通用列表的列使用逻辑来源，不直接暴露 Prisma 字段：

```ts
list: {
  modes: ["document", "detail"],
  detailTableId: "items",
  columns: [
    { id: "code", label: "单据编号", source: "system", path: "code", sortable: true, filterable: true },
    { id: "customer", label: "客户", source: "master", path: "customerName", sortable: true, filterable: true },
    { id: "quantity", label: "数量", source: "detail", path: "quantity", dataType: "number", sortable: true, filterable: true },
  ],
  defaultSorting: [{ columnId: "updatedAt", direction: "desc" }],
  aggregates: [{ id: "quantity-sum", label: "数量合计", columnId: "quantity", function: "sum" }],
  rowActions: [{ id: "open", label: "打开", command: "open" }],
  toolbarActions: [{ id: "export", label: "导出", command: "export" }],
}
```

`POST /api/documents/query` 接收 `filters`（可嵌套 AND/OR）、`sorting` 数组、`mode`、分页和聚合项。前端演示客户端携带 `x-user-id`、`x-user-name` 与 `x-user-department-id`，服务端根据 `data_permission_policies` 生成 PostgreSQL 基础查询范围，再执行 Schema 逻辑列查询。生产环境必须由可信认证中间件写入用户上下文，不能信任浏览器自行提供的请求头。

## 插件扩展

前端插件注册表位于 `apps/web/src/core/plugin-registry.tsx`，注册动作放在 `apps/web/src/registrations/`：

```ts
pluginRegistry.registerField("custom:my-field", MyField)
pluginRegistry.registerEffect("load-related-data", loadRelatedData)
pluginRegistry.registerRowSelector("my-selector", MySelector)
pluginRegistry.registerExtraTab("my-tab", MyTab)
```

Schema 只保存 `custom:my-field`、`handlerId` 或 `pluginId`，因此可以安全地通过 API 序列化和缓存。

## 前端共通组件

基础组件位于 `apps/web/src/components/ui/`，统一从 `components/ui/index.ts` 导出。应用外壳、工作台、单据列表、编辑器、通知中心和用户设置已经接入。侧边栏的“使用帮助”页面提供全部组件的可视示例。

基础组件只解决视觉、可访问性和通用交互；Schema 字段继续由 `FieldRenderer` 渲染，复杂单据列表继续使用 `DocumentList`，多标签工作区继续使用 `WorkspaceTabs`。详细使用约定见 `apps/web/src/components/ui/README.md`。

## PostgreSQL 数据模型

- `documents`：单据类型、编号、状态、JSONB 主数据/明细、来源关系、乐观锁版本
- `system_menus`：应用外壳菜单、分组、目标、图标、排序、启停状态和所需权限码
- `departments`：部门编码、名称、上级部门和树形排序
- `app_users`：框架用户、邮箱、部门与启停状态
- `roles`：稳定角色编码、名称、说明和权限码数组
- `user_roles`：用户与角色的多对多分配关系
- `data_permission_policies`：用户在单据类型上的数据范围及附加部门/用户授权，`*` 表示所有单据类型
- `user_preferences`：用户界面、侧边栏、状态栏和工作台组件偏好
- `user_notifications`：通知内容、级别、跳转目标和已读时间
- `activity_records`：创建、修改、审批、驳回、完成和下推日志
- `document_sequences`：按单据类型和年月原子生成流水号
- `declaration_name_mappings`：去重键、标准中英文名、置信度、审核状态和模型版本
- `declaration_name_generation_jobs` / `declaration_name_generation_job_items`：批量模型任务及逐项结果
- `declaration_name_source_items`：由 ERP 调用 `resolve` 时登记的来源明细和显式回写结果
- `declaration_name_audit_logs`：模型生成、人工审核、驳回和回写审计
- `ocr_recognitions`：用户、原始文件、识别类型与状态、火车票行程/乘客字段、通行费车辆与日期字段、结构化支付与发票字段、模型原始结果和失败信息
- `image_search_assets`：公共图库原图、标签、视觉描述、64 维 JSONB 特征向量、模型和索引时间
- `image_search_history`：按用户隔离的查询原图、Top-K 参数和搜索结果快照

`documents(source_document_id, type_id)` 有唯一约束，从数据库层阻止并发重复下推；状态变更通过 `version` 条件更新，冲突时 API 返回 HTTP 409。

通用列表默认由 PostgreSQL 适配器执行 JSONB 主表字段和明细行的过滤、排序、聚合与分页。`documents.search_text` 使用 `pg_trgm` GIN 索引，`master_data` 和 `detail_tables` 使用 `jsonb_path_ops` GIN 索引；扩展其他执行引擎时实现 `DocumentListQueryAdapter`，无需修改共享查询协议。

## 菜单、部门、用户与角色

侧边栏不再依赖前端硬编码。`GET /api/shell/bootstrap` 会读取已启用的 `system_menus`，再按照当前数据库用户各角色权限的并集过滤菜单。禁用用户不会获得数据库角色权限。

系统管理使用四组稳定权限码：

- `system:menu:manage`：菜单维护；
- `system:department:manage`：树形部门维护；
- `system:user:manage`：用户与角色分配；
- `system:role:manage`：角色与权限码维护。

报关名称能力使用 `declaration-name:view`、`declaration-name:generate`、`declaration-name:review` 和 `declaration-name:writeback` 四个权限码；种子数据提供最小权限的 `DECLARATION_REVIEWER` 角色。

火车票、导航截图、支付截图和电子发票识别共用 `ocr:view`、`ocr:recognize`、`ocr:delete` 和 `ocr:export` 四个权限码；种子数据提供最小权限的 `OCR_OPERATOR` 角色。四类记录按识别类型分别查询，并且原件、删除和导出都会再次按当前用户 ID 与识别类型限定。火车票识别支持带文本层的铁路电子客票 PDF，可提取行程、车次座位、乘客、票价及购买方字段；导航截图识别会提取当前选中路线的目的地、途经地、距离、通行费、置信度及选中依据。

以图搜图使用 `image-search:view`、`image-search:search`、`image-search:manage` 和 `image-search:index` 四个权限码。种子数据提供只能搜索和查看个人历史的 `IMAGE_SEARCH_OPERATOR`；公共图库上传/删除与模型索引需要额外管理权限。

智能抠图使用 `image-cutout:use` 权限码。种子数据提供最小权限的 `IMAGE_CUTOUT_OPERATOR` 角色；图片不会发送到 ZAI API，也不会写入 PostgreSQL，关闭工作区页面后浏览器会释放本批次的预览与成品 URL。

前端隐藏入口只用于交互，真正的写权限由 API 校验。内置 `SYSTEM_ADMIN` 角色和 `framework-user` 演示用户受删除保护。生产接入认证时，应由可信中间件确定 `x-user-id`，不要接受浏览器任意冒充用户。

## 环境变量

后端可参考 `apps/api/.env.example`：

- `PORT`：API 端口，默认 `3100`
- `CORS_ORIGIN`：允许的管理端来源，默认 `http://localhost:5174`
- `DATABASE_URL`：PostgreSQL 连接串
- `LLM_PROVIDER_ORDER`：模型调用顺序，默认 `openai`，可配置 `openai,ark,kimi,minimax`
- `CUSTOMER_RESEARCH_TIMEOUT_MS`：单次客户背景调查超时，默认 `300000`（5 分钟），独立于普通模型调用超时
- `TAVILY_API_KEY`：客户背景调查的实时联网搜索密钥；所有模型统一使用 Tavily 返回的证据
- `TAVILY_SEARCH_DEPTH` / `TAVILY_MAX_RESULTS` / `TAVILY_TIMEOUT_MS`：搜索深度、单个关键词结果数和单次搜索超时，默认 `basic`、`5`、`30000`
- `OPENAI_API_KEY` / `OPENAI_MODEL`：OpenAI Responses API 配置
- `ARK_API_KEY` / `ARK_MODEL` / `ARK_BASE_URL`：火山方舟 OpenAI-compatible 配置
- `OCR_PROVIDER` / `OCR_MODEL`：电子发票识别模块指定供应商和模型，必须同时配置或同时留空；两者留空时完全回退到 `LLM_PROVIDER_ORDER` 和对应供应商的系统模型配置
- `OCR_TIMEOUT_MS`：电子发票识别单次模型请求超时，默认 180000 毫秒；未配置时才回退到 `LLM_TIMEOUT_MS`
- `TRAIN_TICKET_OCR_PROVIDER` / `TRAIN_TICKET_OCR_MODEL`：火车票识别专用供应商和模型，必须同时配置或同时留空；两者留空时回退到 `LLM_PROVIDER_ORDER` 中首个已配置 API Key 的供应商及其公共模型
- `PAYMENT_OCR_PROVIDER` / `PAYMENT_OCR_MODEL`：支付截图识别模块指定供应商和模型，必须同时配置或同时留空；两者留空时回退到 `LLM_PROVIDER_ORDER` 中首个已配置且支持图片输入的供应商及其系统模型
- `ROUTE_OCR_PROVIDER` / `ROUTE_OCR_MODEL`：导航截图识别模块指定供应商和视觉模型，必须同时配置或同时留空；两者留空时从 `LLM_PROVIDER_ORDER` 中选择首个已配置 API Key、公共模型且支持图片输入的供应商
- `IMAGE_SEARCH_MODEL`：图片视觉索引与查询特征提取模型；留空时使用 `OPENAI_MODEL`，模型必须支持图片输入和严格 JSON Schema 输出
- `KIMI_API_KEY` / `KIMI_MODEL` / `KIMI_BASE_URL`：Kimi OpenAI-compatible 配置
- `MINIMAX_API_KEY` / `MINIMAX_MODEL` / `MINIMAX_BASE_URL`：MiniMax Anthropic-compatible 配置
- `AUTO_APPROVE_CONFIDENCE`：自动通过置信度，默认 `0.9`
- `MAX_BATCH_RESOLVE`：单次查询或生成上限，默认 `100`
- `EXTERNAL_API_KEYS`：外部转换接口密钥，多个密钥以英文逗号分隔；未配置时接口返回 503
- `IMAGE_CUTOUT_MODEL_BASE_URL`：可选的抠图模型资源根地址；默认使用 IMG.LY 1.7.0 模型资源，可改为企业内网镜像，目录需包含 `resources.json` 和对应分片
- `IMAGE_CUTOUT_MODEL_PATH`：完整 ISNet ONNX 本地路径；默认 `apps/api/.models/isnet.onnx`，文件缺失时自动下载、校验并原子落盘
- `IMAGE_CUTOUT_THREADS`：抠图 WASM 推理线程数，范围 1–4，默认 1

前端可通过 `VITE_API_BASE` 指向独立部署的 API；开发模式默认使用 Vite 代理。

客户背景调查会先通过 Tavily 执行公司注册、规模和园林户外业务三组实时搜索，在调查窗口持续显示关键词及命中链接，再把证据交给 `LLM_PROVIDER_ORDER` 中本次选择的模型。流式接口每 15 秒发送状态心跳，模型来源字段只保留 Tavily 本次实际返回的 URL；每次成功或失败的调查仍独立保存到“调查历史”。

调查窗口、网络或 API 进程意外中断后，可在“调查中”记录上点击“中断并重新加入”，将客户安全恢复为“等待调查”。每次调查使用单据版本作为运行租约；旧请求即使稍后返回，也不能覆盖重新启动后的调查结果。

生产环境执行 `npm run build && npm run start` 后，可直接通过 `http://localhost:3100` 访问完整应用。

生产部署应先执行 `npm run db:deploy`，并将示例密码替换成密钥管理系统提供的数据库凭据。不要在生产环境执行 `db:migrate`。

## 当前边界

- 通用列表查询协议已通过可替换的 `DocumentListQueryAdapter` 与执行层解耦；默认 PostgreSQL 适配器下推 JSONB 主表/明细过滤、排序、聚合和分页，并配套 trigram 与 JSONB GIN 索引。新增自定义系统列或数据库方言时，应实现新适配器或保留兼容回退。
- 数据权限已覆盖列表、详情、修改、删除、流程、下推、影响评估、追溯、工作台和活动记录；对象入口统一复用 `permissionWhere()` 生成的范围条件，未授权对象按不存在返回。生产接入可信认证后仍需结合稳定权限码补齐操作级授权。
- 通用单据创建、更新、影响评估、流程和下推请求均使用 Zod 校验；主数据与明细数据根据 `DocumentSchema` 动态限制字段、类型、长度和数量，明细来源引用由服务端保留，不能由客户端新增或篡改。
- `x-user-*` 请求头和 `x-user-permissions` 是演示身份回退机制，不是生产认证方案；`*` 权限仅用于内置系统管理员。
- 根 `npm test` 当前运行 shared 与 API workspace 测试。复杂事务权限和 React 状态仍需继续补充自动化覆盖，并按改动范围执行真实 PostgreSQL 与浏览器验收。
