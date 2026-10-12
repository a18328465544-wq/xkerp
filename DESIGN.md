---
version: 2026-10-12
name: 成都显卡一号店 · 进销存
description: 二手显卡进销存 ERP 的设计语言。电脑端紧凑、手机端舒适；按钮是圆角矩形，可选项是胶囊；选中同时用颜色和对勾表达。
source_of_truth: src/styles/tokens.css
colors:
  primary: '#0A84FF'
  primary-hover: '#006EDC'
  primary-soft: '#EAF3FF'
  success: '#12805C'
  success-soft: '#E8F7F0'
  warning: '#9A6100'
  warning-soft: '#FEF7E6'
  danger: '#C8231C'
  danger-soft: '#FEF3F2'
  canvas: '#F7F8FB'
  surface: '#FFFFFF'
  surface-muted: '#F5F7FB'
  text: '#172033'
  text-secondary: '#506078'
  border: '#E2E8F0'
  border-strong: '#CBD5E1'
rounded:
  control: 10px
  card: 18px
  pill: 9999px
density:
  desktop: compact
  phone: comfortable
  touch-target: 44px
components:
  button:
    shape: '{rounded.control}'
    height: {desktop: [28px, 36px, 40px], phone-content: 36px, phone-fixed-bar: 44px}
    hit-area: {phone: 44px}
    rule: 每屏最多 1 个主按钮；同一组按钮等高，用填充色区分主次，不用尺寸
  icon-button:
    size: {desktop: 36px, phone: 36px}
    hit-area: {phone: 44px}
  segmented-control:
    component: ErpSegmentedControl
    options: 2-5
    height: {desktop: 40px, phone: 44px}
    rule: 和同一行的输入框等高（--erp-control-height）；等宽，文字不换行；超过 5 个改用选择胶囊
    selected: 灰色轨道上的白色滑块，文字加粗；不用实心主色
  choice-chips:
    component: ErpChoiceChips
    shape: '{rounded.pill}'
    border: 1px '{colors.border}'
    height: {desktop: 28px, phone: 32px}
    hit-area: {phone: 44px}
    gap: 8px
    selected: '{colors.primary-soft} 底 + {colors.primary} 边框和文字 + 对勾'
  filter-tag:
    component: ErpFilterTags
    shape: '{rounded.pill}'
    border: none
    height: 24px
    background: '{colors.primary-soft}'
    rule: 只在电脑端显示；带 ×；超过 5 个显示 +n；多于 1 个时末尾有「清空」
  status-badge:
    component: ErpStatusBadge
    shape: '{rounded.pill}'
    border: none
    height: 22px
    rule: 只读，没有悬停效果；语义色加圆点
  picker:
    component: Select（电脑端下拉框 36px）/ ErpFilterFields 选择行（手机 48px）
    rule: 超过 12 项带搜索
  tabs:
    component: FinanceSectionTabs / 页面页签
    height: {desktop: 40px, phone: 44px}
    rule: 只用于去同级页面，不能做筛选
---

# 设计语言

这份文件写给所有写代码的人和 AI 工具（Codex、Claude、Gemini）。具体数值以 `src/styles/tokens.css` 为准；规则细节见 [docs/UI_DESIGN_RULES.md](docs/UI_DESIGN_RULES.md) 和 [docs/MOBILE_UI_RULES.md](docs/MOBILE_UI_RULES.md)。

## 三条底层决定

1. **两档密度**：电脑端紧凑（表格为主），手机端舒适（拇指操作）。尺寸只用 `--erp-*` 变量，不在页面里写死像素。
2. **形状分工**：执行动作的按钮和输入类控件是 10px 圆角矩形；可选项和标签是胶囊；卡片 18px。用户靠形状分清「点了会执行」和「点了是选择」。
3. **选中不只靠颜色**：选择胶囊选中时加对勾；分段控件选中项是白色滑块加粗字。选中状态不使用实心主色，实心主色只留给主按钮。

## 选控件的顺序（命中就停）

1. 点了会执行动作或进入下一步 → **按钮** `Button`
2. 2–5 个互斥的模式或视图，会改变页面的工作方式 → **分段控件** `ErpSegmentedControl`
3. 写死在代码里的短选项单选（筛选条件、表单里的固定分类） → **选择胶囊** `ErpChoiceChips`。手机筛选面板里，除「全部」外不超过 6 个；字段写 `phoneControl: "chips"`
4. 选项更多，或者是从数据里读出来的（账户、员工、客户、分类） → **选择器** `Select`；手机筛选面板里显示为选择行
5. 去同级的另一个页面 → **页签**
6. 只是显示状态，不能点 → **状态标签** `ErpStatusBadge`

已生效的筛选条件在电脑端用 **已选条件** `ErpFilterTags` 显示，可以逐个撤销；手机端只在「筛选」按钮上显示数量。

## 四种外观怎么区分

| 外观 | 含义 |
|---|---|
| 圆角矩形 | 执行动作（按钮） |
| 有边框的胶囊 | 可以选（选择胶囊） |
| 无边框的浅蓝胶囊，带 × | 用户已经设下的条件，可以撤销（已选条件） |
| 无边框的语义色胶囊，带圆点 | 系统给出的状态，只读（状态标签） |

## 手机触控

可点范围至少 44px。按钮看上去 36px，由透明的 `::after` 区域补足到 44px；底部固定操作栏里的按钮看上去也是 44px。选择胶囊看上去 32px，可点范围同样补足到 44px。放在会裁剪内容的容器里时，容器要留出补足所需的上下空间。

## 不采用的潮流

- 不用玻璃材质（Liquid Glass）：ERP 以表格和数字为主，半透明会降低可读性。
- 不用按下或选中时改变形状的动效（Material 3 Expressive）：稳定比表现力重要。
- 按钮不改成胶囊：胶囊已经留给可选项。
