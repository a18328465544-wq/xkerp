# 选项控件统一方案（胶囊 / 分段 / 选择行）

日期：2026-10-12　基线：main `c84bba2`　状态：**已按 [DESIGN.md](../DESIGN.md) 实施（分支 `feat/mobile-button-tiers`）**

> **实施记录（2026-10-12）**
> - 组件定义改以根目录 `DESIGN.md` 为准；本文保留为背景和任务拆分。
> - 和下文原方案不同的地方：
>   - 不按「≤6 个选项」自动判断。字段要显式写 `phoneControl: "chips"` 才显示胶囊，因为从数据读出来的列表数量会变；胶囊上限不含「全部」。
>   - 胶囊选中时加对勾；手机胶囊 32px、电脑 28px。
>   - 已选条件组件叫 `ErpFilterTags`。
>   - 新增手机按钮分档：内容里 36px、底部固定栏 44px。
> - 已完成：C1、C2、C3（选择行由 `ErpFilterFields` 生成）、C5、C6、C8、C9、D1、R1、R2、R3。
>   - 另外改了 3 处：账户流水的已选条件、商品模板的品类、单据筛选面板的「应用筛选」改为主按钮。
> - 未做：
>   - C7（档案页面板瘦身）。
>   - D2（电脑端快捷切换，需要你确认）。
>   - 库存分类横条、检测队列：Codex 分支正在改这两页，合并后再迁移，已登记在 lint 白名单。

## 1. 要解决的问题

**手机端「又大又空」**：电脑端的筛选下拉框原样搬到手机，每个字段是「标签一行 + 44px 通栏框」，框里只有「全部类型」4 个字。

| 页面 | 筛选字段 | 字段区高度 | 面板内容总高 |
|---|---|---|---|
| 客户 `/crm/customers` | 类型、来源、分类、等级 | 321px | 740px（另含每页条数、分类管理、导出、刷新、汇总） |
| 销售单 `/sales` | 渠道、收款、出库、日期 | 321px | 491px |
| 收入登记 `/finance/income` | 类型、账户、经办人、日期 | 321px | 491px |

选项少的条件也要「点开下拉 → 再选一次」，而且选之前看不到有哪些选项。

**「多选一」有 5 种长相：**

| 位置 | 现在的样子 | 文件 |
|---|---|---|
| 退货范围（单件 / 多件 / 整单） | 三个独立按钮，选中浅蓝底 | `returns/pages/NewSalesReturnPage.tsx`、`NewPurchaseReturnPage.tsx` |
| 收款方式 | 灰底分段控件 `ErpSegmentedControl` | `SalesPaymentSection.tsx`、`PurchasePaymentSection.tsx` |
| 列表快捷筛选（全部 / 待处理…） | 蓝底方角按钮 `.erp-list-quick-filters` | `ErpListPage.tsx`（11 个页面在用） |
| 订单池队列、资金账户状态 | 各自手写的 `aria-pressed` 按钮组 | `OrderPoolPage.tsx`、`FinanceAccountsPage.tsx` |
| 筛选面板 | 通栏下拉框 | `ErpFilterFields.tsx`（23 个文件、45 个 select 筛选） |

**电脑端**：结果栏只显示「N 项筛选」，看不出筛了什么，也不能单独撤销某个条件。

**已有可复用的基础：**
- `.erp-phone-chip` 胶囊样式已存在但没有页面在用，手机规则脚本已对它豁免 44px 检查。
- `ErpFilterChoiceRow`（设置页式的「标签 … 值 >」行）目前只在库存筛选里用。
- `ErpDocumentFilterSheet` 的草稿机制会把字段的 `value / onChange` 替换成草稿版本，换控件后不需要改它。

## 2. 规则：哪种场景用哪种控件

