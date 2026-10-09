// Static guard for docs/MOBILE_UI_RULES.md rules marked [lint].
// M17 quick-status chips are work items, not system meta
// M18 at most 4 metric cards per MetricsRegion
// M19 user-facing copy carries no implementation language
// M20 product name only comes from src/config/brand.ts
// M23 feature pages do not hand-roll fixed bottom bars
// Real exceptions go to scripts/mobile-rules-allowlist.json with a reason.
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import ts from "typescript";

const projectRoot = process.cwd();
const allowlist = JSON.parse(fs.readFileSync(path.join(projectRoot, "scripts", "mobile-rules-allowlist.json"), "utf8"));
const failures = [];

const UI_ROOTS = ["src/features", "src/components", "src/app", "src/services/api/adapters"];
const SKIP_FILE = /\.test\.tsx?$|\/design-system\//;
const BRAND_SOURCE = "src/config/brand.ts";

const META_LABEL = /权限$|权限边界|筛选状态|筛选能力|数据连接|库存状态|删除回滚|财务边界|到账规则|等级规则|客户轨迹|^当前页$|^当前筛选$|建议来源/;
const DEV_COPY = /服务端|服务器|租户|口径|现有服务|由现有|已连接|当前筛选结果|当前筛选汇总|按当前筛选|按接口|接口/;
// Hardware ports are domain language, not implementation detail.
const HARDWARE_PORT = /HDMI|DP|USB|PCIe|显示|信号|螺丝|氧化|供电|插槽|类型 \/ 接口/;
const METRIC_TAG = /^(?:Erp)?MetricCard$|^Metric$|^SummaryCard$/;
const BRAND_ALIASES = ["GPU ERP", "经营工作台"];
const STORE_NAME = "成都显卡一号店";

function walkFiles(directory) {
  const absolute = path.join(projectRoot, directory);
  if (!fs.existsSync(absolute)) return [];
  return fs.readdirSync(absolute, {withFileTypes: true}).flatMap((entry) => {
    const rel = path.posix.join(directory, entry.name);
    if (entry.isDirectory()) return walkFiles(rel);
    return /\.tsx?$/.test(entry.name) && !SKIP_FILE.test(rel) ? [rel] : [];
  });
}

const allowed = (rule, file, text) => (allowlist[rule] || []).some((item) => item.file === file && (item.text === undefined || text.includes(item.text)));

function report(rule, file, sourceFile, node, message) {
  const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
  failures.push(`[${rule}] ${file}:${line} ${message}`);
}

function insideConsoleCall(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isCallExpression(current) && /^console\./.test(current.expression.getText())) return true;
    if (ts.isImportDeclaration(current) || ts.isExportDeclaration(current)) return true;
  }
  return false;
}

function textOf(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) return [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join("…");
  if (ts.isJsxText(node)) return node.text.trim();
  return null;
}

function jsxName(node) {
  const opening = ts.isJsxElement(node) ? node.openingElement : ts.isJsxSelfClosingElement(node) ? node : null;
  return opening ? opening.tagName.getText() : null;
}

function isInsideFoldedMetricRegion(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (jsxName(current) === "details" && /<summary\b[^>]*>[\s\S]*?更多指标[\s\S]*?<\/summary>/.test(current.getText())) return true;
  }
  return false;
}

for (const file of UI_ROOTS.flatMap(walkFiles)) {
  const source = fs.readFileSync(path.join(projectRoot, file), "utf8");
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const isFeature = file.startsWith("src/features/");
  // Cards are often built in a variable (`const cards = <>…</>`) and passed in
  // as `{cards}`; resolve same-file identifiers so they are still counted.
  const declarations = new Map();
  const collect = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) declarations.set(node.name.text, node.initializer);
    ts.forEachChild(node, collect);
  };
  collect(sourceFile);
  const countMetricCards = (root, seen = new Set()) => {
    let count = 0;
    const walk = (inner) => {
      const name = jsxName(inner);
      if (name === "details") return;
      if (name && METRIC_TAG.test(name)) count += 1;
      if (ts.isIdentifier(inner) && declarations.has(inner.text) && !seen.has(inner.text) && (ts.isJsxExpression(inner.parent) || ts.isArrayLiteralExpression(inner.parent) || ts.isSpreadElement(inner.parent))) {
        seen.add(inner.text);
        count += countMetricCards(declarations.get(inner.text), seen);
      }
      ts.forEachChild(inner, walk);
    };
    walk(root);
    return count;
  };

  const visit = (node) => {
    const text = textOf(node);
    if (text && !insideConsoleCall(node)) {
      if (DEV_COPY.test(text) && !(text.includes("接口") && !/服务端|服务器|租户|口径|现有服务|由现有|已连接|筛选|按接口/.test(text) && HARDWARE_PORT.test(text)) && !allowed("copy", file, text)) {
        report("M19", file, sourceFile, node, `界面文案含实现细节：「${text.slice(0, 40)}」`);
      }
      for (const alias of BRAND_ALIASES) if (text.includes(alias)) report("M20", file, sourceFile, node, `出现品牌别名「${alias}」，请改用 BRAND`);
      if (text.includes(STORE_NAME) && file !== BRAND_SOURCE && !allowed("brand", file, text)) report("M20", file, sourceFile, node, `店名请从 ${BRAND_SOURCE} 读取`);
      if (isFeature && /\bfixed\b/.test(text) && /\bbottom-/.test(text) && !allowed("dock", file, text)) report("M23", file, sourceFile, node, "功能页面不要自建底部固定栏，请用 ErpMobileActionDock / ErpSubmitBar");
    }

    if (isFeature && ts.isVariableDeclaration(node) && /quickstatus/i.test(node.name.getText()) && node.initializer) {
      const scan = (inner) => {
        if (ts.isPropertyAssignment(inner) && inner.name.getText() === "label" && ts.isStringLiteral(inner.initializer) && META_LABEL.test(inner.initializer.text) && !allowed("quickStatus", file, inner.initializer.text)) {
          report("M17", file, sourceFile, inner, `状态标签「${inner.initializer.text}」是系统信息，不应放在页面顶部`);
        }
        ts.forEachChild(inner, scan);
      };
      scan(node.initializer);
    }

    if (isFeature && jsxName(node) === "MetricsRegion" && ts.isJsxElement(node) && !isInsideFoldedMetricRegion(node)) {
      const count = node.children.reduce((total, child) => total + countMetricCards(child), 0);
      if (count > 4 && !allowed("metrics", file)) report("M18", file, sourceFile, node, `一行数据卡 ${count} 张，最多 4 张`);
    }
    // Templates take metrics as a prop; the same limit applies there.
    if (isFeature && ts.isJsxAttribute(node) && node.name.getText() === "metrics" && node.initializer && /^(ErpListPage)$/.test(node.parent.parent.tagName.getText())) {
      const count = countMetricCards(node.initializer);
      if (count > 4 && !allowed("metrics", file)) report("M18", file, sourceFile, node, `一行数据卡 ${count} 张，最多 4 张`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

for (const file of ["index.html", "public/manifest.webmanifest"]) {
  const text = fs.readFileSync(path.join(projectRoot, file), "utf8");
  for (const alias of BRAND_ALIASES) if (text.includes(alias)) failures.push(`[M20] ${file} 出现品牌别名「${alias}」`);
}

if (failures.length) {
  console.error(`手机端规则检查失败（${failures.length} 项，规则见 docs/MOBILE_UI_RULES.md）：`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("手机端规则检查通过：M17 状态标签、M18 数据卡数量、M19 文案、M20 品牌、M23 底部固定栏。");
