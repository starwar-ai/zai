# Framework UI Components

这里是 framework 前端的无业务基础组件层。业务页面优先从 `components/ui` 的 barrel 文件导入，不要复制样式类重新实现同类组件。

```tsx
import { Alert, Button, Card, FormField, Input, PageHeader } from "@/components/ui"

export function ExamplePage() {
  return <>
    <PageHeader title="示例页面" actions={<Button variant="primary">保存</Button>} />
    <Card>
      <FormField htmlFor="name" label="名称" required>
        <Input id="name" />
      </FormField>
      <Alert variant="info">这是提示信息。</Alert>
    </Card>
  </>
}
```

## 组件清单

- `Button`、`IconButton`：操作按钮、尺寸、语义变体和 loading 状态
- `Card`、`CardHeader`、`CardContent`、`CardFooter`：内容容器
- `PageHeader`：页面标题、说明和操作区
- `Input`、`Textarea`、`Select`、`Checkbox`、`Label`、`FormField`：表单基础控件
- `Badge`、`Alert`、`Spinner`、`EmptyState`：状态与反馈
- `Dialog`、`ConfirmDialog`：模态交互
- `Tabs`、`TabPanel`：页面内部受控标签
- `Table` 系列：简单语义数据表格
- `Pagination`：服务端分页控制
- `cn`：过滤并拼接 className

## 使用边界

- 复杂单据列表使用 `DocumentList` 和 `/api/documents/query`，不要用基础 `Table` 重写分页、权限、过滤和聚合。
- Schema 字段使用 `FieldRenderer`；基础表单或配置页才直接组合 Input/Select 等组件。
- 多标签工作区使用 `WorkspaceTabs`，页面内部局部切换使用 `Tabs`。
- 业务确认优先使用 `ConfirmDialog`。现有遗留的 `window.confirm` 可逐步替换，新代码不要再新增。
- 业务状态、字段规则和权限不能写入基础 UI 组件。
- 新增共通组件时必须从 `index.ts` 导出，并在 `UiShowcase` 增加至少一个可视示例。
