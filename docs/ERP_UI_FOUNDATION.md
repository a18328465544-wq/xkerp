# ERP UI 基础层实施方案

> 历史迁移记录：本文记录的是旧版基础层试点，不是当前 Frontend V2 的组件路径或 Token 唯一来源。当前规范请参阅 [`docs/frontend/design-system-v2.md`](./frontend/design-system-v2.md)。

更新时间：2026-08-03

本轮不是一次性替换全站组件，而是先建立可回滚的基础层，并以**销售开单页**作为唯一试点。业务 API、路由、权限、库存和金额事实保持不变。

## 1. 技术边界

| 层级 | 本项目约定 | 说明 |
| --- | --- | --- |
| 视觉与源码 | shadcn/ui 风格与源码所有权 | 不把 shadcn 当黑盒运行时依赖，组件源码归项目维护 |
| 底层交互 | 保留现有交互实现 | 当前代码扫描未发现实际 Radix/Base UI 包，`ui.tsx` 是现有兼容底座；在确认底层库前不新增第二套实现 |
| 业务表格 | TanStack Table | 当前已有 `DataTable → TanStackDataTable` 适配链 |
| 业务组件 | `src/components/erp` | 只表达 ERP 语义，复用 `shared` 分类出口的视觉和交互 |
| 页面组合 | `src/components/domains/*` | 只组合业务组件，不直接导入第三方包 |

React Hook Form、Zod、cmdk、TanStack Virtual、react-number-format、React DayPicker、Sonner、dnd-kit 和 Recharts 均已通过 `shared`/`erp` 适配层接入；业务页面不得直接 import 第三方交互包。

## 2. Token 数值基线

运行时定义在 `src/index.css`，TypeScript 入口为 `src/components/erp/tokens.ts`。页面不得创建新的颜色、圆角、阴影和控件高度。

| 类别 | Token | 数值 |
| --- | --- | --- |
| 间距 | `--erp-space-1/2/3/4/6/8/12` | 4 / 8 / 12 / 16 / 24 / 32 / 48px |
| 控件高度 | `--erp-control-compact-height` | 36px |
| 控件高度 | `--erp-control-height` | 40px |
| 表格控件 | `--erp-table-control-height` | 38px |
| 圆角 | `--erp-radius-control` | 8px |
| 圆角 | `--erp-radius-card` | 12px |
| 圆角 | `--erp-radius-panel` | 16px |
| 页面标题 | `--erp-font-size-page-title` | 24px |
| 区块标题 | `--erp-font-size-section-title` | 16px |
| 正文/标签 | `--erp-font-size-body / label` | 14px / 12px |
| 辅助文字 | `--erp-font-size-caption` | 11px |
| 主色 | `--erp-primary-blue` | `#0a84ff` |
| 成功 | `--erp-profit-green` | `#23884b` |
| 提醒 | `--erp-warning-orange` | `#f59e0b` |
| 风险 | `--erp-loss-red` | `#e5484d` |

## 3. ERP 业务组件层

入口：`src/components/erp/index.ts`

当前第一批组件：

- `ErpStatusBadge`：统一库存、付款、出库、质检和风险状态。
- `ErpMoney` / `formatErpMoney`：统一金额、正负号、千分位和语义色。
- `ErpQuantity`：统一数量和单位展示。
- `ErpMoneyInput`：统一金额输入、千分位、非负约束和数值回调。
- `ErpProductSearch`：统一商品型号搜索、键盘选择、库存提示和浮层定位。
- `ErpScanInput`：统一扫码枪/手工输入、回车提交和等宽字符展示。
- `ErpDocumentMeta`：统一单号、状态和文档元数据。
- `ErpSection`：统一录入页业务分区标题、说明和操作位。
- `ErpMetricCard`：复用现有 `StatCard` 的业务指标入口。
- `ErpTrendMetricCard`：统一带环比/趋势说明的指标卡，避免财务、库存和首页重复实现。
- `ErpSummaryCard`：统一金额/数量汇总列表。
- `useErpForm`：统一 React Hook Form + Zod 的表单解析入口，业务页面不直接依赖校验适配包。
- `setErpFormIssues` / `getErpFormErrorMessage`：统一把领域校验问题映射为字段错误和摘要错误。
- `ErpFieldError`：统一字段错误的可访问展示和视觉契约。
- `NotificationToaster`：唯一的 Sonner 展示宿主；业务代码继续调用 `notify`，不直接依赖 toast 实现。

