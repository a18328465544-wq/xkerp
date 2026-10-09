> **已归档**：本文的规则已合并进 [docs/MOBILE_UI_RULES.md](../../MOBILE_UI_RULES.md)（M4、M24、M26、M27），两者冲突时以 MOBILE_UI_RULES.md 为准。

# 移动端按钮尺寸体系与交互设计规范

更新时间：2026-10-09  
适用范围：OneERP V2 移动端（视口宽 $\le 767\text{px}$）所有交互按钮、图标按键、步进器与分段单选控件。

---

## 1. 核心设计哲学与触控基线

1. **44px 黄金触控基准（WCAG 2.5.5 / iOS HIG 44×44pt）**
   - 移动端（手机）用户主要依赖单手拇指或食指点按。
   - **所有独立可交互按钮在手机端的物理触控热区不得小于 44px × 44px**。桌面端存在的 28px（xs）或 36px（sm）紧凑按键，进入手机端时均由媒体查询或专用移动端容器统一升格至触控基线。
2. **拇指热区与视觉层级（Thumb-Friendly Hierarchy）**
   - **核心主流程提交**（开单、提交、结算、确认）：置于单手最易触及的屏幕底部，高度强化为 **48px**，字号 **16px**。
   - **表单与列表次级操作**：高度保持 **44px**，采用次级边框或幽灵态。
   - **状态快捷筛选胶囊（Chips）**：高度 **36px**，仅用于横向连续滑动状态组，左右补齐内边距以保证横向触达。
   - **纯图标按钮**：统一强制提升为 **44px × 44px** 方形热区，内部图标统一为 **20px**。

---

## 2. 移动端按钮尺寸梯级矩阵（Tier Matrix）

| 梯级 (Tier) | 高度/尺寸 Token | 触控热区 (Hit Target) | 推荐字号 / 图标尺寸 | 适用场景与典型组件 | 视觉变体 (Variant) |
|---|---|---|---|---|---|
| **L1: 核心任务主操作** | `--erp-mobile-primary-height`<br>(**48px**) | $\ge 48\text{px} \times 100\%$<br>（或弹性大主位） | 16px (`--erp-text-base`)<br>500 中粗体 | 底部提交栏 (`ErpSubmitBar`)、单据结算保存主键、弹窗/抽屉底部确认主按钮、移动工作流下一步 | `variant="primary"`<br>高饱和品牌主色 |
| **L2: 标准操作与表单按键** | `--erp-mobile-control-height`<br>(**44px**) | $\ge 44\text{px} \times 44\text{px}$ | 14px~16px (`--erp-text-base`) | 弹窗取消、重置、表格卡片展开/收起、快速开单辅助操作、常规独立操作项 | `variant="secondary"`<br>或 `variant="ghost"` |
| **L3: 纯图标动作按钮** | `--erp-mobile-touch-size`<br>(**44px × 44px**) | 44px × 44px (正方形) | 图标 20px<br>(`--erp-mobile-icon-size`) | 页面头部右侧操作、弹窗关闭 X、搜索清空 X、更多操作 `...`、抽屉返回/收起 | `size="icon"`<br>`size="iconTouch"` |
| **L4: 数量步进器按键** | `--erp-mobile-touch-size`<br>(**44px 宽**) | 44px × 44px 加减方块 | 图标 16px~20px | `ErpQuantityStepper` 左右加减按钮 | 浅灰底、防误触隔离 |
| **L5: 横向滚动筛选胶囊** | `--erp-control-height-compact`<br>(**36px**) | 高度 36px，横向外扩 Padding | 12px (`--erp-text-xs`) | 列表页顶部横向单据状态胶囊 (`.erp-phone-chips-scroll .erp-phone-chip`) | 胶囊圆角 (`--erp-radius-pill`)，灰边框/主色激活 |
| **L6: 网格分段单选按钮** | $\ge 40\text{px}$~44px | 等分网格平铺 (`1fr`) | 14px~16px | 支付方式切换、销售/采购类型单选 (`ErpSegmentedControl`) | 浅灰容器内白底卡片单选态 |

---

## 3. 关键布局与交互约束

### 3.1 底部安全区适配（Safe Area Insets）
- 所有停靠在移动端屏幕底部的按钮容器（包括 `ErpSubmitBar`、`ErpDialogShell` 底部操作栏、`ErpDetailDrawer` 底部按钮组）：
  ```css
  padding-bottom: max(var(--erp-space-3), var(--erp-safe-bottom));
  ```
- 严格规避 iOS 底部小白条（Home Indicator）与操作按键的重叠误触。

### 3.2 并排按钮数量上限（Max 2 Buttons per Row）
- 移动端单行并排按钮数量**严禁超过 2 个**（主操作 1 个 + 次操作 1 个，推荐比例为 2:1 或 1:1 等分）。
- 若某页面/卡片存在 3 个及以上操作项：
  - 保留 1 个核心主操作；
  - 剩余次要操作全部收纳进更多动作按钮（`...`），点击后呼出底部操作面板（Action Sheet）。

### 3.3 按钮加载态防跳动契约（Loading & Geometric Stability）
- 按钮进入 `loading={true}` 时：
  - 必须保留原本子元素的宽度占位（`opacity: 0`）；
  - 居中呈现单色旋转指示器；
  - **严禁因将文案替换为“保存中…”而引发按钮整体宽度突变或页面闪烁重排**。

### 3.4 无障碍与图标标签（Accessibility & Labels）
- 纯图标按钮（`size="icon"`）必须显式传递 `aria-label` 或 `title`。
- 在移动端展开的折叠操作列表（`.erp-phone-action-menu`）中，图标按钮自带的 `.erp-icon-action-label` 必须自动展开为可见文字，保证操作意图直观明了。

---

## 4. 严禁的反模式（Anti-Patterns）

1. ❌ **禁止透传桌面小尺寸**：不得在手机端使用 `h-7` (28px) 或 `h-8` (32px) 的孤立小按钮，避免用户点按落空。
2. ❌ **禁止行内堆叠 3 个以上文字按钮**：避免文字折行或相互贴合导致误触。
3. ❌ **禁止禁用态缩减热区**：按钮 `disabled` 仅改变透明度（50%）与点击阻断，外围盒模型的触控占用空间不得收缩。
4. ❌ **禁止重复定义内联样式**：所有按钮尺寸必须通过 `Button` 的 `size` 属性或全局 Token 定义，严禁在业务页面写入 `style={{ height: '42px' }}` 等非标尺寸。
