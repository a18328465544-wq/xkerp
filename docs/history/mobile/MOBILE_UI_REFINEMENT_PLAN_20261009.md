> **已归档**：本文是实施过程记录，规则已合并进 [docs/MOBILE_UI_RULES.md](../../MOBILE_UI_RULES.md)，两者冲突时以 MOBILE_UI_RULES.md 为准。

# 移动端 UI 精修方案（2026-10-09）

> 执行人：Gemini
> 代码基线：`cderp/main` @ `9b517df`（请从这个提交新建分支，例如 `mobile-ui-refine`）
> 来源：在 390×844 视口下逐页实测得到的审查结论。截图环境见第 1 节。

---

## 0. 必读约束（违反任一条视为任务失败）

1. 先读 `AGENTS.md`、`docs/UI_DESIGN_RULES.md`（尤其第 6 节和第 7 节「移动产品呈现 V2」）、`docs/MOBILE_CONTROL_SYSTEM_20261009.md`。
2. **只改呈现层**：不碰 `server/`、`src/utils/state.ts`、任何 API 适配器、schema 和业务计算。表单字段名和提交数据结构保持不变。
3. **桌面端零变化**：所有改动必须限定在手机端，用 `useErpPhone()` 判断，或放在 `globals.css` 已有的手机媒体查询块里。每完成一个任务，都要在 1440 宽度下抽查被改页面是否和改动前一致。
4. **优先复用现有组件**：`ErpMobileRecordRow`、`ErpMobileActionDock`、`ErpDialogShell mobilePresentation="sheet"`、`ErpStatusBadge`、`ErpEntityThumbnail`、`ErpPageHeader`。不要新造同类组件。
5. **参考实现**是 `src/features/customers/pages/CustomerDirectoryPage.tsx` 的手机分支。它是目前手机列表页的最佳范例，后面说「按客户页模式」都指它。
6. 每个任务单独提交一个 commit，commit message 写明任务编号，例如 `fix(mobile): T1 sales list phone pattern`。
7. 每个阶段结束后运行 `npm run lint` 和 `npm test`，全部通过才能进入下一阶段。

---

## 1. 本地预览方法（不连数据库、写操作全部拦截）

```bash
npm ci
npx vite --port 3010 --strictPort --host 127.0.0.1
# 另开一个终端：
ERP_MOBILE_QA_PORT=3022 ERP_CUSTOMER_QA_SCENARIO=design ERP_INVENTORY_QA_SCENARIO=design python3 scripts/mobile-preview-server.py
```

用浏览器打开 `http://127.0.0.1:3022`，视口设为 390×844。需要验证长文本时，可以把场景换成 `stress`；验证翻页用 `many`；验证空数据用 `empty`。

---

## 2. 总体问题

首页、开单表单、库存、客户、质检这几页是专门为手机设计的，质量很好。其余列表页和财务页还是通用表格自动转出来的卡片：桌面控件直接搬到手机上，排版断裂，和精修页明显是两套产品。

**本方案的目标是把这些页面统一到「客户页 / 库存页」的水准。**

| 阶段 | 内容 | 任务 | 优先级 |
|---|---|---|---|
| 一 | 列表页统一 | T1–T4 | P1 |
| 二 | 财务页 | T5–T7 | P1 |
| 三 | 导航 | T8–T12 | P1/P2 |
| 四 | 一致性与细节 | T13–T18 | P2/P3 |

---

## 阶段一：列表页统一（P1）

### T1：单据列表页改成「客户页模式」

**涉及文件**
- `src/features/sales/pages/SalesListPage.tsx`
- `src/features/purchase/pages/PurchaseListPage.tsx`
- `src/features/returns/pages/SalesReturnListPage.tsx`
- `src/features/returns/pages/PurchaseReturnListPage.tsx`

