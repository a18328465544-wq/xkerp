import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import ts from "typescript";

const root = process.cwd();
const pagesRoot = path.join(root, "src/features/finance/pages");
const allowlistPath = path.join(root, "scripts/finance-layout-allowlist.json");
const allowlist = JSON.parse(fs.readFileSync(allowlistPath, "utf8"));
const metricTag = /^(?:Erp)?Metric(?:Card)?$|^(?:FinanceEntry|Finance)?Metric$|^SummaryCard$/;
const foldedMetricRegion = /^(?:details|FinanceMoreMetrics|MoreMetrics)$/;
const fixedAsideGrid = /(?:lg|xl|2xl):grid-cols-\[minmax\(0,1fr\)_[0-9.]+(?:px|rem|vw)\]/g;
const failures = [];

function walkPages(directory) {
  return fs.readdirSync(directory, {withFileTypes: true}).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return walkPages(absolute);
    return entry.isFile() && entry.name.endsWith(".tsx") && !entry.name.endsWith(".test.tsx") ? [absolute] : [];
  });
}

function jsxTag(node) {
  const element = ts.isJsxElement(node) ? node.openingElement : ts.isJsxSelfClosingElement(node) ? node : undefined;
  return element?.tagName.getText();
}

function containsMetric(node) {
  let count = 0;
  const visit = (current) => {
    const tag = jsxTag(current);
    if (tag && foldedMetricRegion.test(tag)) return;
    if (tag && metricTag.test(tag)) count += 1;
    ts.forEachChild(current, visit);
  };
  ts.forEachChild(node, visit);
  return count;
}

function isAllowed(rule, file, text) {
  return (allowlist[rule] || []).some((entry) => entry.file === file
    && (entry.text === undefined || entry.text === text)
    && typeof entry.reason === "string"
    && entry.reason.trim().length > 0);
}

for (const file of walkPages(pagesRoot)) {
  const relative = path.relative(root, file).split(path.sep).join("/");
  const source = fs.readFileSync(file, "utf8");
  const sourceFile = ts.createSourceFile(relative, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const scan = (node) => {
    if (ts.isJsxElement(node) && jsxTag(node) === "MetricsRegion") {
      const count = containsMetric(node);
      if (count > 4 && !isAllowed("metrics", relative)) {
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
        failures.push(`${relative}:${line} MetricsRegion 中有 ${count} 张数据卡，最多 4 张`);
      }
    }
    ts.forEachChild(node, scan);
  };
  scan(sourceFile);

  for (const match of source.matchAll(fixedAsideGrid)) {
    const pattern = match[0];
    if (!isAllowed("aside", relative, pattern)) {
      const line = source.slice(0, match.index).split("\n").length;
      failures.push(`${relative}:${line} 存在固定宽度右侧栏 ${pattern}，请移除或登记有业务必要的例外`);
    }
  }
}

if (failures.length) {
  console.error(`财务布局规则检查失败（${failures.length} 项）：`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("财务布局规则检查通过：指标卡不超过 4 张，未发现未登记的固定宽度右侧栏。");
