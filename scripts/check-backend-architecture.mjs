import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const indexPath = path.join(root, "server", "index.ts");
const dbPath = path.join(root, "server", "db.ts");
const appPath = path.join(root, "server", "app.ts");
const policyPath = path.join(root, "server", "mutationPolicy.ts");
const indexSource = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, "utf8") : "";
const dbSource = fs.existsSync(dbPath) ? fs.readFileSync(dbPath, "utf8") : "";
const policySource = fs.existsSync(policyPath) ? fs.readFileSync(policyPath, "utf8") : "";
const observabilityPath = path.join(root, "server", "observability.ts");
const observabilitySource = fs.existsSync(observabilityPath) ? fs.readFileSync(observabilityPath, "utf8") : "";
const failures = [];

function fail(message) {
  failures.push(message);
}

if (!fs.existsSync(appPath) || !/export\s+\{[^}]*createApp/.test(fs.readFileSync(appPath, "utf8"))) {
  fail("后端必须提供不绑定端口的 createApp() 入口。");
}
if (/let\s+state\s*:\s*AppState\s*=\s*await\s+loadState\s*\(/.test(indexSource) || !/ensureStateReady/.test(indexSource)) {
  fail("应用导入时不能直接建立数据库状态；必须通过 ensureStateReady() 懒加载。");
}
if (/writeRequestTail|serializeWriteRequests|app\.use\(serializeWriteRequests\)/.test(indexSource)) {
  fail("禁止按 HTTP 方法使用全局 writeRequestTail/serializeWriteRequests 写锁。");
}
if (!/createSerializedMutationRunner/.test(indexSource) || !/runSerializedStateMutation/.test(indexSource)) {
  fail("真实业务写操作必须经过串行 mutation runner。");
}
if (!/requiresStateSerialization/.test(indexSource) || !/isStateMutationPath/.test(policySource) || !fs.existsSync(policyPath)) {
  fail("业务写操作和完整状态快照必须经过显式 mutation policy，而不是按 HTTP 方法全量加锁。");
}
if (/saveQueue\s*=\s*saveQueue\.then/.test(dbSource)) {
  fail("数据库保存队列不能使用会被 rejected 永久污染的 saveQueue.then 链。");
}
if (!/createResilientQueue/.test(dbSource)) {
  fail("数据库保存必须使用可恢复的统一队列入口。");
}
const httpIntegrationSource = fs.readFileSync(path.join(root, "server", "httpIntegration.test.ts"), "utf8");
if (!/TEST_DATABASE_URL/.test(dbSource) || !/process\.env\.NODE_ENV\s*===\s*"test"/.test(httpIntegrationSource)) {
  fail("后端集成测试必须显式使用 NODE_ENV=test + TEST_DATABASE_URL，不能默认读取生产 DATABASE_URL。");
}
if (!/redactRequestPath/.test(observabilitySource) || !/safeErrorMessage/.test(observabilitySource)) {
  fail("结构化日志必须通过统一的请求路径和异常信息脱敏入口。");
}
if (/app\.use\(asyncRoute\(requireAuth\)\)/.test(indexSource)) {
  fail("认证不能只注册在部分路由之后。");
}
if (/actions\(\)/.test(indexSource)) {
  fail("HTTP 路由创建 Store actions 时必须传入 request-scoped context，不能回退到 currentRole。");
}

const authBoundary = indexSource.indexOf("app.use(requireApiAuthentication);");
const firstFinanceRoute = indexSource.indexOf('app.get("/api/finance/daily-closing"');
if (authBoundary < 0 || firstFinanceRoute < 0 || authBoundary > firstFinanceRoute) {
  fail("财务路由必须位于统一 API 认证边界之后。");
}

if (/api\/ai\/(?:copilot|insights\/refresh)/.test(policySource)) {
  fail("AI Copilot/分析刷新不能进入 ERP 状态 mutation 锁。");
}

if (failures.length) {
  console.error(`后端架构检查失败（${failures.length} 项）：`);
  failures.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}

console.log("后端架构检查通过：认证边界、mutation runner、保存队列和 app factory 已登记。");
