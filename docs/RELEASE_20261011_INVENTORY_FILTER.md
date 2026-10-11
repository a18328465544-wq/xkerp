# 库存手机筛选、移动滚动与语音修复发布

日期：2026-10-11，Asia/Shanghai。

## 发布结果

- 正式站点：<https://gpu-erp.cdgpu.cn/inventory>。
- 应用产物提交：`e56e06c504d6723d4f529575d21269352605504f`，已合入并推送 `xkerp/main`。
- 基于另一个窗口已完成的主线提交 `1bddfe2173304a7d0fca692ec7edf7c62d8e32ae`，一并发布移动滚动、语音草稿回填及库存型号行改进。
- 发布标识：`e56e06c-inventory-filter-20261011T070016Z`。
- 本文为部署后的记录；后续文档提交不改变已发布应用产物的提交编号。
- 独立干净发布 checkout：`/private/tmp/gpu-erp-voice-release-20261011`。原 `gpu-erp-frontend-v2` 的 `feat/voice-entry` checkout 和未提交改动保持原样。

## 本次库存筛选改动

- 手机筛选使用用户选定的分组平铺行：常用条件、细化范围、更多条件，保留固定的重置和应用操作。
- 筛选使用局部草稿；关闭取消本次选择，应用后统一更新列表条件并回到第一页。重置筛选保留原搜索、排序和每页条数。
- 复用原分类、库存状态、风险以及可搜索选择组件；品牌、供应商、库位选项来自原库存读取接口，不创建业务记录。
- 筛选行 48px，关闭操作 44px，手机搜索输入 16px。刷新、每页条数和选中行操作保留在库存作业面板，不改变桌面布局。

## 本地验证

- `npm run lint`，前端/后端/后端测试类型检查、生产脚本测试、本地构建、性能预算、production 依赖审计及 release 检查通过。
- 完整测试共 1772 项：1735 通过、37 项条件数据库测试跳过、0 失败。
- 使用一次性本地 PostgreSQL 16 容器执行独立后端 HTTP 集成测试：37 通过、0 跳过、0 失败。不连接生产数据库测试。
- 生产预检脚本测试 5 项通过；production 依赖审计 0 漏洞。
- 对本地构建后的 dist 进行 390×844 浏览器点验：品牌选择正常，选择后应用前 URL 不变化，应用后条件进入 URL，浏览器 error 日志为空。
- 前端、API、日报均在本地构建。生产服务器没有执行依赖安装、Vite 或 esbuild。候选与生产运行依赖声明一致，无需更换 node_modules。

## 备份与版本切换

- 用户明确授权“本次跳过异地备份检查，继续上线”。豁免仅对本发布标识生效，不修改长期备份规则或生产环境配置。
- 新服务器本地备份：`/home/ubuntu/gpu-erp-backups/gpu_erp_release_e56e06c-inventory-filter-20261011T070016Z.dump`。
- 大小 2859637 字节；SHA-256：`f1b64f800e94b0977f7f9012b7da81dc8d362c6d69559f7d82484f4701fe80bd`。备份校验和与 `pg_restore --list` 通过；不是实际恢复演练或异地灾备证明。
- 真实数据库连接、6 条必需迁移、23 张核心表、19 个索引、密码哈希、单实例 PM2、本地备份和非空构建预检通过；仅异地备份项标为本次豁免。
- 153 份 dist / server-dist 文件、总计 7984384 字节，在暂存和正式目录逐一 SHA-256 校验通过。
- 保留旧静态资源，兼容未刷新的页面。仅切换 dist / server-dist 并重启 `gpu-erp-api`，未修改生产业务数据或执行迁移。
- 第一次切换后的探针验证错误使用顶层 `ok`，实际 ERP 响应为 `data.ok`。脚本自动恢复旧产物并重启服务，旧文件哈希及健康状态已核实。修正为严格验证实际响应契约后，第二次发布成功；两次日志均保留。
- 旧版本回滚目录：`/home/ubuntu/gpu-erp-releases/live-before-e56e06c-inventory-filter-20261011T070016Z-attempt2`。
- 其他服务 `cdweb` 和 `gpu-erp-api-staging` 的 PID 未改变，未被重启。

## 正式环境验收

- ERP 真实探针端口为 3001，`/api/health`、`/api/ready` 均返回 HTTP 200、`data.ok: true`；就绪检查 stateRevision 为 1601。
- 公网 smoke：首页 HTTP 200，健康和就绪检查成功，匿名 `/api/state` 返回 401。
- 公网新入口 `/assets/index-BOJV1lfS.js`、CSS `/assets/index-CuChVfcB.css` 和库存 chunk `/assets/InventoryListPage-BTFfjJUK.js` 均 HTTP 200，实际响应字节哈希与本地构建一致；入口和 CSS gzip、静态缓存验证通过。
- 使用既有登录会话独立打开正式库存页，只读加载真实记录。1280px 桌面页面和 390×844 手机筛选点验通过，6 个筛选行均高 48px，品牌选择加载真实选项，搜索字体 16px，浏览器 error 日志为空。
- 正式环境没有录单、资金、库存或退货写入。上述本地测试与生产只读验收不等于生产业务写入验收，也不代表所有手机尺寸或 iPhone 真机已全量复测。
- Nginx 既有 5173 端口 `conflicting server name "_"` 警告仍在，语法检查和 reload 成功，本次未扩大范围修改配置。
- 服务器发布记录目录：`/home/ubuntu/gpu-erp-releases/e56e06c-inventory-filter-20261011T070016Z`，保留 release.json、SHA256SUMS、备份校验、预检、探针及两次部署结果。
- 本地发布证据：`/private/tmp/erp-filter-release-e56e06c-20261011`；手机正式页面截图：`/private/tmp/erp-mobile-v2-evidence/inventory-filter-live-e56e06c-390.jpg`。临时截图不纳入源码提交。
