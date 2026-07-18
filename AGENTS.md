# ZForm Framework Agent Development Guide

本文件适用于当前仓库根目录及其全部子目录。后续 Agent 在修改本框架时，必须优先复用已有的 Schema、统一单据 API、数据权限和应用外壳能力，不要为单个业务需求另建一套平行实现。

## 1. 项目定位与边界

本仓库是从现有 ZForm 抽取出的通用全栈框架，不是旧业务系统的迁移副本。仓库根目录就是 workspace 根目录，不存在额外的 `framework/` 子目录。

- 可以扩展框架核心、通用组件、Schema 协议、插件、API 和 PostgreSQL 模型。
- 不要把旧 ZForm 的具体业务页面或业务状态直接复制进来。
- 新业务类型应通过 `DocumentSchema`、声明式规则和插件接入。
- 只有无法由通用协议表达的能力，才新增框架扩展点。
- 新增扩展点时，应先补共享类型，再实现后端和前端，保持协议可序列化。

## 2. 技术栈与目录

```text
.
├── apps/api/                  # Express、Prisma、PostgreSQL、领域服务
│   ├── prisma/schema.prisma   # 数据模型
│   ├── prisma/migrations/     # PostgreSQL 迁移
│   ├── prisma/seed.ts         # 幂等演示数据
│   └── src/
│       ├── controllers/       # HTTP 输入、Zod 校验与响应编排
│       ├── routes/            # 路径与中间件装配
│       ├── middleware/        # 统一错误、异步和权限中间件
│       ├── services/          # 领域逻辑、事务和 Prisma 查询
│       ├── documents/         # DocumentSchema、工作流与单据校验
│       ├── utils/             # HTTP 响应和请求上下文工具
│       ├── app.ts             # Express 应用装配
│       ├── database.ts        # Prisma 连接
│       └── index.ts           # 进程启动与优雅退出
├── apps/web/                  # React + TypeScript + Vite
│   └── src/
│       ├── apis/              # 前端 API 客户端
│       ├── components/        # 应用外壳、页面和共通组件
│       │   └── ui/            # 无业务基础 UI
│       ├── core/              # 插件注册表等前端核心协议
│       ├── hooks/             # React hook 与副作用逻辑
│       ├── registrations/     # 默认与业务插件注册
│       ├── types/             # 仅前端使用的类型
│       ├── App.tsx            # 初始化注册与根组件
│       ├── main.tsx           # React 挂载入口
│       └── index.css          # 全局主题样式
├── packages/shared/           # 前后端共享的可序列化协议与纯函数
├── docker-compose.yml         # 本地 PostgreSQL 16
├── package.json               # workspace 根脚本
└── README.md                  # 使用、能力与当前边界
```

共享协议以 `packages/shared/src/index.ts` 为唯一来源。不要在 API 和 Web 中分别复制相似类型。

当前实现入口：

- `packages/shared/src/runtime.ts`：条件、公式、只读模式、下推映射和影响评估等纯函数；
- `apps/api/src/documents/schemas.ts`：客户报价单、销售合同、采购计划、入库单四个演示 Schema；
- `apps/api/src/routes/`：健康检查、外壳、系统管理和通用单据四组路由；
- `apps/web/src/apis/framework-api.ts`：前端访问 API 的唯一客户端；
- `apps/web/src/components/app-layout.tsx`：bootstrap、菜单、多标签工作区和全局状态的装配入口。

## 3. 必须执行的命令

在仓库根目录运行：

```bash
npm install
npm run typecheck
npm test
npm run build
```

说明：

- Node.js 需要 20+，数据库需要 PostgreSQL 14+。
- `npm run typecheck` 会先构建 shared 声明，再检查 API 和 Web；不要绕过根脚本只检查单个 workspace。
- 当前测试使用 Vitest。纯逻辑测试放在源码旁，命名为 `*.test.ts` 或 `*.test.tsx`。
- 修改 Prisma 模型后先运行 `npm run db:generate -w @zform/api`。
- 完成功能后至少执行 `npm run typecheck && npm test && npm run build`。
- 本地联调使用 `npm run dev`；涉及数据库结构或种子数据时再执行 `npm run db:deploy` 和 `npm run db:seed`。
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