**现状**：这几页已经传了 `mobileRow`，但还有以下问题：
- 外面多套了一层卡片，标题栏写着「2 条记录 / 排序」。
- 底部还是完整分页「共 2 条 + 1/1 + 20/页」。
- 同一个数量显示了三次：「2 单」「2 条记录」「共 2 条」。
- 页头有「刷新」和「+ 新建销售单」两个按钮，搜索框单独占一张卡片。

**改法**：逐项对照 `CustomerDirectoryPage.tsx` 来改。
1. `ErpDataTable` 加上 `surface={phone ? "plain" : "card"}` 和 `mobilePagination="compact"`。
2. 加 `mobileToolbar`：左侧放快捷筛选（全部、待出库、待收款、已完成，沿用页面现有的筛选值），右侧放排序按钮（调用 `openSorting`）。删掉页面顶部原有的胶囊筛选行，不要两处并存。
3. 页头在手机上只保留：标题加一行小字（例如「2 单」，数量只在这里出现一次），右侧放「筛选」按钮（`variant="secondary"`，有生效筛选时显示数字角标）。
4. 高级筛选字段、每页条数、刷新，全部移进 `ErpDialogShell mobilePresentation="sheet"` 打开的筛选面板。
5. 搜索框和「新建」按钮放进 `ErpMobileActionDock`。
6. 手机上不再显示「刷新」按钮，靠已有的下拉刷新。
7. 「已收款 · 待出库」这类状态，不要再用纯文本 `<span>`，改成 `ErpStatusBadge`。只显示最需要用户处理的那一个状态，比如待出库优先于已收款，另一个状态挪到 meta 行。

**验收**
- 手机上数量只出现一次，翻页只有紧凑的上一页 / 下一页。
- 页面里没有「刷新」「列设置」「舒适 / 紧凑」。
- 四个页面的结构和客户页一致。
- 桌面端没有变化。

### T2：`ErpMobileRecordRow` 防止断行

**涉及文件**：`src/components/common/ErpMobileRecordRow.tsx`，以及 `src/styles/globals.css` 中 `.erp-phone-record-*` 相关规则（约 1397 行、1512 行附近）。

**现状**
- 单号会断成「XS-RETURN-MOBILE-」和「001」两行。
- meta 行会把人名拆开，例如「手机测」「试员」。
- 右侧区域因为 `.erp-phone-record-end > :not(svg) { white-space: normal }` 加上 `max-width: 38%`，会把状态和金额挤成多行。

**改法**
- `.erp-phone-record-title`：单行显示，超出部分用省略号（`overflow:hidden; text-overflow:ellipsis; white-space:nowrap`）。
- 给 `ErpMobileRecordRow` 加一个可选属性 `titleMono?: boolean`，单据页传 `true`。开启后使用 `font-variant-numeric: tabular-nums`。
- `.erp-phone-record-meta`：单行省略。
- `.erp-phone-record-end`：金额 `white-space: nowrap`；状态徽章不换行。
- 用 `stress` 场景验证超长商品名和超长 SN。

**验收**：所有使用 `ErpMobileRecordRow` 的页面，标题和 meta 都是单行，金额不换行。`ErpMobileRecordRow.test.tsx` 需要补充对应断言。

### T3：给尚未适配的页面补 `mobileRow`

**现状**：下面这些页面使用了 `ErpDataTable`，但没有传 `mobileRow`，所以走的是通用卡片：每张卡片有「操作」文字链和「查看其余 N 项 + 查看详情」两个按钮，标题会被状态标签挤窄。实测商品库的商品名被挤到约 90px 宽，折成 3 行。

**按以下顺序处理，每页都按客户页模式改（`surface="plain"`、紧凑翻页、`mobileToolbar`、筛选面板、底部搜索栏）：**

