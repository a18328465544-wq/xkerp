# 前端组件目录与治理规则

> 历史目录盘点：本文包含旧版 `shared/erp` 路径的迁移记录，不作为当前 V2 的组件路径规范。当前 V2 以 `src/components/ui`、`common`、`domain` 和 [`docs/frontend/design-system-v2.md`](./frontend/design-system-v2.md) 为准。

## 当前盘点（2026-08-05）

`src/components/` 当前有 107 个根目录 TSX 文件和 56 个根目录 TS 文件，另有 20 个 TSX 渲染测试和 27 个 TS 工具测试。基础 UI 已拆到职责目录，`ui.tsx` 仅保留 37 行兼容重导出；页面级组件中仍有 10 个超过 600 行。

这不是功能故障，但会带来三个实际问题：

1. 新页面容易直接复制页面级样式，而不是复用共享控件。
2. 同一业务域的表格、弹窗和筛选组件不容易被发现，修改时容易漏改。
3. 页面入口、基础组件、纯计算工具和测试文件混在一个目录，文件名无法表达依赖方向。

## ERP 业务组件层（2026-08-03）

`src/components/erp/` 是介于共享 UI 和业务页面之间的语义层。它不承载库存、余额、利润等业务事实，只把业务页面反复出现的展示契约封装起来：

- 状态：`ErpStatusBadge`
- 金额与数量：`ErpMoney`、`ErpMoneyInput`、`ErpQuantity`、`formatErpMoney`
- 商品选择：`ErpProductSearch`（cmdk 适配、键盘导航与浮层定位）
- 表单校验：`useErpForm`（React Hook Form + Zod 适配入口）
- 全局反馈：`NotificationToaster`（Sonner 适配）与 `notify` 通知总线
- 单据：`ErpDocumentMeta`
- 业务分区：`ErpSection`
- 指标与汇总：`ErpMetricCard`、`ErpSummaryCard`
- Dashboard 骨架：`ErpDashboardPageFrame`、`PageHeader`、`QuickStatusGroup`、`MetricsRegion`、`MainRegion`、`BottomRegion`、`DashboardSection`；`DashboardShell` 仅为兼容别名，禁止新页面使用

首个迁移页面是 `SalesManager`（销售开单）。随后按“财务 → 库存 → CRM → 采购 → 售后 → 设置”完成了所有主要业务页的统一入口迁移。后续页面必须先复用 ERP 业务组件，再决定是否需要新增组件，禁止在页面内复制金额、状态和单号样式。

Token 数值和组件展示页记录在 [`ERP_UI_FOUNDATION.md`](./ERP_UI_FOUNDATION.md)。

高频共享组件目前已经统一，但仍保留兼容路径：

| 能力 | 权威实现 | 兼容入口 |
| --- | --- | --- |
| 页面骨架、卡片、按钮、表单、弹窗、反馈态 | `src/components/shared/{layout,actions,forms,feedback,overlays}.tsx` | `src/components/shared/index.ts` |
| 业务表格 | `DataTable` → `TanStackDataTable` | `src/components/shared/index.ts` |
| 日期/日期范围 | `DateRangePicker.tsx` + `shared/calendar.tsx`（React DayPicker 适配） | `src/components/shared/index.ts` |
| 趋势图/迷你图 | `shared/charts.tsx`（Recharts 适配） | `src/components/shared/index.ts` |
| 拖拽排序 | `shared/sortable.tsx`（dnd-kit 适配） | `src/components/shared/index.ts` |
| 报表骨架 | `ReportPageLayout.tsx` | `src/components/shared/index.ts` |
| 全局消息 | `NotificationToaster.tsx` + `utils/notification.ts` | `src/components/shared/index.ts` |

## 新的分层出口

本次先增加稳定的目录边界，不移动既有平铺文件，因此不会改变路由、懒加载、chunk 拆分或现有导入路径：

```text
src/components/
├── shared/                 # 只放可跨业务复用的 UI/表格/日期/报表出口
├── domains/
│   ├── dashboard/          # 经营看板与 AI 助手
│   ├── inventory/          # 商品、库存、检测、扫码
│   ├── purchase/           # 采购、回收、组装、进货提成
│   ├── sales/              # 销售、出库、售后、退货
│   ├── finance/            # 财务、资金、报表、利润
│   ├── crm/                # 客户、线索、跟进、来源
│   └── system/             # 导航、权限、全局交互
├── index.ts                # 命名空间出口，供新代码发现组件
└── <legacy flat files>     # 兼容入口，按迁移批次逐步收敛
```

