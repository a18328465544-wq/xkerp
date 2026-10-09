# 移动端精修 · 阶段一验收意见（2026-10-09）

> 写给：Gemini
> 对应方案：`docs/MOBILE_UI_REFINEMENT_PLAN_20261009.md`（已一并放进本分支）
> 验收对象：分支 `mobile-ui-phase1`（内容 = 你的 T2、T1、T3，加上未提交的 T4，详见第 1 节）

## 结论：有条件通过

阶段一的方向和完成度都不错：
- 手机上原来的通用卡片都换成了统一的 `ErpMobileRecordRow`。
- 单据列表页的结构和客户页一致了。
- 账户流水页的信息顺序改对了（数据卡 2×2，明细在前，图表收起）。
- 桌面端基本没有变化。

**但还有 3 个必须修的问题（F1 到 F3），修完才能进入阶段二。**

---

## 1. 分支调整（请先读）

你原来的 `mobile-ui-refine` 分支里混进了方案范围以外的内容：

| 内容 | 处理方式 |
|---|---|
| 提交 `4692dd1`：GPU SN 出厂日期查询、`server/` 后端路由、`server/store.ts` 改动、97 个文件的死代码清理 | 移到新分支 `feature/gpu-sn-lookup`，单独评审 |
| 未提交的 `server/gpuSnDate*.ts`、`GpuSnDateLookupButton.tsx`、`src/types/gpuSn.ts` | 一起移到 `feature/gpu-sn-lookup` |
| T2、T1、T3 三个提交 | 重新摘取到 `mobile-ui-phase1`（以 `9b517df` 为基础） |
| 未提交的 T4（`ErpDataTable.tsx`、对应测试、`check-ui-contracts.mjs`、两个列表页各删 1 行） | 作为一个 WIP 提交放进 `mobile-ui-phase1` |

原分支没有动过，另外保留了备份分支 `backup/mobile-ui-refine-20261009`。

**从现在起只在 `mobile-ui-phase1` 上继续工作。** 你的工作目录里还留着未提交的改动，而这些改动已经分别保存到上面两个分支里了。切换前请先把它们暂存起来，不要直接丢弃：

```bash
git stash push -u -m "pre-split leftovers (already saved in mobile-ui-phase1 / feature/gpu-sn-lookup)"
git switch mobile-ui-phase1
```

**以后不要在 UI 分支里修改 `server/` 或业务逻辑**（方案第 0 节第 2 条）。新功能请单独开分支。

---

## 2. 验收依据

| 检查项 | 结果 |
|---|---|
| `npm run lint`（包含 T4 新增规则） | ✅ 通过 |
| `npm test`（完整测试，不连数据库） | ✅ 1545 通过、0 失败（37 个需要数据库的集成测试被跳过） |
| 桌面 1440 宽度，20 个受影响页面逐像素对比 | 13 页完全一致；6 页有 1 到 2px 的整体位移或预期内的文案改动（见 F6） |
| 手机 390 宽度，20 页自动指标 | 有数据的页面通用卡片数量归零，没有横向滚动，没有小于 12px 的文字，没有新增控制台报错 |
| 代码审查 | 发现 F1 到 F7 |

---

## 3. 必须修复（P0）

### F1：账户流水手机行的金额正负号和颜色反了

**位置**：`src/features/finance/pages/FinanceLedgerPage.tsx` 第 389 到 398 行

**现状**：
- 代码用 `item.direction === "收入"` 来判断收支。
- 但适配层 `finance-account.adapter.ts:93` 在缺少 `direction` 字段时，会默认填「资金变动」。
- 结果：一笔 +150 的「销售收款」在手机上显示成红色的「-¥150.00」。
- 另外，`changeAmount` 本身是负数时，会拼出「--¥150」这样的双负号。
- 桌面列（`finance-ledger.columns.tsx:22`）是按 `changeAmount >= 0` 判断的，逻辑是对的。

**修法**：
- 直接复用桌面列的判断：正负和颜色都看 `changeAmount` 的符号，金额取绝对值后再格式化。最好把这段逻辑提取成一个共享函数，桌面列和手机行都调用它。
- 补一个测试，覆盖三种情况：`direction` 为「资金变动」时金额为正、金额为负、金额为 0。

### F2：资金调拨页的「已入账」是编造的状态

**位置**：`src/features/finance/pages/FinanceTransfersPage.tsx` 中 `mobileRow` 的 `status={<ErpStatusBadge label="已入账" .../>}`

**现状**：`FinanceTransferItem`（`src/types/finance-transfer.ts`）里根本没有状态字段，这个徽章是硬编码的。这违反了 `AGENTS.md`「页面指标必须由真实状态计算」。

**修法**：删掉这个徽章。如果需要一个补充信息，可以用 meta 显示手续费或经办人，这些都是真实数据。

### F3：有 4 个财务页漏了 `mobileRow`，而且 lint 规则查不出来

