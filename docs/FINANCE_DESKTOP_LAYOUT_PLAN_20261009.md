# 财务模块桌面端信息排列整改方案（2026-10-09）

> 执行人：Codex
> 代码基线：`merge/ui-visual-cleanup`（`4f51316`）。如果它已经合入 `main`，就从 `main` 新建分支 `finance-desktop-layout`；如果还没合，先合并它，否则会和这次改动大面积冲突。
> 范围：**只改桌面端（≥ 1024px）的财务页面布局**。手机端遵守 `docs/MOBILE_UI_RULES.md`，不在本次范围内，不能被改坏。

---

## 0. 约束（必读）

1. 先读 `AGENTS.md`、`docs/UI_DESIGN_RULES.md`、`docs/REPORT_UI_STANDARD.md`、`docs/COMPACT_LAYOUT_RULES.md`。
2. **只改布局和呈现**：不碰 `server/`、API 适配器、金额计算、权限、查询参数和导出逻辑。所有数字仍来自现有接口，不新增字段，不编造数据。
3. 手机端零变化。改完后必须跑 `npm run test:mobile-rules`，并对比 390 宽度截图。
4. 优先复用现有组件：`ErpFinancePageFrame` / `ErpAnalyticsPageFrame`、`ErpPageHeader`、`ErpFilterBar`、`ErpMetricCard`、`ErpDataTable`、`DashboardSection`、`FinanceSectionTabs`、`FinanceTableRegion`。新增组件只能放在 `src/components/common/page-frames/` 或 `src/features/finance/components/`，不在页面里重复定义容器。
5. 一个任务一个提交，提交信息写任务编号，例如 `fix(finance): F3 ledger detail-first layout`。
6. 不要部署。

## 1. 预览与截图

```bash
npx vite --port 3010 --strictPort --host 127.0.0.1
ERP_MOBILE_QA_PORT=3022 ERP_CUSTOMER_QA_SCENARIO=design ERP_INVENTORY_QA_SCENARIO=design python3 scripts/mobile-preview-server.py
```

打开 `http://127.0.0.1:3022` 下的 11 个财务路由，用 **1440×900** 截整页图，同时记录明细表顶部的 y 坐标（`main table` 的 `getBoundingClientRect().top`），作为改动前的基准。

## 2. 现状问题（1440×900 实测）

| # | 问题 | 例子 |
|---|---|---|
| P1 | **明细表被压到最下面** | 账户流水的明细表从 **1215px** 才开始，前面依次是 4 张数据卡、筛选栏、趋势图，以及一张**没有数据也占约 360px 的支出分类图**。销售毛利从 1096px 开始，资金账户从 796px 开始 |
| P2 | **同一个数字重复出现** | 财务总览的「1 项待处理」出现 4 次（顶部标签、数据卡、今日资金摘要、待办与异常）；资金账户的「新增账户」出现 3 次，账户数量出现 3 次；财务核对的顶部标签和数据卡、右栏「最新异常」重复 |
| P3 | **右侧栏信息量低还挤窄表格** | 账户流水右栏的「账户信息 / 账户分布 / 常用账户」和筛选栏的「全部账户」下拉框是同一个功能，下方是大片空白，却把明细表的「余额」列截到只剩一个「¥」；资金账户右栏的 6 个快捷操作和账户卡片上的按钮重复，表格「对方」列被截断 |
| P4 | **每页排列不统一** | 销售毛利的筛选栏放在 11 张数据卡**下面**（数据卡是按筛选结果算出来的）；数据卡数量有 3、4、5、8、11 张；有的页有右栏，有的没有；页头按钮里混着「财务总览」这种导航和已禁用的「导出当前页」 |
| P5 | **空状态处理不对** | 往来账款的「近期往来趋势」没有数据时只剩一个标题（`FinanceCustomerFundsPage.tsx` 中的 `MainRegionPlaceholder` 直接遍历空数组）；支出分类图没有数据时仍占满高度 |
| P6 | **图表误导** | `src/components/ui/chart-primitives.tsx` 中的 `TrendLineChart` / `AreaTrendChart` 写死了 `type="monotone"`。稀疏的按天数据被画成连续的坡：只有 10-07 一天有数据，图上却从 10-06 涨到 10-08。财务总览的「健康分 100」环形图占了很大面积，信息量只有一个数字 |

## 3. 统一的三种页面模板

所有财务页面都必须套用下面三种模板之一，不再各自排列。

### 模板 A：明细类（以查账、登记为主）

适用页面：账户流水、其他收支（收入 / 支出）、资金调拨、员工提成、往来账款、退货对账、财务核对。

