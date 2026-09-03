# OneERP 渐进式重构路线图

这份路线图把代码审查结论转成可执行边界。目标是降低变更风险和重复实现，不做一次性重写，不改变现有 API、权限和库存/财务不变量。

## 当前基线

- `server/index.ts` 只保留应用初始化、鉴权、中间件和仍未迁移的路由；新路由进入 `server/routes/`。
- `server/store.ts` 仍是业务动作的唯一入口，暂不把库存、金额和 SN 规则复制到路由层。
- PostgreSQL 仍是唯一持久化事实来源；状态补丁、幂等和图片关系不能绕过现有事务。
- 前端页面继续使用现有 `components/ui`、`components/common`、`components/domain` 和 Query Key。

## 已完成（第一阶段）

- 财务结算账户读取与账户/经办人汇总迁移到 `routes/financeReadModels.ts`。
- 结算账户写入迁移到 `routes/financeAccounts.ts`。
- 收付款和资金调拨写入迁移到 `routes/financePayments.ts`。
- 商品模板写入迁移到 `routes/productMutations.ts`。
- 客户/供应商写入迁移到 `routes/partnerMutations.ts`。
- 共享图片上传、列表和资源读取迁移到 `routes/media.ts`。
- CRM 客户/活动写入迁移到 `routes/crmMutations.ts`，规范化账户、时间线和线索读取迁移到 `routes/crmNormalizedReads.ts`。
- AI 洞察、Copilot SSE 和建议状态操作迁移到 `routes/aiRoutes.ts`。
- 采购、销售（含出库）和退货单据写入迁移到 `routes/purchaseMutations.ts`、`routes/salesMutations.ts`、`routes/returnMutations.ts`，保留原有幂等、库存预占/释放、退款与 CRM 同步事务。
- 收入/支出登记弹窗共用 `FinanceEntryDialogShell`，字段错误提示由共享字段组件统一渲染。
- 前端跨域刷新统一通过 `invalidateErpDomains`，重复域名会自动去重。
- 每个新路由边界都有注册测试，保持路径、权限中间件数量和返回契约可回归。

## 第二阶段：路由和领域边界

1. 将 CRM 读取路由继续按“兼容快照 / 规范化 SQL”双读边界维护，快捷录入解析与确认保持独立事务。
2. 将商品、客户、供应商、媒体、AI、采购、销售、退货注册统一放在清晰的领域挂载区，禁止在组合根新增业务处理函数。
3. 继续迁移检测、装配、售后、行情和库存剩余写入；每次只移动一组相关接口。
4. 为每个迁移模块补成功、权限拒绝、非法输入和状态补丁测试；不通过测试不继续下一组。

## 第三阶段：Store / DB 解耦

1. 先按领域从 `store.ts` 提取纯计算和集合联动函数，保持 `createStoreActions` 兼容外观。
2. 再把财务、库存、采购销售的命令分别收敛到领域服务；金额、SN、余额规则只保留一份。
3. 从 `db.ts` 提取查询、集合写入、事务锁和迁移辅助模块；不在没有迁移脚本和回滚演练时改变表结构。
4. 对高频列表优先使用 PostgreSQL 分页读取，保留快照接口的兼容期和双读观测。

## 第四阶段：前端一致性和密度

1. 继续抽取表格工具栏、空/错/加载态和详情抽屉的公共壳体；业务列定义留在 Feature 内。
2. 所有写入成功后的刷新调用 `invalidateErpDomains`，需要详情级精确更新时再补充专用 Query Key。
3. 清理超长 JSX 和重复的表单字段，优先处理审计中相似度最高、变更频率最高的页面。
4. 每个页面保持 `ErpPageFrame → ErpPageHeader → ErpPageToolbar → ErpPageContent`，1440px 与窄屏都检查首屏、空态、错态和编辑态。

## 持续门禁

- 不新增超过 600 行的领域文件；超过 240 字符的单行不得作为新代码提交。
- `server/index.ts` 不新增业务规则和数据库查询；只允许挂载模块、传递依赖和全局错误处理。
- 新增集合或命令必须同步更新 `requestStatePolicy`、状态补丁、数据库初始化和测试。
- 每个阶段都必须通过：

  ```text
  npm run typecheck
  npm run typecheck:server
  npm run typecheck:server-tests
  npm run lint
  npm test
  npm run build
  ```

- 集成测试依赖 PostgreSQL 时，明确记录“静态/单元已验证”和“真实数据库未验证”，不把跳过当作通过。

## 完成标准

重构完成不以文件数量为目标，而以以下结果为准：新需求能在单一领域模块内定位；跨集合动作仍保持事务一致；页面刷新、权限脱敏和错误反馈不回归；组合根、Store 和 DB 的职责可以通过目录和测试直接解释。
