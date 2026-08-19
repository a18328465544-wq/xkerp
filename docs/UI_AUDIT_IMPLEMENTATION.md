# OneERP UI Audit 实施追踪

> 建立日期：2026-08-03  
> 原则：不改业务含义，不制造填充型卡片，不以“大重构”替代渐进治理；每批必须通过 lint、相关测试和构建门禁。

## 紧凑布局收敛（2026-08-16）

- `ErpPageHeader` 与 `DashboardSection` 默认使用 `density="compact"`，列表页自动收起介绍性副标题和区块说明；表单、安全边界和不可逆流程显式使用 `density="default"`。
- 商品库、采购、销售、退货、行情、同行、客户、售后、组装、CRM 等页面移除接口实现、快照、伪分页和适配层说明，改为数量、筛选状态、权限和风险提示。
- 规则沉淀在 [`COMPACT_LAYOUT_RULES.md`](./COMPACT_LAYOUT_RULES.md)，并由 `CompactLayout.test.tsx` 固定默认行为。
- `useTablePreferences` 增加可见列状态的稳定比较，避免默认配置对象变化导致页面重复更新；CRM 首屏回归已验证不再触发更新深度错误。
- 本批次不删除权限、错误、空状态、加载态和安全确认文案；这些信息直接影响业务决策，继续保留。

## 基线

| 指标 | 初始值 | 目标 |
| --- | ---: | --- |
| 前端 TSX 组件文件 | 104 | 保持按业务边界拆分，不以文件数作为优化目标 |
| 原生 `<table>` 实现 | 17 → 9（含 DataTable 底座） | 常规只读列表已统一；业务例外仅保留录单、扫码、Markdown、打印预览 |
| 原生 `<select>` 实现 | 54 → 0 | 已迁移到统一 Select 组件 |
| `datetime-local` 实现 | 4 → 0 | 已统一到日期/时间选择组件 |
| `PageShell` 使用点 | 4 → 12 | 已覆盖主要管理页面与经营建议页 |
| `ReportPageLayout` 使用页 | 2 | 扩展到报表类页面 |
| 共享 Empty / Loading / Error | 零散实现 | DataTable 与主要异步列表、详情已统一 |

基线与回归命令：

```bash
npm run lint
npm test
npm run build:web
```

## 20 项问题矩阵

| # | 问题 | 优先级 | 批次 | 状态 | 验收证据 |
| ---: | --- | --- | --- | --- | --- |
| 1 | 导航层级与入口优先级不清 | P0 | 导航 | 已完成 | 主导航按业务域分组；财务二级入口按任务分组；移动端保留完整入口 |
| 2 | CRM 存在无响应入口 | P0 | 导航 | 已完成 | 删除空通知/筛选入口，详情关闭与重开可用 |
| 3 | 表格底座并存 | P0 | 表格 | 已完成 | 常规只读清单统一到 DataTable；原生例外见下方登记表 |
| 4 | Select 实现并存 | P0 | 表单 | 已完成 | 业务组件原生 select 已归零，统一兼容 Select/DropdownSelect |
| 5 | 移动端表格依赖横向滚动 | P1 | 响应式 | 已完成 | DataTable 自动移动卡片与列优先级；录单网格保留横向滚动 |
| 6 | Empty / Loading / Error 不一致 | P0 | 状态 | 已完成 | DataTable/TanStackDataTable 分离 loading/empty；主要异步库存、资金页提供 ErrorState 与重试 |
| 7 | Modal / Drawer / Popover 语义与焦点不完整 | P0 | 基础组件 | 已完成 | Modal、搜索、Copilot、移动导航、系统提示均支持焦点闭环/Escape/归还；顶部菜单支持外部关闭与键盘导航 |
| 8 | Dashboard 信息过载 | P1 | Dashboard | 已完成 | 收敛为 4 个核心 KPI、经营趋势、库存风险、AI 建议和行情；删除重复任务条、异常卡和快捷卡 |
| 9 | 采购与销售镜像流程不一致 | P1 | 业务一致性 | 已完成 | 共用 OrderEntryActionBar、DraftRecoveryNotice、EditingNotice，录单主从布局与动作顺序一致 |
| 10 | CRM 工作台与客户池重复 | P0 | 导航 | 已完成 | 合并为客户池单入口 |
| 11 | 页面内重复基础组件 | P1 | 基础组件 | 已完成 | CRM/退货表单复用 FormField；商品模板只保留有明确 36px 密度语义的 ProductFormField |
| 12 | 全局 CSS 兼容层过重 | P2 | 可维护性 | 已完成 | 表格与表单规则改为 erp-* 显式作用域，移除全局 table/input 劫持、!important 与旧紫色映射 |
| 13 | 搜索/筛选 Toolbar 不一致 | P0 | 表格 | 已完成 | 常规清单统一使用 DataTable toolbar、SearchInput、DropdownSelect；录单/扫码作为业务例外登记 |
| 14 | 详情承载方式不一致 | P1 | 基础组件 | 已完成 | Modal=阻断确认、WorkspacePanel=跨页持续工作、InlineDetailPanel=页内主从详情；资金页已迁移 |
| 15 | AI 入口分散且脱离业务动作 | P1 | AI | 已完成 | 收敛为全局 Copilot 执行入口、经营建议队列、客户/库存上下文建议；移除 CRM 重复 AI 页面 |
| 16 | Tooltip 缺失、依赖 `title` | P2 | 基础组件 | 已完成 | 高频图标按钮迁移 IconButton/Tooltip；保留 title 仅用于截断文本与补充说明，不承担可访问名称 |
| 17 | 伪 macOS 三色点 | P2 | 导航 | 已完成 | WorkspaceTabs 已移除并有回归测试 |
| 18 | Sidebar 底部指标卡争抢注意力 | P1 | 导航 | 已完成 | 合并为单一“经营摘要”入口 |
| 19 | 日期统一后仍有原生日期时间控件 | P1 | 表单 | 已完成 | 4 个 `datetime-local` 已全部迁移到 DateTimePicker |
| 20 | 页面 Layout 采用率低 | P1 | Layout | 已完成 | PageShell 使用点扩展至 12，主要财务/库存/AI 页面采用统一页面骨架；报表保持 ReportPageLayout |