```
① 页头       标题 · 主操作（记收入 / 新增 / 检查账务…）· 导出 · 更多
② 子导航     FinanceSectionTabs（只有存在子页面时才显示）
③ 筛选栏     搜索 + 日期 + 业务筛选，一行放不下时进入「更多筛选」，不要让单个控件掉到第二行
④ 数据卡     一行，最多 4 张，用 ErpMetricCard variant="compact"，数值随筛选变化
⑤ 明细表     全宽，不要右侧栏；合计行放在表格底部
⑥ 分析区     DashboardSection「收支分析」，默认折叠；展开后两张图并排（2 列网格）；没有数据的图隐藏
```

**验收**：在 1440×900 下，明细表的表头出现在 **≤ 520px** 处（即首屏内）。

### 模板 B：分析类（以看趋势、做判断为主）

适用页面：销售毛利。

```
① 页头       标题 · 导出
② 筛选栏     放在最上面，在数据卡之前
③ 数据卡     4 张核心指标（销售额、销售毛利、毛利率、净利润）+「更多指标」展开（其余 7 项放在折叠区）
④ 分析区     趋势图（2/3）+ 毛利洞察（1/3）；洞察少于 3 条时，高度跟随内容，不要撑满
⑤ 明细表     全宽
```

这个顺序和 `REPORT_UI_STANDARD.md` 第 1 节一致；数据卡从 11 张降到 4 张，也是为了符合该规范「4–6 张」的要求。

### 模板 C：总览类

适用页面：财务总览、资金账户。

- **财务总览**：
  1. 4 张数据卡：可用资金、今日收入、今日支出、待处理。「待处理」**只在这里出现一次**，删掉顶部标签和「今日资金摘要」里的重复项。
  2. 现金流趋势（2/3）+ 待办与异常列表（1/3）。
  3. 账户余额和近期资金事件，两列。
  4. 「资金健康度」的环形图删掉，改成页头的一个状态标签（例如「健康 · 100」），三个检查项放进标签的悬停说明里。
- **资金账户**：
  1. 4 张数据卡排成一行。
  2. 账户卡片网格作为页面主体。
  3. 删掉右侧栏：「账户状态概览」改成列表上方的筛选标签（正常 / 待核对 / 异常 / 冻结，带数量，点击即筛选）；「快捷操作」并入页头的「更多」菜单（资金调拨、对账管理、导出账户）；「正余额资金分布」改成一条细横条，放进「账面余额」数据卡下方；「异常提醒」只在有异常时，作为列表上方的提示条出现。
  4. 「新增账户」只保留页头一处，删掉虚线占位卡和快捷操作里的那一个。
  5. 「最近资金变动」整块删掉，在页头放一个「查看流水」链接，跳到账户流水页（账户流水页已经完整承担了这个职能）。

### 右侧栏的规则

只有当右栏放的是**真实存在的异常或待办，并且不和主区域重复**时，才允许使用右侧窄栏（`REPORT_UI_STANDARD.md` 第 2 节）。用于选择、导航、重复统计的右栏一律删除，相关功能并入筛选栏或页头。

## 4. 任务清单

### 公共部分

| 编号 | 任务 | 文件 | 验收 |
|---|---|---|---|
| **F1** | 新建 `FinanceDetailPageLayout`，实现模板 A 的 6 段插槽（header / tabs / filters / metrics / table / analysis），分析区默认折叠，记住用户的展开状态 | `src/features/finance/components/FinanceDetailPageLayout.tsx`；可以和现有的 `FinanceEntryPageLayout.tsx` 合并 | 渲染测试覆盖插槽顺序和「分析区默认折叠」 |
| **F2** | 图表曲线：`TrendLineChart` / `AreaTrendChart` 新增 `curve` 属性，默认值改为 `"linear"`；数据点不超过 14 个时显示圆点；仍然需要平滑曲线的调用方显式传 `curve="monotone"` | `src/components/ui/chart-primitives.tsx` | 只有一天有数据时，图上只出现一个点，不出现坡 |

### 各页面