### 前端共通组件

- 前端目录参考仓库根 ZForm：API 放 `apis/`，React 组件放 `components/`，hook 放 `hooks/`，注册动作放 `registrations/`，前端专用类型放 `types/`。
- 统一使用 `@/` 路径别名，禁止从跨目录组件堆叠 `../../` 相对路径。
- 只创建有实际职责的目录；需要跨页面全局状态时再增加 `stores/`，不要为了目录对齐创建空文件。
- 基础 UI 位于 `apps/web/src/components/ui/`，业务页面优先从其 `index.ts` 导入。
- 新代码不要继续直接复制 `primary-button`、`panel`、`inline-error` 等样式组合；应使用 `Button`、`Card`、`Alert`、`PageHeader` 等组件。
- 简单配置数据使用基础 `Table`；复杂单据列表仍必须使用 `DocumentList` 和统一查询 API。
- 普通配置字段使用 `FormField` 与 Input/Select 等；Schema 单据字段仍使用 `FieldRenderer`。
- 页面内部切换使用 `Tabs`，应用级多页签使用 `WorkspaceTabs`，二者不可混用。
- 模态交互使用 `Dialog`/`ConfirmDialog`；新代码不要增加 `window.confirm`。
- 当前单据编辑器、列表和工作区仍有遗留 `window.confirm`；触及对应交互时优先迁移到 `ConfirmDialog`，不要继续扩散。
- 共通组件不得包含 `typeId`、单据状态机、权限码或具体业务字段。
- 新增共通组件时同步从 `components/ui/index.ts` 导出，在 `UiShowcase` 增加示例，并更新组件目录 README。

## 5. Schema 驱动开发规则

新增单据类型的首选流程：

1. 在 `apps/api/src/documents/schemas.ts` 注册 `DocumentSchema`。
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

插件注册表位于 `apps/web/src/core/plugin-registry.tsx`，具体注册动作放在 `apps/web/src/registrations/`：

```ts
pluginRegistry.registerField("custom:my-field", MyField)
pluginRegistry.registerEffect("my-effect", myEffect)
pluginRegistry.registerRowSelector("my-selector", MySelector)
pluginRegistry.registerExtraTab("my-tab", MyTab)
```

不要在 `components/field-renderer.tsx` 中为单个业务类型写 `typeId` 分支。

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

列表数据权限由 `apps/api/src/services/data-permission-service.ts` 统一生成 PostgreSQL 基础查询条件。

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
- 单据详情、修改、删除等接口必须复用对象级数据范围授权；侧边栏权限不能代替后端授权。

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

- 菜单保存在 PostgreSQL `SystemMenu`，由 `app-shell-service.ts` 查询并组装，禁止重新维护一份前端静态菜单。
- 新菜单通过种子数据、系统管理 API 或菜单管理页写入，并声明稳定的 `permissionCode`；空权限码表示公开菜单。
- 当前用户权限必须由 `AppUser -> UserRole -> Role.permissions` 合并产生；禁用用户不得获得数据库角色权限。
- 不要在 `app.tsx` 中为新业务菜单写固定 JSX。
- 菜单的 `target` 必须能映射到现有工作区 View；新增 target 时同步更新 shared 类型和打开逻辑。

### 用户、角色与 RBAC

