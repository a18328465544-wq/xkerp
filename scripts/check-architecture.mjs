import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sourceRoots = [
  "src/app",
  "src/components",
  "src/features",
  "src/hooks",
  "src/services",
  "src/stores",
  "src/types",
  "src/lib",
].map((relative) => path.join(root, relative));

function collectFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, {withFileTypes: true}).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectFiles(file);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name) ? [file] : [];
  });
}

function relative(file) {
  return path.relative(root, file).split(path.sep).join("/");
}

const files = sourceRoots.flatMap(collectFiles).filter((file, index, all) => all.indexOf(file) === index);
const featureFiles = files.filter((file) => relative(file).startsWith("src/features/"));
const failures = [];
const warnings = [];

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

for (const required of [
  "src/app/auth/AuthProvider.tsx",
  "src/app/auth/PermissionBoundary.tsx",
  "src/app/auth/capabilities.ts",
  "src/hooks/useUrlSearchState.ts",
  "src/hooks/useTablePreferences.ts",
  "src/services/api/state-compat.ts",
  "src/services/api/invalidation.ts",
]) {
  if (!fs.existsSync(path.join(root, required))) fail(`缺少架构边界文件：${required}`);
}

const routerFile = path.join(root, "src/app/router.tsx");
const routerSource = fs.existsSync(routerFile) ? fs.readFileSync(routerFile, "utf8") : "";
if (!routerSource.includes("<AuthBoundary>") || !routerSource.includes("<PermissionBoundary>")) {
  fail("路由根节点必须统一包裹 AuthBoundary 与 PermissionBoundary。");
}

for (const file of featureFiles) {
  const source = fs.readFileSync(file, "utf8");
  const fileName = relative(file);
  if (/\bfetch\s*\(/.test(source) || /["'`]\/api\//.test(source)) {
    fail(`${fileName} 绕过 services/api 直接访问接口。`);
  }
  if (/features\/legacy|@\/src\/features\/legacy/.test(source)) {
    fail(`${fileName} 导入 legacy Feature。`);
  }
  if (/src\/data\/demoData|@\/src\/data\/demoData/.test(source)) {
    fail(`${fileName} 导入正式路径禁止使用的 demoData。`);
  }
}

const serviceFiles = files.filter((file) => relative(file).startsWith("src/services/api/"));
for (const file of serviceFiles) {
  const source = fs.readFileSync(file, "utf8");
  const executableSource = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  if (file !== path.join(root, "src/services/api/state-compat.ts") && /\/api\/state\?mode=full/.test(executableSource)) {
    fail(`${relative(file)} 仍直接使用 full state URL，必须经过 state-compat.ts。`);
  }
}

const allSource = files.map((file) => ({file, source: fs.readFileSync(file, "utf8")}));
const allowedLegacyTypeBoundaries = new Set([
  // The public state adapter is the only remaining typed boundary for legacy
  // collections without a dedicated V2 domain projection.
  "src/services/api/adapters/state.adapter.ts",
]);
const rootTypeImports = allSource.filter(({file, source}) => /from\s+["']@\/src\/types["']/.test(source) && !allowedLegacyTypeBoundaries.has(relative(file))).length;
const allowedHistoryBoundaries = new Set([
  "src/hooks/useUrlSearchState.ts",
]);
const allowedStorageBoundaries = new Set([
  "src/hooks/useTablePreferences.ts",
  "src/services/api/client.ts",
]);
const allowedAuthBoundaries = new Set([
  "src/app/auth/AuthProvider.tsx",
]);
const rawHistoryFiles = allSource.filter(({file, source}) => /window\.history\.(?:replaceState|pushState)/.test(source) && !allowedHistoryBoundaries.has(relative(file))).length;
const rawStorageFiles = allSource.filter(({file, source}) => /window\.localStorage\.(?:getItem|setItem|removeItem)/.test(source) && !allowedStorageBoundaries.has(relative(file))).length;
const localAuthFiles = allSource.filter(({file, source}) => /authApi\.login\s*\(/.test(source) && !allowedAuthBoundaries.has(relative(file)) && !relative(file).startsWith("src/features/legacy/")).length;

if (rootTypeImports) warn(`仍有 ${rootTypeImports} 个正式文件使用 src/types.ts 兼容入口；新代码请使用 src/types/*。`);
if (rawHistoryFiles > 1) warn(`仍有 ${rawHistoryFiles} 个文件直接操作 window.history；新 List 页面必须使用 useUrlSearchState。`);
if (rawStorageFiles > 1) warn(`仍有 ${rawStorageFiles} 个文件直接操作 localStorage；表格偏好必须使用 useTablePreferences。`);
if (localAuthFiles) warn(`仍有 ${localAuthFiles} 个页面保留局部 authApi.login；新增页面不得复制登录表单，逐批迁移到 AuthBoundary。`);

for (const file of [
  "src/features/finance/pages/FinanceDashboardPage.tsx",
  "src/features/finance/pages/FinanceClosingPage.tsx",
  "src/features/finance/pages/FinanceAccountsPage.tsx",
  "src/features/finance/pages/FinanceExpensePage.tsx",
  "src/features/finance/pages/FinanceIncomePage.tsx",
]) {
  const absolute = path.join(root, file);
  if (!fs.existsSync(absolute)) continue;
  const lines = fs.readFileSync(absolute, "utf8").split("\n").length;
  if (lines > 700) warn(`${file} 仍有 ${lines} 行，已列入 Finance 分批拆分清单。`);
}

if (failures.length) {
  console.error(`架构边界检查失败（${failures.length} 项）：`);
  failures.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}

console.log(`架构边界检查通过：${files.length} 个正式源文件。`);
warnings.forEach((item) => console.warn(`⚠ ${item}`));