| 顺序 | 文件 | 建议的 mobileRow 字段（只用页面已有的数据） |
|---|---|---|
| 1 | `features/products/pages/ProductLibraryPage.tsx` | 标题：商品名；副标题：分类 · 品牌 · 型号；meta：当前库存 N 件；金额：参考回收价；缩略图：商品图片或 `ErpEntityThumbnail` |
| 2 | `features/finance/pages/FinanceLedgerPage.tsx` 和 `features/finance/components/FinanceTableRegion.tsx` | 标题：业务类型或对方名称；meta：时间 · 账户；金额：带正负号，收入和支出用各自的语义颜色；状态：关联单号 |
| 3 | `features/vendors/pages/VendorDirectoryPage.tsx` | 参照客户页：名称、联系方式、应付余额 |
| 4 | `features/order-pool/pages/OrderPoolPage.tsx` | 标题：订单号；副标题：客户；状态：订单状态；金额：订单金额 |
| 5 | `features/crm/pages/CrmWorkspacePage.tsx` | 参照客户页 |
| 6 | `features/aftersales/pages/AftersalesWorkspacePage.tsx` | 标题：商品或 SN；副标题：客户；状态：售后状态 |
| 7 | `features/finance/pages/FinanceAccountsPage.tsx`、`FinanceTransfersPage.tsx`、`FinanceCustomerFundsPage.tsx`、`FinanceCommissionPage.tsx`、`FinanceProfitPage.tsx` | 每行一个主数字（余额、金额或利润）加一行说明 |
| 8 | `features/quotes/pages/MarketQuotesPage.tsx`、`features/assembly/pages/AssemblyWorkspacePage.tsx` | 标题：型号；金额：报价或成本 |
| 9 | `features/settings/pages/SettingsUsersPage.tsx`、`SettingsLogsPage.tsx`、`BackupPage.tsx` | 用户页：姓名、角色、启用状态；日志页：动作、操作人 · 时间；备份页：文件名、时间、大小 |

**字段确实无法确定时**，用列定义里 `phoneRecordFieldPriority` 排在最前面的字段，不要编造字段。

**验收**：手机上以上页面都不再出现通用卡片，也就是 DOM 中 `data-erp-region="mobile-card-header"` 的数量为 0。

### T4：加固通用卡片兜底，并加一条检查规则

**涉及文件**：`src/components/common/ErpDataTable.tsx`、`scripts/check-ui-contracts.mjs`（或者 `check-frontend-rules.mjs`，选更贴切的那个）。

**改法**
1. 通用卡片在手机上，如果有 `onRowClick`，就让整张卡片可以点击，删掉「查看详情」按钮。
2. 「查看其余 N 项」改成卡片底部一个小的展开箭头（`ChevronDown`，点击区域 44×44）。
3. 「操作」文字按钮改成 `MoreHorizontal` 图标按钮（`size="iconTouch"`，`aria-label` 保持不变）。
4. 在检查脚本里加一条规则：`src/features/**` 下使用 `<ErpDataTable` 的页面，必须传 `mobileRow`，或者显式传 `mobileMode="table"` 并写注释说明原因。`DesignSystemPage` 和 `ErpProductLedgerDrawer` 可以加入白名单。

**验收**：`npm run lint` 包含这条新规则并且通过；`ErpDataTable.test.tsx` 覆盖整卡点击。

---

## 阶段二：财务页（P1）

### T5：账户流水页在手机上调整信息顺序

**涉及文件**：`src/features/finance/pages/FinanceLedgerPage.tsx`

**现状**
- 4 张 `SummaryCards` 各占一整行（第 118 行写的是 `grid-cols-1`），加起来约 450px。
- 往下依次是筛选、收支趋势、支出占比（没有数据时也有约 250px 的空状态）。
- 真正的流水明细要滑很久才看到。
- 页面底部的「账户信息」（`LedgerAside`）后面还有大片空白。