| 场景 | 手机 | 电脑 |
|---|---|---|
| 筛选条件，选项不超过 6 个且每项不超过 6 个汉字 | **胶囊** `ErpChoiceChips`，自动换行，选项全部展开 | 筛选栏下拉框（不变） |
| 筛选条件，选项超过 6 个或文字较长（账户、客户、分类等） | **选择行** `ErpFilterChoiceRow`，点开底部列表，超过 12 项带搜索 | 下拉框（不变） |
| 列表快捷筛选（全部 / 待处理 / 已完成） | **胶囊**，横向可滚动 | **胶囊**（D2，可选） |
| 已生效的筛选条件 | 筛选按钮上的数字（不变） | **已选条件胶囊**「类型：个人 ×」（D1） |
| 表单里 2–4 个互斥模式（收款方式、退货范围、单卡 / 型号汇总） | **分段控件** `ErpSegmentedControl` | 同左 |
| 带说明或图标的大选项（组装 / 拆卸类型卡片） | 保留选择卡片 | 同左 |
| 操作按钮（提交、新建、更多） | 圆角矩形，**不改成胶囊** | 同左 |
| 输入框、日期、状态标签 | 不变 | 不变 |

**胶囊视觉：**
- 圆角：`--erp-radius-pill`。
- 高度：视觉高度手机 36px、电脑 32px。胶囊之间纵向间距 8px，可点区域通过内边距补足，相邻点击区不重叠。
- 未选中：白底、`--erp-color-border` 边框、次要文字色。
- 选中：`--erp-color-info-soft` 浅底、主色文字、主色边框。**不用实心蓝**，避免和主按钮混淆。快捷筛选现在选中是实心蓝，一并改掉。
- 计数：例如「待收款 3」，数字用 `tabular-nums` 和次要色。
- 禁用：沿用按钮的禁用样式。

**无障碍：**
- 单选用 `role="radiogroup"` / `role="radio"` + `aria-checked`。
- 方向键切换，Home / End 跳到首尾，复用 `nextEnabledChoice`，和 `ErpSegmentedControl` 一致。
- 只有选中项是 Tab 停留点。

## 3. 任务

### P1 公共组件（先做，其余都依赖它）

- **C1 新建 `ErpChoiceChips`**（`src/components/common/ErpChoiceChips.tsx`）
  - 参数：`label`、`value`、`options: {value, label, count?, disabled?}[]`、`onValueChange`、`size?: "sm" | "md"`、`layout?: "wrap" | "scroll"`。
  - 只做单选；多选暂时没有需求，不做。
  - 在 `index.ts` 导出，`check-component-reuse` / 组件目录检查登记为 common 组件。
  - 测试：选中态、`aria-checked`、方向键、禁用项跳过、计数渲染。
- **C2 `ErpFilterFields` 手机布局自动选控件**：`layout="sheet"` 下的 select 字段：
  - 选项不超过 6 个，且每项文字不超过 6 个字 → `ErpChoiceChips`（wrap）。
  - 否则 → `ErpFilterChoiceRow`，点开底部选择列表。
  - 字段可加 `phoneControl?: "auto" | "chips" | "picker"` 强制指定，默认 `auto`。
  - 胶囊模式下，标签行和胶囊之间间距 8px，字段之间 16px。
  - 桌面 `layout="bar"` 完全不变。
- **C3 `ErpFilterChoiceRow` 补全成通用选择行**：
  - 自带底部选择列表：单选，点一下即选中并关闭，超过 12 项显示搜索框。
  - 库存筛选改用这个通用版，行为不变。
- **C4 草稿兼容测试**：`ErpDocumentFilterSheet` 里用胶囊和选择行改条件，只改草稿；点「应用筛选」才一次性提交；关闭面板丢弃草稿。

### P2 快捷筛选与手写按钮组

- **C5** `ErpListPage` 的 `.erp-list-quick-filters` 改用 `ErpChoiceChips`（scroll 布局）。去掉 `slice(0, 4)` 的截断，改为横向滚动；排序按钮仍固定在行尾。
- **C6** 订单池队列（带数量）、资金账户状态筛选（6 项带数量）改用 `ErpChoiceChips`，删除手写按钮组。
- **C7** 档案类列表页（客户、供应商、商品、员工、日志）手机筛选面板：「每页条数」和「分类管理 / 导出 / 刷新」移进右上角「更多」。做法与单据模板 `phonePresentation="documents"` 相同，筛选面板只放筛选条件。

### P3 模式切换统一为分段控件

