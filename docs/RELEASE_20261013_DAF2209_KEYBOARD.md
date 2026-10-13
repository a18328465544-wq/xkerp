# 生产发布记录：daf2209（2026-10-13）

## 版本与范围

- 发布标识：`daf2209-main-20261013T080846Z`。
- 源码分支：本地 `main`，提交 `daf2209127899b19afd04db50d1d524dc1bd0264`。
- 本次发布：iPhone 键盘可视区域避让，以及统一图表曲线视觉。
- 只切换本地构建的 `dist/` 和 `server-dist/`；没有运行数据库迁移。
- 新构建 156 个文件上传后逐项 SHA-256 校验通过；并从旧构建保留了静态资源，兼容已打开的旧页面。
- 回滚目录：`/home/ubuntu/gpu-erp-releases/live-before-daf2209-main-20261013T080846Z`。

## 本地检查与线上验收

- `npm run lint`：通过。
- `npm test`：1879 项，1842 通过、37 条件跳过、0 失败。
- `npm run build`：通过；前端、API 与日报构建文件均非空。
- `npm run test:mobile-rules`：38 个页面 × 320px / 390px，通过。
- 发布前与发布后 `npm run smoke:public`：通过。
- 公网首页 HTTP 200；首页 SHA-256 与本地产物一致：`bcfd11d10721ace60b46c4cae624e75cdb8cbbeb6ed60329b5d6e5fae46a3068`。
- 新入口脚本公网解压后 SHA-256 与本地产物一致；JS gzip 响应正常。
- `/api/health` 和 `/api/ready` 通过；就绪版本 `stateRevision=1670`。
- `gpu-erp-api` 为单实例 `fork_mode` 且 online；部署后重启计数为 41。预发布进程与 `cdweb` 未重启。
- `nginx -t` 通过；仍有既有的 `0.0.0.0:5173` `_` server-name 冲突警告，本次未修改 Nginx 配置。
- 未执行业务写操作；本次公网冒烟没有做登录态业务验收。键盘交互通过本地 Chromium / WebKit 模拟，未在实体 iPhone 键盘上验收。

## 数据库备份与异地备份豁免

- 发布前服务器本地备份：`/home/ubuntu/gpu-erp-backups/gpu_erp_20261013-160719.dump`。
- 大小：2,912,479 bytes；SHA-256：`8b69c30f1d1c51b3e9981ad7eeec8d565b2516418e59ab91312104f8c9de5fc5`；`pg_restore --list` 校验通过。
- 基于本次代码执行的生产预检确认：环境密钥、数据库连接、6 条必需迁移、23 张核心表、19 个索引、密码哈希、本地备份和构建产物均通过。
- `OFFSITE_BACKUP_TARGET` 未配置，是预检唯一失败项。用户明确授权本次豁免；未伪造或更改该配置。异地备份配置和恢复演练仍待补齐。

## 发布状态

- 生产站点：`https://gpu-erp.cdgpu.cn/`，本次发布已验收。
- 没有推送 GitHub；部署使用服务器可达的本地 `main` 提交。
