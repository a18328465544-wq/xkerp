# 依赖修复、合并与本地构建发布

日期：2026-10-09，Asia/Shanghai。

## 发布结果

- 正式站点：<https://gpu-erp.cdgpu.cn>。
- 应用提交：`693cc5210ff499c2c603f94144f5ff1efc676299`，`main`，已推送 `xkerp/main`；冻结候选时工作树干净。
- 发布标识：`693cc52-mobile-20261009-1791534858091`。
- 将 `mobile-ui-phase1` 合并到 `main`，保留主线已有 SN 查询入口、维护改动及手机 UI。两个冲突仅在开单/出库页头，保留两侧能力。
- 修复 production 和 development 的兼容版本依赖，完整依赖审计 **0 漏洞**。没有使用强制跨大版本升级或关闭安全门禁。
- 本地构建前端、API 和日报产物；Linux x86_64 production 依赖在本地 Docker `node:22.22.3-bookworm-slim` 安装及审计。服务器未执行 `npm ci`、Vite 或 esbuild。
- 发布包括后端产物及运行依赖，不是仅前端替换；没有修改生产环境配置、执行数据库迁移或清理业务数据。
- 发现并修复手机任务模式的保活页面污染：只有当前激活的 workspace panel 能隐藏底部导航和调整任务操作栏位置。补充静态和浏览器回归。

## 验证

- `verify:ci` 退出 0：前端、后端、后端测试严格类型检查，完整 lint/架构/复用/设计系统/mutation 检查，本地构建、性能预算及生产依赖审计通过。
- 完整测试 1602 项：1565 通过、0 失败、37 项条件数据库测试跳过；另用一次性本地 PostgreSQL 容器执行 37 项 HTTP 集成测试，全部通过、0 跳过，不连接生产库测试。
- 生产预检脚本测试 5 项通过。
- 控件浏览器回归 320/390/768/1024/1440px 全通过。
- 手机工作台回归 320/360/390/430/768/1024/1440px 全通过；覆盖开单草稿保留、失败重试幂等、数量保留、质检 SN 校验、出库扫码草稿、单件/多件/整单退货和受限账号导航。业务请求使用本地拦截 fixtures，无生产业务写入。
- 同步旧测试中的手机按钮名称、任务模式导航隐藏及 Back 分步返回规则，没有删去关键断言。

## 备份与切换

- 用户授权本次跳过异地备份检查，仅对本次发布生效；没有伪造异地目标或永久修改全局安全规则。
- 新服务器本地备份：`/home/ubuntu/gpu-erp-backups/gpu_erp_release_693cc52-mobile-20261009-1791534858091.dump`。
- 大小 2838005 字节；SHA-256 `3b45f02548d0b7dd8193ecb73fda4e009da92c59be9a8bc3c24a42546ec6ffa7`；`pg_restore --list` 和校验和通过。没有删除历史备份；不是恢复演练或异地灾备证明。
- 预检通过真实配置、数据库连接、6 条必需迁移、23 张核心表、19 个索引、密码哈希、单实例 PM2、本地备份及非空构建检查。
- 24376 份应用/运行依赖文件逐一 SHA-256 校验，发布归档 SHA-256 `f444d2b45d76893db2d04c3932e50a8786ef27eb083a32285f4f0d2e2c2b75a9`。暂存静态检查 267 个页面/资源通过。
- 停止并重启唯一 `gpu-erp-api`，交换 `dist`、`server-dist`、`node_modules`、package/lock；失败自动回滚。其他 PM2 应用不操作。
- 保留旧静态资源兼容未刷新的页面。
- 完整旧代码/依赖回滚目录：`/home/ubuntu/gpu-erp-releases/live-before-693cc52-mobile-20261009-1791534858091`。

## 正式环境验收

- 正式 HTTPS：首页、库存、采购开单、销售开单、质检、资金账户、客户目录均返回新版 HTML，入口和 CSS 字节校验通过。
- 新入口 `/assets/index-f89gZPHB.js`，新 CSS `/assets/index-BRmqbi9v.css`。
- `/api/health`、`/api/ready` 返回 200/ok；匿名 `/api/state`、`/api/ops/metrics` 返回 401。
- 独立浏览器页使用既有登录会话，只读加载真实库存；确认新版入口/CSS，桌面表格和真实目录加载成功，采集的浏览器 error 日志为空。
- 手机 390×844：库存真实记录 20 行，文档宽度/scrollWidth 同为 390，底部导航可见。临时尺寸覆盖已恢复，验收页已关闭，不操作用户原有页签。
- 正式环境未执行录单、资金、库存或退货写入；本地模拟及独立数据库集成通过不等于生产业务写入验收。
- Nginx 既有 5173 端口 `conflicting server name "_"` 警告仍在，语法检查及 reload 成功，本次不扩大范围修改配置。
- 服务器 release 目录保留 `release.json`、`SHA256SUMS`、backup/preflight/canary/deployment/public 结果；本地证据目录 `/private/tmp/erp-release-a9cd1fc.vgcgkf`。