推荐导入方式：

```ts
import { shared } from "@/src/components";
import { crm } from "@/src/components";

const { Button, Modal, DataTable } = shared;
const { CrmCustomerLeadModal } = crm;
```

实际页面为了保留 Vite 的按页懒加载，可以继续直接导入页面文件；页面内部使用的基础控件统一从 `./shared` 或对应分类出口获取，业务语义组件从 `./erp` 获取。`./ui`、`DataTable.tsx`、`DateRangePicker.tsx` 和 `ReportPageLayout.tsx` 仅作为兼容实现，不允许业务页直接引用，也不能再新建同名按钮、卡片、弹窗和表格。

## 组件职责

### Shared

- 只处理展示、交互、可访问性和通用布局。
- 不读取或修改业务状态，不计算库存、余额、利润和客户等级。
- 需要业务数据时通过 props 接收，并将动作通过 callback 向上交给页面/领域层。

### Domain

- 负责一个业务域的页面组合和局部交互。
- 可调用 `src/utils/*` 的纯计算函数和 `src/utils/state.ts` 的 API 客户端。
- 不把同一规则复制到另一个域；跨域金额、库存、SN 事实必须由后端返回。

### Support

- 纯计算、类型和 hook 使用现有平铺命名（`*Utils.ts`、`use*.ts`），后续迁移到对应 domain 的 `support/` 时保持导入兼容。
- 测试文件与被测模块同目录，禁止为了迁移目录复制一份实现。

## 本次发现的重复/风险点

- `ui.tsx` 已收敛为兼容重导出，新代码统一通过 `shared/actions`、`shared/layout`、`shared/forms`、`shared/feedback`、`shared/overlays`、`shared/calendar`、`shared/charts`、`shared/sortable` 发现。
- 全局消息现在已统一由 Sonner 适配器展示；`IosAlertDialog` 仅保留兼容入口，不能再由页面直接挂载或新增类似阻塞弹窗。
- `DataTable.tsx` 已经是 TanStack 表格的兼容适配层，页面不应直接新增第三种表格实现。
- `DateRangePicker.tsx` 同时包含范围、单日、日期时间和自然日期输入；这是可接受的同一日期交互族，但应通过 `shared` 入口统一发现。
- 财务、库存、采购页面仍有大文件（600–1162 行）；优先按“页面容器 → 工具栏/筛选 → 表格 → 弹窗/详情”拆分，不先移动文件，避免改变业务状态时序。
- 当前 87 个组件文件仍包含页面级 Tailwind 视觉类；允许页面组合布局，但颜色、按钮高度、卡片、输入框和弹窗视觉必须回到 `ui.tsx`/CSS token。
- `npm run lint:ui` 已对原生按钮、IconButton 无障碍名称、按钮尺寸和视觉逃逸提供约束；新目录应继续复用同一检查，不另起 lint 规则。

## 迁移状态

六个业务批次已完成：

1. 财务：指标、金额、状态、表格与工作区导航统一。
2. 库存：汇总卡片、风险/健康卡片、AI 侧栏和列表统一。
3. CRM：客户、报价、线索和跟进统一 ERP 业务组件。
4. 采购：单据元数据、金额输入、明细/付款和回收入口统一。
5. 售后：售后、退货、发票使用共享数据表格、弹窗和选择控件。
6. 设置：权限、设置和导航使用共享控件，组件展示页作为验收入口。

每批次均保留兼容入口，且由 `scripts/check-component-boundaries.mjs` 阻止业务页直接依赖底层适配文件或第三方交互包。

每一批迁移都必须运行：

```bash
npm run lint
npm test
npm run build
```

本目录只是组件发现和依赖边界，不改变任何业务 API、路由、权限或数据库结构。

## 2026-08-05 适配层试点

第三方能力已完成“适配层先行、单页面试点、全量回归”的第一批迁移：

- `shared/calendar.tsx` → `DateRangePicker` 月份网格。
- `shared/charts.tsx` → `ProductProfitReport` 净利润趋势。
- `shared/sortable.tsx` → `ProductTemplateFormModal` 商品图片排序。

组件展示页 `?page=component-showcase` 现在同时展示三种适配器，并由
`calendarRender.test.tsx`、`chartsRender.test.tsx`、`sortableRender.test.tsx`
锁定 SSR/可访问性契约。后续页面迁移只需传入业务数据和回调，不再直接接触
`react-day-picker`、`recharts` 或 `dnd-kit`。