业务页面只能依赖这些语义组件和 `shared` 出口；底层按钮、卡片、表单、反馈和弹窗分别从 `shared/actions`、`shared/layout`、`shared/forms`、`shared/feedback`、`shared/overlays` 发现。旧的 `ui.tsx` 只作为兼容重导出保留。

Dashboard 页面骨架入口为 `src/components/common/DashboardShell.tsx`，提供 `ErpDashboardPageFrame`、`PageHeader`、`QuickStatusGroup`、`MetricsRegion`、`MainRegion`、`BottomRegion` 和 `DashboardSection`。`DashboardShell` 仅作为兼容别名保留，正式页面统一使用 `ErpDashboardPageFrame`。骨架只负责区域、响应式排布和空区隐藏，不携带库存、财务或 CRM 业务事实。

## 4. 销售开单试点

已在 `src/components/SalesManager.tsx` 使用：

- 单据编号与待出库/编辑中状态使用 `ErpDocumentMeta`。
- 销售总额、成本、利润、已收/未收使用 `ErpMoney`。
- 成交价和已收款输入使用 `ErpMoneyInput`，保留现有 React 状态作为事实源。
- 开单信息和销售备注使用 `ErpSection`。

试点刻意保持原有库存选择、订单草稿、付款状态、权限和提交接口不变。销售提交前通过 `salesOrderSchema` 做结构化校验，问题会同时写入 RHF 字段错误与统一摘要，客户、收款账户等高频字段会显示可定位的错误提示；剩余字段继续按渐进式策略迁移，避免一次改动破坏录单流程。

## 5. 组件展示页

开发环境登录后访问：

```text
http://localhost:3000/?page=component-showcase
```

展示页包含：Token 基线、销售开单业务组件、金额/状态样式、表单/筛选控件和验收状态。该入口只在 `localhost` / `127.0.0.1` 生效，不进入生产菜单。

## 6. 验收标准

### 结构与依赖

- [x] 业务页面不直接 import 第三方 UI 包（目标迁移页已收敛到 `shared`/`erp`）。
- [x] 同一类组件只有一个权威实现和一个 shared/erp 出口（保留兼容入口，不新增平行实现）。
- [x] 销售开单仍使用原有 API、路由、权限和业务状态。
- [x] 不出现第二套 Button/Card/Modal/Table/DatePicker。

`npm run lint:components` 会自动执行 `scripts/check-component-boundaries.mjs`，阻止业务页面直接依赖适配层专用包。

### 视觉与响应式

- [x] 1440px：销售开单主信息、商品明细、收款侧栏完整可读。
- [x] 1024px：双栏可降级为单栏，主操作仍可见。
- [x] 390px：输入、商品行、金额汇总可滚动或折叠，无重叠遮挡。
- [x] 状态同时具备文字/图标和语义色，金额使用等宽数字。

### 交互与可访问性

- [x] 所有按钮有明确行为、禁用/加载态和 `type`。
- [x] 弹窗、下拉和商品搜索可用键盘操作，Escape 可关闭浮层。
- [x] 表单字段有 label 或 aria-label，错误提示可定位。
- [x] 销售开单保存后仍进入待出库流程，不能绕过扫码出库。

### 自动化门禁

```bash
npm run lint
npm test
npm run build
```

每次迁移必须补充对应的静态渲染/领域测试；任何一项失败都不能进入下一批迁移。

## 7. 迁移完成清单

业务组件入口已经按“财务 → 库存 → CRM → 采购 → 售后 → 设置”完成第一轮统一；页面骨架正在按批次迁移。迁移只收敛页面骨架、组件出口和视觉契约，不改变路由、API、权限、状态事实或数据库结构。