## 最终验证（2026-08-03）

- `npm run lint`：通过；UI 按钮合同通过，原生按钮 201/243，未发现新增视觉逃逸。
- `npm test`：370/370 通过。
- `npm run build:web`：Vite 生产构建通过。
- 桌面真实页面：1440×900 检查首页、采购录单、销售录单，页面宽度与视口一致，无横向溢出。
- 窄屏真实页面：390×844 检查首页，文档宽度 375px；DataTable 列表已验证移动卡片模式。
- 日期选择：自然语言“本月”解析成功；自定义范围显示双月日历；Escape 关闭后焦点回到日历触发按钮。
- 顶部菜单：通知菜单打开后首个 menuitem 自动获焦；Escape 关闭并将焦点还给通知按钮。

## 最新门禁（2026-08-16）

- `npm run lint`：通过（组件边界、UI 契约、Design System、分析页骨架、复用和架构检查均通过）。
- `npm run typecheck`：通过。
- `npm test`：442/442 通过。
- `npm run build:web`：通过，Vite 生产构建完成。
- 真实页面回归：商品库和 CRM 桌面视口已检查；商品库保留了改造前/后的截图用于对照，见 `docs/audit/compact-layout/`。

## 详情承载规则

| 任务 | 组件 | 原因 |
| --- | --- | --- |
| 删除、保存、关键确认 | `Modal` / `ConfirmDialog` | 阻断当前流程，需要焦点锁定和明确确认 |
| 库存追溯、Copilot 等持续工作 | `WorkspacePanel` / 专用 Drawer | 保持上下文，可跨列表查看与返回 |
| 客户资金、非经营收支等主从浏览 | `InlineDetailPanel` | 详情与列表同时可见，不制造模态阻断 |
| 大型独立报表 | `ReportPageLayout` | 保留标题、筛选、指标与明细的报表层级 |

## 批次门禁

每项只有同时满足以下条件才可标记“已完成”：

1. 用户路径可完成，不保留无响应控件。
2. 键盘、焦点、可读名称达到同类组件一致水平。
3. 相关测试覆盖结构或行为，且全量测试通过。
4. 不引入新的同类实现；静态合同检查不回退。
5. 桌面与窄屏至少完成一次真实页面检查；若环境受登录阻塞，必须明确记录。

## 原生表格例外登记

以下场景不应强行迁移为分页只读 DataTable：

| 文件 | 场景 | 保留原因 | 窄屏策略 |
| --- | --- | --- | --- |
| `PurchaseItemsTable.tsx` | 采购录单编辑网格 | 连续键盘录入、列宽调整与行内校验 | 显式横向滚动，固定首尾列 |
| `SalesManager.tsx` | 销售录单编辑网格 | 库存绑定、价格与数量联动 | 显式横向滚动，固定关键列 |
| `AssemblyManager.tsx` | 组装/拆卸配件网格 | 多字段行内编辑与商品检索 | 显式横向滚动 |
| `FinanceTransferDraftTable.tsx` | 批量调拨草稿 | 多账户、多金额批量录入 | 显式横向滚动 |
| `InventoryScanModal.tsx` | 连续扫码结果 | 扫码枪高频操作与即时校验 | 显式横向滚动 |
| `OneERPCopilot.tsx` | AI Markdown 表格 | 展示服务端返回的文档内容 | 容器横向滚动 |
| `CrmManager.tsx` | 报价单打印预览 | 版式输出，不是管理列表 | 预览容器自适应，打印样式独立 |
