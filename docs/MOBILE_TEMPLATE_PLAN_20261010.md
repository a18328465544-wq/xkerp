# 手机端整体改造方案：页面模板化（2026-10-10）

> 给 Codex 的执行方案。目标是把「每个页面自己写一套手机版」改成「页面只交数据，手机版由模板统一生成」。
> 改完以后，改一条手机规则只需要改一个模板；新页面套上模板，手机版就自动符合 [MOBILE_UI_RULES.md](MOBILE_UI_RULES.md)。

---

## 进度（2026-10-10）

按现有 `mobile-templates` 分支继续完成；没有从 `pr3` 新开分支。第一阶段 T1–T5 与第二阶段 T6–T10 均已完成：

- **T1**：`MetricsRegion` 会展开 Fragment；M18 检查能识别「卡片写在变量里」和 `ErpListPage metrics={[…]}`。员工提成页恢复成一行 4 列。
- **T2**：`ErpDataTable` 支持 `mobileRow="columns"`，按列定义的 `meta.mobile` 角色生成手机行；`meta.mobileCell` 用来单独写手机上的显示（电脑端单元格太复杂时用）。类型声明在 `src/components/common/tableMeta.d.ts`。
- **T3**：`ErpFilterFields` / `ErpFilterField[]`，`countActiveErpFilterFields` 计算生效筛选数量。**重置由页面传 `onResetFilters`**：逐个字段调用 `onChange` 会因为闭包里的旧状态互相覆盖，所以不这样做。
- **T4**：`ErpListPage`（`src/components/common/page-templates/ErpListPage.tsx`）。手机主操作统一放进底部栏，符合 M13。
- **T5**：`ErpRecordDetail`。电脑端是一张两列字段网格，手机端是单列文档，可以折叠分组。
- **T6**：客户页与供应商/同行页使用 `ErpListPage`；客户和供应商详情沿用既有业务组件，未迁移业务逻辑。
- **T7 单据列表**：采购、销售、采购退货、销售退货列表已迁移；保留桌面结果摘要、退货列表的分页选项，以及详情、结算、导出、删除、作废/完成和权限行为。
- **T8 商品与库存**：商品库、订单池、库存中心迁移到 `ErpListPage`。商品库与订单池使用模板表格；库存保留单卡/SN与型号汇总的领域表格，通过专用插槽接入模板，搜索、筛选、扫码、选择、分页和权限路径保持原有控制器。
- **T9 财务明细**：`FinanceDetailPageLayout` 与 `FinanceEntryPageLayout` 改为薄封装 `ErpListPage`；账务流水、退货对账、员工提成、往来账款及收支/调拨继续保留专用表格、分析区和业务操作。模板可保留财务、分析语义框架及既有区域顺序。
- **T10 设置**：员工权限和操作日志使用 `ErpListPage`，详情抽屉、权限编辑、刷新和分页保留。

**合并复查（2026-10-10，`merge/mobile-templates`）**：

- **T9 已撤销**（41a589a），原因有两条：
  - 财务页只是把外壳换成了模板，页面里的手机分支几乎没减少（账户流水从 27 处降到 22 处，其余几页没变）。
  - 手机端出现了退化：
    - 标题下的条数没了，筛选按钮被挤到单独一行。
    - 页签和卡片贴住了屏幕边缘，因为财务页被套上了列表页的通栏布局。
    - 收支页的搜索框被藏进了筛选面板。
    - 往来账款默认就显示「筛选 1」。

  财务页需要重新设计手机版式后再迁移：搜索要留在页面上，页头要带条数，不能套用通栏布局。
- **模板修正**：
  - 手机列表页不再显示「查看统计」这一行（它会把列表往下挤；库存页还会因此出现两行统计）。
  - 筛选栏字段没写宽度时默认 `w-36`，修复了员工权限页下拉框撑满整行的问题。
  - 订单池电脑端恢复「新建协同订单」，手机端仍是「新建订单」。
- **电脑端与合并前的差异**（表格内容一致）：
  - 「重置筛选」统一改成「重置」，没有筛选时也能点。
  - 筛选栏位置偏移几个像素。
  - 采购退货、销售退货的「导出当前页」从页头移到了筛选栏。
  - 商品库的表格标题处多了「共 N 条」。
  - 同行页去掉了「筛选、排序和分页仅作用于已加载同行集合」这句说明，「当前页 1 / 共 N」改成了「共 N」。
  - 员工提成页的数据卡改成一行 4 列，这是 T1 的预期修复。