| 批次 | 已覆盖页面/能力 | 统一结果 |
| --- | --- | --- |
| 财务 | 资金驾驶舱、账户、流水、调拨、日结与异常、非经营收支、销售利润、客户资金 | `ErpMoney`、`ErpMetricCard`、`ErpTrendMetricCard`、`ErpStatusBadge`、`shared.DataTable` |
| 库存 | 单卡/SN、整机、汇总卡片、风险/健康、AI 侧栏、导入导出、扫描抽屉 | `ErpMoney`、`ErpMetricCard`、`ErpStatusBadge`、`PressableCard`、`shared` 表格/弹窗 |
| CRM | 客户池、客户详情、线索、报价、跟进和客户资金关联 | `ErpMoney`、`ErpMoneyInput`、`ErpStatusBadge`、`ErpMetricCard` |
| 采购 | 采购开单、商品明细、付款侧栏、回收/组装和提成 | `ErpDocumentMeta`、`ErpMoney`、`ErpMoneyInput`、`ErpSection`、`shared.DataTable` |
| 售后 | 售后、退货、发票和退货对账 | `shared.DataTable`、`Modal`、`Button`、`Select`、统一确认交互 |
| 设置 | 员工权限、系统设置、工作区导航和组件展示页 | `shared` 控件出口、`ToggleButton`、`PressableCard`、`DataTable` |

兼容性的平铺文件和 `shared`/`erp` 出口会继续保留；它们是单一实现的适配入口，不再允许业务页直接引用底层适配文件。后续新增页面只允许从 `src/components/shared` 和 `src/components/erp` 发现通用组件。

## 8. Dashboard Skeleton 迁移状态

统一骨架入口为 `src/components/erp/DashboardSkeleton.tsx`。它只定义页面区域和响应式排布，不携带业务事实：

- `Dashboard.tsx`：已迁移，经营待办通过 `PageHeader.quickStatus` 提供，指标、主区和辅助区使用骨架槽位。
- `AiInsightsCenter.tsx`：已迁移，建议统计进入 `MetricsRegion`，筛选和建议列表进入 `MainRegion`。
- `MarketQuotes.tsx`：已迁移，页面标题与操作统一使用 `PageHeader`。
- `FinanceCenter.tsx`：已迁移，指标、现金流主区、健康度和底部账户区使用骨架槽位；财务二级导航仍由 `FinanceWorkspaceNav` 单独负责。
- `FinanceManager.tsx`、`CustomerFundsCenter.tsx`、`FinanceTransferWorkspace.tsx`、`NonOperatingFinancePage.tsx`、`PurchaseCommissionManager.tsx`、`SettlementFinance.tsx`：已迁移到 `ErpDashboardPageFrame`；原有财务数据、权限、筛选和写入流程保持不变，明显指标区使用 `MetricsRegion`。
- `InventoryManager.tsx`：已迁移，库存标题/操作、指标、主表与 AI 侧栏复用骨架，库存筛选、分页、批量操作和抽屉逻辑保持不变。
- `CrmManager.tsx`、`PartnerManager.tsx`、`ProductLibrary.tsx`、`InspectionManager.tsx`、`AssemblyManager.tsx`、`SalesOutboundManager.tsx`、`ReturnManager.tsx`、`AftersalesManager.tsx`、`InvoiceList.tsx`、`AdminSettings.tsx`：已接入 `ErpDashboardPageFrame` 作为统一外壳；领域工作区内部导航和录入布局保留，避免把业务流程强行改造成仪表盘。

销售/采购录入、检测表单和详情抽屉仍优先复用现有领域组件（`ErpSection`、`ErpDocumentMeta`、`shared.DataTable`），后续只在出现真实的页面级重复时补充 `PageHeader` 或区域槽位。`ComponentShowcase` 作为开发展示页保留 `PageShell`，不参与业务迁移。不得在业务页复制 `PageHeader`、`MetricsRegion` 或主区比例规则。

## 9. 表格适配与长列表策略

`DataTable` → `TanStackDataTable` 是业务表格的唯一适配链。排序、分页、列显示、固定列、导出和移动端卡片都在适配层维护，业务页面只传入列定义与数据。

长列表使用 `virtualized` 显式开启 TanStack Virtual；分页表格和短表格保持普通渲染，避免为小数据集引入额外测量成本。当前首个试点是 `FinanceLedgerView` 的非分页账户流水明细，虚拟滚动只替换桌面端可视行，移动端卡片、筛选、导出、选择和固定列行为保持不变。后续只有在“非分页 + 数据量持续增长 + 行高稳定”的列表中复用该开关。

