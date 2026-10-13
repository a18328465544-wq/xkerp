# 移动端输入框全局键盘避让

基线：`2c17a85`，分支：`codex/mobile-keyboard-20261013`。桌面保持既有排版；本次为本地修复，没有部署。

## 原因与复现

采购来源选择器外层 `.erp-dialog-viewport` 同时使用可视区域的 top/bottom
和 `min-height: calc(100dvh - ...)`。iOS 键盘打开后，外层仍被撑成整屏，
而全屏 popup 已缩短并向下对齐，导致标题和搜索框落入键盘覆盖区。
在 390×844 的本地模拟中，视觉区域是 80–460px；修复前容器最小高度仍为
844px，搜索框位于 610–654px。修复后容器高 380px，搜索框位于 146–190px。

此前视口事件只在 AppShell 内管理，登录表单不在其覆盖范围；普通表单
也缺少聚焦字段的可见性检查。登录页在键盘覆盖后还需要额外文档滚动空间。

## 实施方案与共享边界

1. 由 PhoneViewportProvider 在认证之前集中管理可见高度、顶部偏移与遮挡量。
   键盘 blur/焦点切换期间等待实际视口恢复；清理事件、定时器及根节点令牌。
2. 解除所有手机 dialog/drawer 定位容器的整屏最小高度。全屏内容按父容器
   实际可用高度收缩，安全区只保留尚未被顶部偏移抵消的部分。
3. 监听可编辑 input、textarea 和 contenteditable 的 focus/input；仅在被遮挡时
   滚动所属内容容器，考虑底部提交栏。固定搜索栏不滚动背景列表，长 textarea
   保持首个编辑行可见并沿用原生内部文字滚动。登录页追加键盘期间的底部留位。
4. iPhone 横屏进入平板布局时，触摸设备的输入字号仍满足 16px，锚定候选面板
   使用实际可见空间。桌面鼠标布局与定位继续沿用原有几何。
5. 保留原字段、草稿、校验、提交动作与原生缩放；没有新增业务接口。

## 验收

- 新增 `npm run test:mobile-keyboard`：Chromium 与 WebKit 使用可视区域模拟，
  覆盖来源/商品/共享搜索选择器、快速新建客户、共享表单、财务弹窗、底部搜索、AI 抽屉、
  全部 38 页可编辑输入、登录、Android 布局收缩、无 VisualViewport 回退、横屏、
  安全区、焦点切换、关闭残留偏移及 pinch zoom。全部业务写请求被拒绝。
- 单元测试覆盖顶部偏移、关闭延迟、无效视口尺寸、缩放及输入字段的最小滚动量。
- 基线截图位于 `artifacts/snapshots/keyboard-before`；修改后与对比截图使用同目录
  的 `keyboard-after` 与 `diff-keyboard-before-keyboard-after`。
- 常规门禁：lint、完整单元测试、构建、手机规则检查、控件浏览器回归及桌面截图比较。

## 本地验证结果

- `npm run lint`：通过，含前端/服务端严格类型检查、移动规则、架构与未引用代码检查。
- `npm test`：1879 项，1842 通过、37 条件数据库测试跳过、0 失败。
- `npm run build`：通过，前端、API 与日报构建均生成。
- `npm run test:mobile-rules`：38 个业务页 × 320/390px，通过。
- `npm run test:mobile-keyboard`：通过。业务页扫查覆盖当前可见的 34 个编辑字段；
  320/390/430px 验证选择器、新建客户 3 个字段、共享表单 9 个字段、财务弹窗 4 个字段、
  底部搜索和 AI 抽屉；WebKit 在 390px 重复关键场景，登录的两个字段也通过。
  Android 布局收缩、无 VisualViewport 回退、844px 触摸横屏与关闭残留偏移通过。
- `npm run test:controls-browser`：320/390/768/1024/1440px 全部通过，未提交业务数据。
- 修改前后 38 页 × 1024/1440/390px 的 114 张默认界面截图全部一致，差异为 0；
  键盘交互截图位于 `artifacts/snapshots/mobile-keyboard/`。

复现需要已安装 Python Playwright 与 Chromium/WebKit 浏览器：
`python3 -m playwright install chromium webkit`。先运行当前工作树的隔离预览，
再设置 `PHONE_KEYBOARD_BASE_URL=http://127.0.0.1:<预览端口>` 执行新测试。

浏览器自动化不能弹出真实 iPhone 软件键盘。本地模拟和 WebKit 引擎验证不等于
Safari/主屏幕模式真机验收；仍需要在真实设备确认键盘附件栏、横屏和关闭后恢复。

机制参考：[MDN VisualViewport](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport)、
[WebKit Visual Viewport API](https://webkit.org/blog/9674/new-webkit-features-in-safari-13/)。