## 2026-08-05 共享动作控件第二轮收口

本轮把剩余业务页中重复的原生交互按钮迁移到 `shared/actions.tsx` 的语义出口：

- `TextButton`：报表页签、筛选清除、单号链接、轻量动作和表格内链接。
- `ToggleButton`：收付款状态、分析维度、业务范围、提成类型和趋势切换。
- `PressableCard`：库存/账户/客户行、候选商品、导航入口和可点击汇总卡片。
- `IconButton`：分页、删除、关闭、编辑、表格操作和带 Tooltip 的图标动作。

覆盖页面包括财务中心、客户资金、退货、CRM、工作区标签、日期范围、权限、经营首页、库存筛选/侧栏、非经营收支、发票、来源客户、采购/销售录单及报表组件。UI 契约扫描结果从本轮开始前的 72 个原生按钮降至 3 个运行时保留项（`npm run lint:ui` 当前报告 `3/243`）。

剩余 3 个按钮均有明确原因，不作为新页面范例：全局搜索和移动端导航触发器需要把 `ref` 交给焦点恢复/焦点陷阱；`IosAlertDialog` 是旧调用方的兼容实现。新增业务按钮不得复制这三种写法，必须从 `shared/actions` 选择语义控件。

## 2026-08-05 超大录单页拆分首批

销售开单页已按“页面容器持有状态、业务子组件负责展示和局部交互”的边界拆分：

- `SalesHeaderForm`：单据编号、来源客户、物流和整单质保。
- `SalesItemsTable`：商品搜索、库存匹配、数量/售价/质保编辑、列宽和行操作。
- `SalesPaymentSidebar`：收款账户、收款状态、金额校验提示、发票/物流选项和结算汇总。
- `SalesManager`：只保留草稿、订单校验、库存预占计算、提交命令和路由切换。

这批拆分不改变 API、路由、权限、表单校验或提交数据结构。采购页、库存页和财务页已有独立的表格/工具栏/抽屉组件，后续按同一边界继续把剩余超大文件中的“状态计算”和“页面展示”分离，禁止为了减少行数复制业务规则。

## 2026-08-05 超大检测与组装页拆分第二批

第二批继续采用“页面容器持有业务状态、子组件负责业务视图”的边界：

- `InspectionQueue`：显卡待检池、其他配件待检池和质检归档列表；只接受队列数据与选择/编辑回调。
- `InspectionForm`：SN 校验入口、入库属性、显卡检测项、图片凭证和提交操作；不直接调用 store 命令。
- `InspectionManager`：保留检测状态、重复 SN 校验、媒体 URL 解析、检测提交/更新命令和扫码弹窗。
- `AssemblyPartTable`：组装/拆卸配件明细表和行级编辑、删除、扫码操作；商品模板下拉仍由容器提供渲染回调。
- `AssemblyRecentRecords`：近期组装/拆卸记录筛选与摘要；完整历史仍由 `DataTable` 负责。

本批次不改变 API、路由、权限、检测字段、库存同步或组装拆卸命令。后续拆分优先处理仍超过 600 行的页面，并保持“一个业务事实只在容器计算一次、展示组件通过 props 消费”的规则。

## 2026-08-05 财务页重复分支清理

`FinanceManager` 原来同时保留两套日结仪表盘：前面的新财务工作台已经在 `permissions.showProfit` 为真时直接返回，后面的旧版流水/日结 JSX 因此永远不会执行，却仍携带重复的日结、账户、趋势和待复核表格逻辑。本轮删除这段不可达视图，并保留统一的权限受限空态；同时移除不可达视图专用的流水表格列、历史日结预加载和复核命令引用。

这样做不改变财务数据计算、账户实盘核对、日结确认、异常提示或权限判断，只减少重复代码和一次无效的历史日结请求。`FinanceManager` 从 655 行降到约 270 行，后续若新增财务工作区应继续在 `FinanceCenter`/`Finance*View` 组件中扩展，而不是把旧版页面重新塞回容器。

## 2026-08-05 客户/合作方页数据投影拆分

`PartnerManager` 原来同时负责客户与同行的单据归并、等级映射、筛选选项和表格行构造。本轮新增 `usePartnerData`，把这些纯数据投影集中到一个可复用 hook：