- 用户、角色、菜单的领域逻辑集中在 `services/system-management-service.ts`，Controller 负责 Zod 校验和响应封装，Route 只声明路径和权限中间件。
- 管理写接口必须在服务端调用 `assertSystemPermission()`；不能只通过隐藏按钮或菜单判断权限。
- 使用稳定权限码，系统管理固定使用 `system:menu:manage`、`system:user:manage`、`system:role:manage`；业务能力使用 `document:<typeId>:<action>` 等可读格式。
- `*` 只赋予系统管理员。普通角色列出所需权限码，不要为方便扩大权限。
- 修改角色权限或当前用户角色后，应重新请求 shell bootstrap，让菜单与用户信息即时刷新。
- 用户状态使用 `ACTIVE`/`DISABLED`。禁用是保留审计关系的首选方式，不要用删除代替停用。
- 删除角色前必须检查用户关联；系统管理员角色和框架内置演示用户保留删除保护。
- `x-user-permissions` 仅作为尚未建库用户的演示回退。生产环境的身份与权限必须来自可信认证和数据库，不能信任浏览器请求头。

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
- 用户角色分配必须在事务中替换关联关系；角色编码、菜单标识和用户标识保持唯一。
- 不把真实凭据写入代码、README、迁移或测试输出。

## 11. API 开发规则

### 分层职责

- `routes/`：只声明 URL、HTTP 方法、Controller 和 Middleware，不写 Prisma 查询或业务判断。
- `controllers/`：解析参数、执行 Zod 校验、调用 Service、使用 `ok()` 返回统一响应；不要直接访问 Prisma。
- `services/`：承载领域规则、事务、数据库查询和 `BusinessError`，不依赖 Express 的 `Request`/`Response`。
- `middleware/`：处理横切能力。权限校验、错误处理和异步异常统一在此实现，不在每个 Controller 重复复制。
- `utils/`：只放无业务状态的复用工具；不要把领域服务堆入 `utils`。
- `documents/`：保存所有单据类型共享的 Schema 注册、工作流和请求校验。新增单据仍只扩展 Schema，不新增专用 Route/Controller。
- `app.ts` 只负责 Express 装配，`index.ts` 只负责数据库连接、监听端口和进程退出。

禁止把全部接口重新写回 `index.ts`。新增模块至少提供对应 Route 和 Controller；存在领域逻辑时再增加 Service。

新增 API 的顺序：

1. 在 shared 定义请求和响应类型。
2. 在 API 服务文件实现领域逻辑。
3. 在对应 Controller 用 Zod 校验输入并使用 `ok()` 返回统一响应。
4. 在对应 Route 装配 Controller 和权限 Middleware；不要把业务路由写进 `index.ts`。
5. 在 `apps/web/src/apis/framework-api.ts` 添加有类型的客户端方法。
6. 页面只调用 API 客户端，不散落原始 `fetch`。

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
- [ ] 用户、角色或菜单写操作是否同时校验了后端 RBAC 权限？
- [ ] Prisma 变更是否包含 migration 和幂等 seed？
- [ ] 是否通过 typecheck、test、build？
- [ ] 是否完成真实 PostgreSQL 和浏览器验证？
- [ ] 是否更新 README 或本文件中受影响的开发约定？

## 14. 当前已知边界

- 通用 JSONB 列表目前先用 PostgreSQL 完成类型、全文搜索和数据权限基础过滤，再在服务端完成 Schema 逻辑列过滤、排序、聚合和分页。数据量显著增长时，应增加可替换的 SQL/索引适配器，不要破坏现有查询协议。
- 数据范围已接入列表、详情、修改、删除、流程、下推、影响评估、追溯、工作台和活动记录。新增任何返回或操作单据的入口时，仍必须复用统一对象级授权，不能把当前演示身份来源视为生产安全边界。
- 通用单据的 create/update 等部分请求体仍直接进入 Service，尚未全部经过完整 Zod Schema；扩展写接口时应同时收紧现有输入边界。
- 当前用户请求头和 `*` 权限是演示实现。接入生产认证时保留 `ShellUser`、权限码和 `UserContext` 协议，替换身份来源。
- 根 `npm test` 当前运行 shared 和 API workspace 测试。新增复杂事务权限或 React 状态逻辑时，应补充相应 workspace 测试并更新根测试脚本，不要只依赖手工验收。