- **手机端与合并前的差异**：
  - 销售、采购、退货、同行、商品、订单池、员工改成通栏列表，和客户页一致。
  - 新建按钮统一放到底部主按钮。
  - 库存页的「扫码」从搜索框旁边的小图标改成了底部主按钮。

**第三阶段（2026-10-10，`mobile/phase3`）**：

- **财务 11 页全部去掉页面级手机分支**：
  - `FinanceDetailPageLayout` 现在负责手机和电脑两种布局，手机上可以把表格前的分析区折叠到表格后面（`phoneFoldBeforeTable`）。
  - 新增 `ErpDataTable surface="responsive"` 和 `ErpMetricCard variant="responsive"`。
  - 手机端变化：账户流水与其他财务页统一为「页面里一排搜索和筛选 + 带条数的表格卡片」；财务核对换上 F6 新版布局；销售毛利补齐 4 张核心卡；去掉「暂无」占位卡和空的「近期往来趋势」。
  - 电脑端：截图逐像素一致。
- **T11 详情**：
  - 新增 `ErpRecordPage`（详情页外壳），销售单详情、采购单详情已迁移。
  - 销售单的列表抽屉和详情页共用一份 `ErpRecordDetail`。
  - 采购单详情的电脑端信息结构更丰富，通过 `phoneBody` 明确传入手机正文。
  - 手机端：截图一致。电脑端销售单详情改为状态行加一张两列字段网格。
- **T12**：售后维护、客户 CRM 迁到 `ErpListPage`，模板新增 `pageActions`。AI 分析、报价、组装、备份去掉了只为隐藏刷新而写的分支。
- **页头修复**：`ErpPageHeader` 在手机上只剩一个次要操作时，不再把刷新按钮带出来。
- **剩余 6 个例外**（都写明了原因）：
  - 首页：手机端是独立工作台，属于有意的差异。
  - 检测质检、销售出库：手机端是任务流，属于有意的差异。
  - 采购开单、销售开单：T14，同一组表单字段在两端挂的位置不同，需要 `ErpMobileWorkflow` 支持按步骤放置内容，并跑 `test:forms-browser`。
  - 库存：另一项改动正在修改这个文件。
- **数量**：页面级手机分支从 122 处降到 59 处（改造前为 244 处），`useErpPhone` 页面从 26 个降到 6 个。
- **已知问题（不是本轮引入的）**：`test:forms-browser` 中 `browser-purchase-draft-media.py`、`browser-order-submission.py`、`browser-return-amounts.py` 三个脚本在 main（`6fa7029` 起）就已失败，已单独记录待修。

**第四阶段（2026-10-10）**：

- **T14 开单页**：
  - 新增 `ErpTransactionHeader`（开单页页头）。
  - 新增 `ErpMobileWorkflowPhone` / `ErpMobileWorkflowDesktop`：在两步流程里按设备放置内容，每个表单字段仍然只挂载一次。
  - `ErpSubmitBar` 新增 `phoneSubmitLabel`、`phoneSummary`。
  - 销售开单已合入 main；采购开单在 `mobile/t14-purchase`。
  - 两页在 390 / 1024 / 1440 下截图和改前完全一致。
- **表单浏览器测试已修好**：
  - `test:forms-browser` 全部通过（214 个场景），`test:mobile-browser` 通过。
  - 失败原因是测试过时：采购账户叫「付款账户」；来源输入框的角色是组合框；手机附件在结算步骤里；库存扫码改成了底部主按钮。
  - 开单提交和退货金额两个脚本改为只测电脑宽度，手机两步流程由 `test:mobile-browser` 覆盖。
- **T16 样式清理**：删掉迁移后已经没有页面使用的选择器，放在 `mobile/css-cleanup`。库存相关的选择器等库存改动完成后再清。
- **`ErpRecordPage` 补了单元测试**，测的是手机上操作的放置逻辑。
- **待合入**：main 上另一项改动正在修改 `NewPurchaseOrderPage.tsx` 和 `globals.css`，还没提交。等它提交后，再把 `mobile/t14-purchase` 和 `mobile/css-cleanup` 变基合入。
- **例外**：main 上现有 5 个；采购开单合入后剩 4 个，即首页、检测质检、销售出库、库存。

**验证**：当前 `mobile-templates` 工作树前端类型检查与全量 lint 通过；当前代码快照的全量测试为 1595 通过、37 跳过、0 失败；当前工作树隔离预览的手机浏览器规则检查为 38 个页面 × 320/390px 全部通过；本地前端构建通过。没有执行生产部署。