**现状**：
- `scripts/check-ui-contracts.mjs` 把 `FinanceTableRegion.tsx` 加进了白名单。
- `FinanceTableRegion` 通过 `{...table}` 把属性整体透传给 `ErpDataTable`，规则遇到这种透传会直接放行。
- 结果，下面 4 个页面都没有 `mobileRow`，有真实数据时就会退回到通用卡片：
  - `FinanceIncomePage` 和 `FinanceExpensePage`（经过 `FinanceEntryPageLayout`）
  - `FinanceClosingPage`
  - `FinanceReturnReconcilePage`
- T3 的提交信息写着「add mobileRow to **all** remaining data tables」，这和实际情况不符。

**修法**：
1. 给这 4 个页面补上 `mobileRow`，写法参照方案 T3 的字段建议。
2. 用类型来强制：把 `FinanceTableRegion` 的 `table` 属性类型改成必须带 `mobileRow`（例如 `ErpDataTableProps<TData> & {mobileRow: NonNullable<ErpDataTableProps<TData>["mobileRow"]>}`），这样漏写会直接编译报错。
3. 把 `FinanceTableRegion.tsx` 从白名单里移除。
4. 对于有透传（spread）的情况，规则不能直接放行。至少要求透传的来源类型里包含 `mobileRow`，或者干脆改成以类型约束为准。

---

## 4. 应该修复（P1）

### F4：有 9 个页面只补了 `mobileRow`，没有按客户页模式完整改造

下面这些页面在手机上仍然显示「刷新」按钮和整排桌面筛选栏：
- `AssemblyWorkspacePage`
- `FinanceAccountsPage`
- `FinanceCustomerFundsPage`
- `FinanceCommissionPage`（`/finance/sales-commission`）
- `FinanceProfitPage`
- `SettingsUsersPage`
- `SettingsLogsPage`

另外 `MarketQuotesPage`、`BackupPage`、`FinanceTransfersPage` 也请一并检查。

方案 T3 要求每页都按客户页模式改：`surface="plain"`、紧凑翻页、`mobileToolbar`、筛选面板、底部搜索栏。至少要做到两点：手机上不显示「刷新」，筛选条件移进底部弹出的筛选面板。这样也顺带完成了方案里的 T15。

### F5：手机行内容需要调整

| 页面 | 问题 | 改为 |
|---|---|---|
| `SettingsLogsPage` | 标题和徽章都是 `item.type`，同一个词显示了两次 | 标题用 `item.target`（操作对象），徽章保留 `item.type` |
| `BackupPage` | 标题是 `item.id`，一串用户看不懂的编号 | 标题用文件名或备份时间，编号放到 meta |
| `ProductLibraryPage` | 价格没有标签，只有一个「¥100」，看不出是什么价；meta 里重复了型号 | 加上 `amountLabel="参考回收价"`，meta 去掉重复的型号 |
| `FinanceLedgerPage` | 关联单号用 `ErpStatusBadge` 显示成了徽章 | 徽章只用来表示流程状态，单号放到 meta |

### F6：桌面端的细微变化

方案要求桌面端零变化。逐像素对比的结果如下：
- `/products`、`/purchase`、`/sales/returns`、`/purchase/returns`：列表区域整体移动了 1 到 2px。请找出是哪个外层容器或间距改动导致的，并恢复原样。
- `/order-pool`：空状态文案从「点击右上角新建一条客户协同订单。」改成了「点击新建协同订单创建第一条记录。」。这个改动可以接受，但请在 PR 里说明。
- `/finance/ledger`：「近30天」下拉框加宽了，属于方案 T5 允许的改动，没有问题。

### F7：T4 的收尾

T4 的方向是对的：手机上整卡可点、展开改成图标按钮、「操作」改成「···」图标按钮、新增的 lint 规则都没问题。请完成以下几点再正式提交：
- `ErpDataTableProps` 新增的 `phone` 和 `compactViewport` 是为了测试才加的，不应该成为公开接口。请改成在测试里模拟 `useErpPhone` 或 `matchMedia`；如果暂时做不到，至少加上 `/** @internal 仅测试用 */` 注释。
- `compactViewport` 的初始值来自这个属性，但随后 matchMedia 的副作用会覆盖它。请确认对应测试确实测到了手机分支，而不是碰巧通过。
- 把 WIP 提交整理成正式提交：`fix(mobile): T4 ...`。

---

## 5. 流程要求

1. **一个任务一个提交，提交信息要和实际一致。** T3 的提交里顺带完成了 T5 的大部分（账户流水页的结构调整），这是好事，但要在 PR 描述里写清楚，并在方案的 T5 下注明「已在 T3 中部分完成」。
2. **超出方案范围的改动先停下来问。** GPU SN 功能、死代码清理这类事情，需要先和仓库负责人确认，并且单独开分支。
3. **自己先做验收再报完成。** 请使用第 2 节的方法：手机 390 和桌面 1440 两个宽度截图对比，加上 lint 和测试。验收用的预览环境是 `scripts/mobile-preview-server.py`。

---

## 6. 下一步

1. 先修 F1、F2、F3（P0），再修 F4 到 F7（P1）。
2. 重新运行 `npm run lint` 和 `npm test`，在 PR 里附上修复前后的截图。
3. 通过复验后进入阶段二：T5 只剩下其余财务页的顺序检查，然后是 T6、T7。
4. 不要合并到 `main`，也不要部署。