**改法**（仅手机端）
1. `SummaryCards` 改成 `grid-cols-2`，手机上给 `ErpMetricCard` 传 `variant="compact"`（组件已支持）。去掉「较上期按筛选结果」这句 detail。
2. 顺序调整为：数据卡（2×2）→ 流水明细（使用 T3 的 `mobileRow`）→ 一个「收支分析」折叠区，默认收起，展开后显示 `TrendCard` 和 `ExpenseShareCard`。
3. `ExpenseShareCard` 没有数据时，在手机上直接隐藏。
4. 筛选条件（账户、类型、方向、日期、高级字段）和 `LedgerAside` 的账户切换都移进筛选面板。页头只保留标题和「筛选」「导出」两个按钮。
5. 去掉手机上的「刷新」按钮（`FinanceLedgerHeader`，第 114 行）。
6. `TrendCard` 里的 `Select className="w-24"`（第 136 行）会把「近30天」折成两行，改成 `w-28` 并加 `whitespace-nowrap`。这一点桌面端也可以一起修。

**验收**
- 手机首屏能看到数据卡和至少 2 条流水。
- 没有数据的图表不占位置。
- 桌面端布局不变（只修 Select 宽度）。

**同类页面**：财务总览、利润、往来账款等页面也要检查是否存在「图表压在列表前面」的问题，按同样的顺序处理。

### T6：财务总览的细节

**涉及文件**：`src/features/finance/components/FinanceDashboardWidgets.tsx`、`FinanceDashboardRegions.tsx`

- 「资金健康度」的环形图（健康分）在手机上改成一行：「健康 · 100 分」加 3 个勾选项横向排列，不要再画大环形图。
- 金额为 0 时一律用中性色。现在「今日收入 ¥0」显示成绿色，零值不应该带正负语义。
- 页头的日期按钮、「记支出」、「···」要和标题在同一行。放不下就只保留「记支出」，日期移进「···」菜单。

### T7：「回到顶部」按钮遮挡内容

**涉及文件**：`src/styles/globals.css` 中 `.erp-phone-scroll-top`（约 1249 行），以及 `src/app/shell/AppShell.tsx`。

**现状**：在账户流水页，回到顶部按钮盖住了合计行（「支出 ¥0.0…」被截断）。

**改法**：按钮的 bottom 定位要算上底部操作栏和提交栏的高度。在 `ErpMobileActionDock` 或 `ErpSubmitBar` 可见时，设置一个 CSS 变量 `--erp-phone-dock-height`，按钮的 bottom 用这个变量加上间距。另外，页面内容底部要留出同等的 padding，保证最后一行内容能完整滚出来。

---

## 阶段三：导航（P1/P2）

### T8：财务页的底部高亮

**涉及文件**：`src/app/shell/mobileNavigation.ts`（`mobileDestinationForPath`）和 `mobileNavigation.test.ts`

**现状**：`/finance`、`/quotes`、`/ai-insights` 被归到首页那一组。用户在账户流水页时，底部亮的是「首页」，会让人困惑。

**改法**：这三个路径归到 `"more"`（也就是「我的」），因为它们的入口就在「我的」列表里。同步更新测试用例。

### T9：Tab 根页面不显示返回箭头

**涉及文件**：`src/components/common/ErpDialogShell.tsx`（第 47 行和第 59 行）

**现状**：「开单」和「我的」两个面板使用 `mobilePresentation="tab"`，左上角会显示返回箭头。但它们是 Tab 根页面，再点一次底部 Tab 就能关闭，不需要返回。

**改法**：当 `mobilePresentation === "tab"` 时，不渲染关闭按钮；`fullscreen` 模式保留返回箭头。标题要左对齐，字号和其他手机页面标题保持一致。

### T10：「我的」页结构

**涉及文件**：`src/app/shell/AppMobileNavigation.tsx`

**现状**：「我的」其实是 38 项全部功能的平铺列表，里面还包含「首页」；个人相关的只有名字和最底部的「退出登录」。

**改法**
1. 列表中去掉 `dashboard`（首页已经在底部 Tab 里了）。
2. 顶部个人卡片里加上版本号：读取 `package.json` 的 `version`，通过 Vite 的 `define` 注入成 `__APP_VERSION__`（目前代码里没有导出的版本常量，需要新加）。右侧放一个「›」，指向个人设置；如果目前没有个人设置页，就不要加这个箭头。
3. 分组标题保持现状，但每组默认只展示前 4 项，多出来的用「展开全部」控制。搜索时全部展开。
4. 「退出登录」保持在最底部，不要改动它的行为。