迁移时可以直接参考两个文件：

- `src/features/customers/pages/CustomerDirectoryPage.tsx`：模板的用法。
- `src/features/customers/customer.columns.tsx`：`meta.mobile` 和 `mobileCell` 的写法。

## 0. 约束（必读）

1. **基线分支**：从 `mobile-templates` 分支（3b81ea8）接着做。这个分支基于 `codex/finance-desktop-pr3`，已经包含 CI 修复 `8c605cf`，以及第一阶段全部公共部件和客户页样板（见下面的「进度」）。main 合并以后，再 rebase 到 main 上。
2. **不改业务**：不改路由、查询、接口、DTO、校验、权限、金额和库存计算（MOBILE_UI_RULES M2）。这次只改「页面怎么拼」。
3. **电脑端不能变**：1440 和 1024 两个宽度下，迁移前后的截图必须一致（见第 5 节）。确实需要改的，要在 PR 里逐条列出。
4. **不碰扫码相关文件**：main 上有人正在改扫码功能，还没提交：`AppShell.tsx`、`AppSidebar.tsx`、`tokens.css`、`globals.css` 里的扫码部分、`scripts/browser-barcode-scanner.py`。这些文件不要动，避免冲突。
5. **不部署**：没有用户明确说「上线 / 部署」，不推送生产仓库，也不发布。
6. **提交方式**：一个任务一个提交，提交信息写任务编号，例如 `refactor(mobile): T4 migrate customer list to ErpListPage`。

## 1. 现状与根因

以 `codex/finance-desktop-pr3` 的代码统计：

| 指标 | 数量 |
|---|---|
| 业务页面（`src/features/*/pages`） | 41 |
| 自己调用 `useErpPhone()` 的页面和组件文件 | 43 |
| 页面里的「手机 / 电脑」分支（`phone ?`、`!phone &&` 等） | 244 |
| 页面外框种类（`Erp*PageFrame` / `Finance*PageLayout`） | 11 |
| 页面专属的手机 CSS 选择器（`.erp-customer-*`、`.erp-inventory-*` 等） | 35 |
| 手写 `mobileRow` 的表格 | 30 / 33 |

**根因**：MOBILE_UI_RULES 第 4 节定义了 4 种页面模板（M13–M16），但这些模板只存在于文档里，没有变成组件。每个页面都要照着文档自己拼一遍手机版。

以参考实现客户页 `CustomerDirectoryPage.tsx` 为例，这一页就有 15 处手机分支，包括：

- 手机标题和计数（`erp-customer-phone-title`）
- 手机搜索框的提示文字
- 表格外观（`surface={phone ? "plain" : "card"}`）
- 快捷筛选（`mobileToolbar`）
- 手机行（`mobileRow`）
- 底部搜索栏（`ErpMobileActionDock`）和它的隐藏条件
- 手机筛选面板（`ErpDialogShell sheet`）
- 筛选角标的计数
- 详情抽屉的手机版文档布局

这些代码在 16 个列表页里各写了一遍，每页写法还略有不同。结果就是：

- 规则改一条，要改几十个页面。
- 每一页都可能漏一处。员工提成页数据卡竖排、筛选角标不一致，都是这样出来的。

**开单类页面已经基本统一**：采购、销售、退货和编辑页都在用 `ErpMobileWorkflow`、`ErpMobileOrderLine` 和 `ErpSubmitBar`，这次不作为重点。

## 2. 目标结构

页面只描述「有什么」，模板决定「在电脑和手机上分别怎么摆」。新增 5 个公共部件：

### 2.1 `ErpListPage`：列表页模板（对应 M13）

位置：`src/components/common/page-templates/ErpListPage.tsx`。