- 根据客户/同行名称与联系方式归并采购、销售单据，保留交易数量、交易金额和常交易型号计算。
- 统一客户等级、核心客户 S 级约束、同行类型和风险标记的列表投影。
- 统一当前页签、关键词、类型、来源和等级筛选，以及等级统计。
- `PartnerManager` 只保留弹窗状态、创建/更新/删除/导入命令和页面组合；表格、筛选面板和等级面板继续通过 props 消费结果。

本次不改变 CRM 数据结构、API、权限或导入导出格式，后续 CRM 列表和详情页可直接复用同一投影逻辑，避免再次复制客户/同行匹配规则。

## 2026-08-05 库存指标投影拆分

库存页继续保持“容器负责命令，hook 负责事实投影”的边界：新增 `useInventoryMetrics`，统一承载动态品牌选项、筛选后的单卡列表、昨日对比、风险数量和库存健康分。`InventoryManager` 仍负责服务端分页、扫码/批量变更、导入导出、抽屉和弹窗状态，子组件仍只接收页面数据与回调。

这样可以让库存汇总卡、AI 侧栏和未来库存首页复用同一套风险与金额计算，避免在页面展示组件里重复扫描库存或自行推导经营数字；本轮不改变库存筛选条件、分页请求、库存命令或权限行为。

## 2026-08-05 采购录单页草稿与金额模型拆分

采购录单页已经有独立的表头、商品明细、付款侧栏、备注、粘贴导入和合作方弹窗；本轮继续把两个容易被重复使用的业务模型抽出：

- `usePurchaseDraft`：按当前账号保存/恢复采购草稿，处理自动保存、编辑单据时禁用草稿恢复和清理提示。
- `usePurchaseTotals`：统一过滤有效明细、数量展开、采购成本、预估销售额和预计毛利，供明细表、付款汇总和提交命令共同消费。

`PurchaseInvoice` 仍保留采购单状态、合作方选择、单据编辑、风险确认和最终 store 命令；本次不改变草稿格式、金额规则、库存拆卡、付款流水或路由行为。

## 2026-08-05 采购商品搜索交互拆分

新增 `usePurchaseProductLookup`，集中管理采购明细中的商品模板索引、延迟搜索、库存数量提示、浮层定位、点击外部关闭和模板套用。采购容器只传入商品/库存事实与字段更新回调，`PurchaseItemsTable` 继续保持纯展示。

这样可以让销售录单或后续快速入库页面复用同一套商品搜索体验，避免各页面重复实现浮层定位和大商品库筛选；本次不改变商品模板选择结果、价格回填、库存提示或新增商品流程。

## 2026-08-05 采购录单弹层编排拆分

新增 `PurchaseInvoiceOverlays`，统一编排采购录单使用的三个瞬时界面：合作方快速新建、商品模板快速新建和 Excel/微信批量粘贴。它只负责把已有弹窗/抽屉组件组合起来，并通过 props 接收状态与回调；`PurchaseInvoice` 继续持有创建合作方、创建商品模板、批量解析和关闭动作等业务逻辑。

这样主页面的 JSX 不再重复堆叠多个浮层，后续新增采购录入辅助界面时可以在一个明确的编排边界内扩展，同时保持现有 API、路由、权限、校验、图片压缩和提交行为不变。

同批新增 `usePurchasePartnerForm`，把个人客户/同行快速创建的表单状态、目标类型初始化和创建后自动选中逻辑从页面容器移出。它只依赖现有 `createCustomer`、`createVendor` 命令，并通过 `onPartnerSelected` 把统一的合作方结果交回采购页；客户等级、同行类型和原有来源规则保持不变。

## 2026-08-05 退货确认与编辑弹窗拆分

新增 `ReturnDialogs`，将退货预览确认和退货单编辑两个展示层从 `ReturnManager` 中抽出。弹窗只接收已经计算好的金额预览、单据摘要和字段回调，不参与退款、抵扣、直接冲销或库存状态计算；退货容器继续负责服务器校验、并发失败处理和删除冲销命令。

这保证退货金额解释和编辑限制在销售退货、进货退货及历史记录视图之间保持一致，也让后续优化退款 UI 时不会触碰核心结算规则。

## 2026-08-05 行情参考表单拆分

新增 `MarketQuoteFormModal`，统一承载行情参考价的新建/编辑表单。行情页容器继续负责参考价命令、趋势计算、筛选分页和导入导出；表单组件只接收字段值与回调，并保留编辑时不可修改型号/品牌、趋势和价格字段的原有行为。

## 2026-08-05 退货工作区拆分

新增 `PurchaseReturnWorkspace` 和 `ReturnWorkspacePrimitives`：

