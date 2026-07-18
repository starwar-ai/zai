# ZForm Framework Agent Development Guide

本文件适用于 `framework/` 目录及其全部子目录。后续 Agent 在修改本框架时，必须优先复用已有的 Schema、统一单据 API、数据权限和应用外壳能力，不要为单个业务需求另建一套平行实现。

## 1. 项目定位与边界

`framework/` 是从现有 ZForm 抽取出的通用全栈框架，不是旧业务系统的迁移副本。

- 可以扩展框架核心、通用组件、Schema 协议、插件、API 和 PostgreSQL 模型。
- 不要把仓库根目录旧 ZForm 的具体业务页面或业务状态直接复制进来。
- 新业务类型应通过 `DocumentSchema`、声明式规则和插件接入。
- 只有无法由通用协议表达的能力，才新增框架扩展点。
- 新增扩展点时，应先补共享类型，再实现后端和前端，保持协议可序列化。

## 2. 技术栈与目录

```text
framework/
├── apps/api/                  # Express、Prisma、PostgreSQL、领域服务
│   ├── prisma/schema.prisma   # 数据模型
│   ├── prisma/migrations/     # PostgreSQL 迁移
│   ├── prisma/seed.ts         # 幂等演示数据
│   └── src/
│       ├── schemas.ts         # DocumentSchema 注册中心
│       ├── document-service.ts
│       ├── list-query-service.ts
│       ├── data-permission-service.ts
│       ├── app-shell-service.ts
│       └── index.ts           # HTTP 边界与 Zod 校验
├── apps/web/                  # React + TypeScript + Vite
│   └── src/
│       ├── app.tsx            # 应用外壳和工作区编排
│       ├── document-list.tsx  # Schema 通用列表
│       ├── document-editor.tsx
│       ├── plugin-registry.tsx
│       └── workspace-*.tsx    # 多标签工作区
└── packages/shared/           # 前后端共享的可序列化协议与纯函数
```

共享协议以 `packages/shared/src/index.ts` 为唯一来源。不要在 API 和 Web 中分别复制相似类型。

## 3. 必须执行的命令

在 `framework/` 中运行：

```bash
npm install
npm run dev
npm run typecheck
npm test
npm run build
npm run db:deploy
npm run db:seed
```

说明：

- Node.js 需要 20+，数据库需要 PostgreSQL 14+。
- `npm run typecheck` 会先构建 shared 声明，再检查 API 和 Web；不要绕过根脚本只检查单个 workspace。
- 当前测试使用 Vitest。纯逻辑测试放在源码旁，命名为 `*.test.ts` 或 `*.test.tsx`。
- 修改 Prisma 模型后先运行 `npm run db:generate -w @zform/api`。
- 完成功能后至少执行 `npm run typecheck && npm test && npm run build`。
- 涉及数据库或 UI 的修改，还必须进行真实 PostgreSQL 和浏览器验收。

## 4. TypeScript 与代码风格

- TypeScript 严格模式，不使用 `any`；不确定类型使用 `unknown` 并做收窄。
- 类型导入使用 `import type`。
- 文件使用 kebab-case，组件和类型使用 PascalCase，函数和变量使用 camelCase。
- 用户可见文字和面向业务的注释使用中文；代码标识符使用英文。
- React 使用函数组件和显式 Props 类型。
- 复杂状态和副作用应拆到 hook 或独立组件，不要继续扩大单个渲染组件。
- 后端公共输入边界使用 Zod 校验；领域状态非法时抛出 `BusinessError`。
- API 继续使用统一 `ApiEnvelope<T>`，不要返回另一种响应结构。
- 保留用户已有改动，不覆盖无关文件，不提交 `.env`、构建产物或数据库文件。

## 5. Schema 驱动开发规则

新增单据类型的首选流程：

1. 在 `apps/api/src/schemas.ts` 注册 `DocumentSchema`。
2. 配置 `masterFields` 和 `detailTables`。
3. 配置 `list`，让通用列表自动生成。
4. 配置 `formActions`、`pushDownRules`、`impactRules` 等声明式规则。
5. 只有现有字段或行为无法表达时，才注册插件。
6. 不要为新单据类型新建专用列表页面、详情路由或 CRUD 服务。

Schema 必须能被 JSON 序列化：

- 不要把函数、React 组件、类实例放进 Schema。
- 条件使用 `ConditionExpression`。
- 计算使用 `FormulaDefinition`。
- UI/行为扩展只保存 `pluginId`、`handlerId` 或 `custom:*` 类型。
- 字段路径使用逻辑字段名；下推映射和影响规则不要引用数据库内部列名。

字段插件统一注册在 `apps/web/src/plugin-registry.tsx`：