### T11：每个菜单项使用独立图标，行尾统一用 Chevron

**涉及文件**：`src/config/navigation.ts`（目前第 99 行和第 119 行都使用 `groupIcons[item.group]`）、`src/app/shell/AppSidebarDrawer.tsx`（第 40 行的 `itemIcons`）、`src/app/shell/AppMobileNavigation.tsx`（第 32 行）

**现状**
- 同一组的菜单项共用一个图标，例如「经营看板」组连「首页」都是柱状图，「开单与作业」页全是两种剪贴板图标，用户没法靠图标找功能。
- 行尾用的是蓝色 `ArrowRight`，而库存和客户卡片用的是灰色 `ChevronRight`，两种并存。

**改法**
1. 把 `AppSidebarDrawer` 里的 `itemIcons` 移到 `config/navigation.ts`，让 `NavigationItem.icon` 优先使用按菜单项配置的图标，没有时再退回分组图标。桌面侧栏也改用这个新来源，保证桌面视觉不变。
2. 手机菜单行尾改成 `ChevronRight`，颜色用 `var(--erp-color-text-muted)`，尺寸 16px，和 `ErpMobileRecordRow` 保持一致。

### T12：首页工作台

**涉及文件**：`src/features/dashboard/components/DashboardMobileWorkbench.tsx`

1. **快捷操作**（第 35 行）：`["sales_add","purchase_add","inventory","customers"]` 里后两项和底部 Tab 完全重复，改成 `["sales_add","purchase_add","sales_outbound","inspections"]`，也就是销售开单、采购开单、扫码出库、质检入库。没有对应权限时按原来的过滤逻辑处理。四个图标的底色按语义分配：销售用蓝色，采购用橙色，出库和入库用中性色或绿色。
2. **待处理**：每一行末尾加一个灰色 `ChevronRight`，让用户知道这几行可以点。
3. **最近业务**（第 40 行和第 51 行）：
   - 图标从人形改成单据图标。
   - 主标题改为客户名加金额，副标题改为单号 · 日期。
   - 状态继续用 `ErpStatusBadge`。
   - 在区块标题右侧加一个「查看全部」，链接到 `/sales`。

---

## 阶段四：一致性与细节（P2/P3）

### T13：统一列表页头部

规范如下，写进 `docs/UI_DESIGN_RULES.md` 第 7 节：
- **页头**：标题加一行小字数量；右侧放「筛选」按钮（`secondary`，带角标）。
- **工具栏**（`mobileToolbar`）：左侧放快捷筛选，最多 4 个；右侧放排序按钮。
- **底部栏**（`ErpMobileActionDock`）：搜索框，加上最多一个主操作。

按这个规范调整：
- `InventoryListPage.tsx`：现在的「筛选」是纯文字，改成按钮；「入库时间 ↓」那一行和排序按钮的样式统一。
- 商品库和销售单据页（在 T1 / T3 中一起处理）。

### T14：状态徽章的语义

- 质检页（`src/features/inspections/pages/InspectionWorkspacePage.tsx`）：成色（例如「全新」）不应该放在状态徽章的位置，改为 meta 行里的普通文字；徽章位置只放流程状态（例如「待检测」）。
- 客户等级（`src/features/customers/customer.columns.tsx` 第 8 行 `customerLevelTone`）：S 级和 A 级现在都是 `info`，看不出区别。建议改为 S 级 `info`、A 级 `success`、B 级 `neutral`、C 级 `warning`、R 级 `danger`。**这一项桌面端也会跟着变，先列为待确认，由产品负责人同意后再合并。**

### T15：去掉手机上的「刷新」按钮

运行 `grep -rln "刷新" src/features` 找出所有相关页面。手机上统一隐藏「刷新」按钮（已有下拉刷新）；需要的话，可以在筛选面板里保留一个刷新入口。桌面端保持不变。