- `PurchaseReturnWorkspace` 负责进货退货的步骤布局、库存选择、结算方式、记录筛选和导出入口。
- `ReturnWorkspacePrimitives` 统一退货页面的标题、步骤、摘要卡、金额行和搜索栏视觉结构。
- `ReturnManager` 继续持有退货预览、退款/抵扣/直接冲销判断、服务器命令和弹窗状态，只向工作区传递数据与回调。

本次不改变退货金额计算、供应商抵扣余额、整单直接冲销限制、库存处理或历史单据兼容逻辑；销售退货和统一退货记录继续复用同一组页面原语。

## 2026-08-05 财务收付款旧分支清理

`SettlementFinance` 的收款/支出页面已经统一由 `NonOperatingFinancePage` 承载，容器中原来保留的旧 `FinancePaymentTable` 渲染函数、重复收付款弹窗状态、批量删除逻辑和付款过滤投影均不可达。本轮移除这些旧分支，并将 `useFinanceFilteredRecords` 收敛为账户流水与资金调拨两类仍在使用的筛选投影。

这不会改变收付款页面的录入、编辑、图片、删除或账户流水逻辑；只是避免财务容器同时维护两套收付款实现，减少后续 UI 和规则分叉。

## 2026-08-05 销售商品库存目录拆分

新增 `useSalesInventoryCatalog`，把销售开单页中与商品选择相关的事实投影集中起来：

- 可售库存过滤、按商品身份归并库存成本和数量。
- 排除其他待出库销售单后的商品预占量，编辑当前销售单时不重复占用自身库存。
- 从历史库存自动索引缺失的商品模板，并生成统一的商品搜索选项。

`SalesManager` 仍负责客户、收款、草稿和最终销售单命令；`SalesItemsTable` 只消费 hook 输出的商品选项、库存统计和身份解析器。此次拆分不改变库存预占、售价回填、销售出库或权限逻辑，后续采购/销售共用商品目录时可复用同一身份解析边界。

## 2026-08-05 销售录单草稿拆分

新增 `useSalesDraft`，与采购录单保持同一草稿边界，统一负责当前账号的销售草稿键、自动保存、恢复、清理和编辑单据时的禁用策略。销售容器只组装 `SalesDraftData` 并提供恢复时的字段回填回调；草稿序列化格式、提示文案和保存时机保持不变。

同时把 `isSalesItemFilled` 放入草稿/销售录单共用出口，金额计算和提交校验继续使用同一“有效明细”规则，避免页面和草稿 hook 各自判断一遍。

## 2026-08-05 采购编辑回填与单据列表视图拆分

采购录单新增 `usePurchaseInvoiceEditor`，集中处理编辑单据时的合作方匹配、付款字段回填、明细默认库位以及 SQL 媒体 URL 的异步读取。页面只负责把回填结果写入本地表单状态，提交、金额计算、图片压缩和库存命令保持不变。

单据列表新增 `InvoiceDetailPanel` 与 `InvoiceEditModal`：详情工作区和历史单据编辑弹窗分别拥有自己的展示边界，`InvoiceList` 继续持有筛选、排序、删除、打印和保存命令。详情面板仍使用共享 `WorkspacePanel`，编辑弹窗仍使用共享 `Modal`，没有改变路由或权限行为。

员工提成页新增 `CommissionAnalyticsCards`，抽出趋势、计算方式构成、员工排名和异常提醒四个纯展示卡。采购/销售提成仍共用同一页的筛选与金额投影，分析卡只接收已经计算好的点位和汇总数据，不会重复读取单据或改动结算状态。

员工权限页新增 `AdminPermissionComponents`，把成员详情面板、权限指标、成员单元格、角色徽章和权限输入控件移出 `AdminSettings`。容器继续负责账号查询、草稿状态、权限保存和审计加载，详情组件只通过回调修改草稿，不改变权限规则或菜单数据来源。

日期控件新增 `DateRangePickerCalendar`，负责单日/范围模式的月份导航、DayPicker 月历和确认/取消底栏；`DateRangePicker` 保留快捷预设、自然语言输入、焦点恢复与值提交。日期边界和现有回调契约不变，日历展示不再与触发器状态耦合。

TanStack 表格新增 `TanStackDataTableChrome`，承载列显示菜单和分页底栏。`TanStackDataTable` 继续持有排序、虚拟滚动、固定列和数据投影，分页/列设置的视觉与交互边界可以被其他表格适配复用。
