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
- `Progress`、`Separator`：进度反馈与内容分隔
- `Table` 系列：简单语义数据表格
- `Pagination`：服务端分页、每页条数与首页/末页控制
- `ColumnSettings`：复杂列表的列显示、拖拽/按钮排序和左右固定设置
- `cn`：过滤并拼接 className

## 使用边界

- 复杂单据列表使用 `DocumentList` 和 `/api/documents/query`；其列筛选、服务端分页/排序、列宽、列序、固定列、跨页选择和导出能力统一在列表组件内实现。
- 单据明细编辑使用 `DocumentDetailTable`，字段仍由 `FieldRenderer` 渲染；列宽、列序和行序偏好由表格统一维护。
- Schema 字段使用 `FieldRenderer`；基础表单或配置页才直接组合 Input/Select 等组件。
- 多标签工作区使用 `WorkspaceTabs`，页面内部局部切换使用 `Tabs`。
- 业务确认使用 `ConfirmDialog`，不要新增 `window.confirm`。
- 业务状态、字段规则和权限不能写入基础 UI 组件。
- 新增共通组件时必须从 `index.ts` 导出，并在 `UiShowcase` 增加至少一个可视示例。