```ts
pluginRegistry.registerField("custom:my-field", MyField)
pluginRegistry.registerEffect("my-effect", myEffect)
pluginRegistry.registerRowSelector("my-selector", MySelector)
pluginRegistry.registerExtraTab("my-tab", MyTab)
```

不要在 `field-renderer.tsx` 中为单个业务类型写 `typeId` 分支。

## 6. 通用单据列表的正确用法

所有单据列表优先使用 `POST /api/documents/query` 和 `DocumentListDefinition`。

### 列映射

`ListColumnDefinition.source` 的含义：

- `system`：映射 `DocumentRecord` 系统字段，如 `code`、`status`、`createdBy`、`updatedAt`。
- `master`：映射 `masterData` 中的逻辑路径。
- `detail`：映射明细行 `data` 中的逻辑路径，仅在明细模式展示。

禁止事项：

- 不要在业务列表组件中硬编码 Prisma 字段或 JSONB 读取逻辑。
- 不要在客户端对完整数据集做分页、权限过滤或聚合。
- 不要新增绕过 `permissionWhere()` 的列表入口。
- 不要接受 Schema 未声明为 `sortable` 或 `filterable` 的列进行排序/筛选。

查询协议已经支持：

- 服务端分页
- 递归 AND/OR 条件组
- 多字段排序
- count/sum/avg/min/max 聚合
- 主表模式和明细行模式
- 声明式行操作和工具栏操作

扩展过滤操作符或聚合函数时，必须同时更新：

1. shared 类型；
2. API Zod 校验；
3. `list-query-service.ts` 执行逻辑；
4. `document-list.tsx` 编辑器和展示；
5. 对应测试。

## 7. 数据权限与用户上下文

列表数据权限由 `apps/api/src/data-permission-service.ts` 统一生成 PostgreSQL 基础查询条件。

现有范围：

- `ALL`：全部数据；
- `DEPARTMENT`：本部门及附加授权；
- `PERSONAL`：本人及附加授权；
- 没有策略时默认 `PERSONAL`，禁止改为默认全量。

请求上下文使用：

- `x-user-id`
- `x-user-name`
- `x-user-department-id`
- `x-user-permissions`

这些请求头当前用于框架演示，生产环境必须由可信认证中间件写入，不能直接信任浏览器传入值。

新增查询 API 时：

- 必须明确是否需要数据范围。
- 需要数据范围时复用 `requestUser()` 和 `permissionWhere()`。
- 前端隐藏菜单不是安全控制；后端仍需校验数据权限和操作权限。
- 单据详情、修改、删除等接口若用于生产，应继续补齐对象级授权，不能把侧边栏权限当成授权完成。

## 8. 单据事务、流程与追溯

- 单号必须通过 `DocumentSequence` 在事务内生成。
- 创建、状态流转、审计和下推应在同一 Prisma 事务内完成。
- 更新必须保留 `version` 乐观锁，冲突返回 HTTP 409。
- 只有草稿或驳回单可以编辑。
- 提交前必须执行 Schema 必填和明细校验。
- 状态流转复用 `workflow.ts` 和声明式 `formActions`。
- 下推使用 `applyPushDownRule()`，保留整单及明细行 `sourceRef`。
- 不要移除 `(sourceDocumentId, typeId)` 唯一约束或重复下推保护。
- 修改已经下推的数据前继续使用 `impactRules` 进行影响评估。
- 所有关键写操作写入 `ActivityRecord`。

## 9. 应用外壳的正确用法

外壳配置来自 `GET /api/shell/bootstrap`，包括菜单、用户、权限、设置和通知。

### 多标签工作区

- 页面通过 `openView()`、`openList()`、`openDocument()` 加入工作区。
- 不要重新引入单一 `view` 状态覆盖当前标签。
- 标签内容保持挂载，以便切换标签时保留表单状态。
- 可复用页面应定义稳定标签 ID，避免重复打开：列表使用 `list:<typeId>`，单据使用 `editor:<documentId>`。
- 刷新或关闭标签统一经过 `WorkspaceTabs` 和 App 中的处理函数。

### 未保存变更

- 可编辑页面必须向外壳报告 dirty 状态。
- `DocumentEditor` 通过 `onDirtyChange` 上报；新增编辑类页面也应采用同样模式。
- 关闭、刷新、关闭其他、关闭全部和离开页面时不得绕过确认。
- 保存成功后应以服务端返回数据刷新基线，使 dirty 状态恢复为 false。
- 不要只依赖 `beforeunload`；应用内标签操作也必须拦截。

### 菜单权限

