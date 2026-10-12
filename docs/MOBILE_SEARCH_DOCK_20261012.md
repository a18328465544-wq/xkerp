# 手机库存搜索框内置扫码（方案三）

## 范围

- 仅修改手机库存的单卡/SN 和型号汇总底部区域，不修改商品行、分类、视图切换、排序、筛选、导航、查询接口和后台逻辑。
- 共享 `ErpListPage.phoneSearchAction` 将现有 `setScanOpen(true)` 放入 `ErpSearchInput.trailingAction`。识别和回填仍使用原 `ErpBarcodeScannerDialog`、`updateFilter`。
- 只有搜索型扫码页面主动配置此槽位；当前其他模板页面没有同类底部扫码动作，未把新建/提交主按钮改成图标。
- 组合框高 48px，左右 16px，白底、Token 边框、12px 圆角；ghost 扫码按钮为独立 44×44px 点击区域、20px 图标。输入区 `min-width: 0` 独立伸缩，长文本和清除按钮不覆盖扫码。
- 固定区域含上下间距和边框共 65px，原两行约 121px；单行模式只由现有主滚动区留位，不再重复增加流内空白。现有 visualViewport、软键盘、安全区域和浮层隐藏机制保留。

## 验证

- `npm run lint`、完整测试、构建、性能预算通过。完整测试 1863 项：1826 通过、37 条件数据库测试跳过、0 失败。
- `scripts/browser-mobile-search-dock.py`：375/390/430px 的组合高度、点击区域、长文本、清除、型号/SN/库存编号查询参数、扫码备用回填、两种键盘视口模拟、34px 安全区偏移模拟、最后一行可见、两种库存视图通过；没有业务写请求或页面脚本异常。
- `test:mobile-rules`：38 页面 × 320/390px 通过。原库存顶部专项回归在 320/375/390/430px 验证分类、视图、原排序、更多统计通过。
- `snapshots capture dock-before/dock-after` 覆盖库存两视图及客户页，375/390/430/1024/1440px。电脑端差异 0，客户页两端差异 0；手机库存变化只在底部固定区域和相应列表留位。
- 原扫码引擎集成回归：构建产物及开发预览均通过 WASM Code128、竖向视频识别、拒绝摄像头后二维码图片识别三个场景。最初开发态测试受 Vite 首次预优化 `barcode-detector/ponyfill` 全页重载影响；预优化完成后原断言重跑通过，没有改扫码实现或放宽测试。
- 当前工作树的真实页面截图（本地隔离验收数据）：`artifacts/snapshots/mobile-search-dock/actual-iab-390.jpg`。前后对比：`artifacts/snapshots/diff-dock-before-dock-after/`。

## 边界

- 仅本地完成，未合并 main、未推送或上线；没有连接生产数据库或执行生产写操作。
- 本地预览用已有合成验收数据，写操作被阻止；搜索测试证明输入及参数联动，不等于重新证明生产 SQL 匹配质量。
- 键盘及安全区为浏览器模拟，摄像头用合成视频源；不代替 iPhone Safari/主屏幕模式真机键盘、权限、镜头与手势验收。
