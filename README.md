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
- 插件注册表：支持字段渲染器、字段联动处理器、明细行选择器和扩展 Tab
- 前端共通组件：按钮、卡片、表单、反馈、对话框、页头、标签、语义表格和分页均由 `components/ui` 统一提供
- 通用单据 API：Schema、列表、搜索、创建、详情、修改、删除、流程、下推、影响评估和追溯
- Schema 通用列表：逻辑列映射到系统字段、JSONB 主表字段或明细行字段，无需为每类单据编写列表页
- 服务端列表：分页、递归 AND/OR 多条件过滤、多字段排序、全文搜索和聚合统计
- 双列表模式：同一份 Schema 可在“一张单据一行”和“一条明细一行”之间切换
- 声明式列表操作：行操作、工具栏按钮、适用状态、适用模式和选中行约束由 Schema 配置
- 数据权限：PostgreSQL 权限策略支持全部、部门和本人范围，并可附加授权部门或用户；无策略时默认仅本人可见
- 应用外壳：多标签工作区、标签右键菜单、脏数据标记和未保存变更拦截
- 数据库菜单：菜单组、图标、跳转目标、排序、启停和权限码在 PostgreSQL 中维护，外壳按当前用户权限生成侧边栏
- 用户与角色：提供用户状态、部门、角色分配、角色权限码和菜单管理页面及完整 CRUD API
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
| GET | `/api/system-management` | 获取菜单、用户和角色管理数据 |
| POST/PUT/DELETE | `/api/system-management/menus[/:id]` | 新建、修改、删除菜单 |
| POST/PUT/DELETE | `/api/system-management/users[/:id]` | 新建、修改、删除用户及角色分配 |
| POST/PUT/DELETE | `/api/system-management/roles[/:id]` | 新建、修改、删除角色及权限码 |
| GET | `/api/dashboard` | 获取工作台聚合数据 |
| GET | `/api/activities?documentId=...` | 获取最近操作记录或指定单据的操作记录 |
| GET | `/api/documents` | 按类型、状态、关键词查询 |
| POST | `/api/documents/query` | 通用列表分页、过滤、排序、聚合和数据权限查询 |
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

所有响应使用统一结构：

```json
{
  "success": true,
  "message": "操作成功",
  "data": {}
}
```

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

`documents(source_document_id, type_id)` 有唯一约束，从数据库层阻止并发重复下推；状态变更通过 `version` 条件更新，冲突时 API 返回 HTTP 409。

## 菜单、用户与角色

侧边栏不再依赖前端硬编码。`GET /api/shell/bootstrap` 会读取已启用的 `system_menus`，再按照当前数据库用户各角色权限的并集过滤菜单。禁用用户不会获得数据库角色权限。

系统管理使用三组稳定权限码：

- `system:menu:manage`：菜单维护；
- `system:user:manage`：用户与角色分配；
- `system:role:manage`：角色与权限码维护。

报关名称能力使用 `declaration-name:view`、`declaration-name:generate`、`declaration-name:review` 和 `declaration-name:writeback` 四个权限码；种子数据提供最小权限的 `DECLARATION_REVIEWER` 角色。

前端隐藏入口只用于交互，真正的写权限由 API 校验。内置 `SYSTEM_ADMIN` 角色和 `framework-user` 演示用户受删除保护。生产接入认证时，应由可信中间件确定 `x-user-id`，不要接受浏览器任意冒充用户。

## 环境变量

后端可参考 `apps/api/.env.example`：

- `PORT`：API 端口，默认 `3100`
- `CORS_ORIGIN`：允许的管理端来源，默认 `http://localhost:5174`
- `DATABASE_URL`：PostgreSQL 连接串
- `LLM_PROVIDER_ORDER`：模型调用顺序，默认 `openai`，可配置 `openai,kimi,minimax`
- `OPENAI_API_KEY` / `OPENAI_MODEL`：OpenAI Responses API 配置
- `KIMI_API_KEY` / `KIMI_MODEL` / `KIMI_BASE_URL`：Kimi OpenAI-compatible 配置
- `MINIMAX_API_KEY` / `MINIMAX_MODEL` / `MINIMAX_BASE_URL`：MiniMax Anthropic-compatible 配置
- `AUTO_APPROVE_CONFIDENCE`：自动通过置信度，默认 `0.9`
- `MAX_BATCH_RESOLVE`：单次查询或生成上限，默认 `100`

前端可通过 `VITE_API_BASE` 指向独立部署的 API；开发模式默认使用 Vite 代理。

生产环境执行 `npm run build && npm run start` 后，可直接通过 `http://localhost:3100` 访问完整应用。

生产部署应先执行 `npm run db:deploy`，并将示例密码替换成密钥管理系统提供的数据库凭据。不要在生产环境执行 `db:migrate`。

## 当前边界

- 通用列表先在 PostgreSQL 完成单据类型、全文搜索和数据范围过滤，再在服务端完成 JSONB 逻辑列过滤、排序、聚合与分页。大数据量场景需要增加 SQL/索引适配层。
- 数据权限已覆盖列表、详情、修改、删除、流程、下推、影响评估、追溯、工作台和活动记录；对象入口统一复用 `permissionWhere()` 生成的范围条件，未授权对象按不存在返回。生产接入可信认证后仍需结合稳定权限码补齐操作级授权。
- `x-user-*` 请求头和 `x-user-permissions` 是演示身份回退机制，不是生产认证方案；`*` 权限仅用于内置系统管理员。
- 根 `npm test` 当前运行 shared 与 API workspace 测试。复杂事务权限和 React 状态仍需继续补充自动化覆盖，并按改动范围执行真实 PostgreSQL 与浏览器验收。
