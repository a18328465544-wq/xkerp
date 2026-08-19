import { claimDailyNotification, loadState, markDailyNotificationFailed, markDailyNotificationSent } from "./db.ts";
import { buildDailyBusinessReport, buildFeishuDailyAiSummaryMessage } from "./dailyReport.ts";
import { notifyFeishuDailyReport } from "./feishu.ts";
import { getDashboardAiInsights } from "./aiInsights.ts";
import { storeDate } from "../src/utils/storeTime.ts";

const args = new Set(process.argv.slice(2));
const dateArg = process.argv.slice(2).find(arg => arg.startsWith("--date="));
const reportDate = dateArg ? dateArg.slice("--date=".length) : storeDate();
const dryRun = args.has("--dry-run");
const testMode = args.has("--test");
const notificationType = "business_daily_report";
const cutoff = process.env.FEISHU_DAILY_REPORT_CUTOFF || "20:00";

if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) throw new Error("日报日期必须是 YYYY-MM-DD");
if (!/^\d{2}:\d{2}$/.test(cutoff)) throw new Error("FEISHU_DAILY_REPORT_CUTOFF 必须是 HH:mm");

const state = await loadState();
const report = buildDailyBusinessReport(state, reportDate, cutoff);
const ai = await getDashboardAiInsights(state);
const text = `${testMode ? "【测试推送】\n" : ""}${buildFeishuDailyAiSummaryMessage(report, ai)}`;

if (dryRun) {
  console.log(text);
  process.exit(0);
}

if (!process.env.FEISHU_DAILY_REPORT_WEBHOOK_URL?.trim()) {
  throw new Error("未配置 FEISHU_DAILY_REPORT_WEBHOOK_URL，日报未发送");
}

if (testMode) {
  const result = await notifyFeishuDailyReport(text);
  if (result.sent === false) throw new Error(`飞书测试投递失败: ${result.reason}`);
  console.log("[daily-report] 测试日报已发送，未占用正式日报发送记录");
  process.exit(0);
}

if (!await claimDailyNotification(reportDate, notificationType)) {
  console.log(`[daily-report] ${reportDate} 已发送或正在发送，跳过重复推送`);
  process.exit(0);
}

try {
  const result = await notifyFeishuDailyReport(text);
  if (result.sent === false) throw new Error(`飞书投递失败: ${result.reason}`);
  await markDailyNotificationSent(reportDate, notificationType, { report, ai });
  console.log(`[daily-report] ${reportDate} 已发送`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  await markDailyNotificationFailed(reportDate, notificationType, message);
  throw error;
}