### T16：底部栏占用高度

- **库存页**：现在底部是搜索框、两个大按钮，再加 Tab 栏，约 175px，一屏只能看到 3 张多卡片。改成一行：搜索框加扫码图标按钮。「质检入库」「扫码出库」移到页头右侧的「+」菜单（用 sheet 弹出）。
- **客户页**：「新建客户」不是高频操作，不应该做成整行主按钮。改成页头右侧的「+」图标按钮，底部栏只保留搜索。
- **可选**：列表向下滚动时自动收起底部栏，向上滚动时重新出现。注意 `prefers-reduced-motion`。

### T17：文案与表单细节

| 位置 | 现状 | 改为 |
|---|---|---|
| `src/app/shell/WorkspaceTabKeepAlive.tsx:71` | 「正在打开页面 / 只加载当前页面所需的资源。」 | 只保留骨架屏，或者显示「加载中…」 |
| `NewSalesOrderPage.tsx:283`、`NewPurchaseOrderPage.tsx:296` | 「草稿 · 切页保留」 | 「已自动保存草稿」 |
| `NewSalesOrderPage.tsx:309`（结算步骤） | 「本次收款」出现两次（分段控件的标题和下方明细行） | 分段控件的标题改成「收款方式」 |
| 同上 | 勾选框「不开票」「到付自理」是否定式表述 | 改成开关「开发票」「运费到付」，具体要求见下方 |

**关于最后一项的警告**：只改展示方式。表单字段名和值的含义保持不变，开关状态等于原字段取反。必须补一个单元测试，证明提交的数据和改动前完全一致。`SalesEditPage.tsx:234` 也要同步修改。

### T18：Recharts 属性泄漏到 DOM

**现状**：控制台有 8 条 React 警告，`verticalAlign`、`wrapperStyle`、`iconSize`、`chartWidth` 等属性被传到了 DOM 元素上。

**涉及文件**：`src/components/ui/chart.tsx`（约 134 行，`ChartLegend` / `ChartLegendContent`，以及 Tooltip 相关部分）

**改法**：把 Recharts 注入的这些属性显式解构出来，不要用 `...props` 透传到 `<div>` 上。

**验收**：打开任意含图表的页面，控制台没有 `React does not recognize` 警告。

---

## 3. 不在本次范围（需要用真实数据确认，不属于 UI 问题）

- 销售单据统计显示「待出库 0」，但列表里有一单是「待出库」。
- 账户流水：期初 0、收入 150、支出 0，期末却是 10,000。

这两处很可能只是预览假数据不一致造成的。请用真实环境验证；如果确认是 bug，单独开 issue，**不要在本次修改中顺手改业务逻辑**。

---

## 4. 总验收清单

每个阶段完成后逐项打勾：

- [ ] `npm run lint` 通过（包含 T4 新增的检查规则）
- [ ] `npm test` 通过
- [ ] 390×844 视口下截图以下页面，并放到 PR 描述里：首页、开单面板、我的面板、销售开单两步、库存、客户、销售单据、采购单据、商品库、账户流水、财务总览、质检入库
- [ ] 使用 `stress` 场景验证库存和客户页：长文本单行省略，没有横向滚动
- [ ] 使用 `empty` 场景验证：空状态居中，没有大片空白
- [ ] 1440×900 视口下抽查被改动的页面，和改动前一致
- [ ] 控制台没有新增 error 或 warning
- [ ] 如果视觉回归脚本 `npm run check:visual` 因为手机端的预期改动失败，可以更新基线，但要在 PR 里逐项说明；桌面端基线不允许变化

## 5. 交付方式

- 每个阶段提一个 PR：阶段一、二、三、四，共 4 个。
- PR 描述包括：改了哪些任务、改动前后截图对比、验收清单勾选情况。
- 不要部署。部署只能由仓库负责人明确说「上线」后再执行（见 `AGENTS.md`）。