- 菜单定义在 `app-shell-service.ts` 的 `ApplicationShellConfig` 中。
- 新菜单声明 `requiredPermissions`，前端通过当前用户权限过滤。
- 不要在 `app.tsx` 中为新业务菜单写固定 JSX。
- 菜单的 `target` 必须能映射到现有工作区 View；新增 target 时同步更新 shared 类型和打开逻辑。

### 工作台、通知和设置

- 新工作台组件先增加 `DashboardWidgetId` 和 `DashboardWidgetDefinition`，再在 `Dashboard` 中按 `visibleWidgets` 渲染。
- 用户设置通过 `/api/shell/settings` 保存到 `UserPreference`，不要另存一份互相冲突的 localStorage 配置。
- 通知保存到 `UserNotification`；跳转目标使用声明式 `target`，不要把回调函数放入通知。
- 通知读取和标记已读必须按 `userId` 限定。
- 全局状态栏由用户设置控制，业务页面不要直接修改它。

## 10. PostgreSQL 与 Prisma 规则

- 唯一数据库是 PostgreSQL；不要加入 SQLite、内存数据库或本地 JSON 持久化作为正式路径。
- JSONB 用于 Schema 可变的主数据、明细、设置和通知目标；身份、状态、版本、权限范围和关联关系应使用强类型列。
- 新模型或字段需要 Prisma migration，不能只修改 `schema.prisma`。
- 已经部署过的 migration 不应被修改；后续变更创建新的时间戳迁移。
- migration SQL 应能在空 PostgreSQL 数据库从零执行。
- `seed.ts` 必须幂等，优先使用 `upsert`，避免每次运行重复通知或演示单据。
- 涉及并发一致性的写操作使用事务和数据库约束，不用前端检查代替。
- 不把真实凭据写入代码、README、迁移或测试输出。

## 11. API 开发规则

新增 API 的顺序：

1. 在 shared 定义请求和响应类型。
2. 在 API 服务文件实现领域逻辑。
3. 在 `index.ts` 用 Zod 校验输入并接入统一错误处理。
4. 在 `apps/web/src/api.ts` 添加有类型的客户端方法。
5. 页面只调用 API 客户端，不散落原始 `fetch`。

涉及写操作时检查：

- 用户身份和权限；
- 输入长度、枚举和嵌套数量限制；
- 事务边界；
- 乐观锁或唯一约束；
- 审计记录；
- `BusinessError` 的 HTTP 状态码和中文消息。

## 12. 验证要求

### 最低检查

```bash
npm run typecheck
npm test
npm run build
```

### 数据库改动

必须使用一个空 PostgreSQL 数据库验证：

1. `npm run db:deploy`
2. `npm run db:seed`
3. 启动 API 并访问 `/health`
4. 调用受影响 API
5. 验证权限用户和无权限用户的差异

不要用项目生产数据库做自动化破坏性验证。优先使用临时数据库或独立测试库，并在结束后停止服务。

### 前端和外壳改动

必须在浏览器中验证相关交互，并检查控制台错误。涉及应用外壳时至少覆盖：

- 打开多个标签并切换；
- 标签关闭和右键操作；
- 编辑后 dirty 标记与关闭确认；
- 菜单权限过滤；
- 通知已读和目标跳转；
- 用户设置保存后重新 bootstrap；
- 状态栏和紧凑模式。

## 13. 完成前检查清单

- [ ] 是否复用了 Schema，而不是新增专用业务页面？
- [ ] 是否复用了统一列表查询和数据权限？
- [ ] shared、API、Web 类型是否一致且可序列化？
- [ ] 公共 API 是否使用 Zod 校验？
- [ ] 写操作是否有事务、并发保护和审计？
- [ ] 编辑页面是否接入 dirty 状态与未保存拦截？
- [ ] 菜单和工作台是否通过外壳配置扩展？
- [ ] Prisma 变更是否包含 migration 和幂等 seed？
- [ ] 是否通过 typecheck、test、build？
- [ ] 是否完成真实 PostgreSQL 和浏览器验证？
- [ ] 是否更新 README 或本文件中受影响的开发约定？

## 14. 当前已知边界

- 通用 JSONB 列表目前先用 PostgreSQL 完成类型、全文搜索和数据权限基础过滤，再在服务端完成 Schema 逻辑列过滤、排序、聚合和分页。数据量显著增长时，应增加可替换的 SQL/索引适配器，不要破坏现有查询协议。
- 当前用户请求头和 `*` 权限是演示实现。接入生产认证时保留 `ShellUser`、权限码和 `UserContext` 协议，替换身份来源。
- 当前自动测试主要覆盖 shared 纯逻辑。新增复杂 API 或 React 状态逻辑时，应补 Vitest 测试，不要只依赖手工验收。