```tsx
<ErpListPage
  title="客户档案"
  phoneTitle="客户"                              // 可选，默认等于 title
  subtitle="集中维护个人客户的身份、等级、联系方式和往来余额。"
  countLabel={(total) => `${total} 位客户`}     // 手机页头下的小字，全页只出现一次
  status={{loading: query.isPending, error: query.error}}
  quickStatus={quickStatus}                      // 只放待办（M17）
  metrics={[<ErpMetricCard … />, …]}             // 数组，最多 4 个；手机端默认不显示
  tabs={…}                                       // 可选：财务分类页签等
  search={{value, onChange, placeholder, phonePlaceholder}}
  filters={filterFields}                         // 见 2.3，同一份定义生成桌面筛选栏和手机筛选面板
  quickFilters={[{label: "全部", active, onSelect}, …]}  // 手机快捷筛选，最多 4 个
  primaryAction={{label: "新增客户", icon: <Plus />, onClick: openCreate}}
  secondaryActions={[{label: "导出", icon: <Download />, onClick: exportCsv}]}  // 桌面放页头；手机收进筛选面板
  table={{columns, data, total, page, pageSize, sorting, …}}   // 原样传给 ErpDataTable
  tableTitle="个人客户明细"                      // 桌面表格卡片的标题
  analysis={…}                                   // 可选：财务模板 A 的折叠分析区
  overlays={<>{detailDrawer}{dialogs}</>}
  overlayOpen={Boolean(detail || dialogOpen)}    // 有浮层打开时隐藏底部栏（M24）
/>
```

模板内部负责的事情（页面里不再出现这些代码）：

| 部分 | 电脑 | 手机 |
|---|---|---|
| 页头 | 标题、副标题、待办标签、主操作和次要操作 | 标题加计数小字；右侧「筛选」按钮（`secondary`），有生效筛选时显示数字角标 |
| 数据卡 | `MetricsRegion` 一行 | 不显示，或者用 `ErpMobileSummary` 折叠 |
| 筛选 | `ErpFilterBar`：搜索 + 字段 + 重置 | 快捷筛选放在 `mobileToolbar`；其余字段、每页条数、导出放进 `ErpDialogShell mobilePresentation="sheet"` |
| 表格 | `DashboardSection` 加卡片表格，带列设置和密度切换 | `surface="plain"`、`mobilePagination="compact"`，每行用 `ErpMobileRecordRow` |
| 底部 | 无 | `ErpMobileActionDock`：搜索框加最多 1 个主操作，有浮层时隐藏 |

`FinanceDetailPageLayout`（模板 A）改成在 `ErpListPage` 上加一层薄封装，保留它现在的插槽顺序和折叠分析区。

### 2.2 列定义直接生成手机行：`meta.mobile`

在 `ErpDataTable` 的列定义上声明每一列在手机行里的角色。没有传 `mobileRow` 时，表格按这些角色自动拼出 `ErpMobileRecordRow`。

```ts
// src/types/table-meta.d.ts
declare module "@tanstack/react-table" {
  interface ColumnMeta<TData, TValue> {
    mobile?: "title" | "subtitle" | "meta" | "amount" | "status" | "thumbnail" | "hidden";
    mobileLabel?: string;  // amount 的小标签，例如「毛利」「应收」
    mobileMono?: boolean;  // 单号用等宽字体
  }
}
```

规则如下：

- `title` 只能有 1 个。
- `meta` 可以有多个，按列顺序用「 · 」连接。
- 没有声明 `mobile` 的列，在手机上不显示。
- 行点击沿用 `onRowClick`。
- 有特殊行布局的页面（库存、开单选择器）仍然可以手写 `mobileRow`，手写的优先。

做完以后，大多数列表页的 `mobileRow` 都可以删掉，改成在 `*.columns.ts` 里标注角色。

### 2.3 筛选只定义一次：`ErpFilterField[]`

位置：`src/components/common/filters/`。

```ts
type ErpFilterField =
  | {kind: "select"; key: string; label: string; value: string; defaultValue: string; options: Option[]; onChange(v: string): void; width?: string}
  | {kind: "dateRange"; key: string; label: string; value: {startDate: string; endDate: string}; defaultValue: …; onChange(v): void}
  | {kind: "text"; key: string; label: string; value: string; defaultValue: string; onChange(v: string): void; placeholder?: string};
```

- 桌面：渲染成 `ErpFilterBar` 里的一排控件。
- 手机：渲染成筛选面板里的单列表单，每个字段带字段名。
- **生效筛选数量由模板自动计算**（`value !== defaultValue`），页面不再自己写 `activeFilters` 的计数。
- 「重置」按钮由模板统一提供，把所有字段恢复到 `defaultValue`。

### 2.4 `ErpRecordDetail`：详情内容模板（对应 M16）

现在好几个详情抽屉写成「`if (phone) return 手机文档布局；else return 桌面网格`」两份。改成一份声明：

```tsx
<ErpRecordDetail
  hero={{title, subtitle, status, thumbnail}}
  sections={[
    {title: "往来概览", facts: [{label: "应收余额", value: …}, …]},
    {title: "档案与备注", facts: […], collapsed: true},
  ]}
/>
```