## 10. 全局消息提示策略

消息流已经收敛为“业务 API + 单一展示宿主”两层：

- 业务层只调用 `src/utils/notification.ts` 的 `notify`，或订阅同一通知总线；不在页面内创建新的 toast、alert 或阻塞式提示。
- `src/components/shared/NotificationToaster.tsx` 负责把通知总线适配到 Sonner，并在 `src/main.tsx` 只挂载一次。
- Sonner 使用非阻塞的顶部消息、统一关闭按钮、最多 4 条可见消息和可访问标签；原生 `window.alert` 仅作为兼容调用转为同一消息流。
- `IosAlertDialog` 保留为旧调用方的兼容入口，但不再由应用根节点挂载，也不应作为新页面反馈方案。

验收门禁由 `notificationToasterRender.test.tsx` 固定：根节点只能有一个 `NotificationToaster`，应用入口不得重新挂载旧弹窗，适配层必须依赖 Sonner 和通知总线。

## 10.1 本轮剩余能力收口（2026-08-05）

- `DateRangePicker` 的月份网格已改由 `shared/calendar.tsx` 的 `ErpCalendar` 渲染，保留原有快捷日期、自然语言和范围确认逻辑。
- `ProductProfitReport` 的净利润趋势已改由 `shared/charts.tsx` 的 `ErpLineChart` 渲染，保留原有聚合数据和空态。
- `ProductTemplateFormModal` 的商品图片支持 `shared/sortable.tsx` 的拖动排序，压缩、上传和删除行为保持不变。
- `PurchaseCommissionManager` 的排名、筛选、更多操作和条件清除控件已收敛到 `TextButton`、`ToggleButton`、`IconButton` 和 `Button`；存量原生按钮基线由 `npm run lint:ui` 守护。
- 依赖安全基线已更新：生产依赖 `npm audit --omit=dev` 与全量 `npm audit` 均通过。

## 11. 基础 UI 分层迁移

`src/components/shared/index.ts` 现在按职责聚合八个稳定出口：

- `actions`（`shared/actions.tsx`）：`Button`、`IconButton`、`ToggleButton`、`PressableCard` 和 Tooltip。
- `layout`（`shared/layout.tsx`）：`PageShell`、`Card`、`StatCard`、`FilterBar` 和工作区面板。
- `forms`：输入类名、`Select`、`DropdownSelect`、筛选控件和 `FormField`。
- `feedback`：`Badge`、`Tooltip`、空态、加载态和错误态。
- `overlays`：`Modal`。
- `calendar`：`ErpCalendar`（React DayPicker 适配）。
- `charts`：`ErpLineChart`、`ErpSparkline`（Recharts 适配）。
- `sortable`：`ErpSortableList`（dnd-kit 适配）。

本阶段采用兼容适配策略：`layout`、`actions`、`forms`、`feedback`、`overlays`、`calendar`、`charts` 和 `sortable` 均为独立实现；`ui.tsx` 仅保留兼容重导出。业务 API、样式和 DOM 契约保持不变，迁移期间不允许复制出第二份组件。

## 12. 共享动作控件收口（2026-08-05）

页面级按钮迁移按“语义先行、保留业务 DOM 行为”的方式完成第二轮收口：

| 交互语义 | 统一出口 | 适用场景 |
| --- | --- | --- |
| 轻量动作/链接 | `TextButton` | 报表页签、单号、筛选清除、快捷操作 |
| 互斥或状态切换 | `ToggleButton` | 付款状态、趋势维度、范围/规则页签 |
| 可点击行/卡片 | `PressableCard` | 库存、账户、客户、商品候选、导航 |
| 仅图标动作 | `IconButton` | 关闭、分页、编辑、删除、表格操作 |
| 强调提交/主操作 | `Button` | 保存、提交、导出、打开弹窗 |

本轮迁移只改变控件出口和可访问性契约，不改变 API、路由、权限、状态事实或业务回调。`npm run lint:ui` 负责阻止新增原生 `<button>` 和 `IconButton` 无障碍/视觉逃逸；当前运行时保留的三个原生按钮均为需要 `ref` 的焦点管理兼容点。
