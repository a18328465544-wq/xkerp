import {apiRequest, apiStreamRequest} from "../client";
import {ApiError} from "../errors";
import type {CopilotContext, CopilotToolName, CopilotToolResult} from "@/src/utils/copilotTools";

export type {CopilotContext, CopilotCardAction, CopilotToolResult} from "@/src/utils/copilotTools";

export type AiInsightSeverity = "high" | "medium" | "low";
export interface AiInsightItem {
  id: string;
  label: string;
  title: string;
  detail: string;
  severity: AiInsightSeverity;
  actionLabel: string;
  actionTab: string;
  evidence: string[];
  confidence: number;
}

export interface AiInsightsResult {
  insights: AiInsightItem[];
  source: "ai" | "rules" | string;
  generatedAt: string;
  expiresAt: string;
  model?: string;
}

export interface CopilotRequest {
  messages: CopilotMessage[];
  context: CopilotContext;
}

export interface CopilotMessage {
  role: "user" | "assistant" | "tool";
  content: string;
  toolName?: string;
}

export type CopilotStreamEvent =
  | {type: "status"; message: string}
  | {type: "tool_start"; toolName: CopilotToolName; label: string}
  | {type: "tool_result"; result: CopilotToolResult}
  | {type: "text_delta"; text: string}
  | {type: "done"; source: "rules" | "model"; model?: string}
  | {type: "error"; message: string};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function text(value: unknown, fallback = "") { return typeof value === "string" ? value : fallback; }

const toolNames = new Set<CopilotToolName>([
  "searchInventory", "searchCustomer", "createQuote", "createPurchase", "createSales",
  "createCustomer", "recommendPurchase", "generateReport", "analyzeProfit", "searchFinance",
]);
const resultTypes = new Set<CopilotToolResult["type"]>([
  "inventory", "customer", "quote", "purchase", "sales", "profit", "finance", "report", "approval", "empty", "error",
]);

function adaptCopilotResult(value: unknown): CopilotToolResult | null {
  const item = record(value);
  const toolName = toolNames.has(item.toolName as CopilotToolName) ? item.toolName as CopilotToolName : null;
  const type = resultTypes.has(item.type as CopilotToolResult["type"]) ? item.type as CopilotToolResult["type"] : "error";
  const title = text(item.title);
  if (!toolName || !title) return null;
  type CopilotMetric = NonNullable<CopilotToolResult["metrics"]>[number];
  type CopilotAction = NonNullable<CopilotToolResult["actions"]>[number];
  const metrics: CopilotToolResult["metrics"] = Array.isArray(item.metrics) ? item.metrics.map((metric): CopilotMetric => {
    const row = record(metric);
    const tone: CopilotMetric["tone"] = row.tone === "blue" || row.tone === "green" || row.tone === "amber" || row.tone === "rose" || row.tone === "slate" ? row.tone : undefined;
    return {label: text(row.label), value: text(row.value), tone};
  }).filter((metric) => metric.label && metric.value).slice(0, 6) : undefined;
  const rows = Array.isArray(item.rows) ? item.rows.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object")).slice(0, 20) : undefined;
  const actions: CopilotToolResult["actions"] = Array.isArray(item.actions) ? item.actions.map((action): CopilotAction | null => {
    const row = record(action);
    const kind: CopilotAction["kind"] | null = row.kind === "navigate" || row.kind === "open" || row.kind === "confirm" ? row.kind : null;
    return kind && text(row.label) ? {label: text(row.label), kind, tab: text(row.tab) || undefined, payload: record(row.payload)} : null;
  }).filter((action): action is CopilotAction => action !== null).slice(0, 4) : undefined;
  return {
    id: text(item.id, `copilot-result-${Date.now()}`),
    toolName,
    type,
    title,
    summary: text(item.summary) || undefined,
    metrics,
    rows,
    data: record(item.data),
    actions,
    requiresConfirmation: item.requiresConfirmation === true,
    error: text(item.error) || undefined,
  };
}

function parseCopilotEvent(value: unknown): CopilotStreamEvent | null {
  const item = record(value);
  const type = item.type;
  if (type === "status" && text(item.message)) return {type, message: text(item.message)};
  if (type === "tool_start" && toolNames.has(item.toolName as CopilotToolName)) return {type, toolName: item.toolName as CopilotToolName, label: text(item.label, "正在分析")};
  if (type === "tool_result") {
    const result = adaptCopilotResult(item.result);
    return result ? {type, result} : null;
  }
  if (type === "text_delta" && text(item.text)) return {type, text: text(item.text)};
  if (type === "done" && (item.source === "rules" || item.source === "model")) return {type, source: item.source, model: text(item.model) || undefined};
  if (type === "error" && text(item.message)) return {type, message: text(item.message)};
  return null;
}

/** Parse complete SSE frames and retain an incomplete trailing frame. */
export function parseCopilotSseBuffer(buffer: string): {events: CopilotStreamEvent[]; rest: string} {
  const normalized = buffer.replaceAll("\r\n", "\n");
  const frames = normalized.split("\n\n");
  const rest = frames.pop() || "";
  const events: CopilotStreamEvent[] = [];
  for (const frame of frames) {
    const data = frame.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
    if (!data) continue;
    try {
      const event = parseCopilotEvent(JSON.parse(data) as unknown);
      if (event) events.push(event);
    } catch {
      // Ignore malformed frames; the server's final error event remains the
      // authoritative failure signal and keeps the UI recoverable.
    }
  }
  return {events, rest};
}

function adaptInsight(value: unknown, index: number): AiInsightItem | null {
  const item = record(value);
  const title = text(item.title);
  const detail = text(item.detail);
  if (!title || !detail) return null;
  const severity = item.severity === "high" || item.severity === "medium" || item.severity === "low" ? item.severity : "low";
  return {
    id: text(item.id, `insight-${index}`),
    label: text(item.label, "经营建议"),
    title,
    detail,
    severity,
    actionLabel: text(item.actionLabel, "查看"),
    actionTab: text(item.actionTab, "inventory"),
    evidence: Array.isArray(item.evidence) ? item.evidence.filter((entry): entry is string => typeof entry === "string").slice(0, 3) : [],
    confidence: Number.isFinite(Number(item.confidence)) ? Number(item.confidence) : 0,
  };
}

export const aiApi = {
  async insights(signal?: AbortSignal): Promise<AiInsightsResult> {
    const response = await apiRequest<{data?: unknown}>("/api/ai/insights", {signal});
    const data = record(response.data);
    const insights = Array.isArray(data.insights) ? data.insights.map(adaptInsight).filter((item): item is AiInsightItem => Boolean(item)) : [];
    return {insights, source: text(data.source, "rules"), generatedAt: text(data.generatedAt), expiresAt: text(data.expiresAt), model: text(data.model) || undefined};
  },
  async streamCopilot(input: CopilotRequest, onEvent: (event: CopilotStreamEvent) => void, signal?: AbortSignal): Promise<void> {
    const response = await apiStreamRequest("/api/ai/copilot", {method: "POST", body: JSON.stringify(input), signal});
    if (!response.body) throw new ApiError(0, "AI 助手没有返回可读取的消息流");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (true) {
        const chunk = await reader.read();
        buffer += decoder.decode(chunk.value || new Uint8Array(), {stream: !chunk.done});
        const parsed = parseCopilotSseBuffer(buffer);
        buffer = parsed.rest;
        parsed.events.forEach(onEvent);
        if (chunk.done) break;
      }
      const final = parseCopilotSseBuffer(`${buffer}\n\n`);
      final.events.forEach(onEvent);
    } finally {
      reader.releaseLock();
    }
  },
};