- 电脑：`ErpDetailFactGrid` 两列网格。
- 手机：`erp-phone-document` 单列文档，`collapsed` 的分组变成 `<details>`。

外层仍然用 `ErpDetailDrawer`，它本身已经处理了手机和电脑两种形态。

### 2.5 `MetricsRegion` 展开 Fragment

`MetricsRegion` 里的 `Children.toArray` 会把 `<>…</>` 当成 1 个子元素，员工提成页的 4 张卡因此排成了 1 列。改成先展开 Fragment 再计数（写一个 `flattenChildren`）。这个问题在组件里一次修好，不要在页面上逐个绕开。

## 3. 任务清单

### 第一阶段：公共部件（1 个 PR）

| 编号 | 任务 | 验收 |
|---|---|---|
| **T1** | `MetricsRegion` 展开 Fragment（2.5）；`check-mobile-rules.mjs` 的 M18 计数同时识别「卡片写在变量或 Fragment 里」的情况 | 单测：`<MetricsRegion><>{4 张卡}</></MetricsRegion>` 的 `data-metric-count` 等于 4；员工提成页在 1440 下 4 列 |
| **T2** | 列定义的 `meta.mobile` 类型声明，以及 `ErpDataTable` 自动生成手机行（2.2） | 单测覆盖：只有 title；title + amount + status；手写 `mobileRow` 优先；没有声明 mobile 的列不显示 |
| **T3** | `ErpFilterField` 及其桌面和手机两种渲染（2.3） | 单测：生效数量计算、重置、两种渲染的字段一致 |
| **T4** | `ErpListPage` 模板（2.1） | 单测覆盖插槽顺序、手机和电脑两种结构、`overlayOpen` 时隐藏底部栏、计数只出现一次；在 `DesignSystemPage` 里加示例 |
| **T5** | `ErpRecordDetail`（2.4） | 单测覆盖两种布局和折叠分组 |

### 第二阶段：列表页迁移（按批次，每批 1 个 PR）

每迁一页，都要删掉这一页里的 `useErpPhone`、手机分支、手写 `mobileRow`（除非是特殊布局），以及只给这一页用的手机 CSS。

| 批次 | 页面 | 说明 |
|---|---|---|
| **T6 样板** | `CustomerDirectoryPage`、`VendorDirectoryPage` | 先迁客户页，把模板 API 定下来。迁移后客户页预计从 127 行降到 70 行左右，手机分支为 0 |
| **T7 单据** | `PurchaseListPage`、`SalesListPage`、`PurchaseReturnListPage`、`SalesReturnListPage` | 4 页结构几乎一样，迁完后检查是否还能抽出共用的单据列定义 |
| **T8 商品与库存** | `ProductLibraryPage`、`OrderPoolPage`、`InventoryListPage` | 库存页的手机行和视图切换比较特殊，可以保留手写 `mobileRow`，但页头、筛选、底部栏必须走模板 |
| **T9 财务明细** | `FinanceLedgerPage`、`FinanceIncomePage`、`FinanceExpensePage`、`FinanceTransfersPage`、`FinanceReturnReconcilePage`、`FinanceCommissionPage`、`FinanceCustomerFundsPage` | 先把 `FinanceDetailPageLayout` 和 `FinanceEntryPageLayout` 改成在 `ErpListPage` 上封装，再逐页删掉 `if (!phone) return …` 的双份写法 |
| **T10 设置** | `SettingsUsersPage`、`SettingsLogsPage` | 页面小，顺手迁移 |

### 第三阶段：详情和其余页面

| 编号 | 任务 |
|---|---|
| **T11** | 客户、供应商、单据、库存详情抽屉改用 `ErpRecordDetail`，删掉「手机一份、电脑一份」的双份写法 |
| **T12** | 工作台类页面（`AftersalesWorkspacePage`、`CrmWorkspacePage`、`InspectionWorkspacePage`、`AssemblyWorkspacePage`、`SalesOutboundPage`）逐页评估：能套 `ErpListPage` 的就套；套不了的，在允许清单里写明原因，并把手机分支收拢到一个子组件里 |
| **T13** | 看板和分析页（`DashboardPage`、`FinanceDashboardPage`、`FinanceProfitPage`、`AiInsightsPage`、`MarketQuotesPage`）：只保证数据卡用数组、图表区在手机上单列，不强行套用列表模板 |
| **T14** | 开单类页面：清点 `NewPurchaseOrderPage`、`NewSalesOrderPage` 等剩下的手机分支，能挪进 `ErpMobileWorkflow` / `ErpSubmitBar` 的就挪进去 |

