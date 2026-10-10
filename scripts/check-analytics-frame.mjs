import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
// Profit and commission use the finance detail template on every viewport
// (FINANCE_DESKTOP_LAYOUT_PLAN template B/A); they are checked further below.
const financeTemplatePages = [
  "src/features/finance/pages/FinanceProfitPage.tsx",
  "src/features/finance/pages/FinanceCommissionPage.tsx",
];
const analyticsPages = [
  "src/features/quotes/pages/MarketQuotesPage.tsx",
  "src/features/ai/pages/AiInsightsPage.tsx",
];
const failures = [];

for (const relative of analyticsPages) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) {
    failures.push(`${relative}: Analytics 页面文件不存在`);
    continue;
  }
  const source = fs.readFileSync(file, "utf8");
  if (!source.includes("ErpAnalyticsPageFrame")) failures.push(`${relative}: 必须使用 ErpAnalyticsPageFrame`);
  if (!source.includes("ErpMetricCard")) failures.push(`${relative}: 指标必须复用公共 ErpMetricCard`);
  if (source.includes("FinanceMetricCard")) failures.push(`${relative}: 不应通过业务别名重复实现指标卡，应直接复用 ErpMetricCard`);
  const requiredRegions = relative.includes("AiInsightsPage")
    ? ["AnalyticsKpiRegion", "AnalyticsMainRegion"]
    : ["AnalyticsKpiRegion", "AnalyticsToolbar", "AnalyticsMainRegion"];
  for (const region of requiredRegions) {
    if (!source.includes(region)) failures.push(`${relative}: 缺少 ${region}`);
  }
}

for (const relative of financeTemplatePages) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) {
    failures.push(`${relative}: 页面文件不存在`);
    continue;
  }
  const source = fs.readFileSync(file, "utf8");
  if (!source.includes("FinanceDetailPageLayout")) failures.push(`${relative}: 必须使用 FinanceDetailPageLayout`);
  if (!source.includes("ErpMetricCard")) failures.push(`${relative}: 指标必须复用公共 ErpMetricCard`);
  if (!source.includes("MetricsRegion")) failures.push(`${relative}: 数据卡必须放在 MetricsRegion 中`);
  if (source.includes("FinanceMetricCard")) failures.push(`${relative}: 不应通过业务别名重复实现指标卡，应直接复用 ErpMetricCard`);
}

const profitFile = path.join(root, "src/features/finance/pages/FinanceProfitPage.tsx");
if (fs.existsSync(profitFile)) {
  const source = fs.readFileSync(profitFile, "utf8");
  for (const region of ["AnalyticsToolbar", "AnalyticsDetailRegion", "AnalyticsInsightItem", "更多指标", "phoneFoldBeforeTable"]) {
    if (!source.includes(region)) failures.push(`销售利润页: 缺少 ${region}`);
  }
  for (const forbidden of ["ErpFinancePageFrame", "<MainRegion", "function MetricCard", "function SummaryFact", "function TableControls"]) {
    if (source.includes(forbidden)) failures.push(`销售利润页: 不应继续使用或定义 ${forbidden}`);
  }
  if (!source.includes('surface="plain"')) failures.push("销售利润页: Detail Table 不应再嵌套第二层 Card");
  if (/minHeight=\{/.test(source) || /(?:min-h-|h-\[)/.test(source)) failures.push("销售利润页: 不得自行定义 Visualization/KPI 固定高度");
  if (/ProfitInsightRow|rounded-\[var\(--erp-radius-md\)\].*border/.test(source)) failures.push("销售利润页: Insight 不应重新创建卡片式条目");
  // Only flag page-level arbitrary negative margins here. Content widgets may
  // legitimately use their own icon positioning and small grids.
  if (/-m[trblxy]?-\[/.test(source)) failures.push("销售利润页: 发现页面专属布局 hack，请调整 Analytics Region 而不是页面布局");
}

if (failures.length) {
  console.error(`Analytics Frame 检查失败（${failures.length} 项）：`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Analytics Frame v2 检查通过：分析页复用统一 Frame、指标和区域骨架；毛利与提成使用财务明细模板。");
