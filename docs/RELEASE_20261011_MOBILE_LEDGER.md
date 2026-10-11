# 手机型号出入记录：方案 1 发布

日期：2026-10-11，Asia/Shanghai。

## 结果

- 已将应用提交 `a0559adfdd73d30192fab3fbd6d49b3869bb9f69` 合入并推送 `xkerp/main`。
- 基于原主线 `5af481b`，保留其已合并改动和先前商品分类/型号库存数量调整；没有合并其它 checkout 的未提交内容。
- 发布标识 `mobile-ledger-20261011T151406Z`，生产站点 <https://gpu-erp.cdgpu.cn/inventory?view=models>。
- 此文是发布后记录；文档提交不改变已部署应用产物的提交编号。
- 实施范围和本地测试见 `PRODUCT_LEDGER_MOBILE_20261011.md`；用户选定第一张图，手机端出入记录列表完成，桌面原表格保持。

## 本地门禁与产物

- lint、前端/服务端/服务端测试类型检查、完整测试、生产脚本测试、性能预算、production 依赖审计和干净 release 检查通过。
- 完整测试 1806 项：1769 通过，37 条件数据库测试跳过，0 失败；一次性本地 PostgreSQL HTTP 集成测试另外执行，37 通过、0 跳过、0 失败。
- 最终定向测试 32 通过；设计原图和实际浏览器截图全图与首两行局部并排验收通过，含修正后的二次对比。
- 153 个 dist/server-dist 文件，总计 7989897 字节，在本地生成 SHA-256 清单，服务器暂存和正式目录逐文件校验通过。
- 前端、API、日报均本地构建；服务器没有安装依赖、执行 Vite 或 esbuild。运行依赖声明与服务器既有 node_modules 对应声明一致。

## 备份和切换

- 用户明确确认“本次跳过异地备份检查，继续上线”；只对本次发布生效。原长期预检/安全配置不修改，不以虚假的异地目标绕过检查。
- 新本地数据库备份：`/home/ubuntu/gpu-erp-backups/gpu_erp_release_mobile-ledger-20261011T151406Z.dump`。
- 备份 2897502 字节，SHA-256 `cb9168209b1cb9cff17de0d7a4a2ca24326156e77afe23061d856e4dd285bfa9`，manifest 和 `pg_restore --list` 校验通过；不是实际恢复或异地灾备证明。
- 真实数据库连接、6 条必需迁移、23 张核心表、19 个索引、密码哈希、单实例 PM2、近期本地备份和构建文件检查通过；唯一异地备份项记作本次 WAIVED。
- 只切换 dist/server-dist，保留旧静态 assets 兼容未刷新的页面，只重启 `gpu-erp-api`；`cdweb`、`gpu-erp-api-staging` PID 不变。
- 旧版本可回滚目录：`/home/ubuntu/gpu-erp-releases/live-before-mobile-ledger-20261011T151406Z`。
- 发布记录目录：`/home/ubuntu/gpu-erp-releases/mobile-ledger-20261011T151406Z`，包含 release.json、SHA256SUMS、备份结果、预检、产物校验和探针日志。

## 生产验收

- 本机和公网 `/api/health`、`/api/ready` 返回 HTTP 200、`data.ok: true`；stateRevision 1638。公网首页正常，匿名受保护状态接口 401。
- 服务运行 289 秒后再次验证 PID 3354115、online、PM2 重启计数未增长，健康/就绪仍正常。
- 公网入口 `/assets/index-BLhIUAIg.js`、CSS `/assets/index-bhPUolDl.css` 的响应字节 SHA-256 与本地产物一致，HTTP 200、gzip 和静态 immutable 缓存正常。
- 用既有登录会话打开真实生产库存，390×844 手机出入记录加载真实型号和 50 条单据；类型筛选销售出库返回 17 条且均为该类型，原始负金额未改写。重置恢复记录。
- 点击真实采购单记录进入原 `/purchase?keyword=...` 入口，正确显示单据，返回库存正常。未执行录单、资金、库存或退货写入。
- 1440×900 正式环境仍为原桌面侧拉/表格和筛选结构，控制台 error 为空。
- 正式手机截图：`/private/tmp/erp-mobile-v2-evidence/ledger-production-a0559ad-390.jpg`。
- 本地发布证据目录：`/private/tmp/erp-ledger-release.WHg6qx`。本地临时截图/发布脚本不提交源码。
- Nginx 原有 5173 端口 `conflicting server name "_"` 警告仍存在，配置检查与 reload 成功；本次不扩大范围调整该配置。

## 证据边界

浏览器尺寸验收不等于 iPhone 真机键盘/手势测试；只读生产点验不等于生产资金写入、历史账务核对或异地恢复演练。本次没有修改业务金额/库存计算、数据结构或原单据跳转规则。