### 第四阶段：清理和守护（1 个 PR）

| 编号 | 任务 | 验收 |
|---|---|---|
| **T15** | 新增 lint 规则（放进 `check-mobile-rules.mjs`，规则编号 M28）：`src/features/*/pages/*.tsx` 里不得出现 `useErpPhone`、`data-phone-*` 属性、`ErpMobileActionDock`、`mobilePresentation="sheet"` 这类模板内部才该用的东西；例外写进 `scripts/mobile-rules-allowlist.json`，每项要有原因 | 允许清单不超过 8 个文件 |
| **T16** | 删掉 `globals.css` 里已经没有页面在用的手机 CSS（页面专属的 `.erp-customer-*`、`.erp-inventory-*` 等），只保留模板和公共组件的样式 | 用 `rg` 证明每个被删的选择器在 `src` 里都已经没有引用；手机规则浏览器检查通过 |
| **T17** | 更新 `MOBILE_UI_RULES.md` 第 4 节：从「照着这个结构拼」改成「必须使用 `ErpListPage` / `ErpRecordDetail` / `ErpMobileWorkflow`」，并附 API 说明；`COMPONENT_CATALOG` 同步更新 | — |

## 4. 迁移一页的标准步骤

1. 迁移前，先在 390、1024、1440 三个宽度下给这一页截图（第 5 节的脚本）。
2. 在这一页的 `*.columns.ts` 上标注 `meta.mobile`，然后删掉手写的 `mobileRow`（确有特殊布局的除外）。
3. 把筛选控件改成 `ErpFilterField[]`，删掉页面里的 `activeFilters` 计数和手机筛选面板。
4. 页面主体换成 `<ErpListPage …>`，详情抽屉和对话框放进 `overlays`。
5. 删掉这一页的 `useErpPhone` 引用，以及只给这一页用的 CSS 类。
6. 迁移后重新截图并对比：
   - **1440 / 1024**：和迁移前一致。
   - **390**：符合 M13，差异逐条写进 PR。

## 5. 验收

### 5.1 命令

以下全部通过：

- `npm run lint`（包含新增的 M28）
- `npm test`
- `npm run build`
- `npm run test:mobile-rules`（38 个页面 × 320 / 390）
- `npm run test:controls-browser`
- `npm run test:backend-http:docker`

### 5.2 截图对比（新增脚本）

新增 `scripts/browser-page-snapshots.py`：

- 对准隔离预览服务（`scripts/mobile-preview-server.py`，合成数据，禁止写入），给 `browser-mobile-rules.py` 里的全部路由各截一张图。
- 宽度：390、1024、1440。
- 输出到被 git 忽略的 `artifacts/snapshots/<标签>/`。
- 附一个对比命令，按路由输出像素差异比例。

验收标准：

- 1440 / 1024：除 PR 里列明的改动外，差异 ≤ 0.5%。
- 390：差异逐页列在 PR 里，并附截图。

### 5.3 数量指标（第四阶段完成时）

| 指标 | 现在 | 目标 |
|---|---|---|
| 页面里调用 `useErpPhone` 的文件 | 43 | ≤ 8（都在允许清单里，并写明原因） |
| 页面里的手机分支 | 244 | ≤ 40 |
| 手写 `mobileRow` | 30 | ≤ 6 |
| 页面专属的手机 CSS 选择器 | 35 | ≤ 5 |

### 5.4 真机

每个阶段结束后，用 iPhone Safari 和主屏幕模式抽查客户、销售单、库存、账户流水 4 页：键盘弹出、安全区、底部栏遮挡。

## 6. 交付

- PR 拆分：
  - 第一阶段 1 个（T1–T5）
  - 第二阶段每批 1 个（T6–T10）
  - 第三阶段 1–2 个（T11–T14）
  - 第四阶段 1 个（T15–T17）
- T1–T5 和客户页已经完成，模板接口以客户页的用法为准。如果迁移中发现模板确实缺少某项能力，就在模板里补上并加测试，不要在页面里绕开。
- 每个 PR 的描述要写清：任务编号、迁移页面、第 5.3 节的数量变化、三个宽度的前后截图、验收清单的勾选情况。
- 不推送生产仓库，也不部署。