| 编号 | 页面 | 改法 | 主要文件 |
|---|---|---|---|
| **F3** | 账户流水 | 套用模板 A。`LedgerAside` 的账户切换并入筛选栏（已有「全部账户」下拉框，删掉重复的那个），「账户分布 / 常用账户」删除，`TrendCard` 和 `ExpenseShareCard` 移入折叠的分析区，`LedgerTableCard` 改为全宽 | `pages/FinanceLedgerPage.tsx` |
| **F4** | 其他收支 / 资金调拨 / 员工提成 / 退货对账 | 套用模板 A。删掉已禁用的「导出当前页」（无数据时按 `REPORT_UI_STANDARD` 给出提示即可）；删掉「主要来源类型：暂无」这类没有信息量的数据卡 | `FinanceIncomePage.tsx`、`FinanceExpensePage.tsx`、`components/FinanceEntryPageLayout.tsx`、`FinanceTransfersPage.tsx`、`FinanceCommissionPage.tsx`、`FinanceReturnReconcilePage.tsx` |
| **F5** | 往来账款 | 套用模板 A。修复 P5：趋势为空时显示 `ErpEmptyState`，或者整块隐藏；把横排的趋势卡片改成和其他页一致的折叠分析区 | `FinanceCustomerFundsPage.tsx`（`MainRegionPlaceholder`） |
| **F6** | 财务核对 | 套用模板 A。顶部状态标签只保留「账务体检」结果（并且可点击跳到体检结果）；「月结锁定」放进页头的「更多」菜单或者表格上方的一行操作；「最新异常」有内容时作为表格上方的提示条，没有内容时隐藏；删掉页头的「财务总览」导航按钮 | `FinanceClosingPage.tsx`、`components/FinanceClosingSections.tsx`、`components/FinanceLatestExceptions.tsx` |
| **F7** | 销售毛利 | 套用模板 B。筛选栏移到数据卡之前；4 张核心数据卡加「更多指标」折叠区；毛利洞察高度跟随内容 | `FinanceProfitPage.tsx` |
| **F8** | 财务总览 | 套用模板 C | `FinanceDashboardPage.tsx`、`components/FinanceDashboardRegions.tsx`、`FinanceDashboardWidgets.tsx`、`FinanceDashboardCashflowPanel.tsx` |
| **F9** | 资金账户 | 套用模板 C | `FinanceAccountsPage.tsx`（右栏几个区块约在第 196–213 行） |

### 文档与守护

| 编号 | 任务 |
|---|---|
| **F10** | 更新 `docs/REPORT_UI_STANDARD.md`：① 第 1 节补充「明细类页面（模板 A）把明细表放在分析区之前，分析区默认折叠」，并写明三种模板分别适用哪些页面；② 第 3 节的金额颜色和当前设计令牌保持一致：**支出现在是中性深灰（`--erp-color-expense`），不是红色**；红色只表示危险 / 失败；警告是琥珀色 |
| **F11** | 在 `scripts/check-mobile-rules.mjs` 旁边新增 `scripts/check-finance-layout.mjs`，并接入 `npm run lint`：财务页面里，一个 `MetricsRegion` 中的数据卡不能超过 4 张（销售毛利的「更多指标」折叠区不算在内）；`src/features/finance/pages` 下不得出现 `xl:grid-cols-[minmax(0,1fr)_232px]` 这种固定宽度的右侧栏写法（除非在允许清单里写明原因）。允许清单沿用 `scripts/mobile-rules-allowlist.json` 的格式 |

## 5. 验收

1. **首屏指标（1440×900）**：

   | 页面 | 改动前明细表位置 | 目标 |
   |---|---|---|
   | 账户流水 | 1215px | ≤ 520px |
   | 销售毛利 | 1096px | 筛选栏 + 4 张卡 + 分析区第一行都在首屏内，明细表 ≤ 900px |
   | 资金账户 | 796px（「最近资金变动」） | 账户卡片网格的第一行 ≤ 450px |
   | 其他模板 A 页面 | — | ≤ 520px |

2. **无截断**：在 1440 和 1024 两个宽度下，所有财务表格的最后一列都完整显示（不再出现只剩「¥」或被切掉的列）。
3. **无重复**：同一个数字在一个页面里只出现一次（人工逐页核对，在 PR 里列出核对结果）。
4. **命令**：`npm run lint`（含新增的 F11 检查）、`npm test`、`npm run build`、`npm run test:mobile-rules`、`npm run test:controls-browser` 全部通过。
5. **截图**：11 个财务页面在 1440 宽度下的改动前后对比图，加上 1024 宽度的改动后截图，以及 390 宽度下手机端没有变化的证明（`test:mobile-rules` 通过即可）。

## 6. 交付

- 分 3 个 PR 提交：① F1 + F2 + F10 + F11（公共部分）；② F3–F7（模板 A、B）；③ F8–F9（模板 C）。
- PR 描述里要有：任务编号、首屏指标的改动前后对比、截图、验收清单勾选情况。
- 不要合并到 `main`，也不要部署。等仓库负责人看过截图后再决定。