- **C8** 两张退货开单页的「退货范围」改用 `ErpSegmentedControl`，禁用逻辑不变（未选原单时，多件和整单禁用）。
- **C9** 其余 `aria-pressed` 手写组逐个确认：
  - 组装 / 拆卸类型卡片：保留，属于带说明的选择卡片。
  - 员工权限对话框的菜单多选：保留，属于多选开关。
  - 其他按第 2 节规则处理。

### P4 电脑端

- **D1 已选条件胶囊 `ErpActiveFilterChips`**：
  - 位置：放在表格结果栏（`ErpTableResultsBar` / `ErpListPage` 桌面结果栏），替换「N 项筛选」徽标。
  - 内容：只显示生效的条件（`isErpFilterFieldActive`）。select 显示「标签：选项名」；日期显示「日期：10-01 至 10-31」；文本显示「经办人：张三」；checkbox 显示标签本身。
  - 点 × 调该字段的 `onChange(defaultValue)`；超过 1 个条件时，末尾加「清空」文字按钮，调已有的重置。
  - 财务的明细页布局和登记页布局，在筛选栏下方接同一组件。
  - 没有生效条件时不显示，不保留空行。
- **D2（可选，需用户确认后再做）电脑端状态快捷切换**：把 `ErpListPage` 的 `quickFilters` 在电脑端也渲染成胶囊，放在结果栏左侧。如果同一字段在筛选栏里还有下拉框，两者共用同一个状态；是否隐藏重复的下拉框，由用户决定。

### P5 规则与检查

- **R1** 第 2 节规则写入 `docs/MOBILE_UI_RULES.md`（新增一条，编号接现有 M 规则）和 `docs/UI_DESIGN_RULES.md`。
- **R2** 新增 lint：`src/features` 里同一父元素下出现 2 个以上带 `aria-pressed` 的 `Button` 时报错，提示改用 `ErpChoiceChips` 或 `ErpSegmentedControl`。C9 保留的两处写进白名单并注明原因。
- **R3** 手机规则浏览器脚本：豁免从 `.erp-phone-chip` 改为 `[data-erp-component="choice-chips"]` 内的按钮，同时检查胶囊视觉高度不小于 32px、相邻胶囊间距不小于 8px。

## 4. 不做的事

- 电脑端筛选栏的下拉框、所有操作按钮的形状、输入框、日期控件、状态标签都不改。
- 不改筛选参数、接口、权限、业务逻辑；只换控件形式。
- 不碰语音、扫码相关文件，以及开单页的商品行编辑。

## 5. 验收

**数字指标（390px，合成数据预览）：**
- 客户筛选面板：字段区从 321px 降到 180px 以内；面板内容总高从 740px 降到 400px 以内（C2 + C7）。
- 销售单、收入登记筛选面板：字段区从 321px 降到 220px 以内。

**截图检查：**
- 38 个手机页面在 390px / 320px 下截图，筛选面板逐个打开截图。
- 电脑端 1440px / 1024px 截图，除 D1 结果栏外无变化。

**交互检查：**
- 键盘：Tab 进入胶囊组只停在选中项，方向键切换，Enter / Space 不会提交表单。
- 读屏：组名用字段标签，选项读作「单选，已选中」。
- 草稿：单据筛选面板里改条件、关闭面板后，列表不变。

**命令全部通过：**
- `npm run verify:ci`
- `npm run test:mobile-rules`
- `npm run test:controls-browser`
- `npm run test:forms-browser`
- `npm run test:mobile-browser`
- `npm run smoke:browser`

浏览器测试前，用 `ERP_PREVIEW_VITE_PORT` 指定本工作目录自己的 Vite 端口，避免预览到别的目录正在跑的开发服务器。

## 6. 顺序与工作量

| 阶段 | 内容 | 工作量 | 依赖 |
|---|---|---|---|
| P1 | C1–C4 公共组件 | 中 | — |
| P2 | C5–C7 快捷筛选、手写组、档案页面板瘦身 | 小 | P1 |
| P3 | C8–C9 模式切换 | 小 | — |
| P4 | D1 已选条件胶囊 | 中 | P1 |
| P4 | D2 电脑端快捷切换 | 小 | P1，需用户确认 |
| P5 | R1–R3 规则与检查 | 小 | P1–P3 |

建议按 P1 → P2 → P3 → P4（D1）→ P5 的顺序，每个阶段单独提交，方便逐段复查。
