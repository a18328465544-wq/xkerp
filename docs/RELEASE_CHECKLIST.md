# Frontend V2 / GPU ERP 发布门禁

这份清单把“代码通过”和“环境可上线”分开。没有通过生产预检，不把本地构建成功当作上线成功。

## 1. 本地代码门禁

在准备发布的干净 Git 工作树中执行：

```bash
npm ci
npm run typecheck
npm run typecheck:server
npm run typecheck:server-tests
npm run lint
npm test
npm run test:backend-http:docker
npm run build
npm audit --omit=dev --audit-level=high
npm run check:release
```

`test:backend-http` 必须配置独立的 `TEST_DATABASE_URL`，不能复用生产数据库；测试还要设置
`POSTGRES_IMPORT_LEGACY_JSON=false`，避免把本地历史 JSON 导入测试库。本机 Docker 环境优先运行
`test:backend-http:docker`，脚本会创建并自动清理一次性 PostgreSQL 16 容器。CI 使用独立 PostgreSQL 服务执行同一组测试。

正式服务端代码继续执行严格类型检查；历史测试夹具使用兼容级类型检查，确保测试文件至少纳入 TypeScript 门禁，后续新增测试不得依赖不安全的类型断言。

## 2. 生产环境门禁

服务器上的 `.env` 只保留真实运行时配置，不进入 Git。部署前执行：

```bash
NODE_ENV=production npm run preflight:production
sudo nginx -t
sudo install -m 0644 ops/systemd/gpu-erp-backup.service ops/systemd/gpu-erp-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now gpu-erp-backup.timer
systemctl is-enabled gpu-erp-backup.timer
systemctl status gpu-erp-backup.timer --no-pager
```

预检必须确认 `DATABASE_URL`、`OPEN_API_TOKEN`、`BOOTSTRAP_ADMIN_PASSWORD`、数据库连接、必需迁移版本、核心业务表和三份非空构建文件均存在。生产密钥不得使用示例占位值且长度不得少于 16 位，`POSTGRES_IMPORT_LEGACY_JSON` 必须为 `false`。

## 3. 备份和恢复门禁

- 备份服务使用 `ops/systemd/gpu-erp-backup.service` 和 `.timer`。
- 恢复演练必须使用独立数据库，并设置：

```bash
RESTORE_DRILL_CONFIRM=I_UNDERSTAND_ISOLATED_DATABASE npm run restore:drill
```

- 生产数据库与 `RESTORE_TEST_DATABASE_URL` 相同会被脚本拒绝。
- 恢复脚本会校验核心业务表、必需迁移版本，并对比生产源与恢复库的核心表行数指纹。
- 记录最近一次 dump 文件、大小、`pg_restore --list` 结果、核心表行数指纹和恢复演练时间。

## 4. 上线后验收

```bash
SMOKE_BASE_URL=https://gpu-erp.cdgpu.cn npm run smoke:public
curl -fsSI https://gpu-erp.cdgpu.cn/
pm2 list
sudo nginx -t
```

浏览器还需使用真实测试账号完成一次只读验收：登录、财务页、销售开单页、质检页、日期/选项浮层、移动端侧栏和一个权限拒绝场景。不能把“匿名 HTTP 冒烟通过”当成业务流程验收。

## 5. 当前边界

本仓库已提供就绪探针、CI 数据库集成测试、备份定时器模板、恢复演练脚本和发布追踪检查。systemd/Nginx 的服务器安装、生产构建切换和 Git 推送仍属于显式上线动作，需在获得上线授权后执行并留存结果。
