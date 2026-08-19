import {apiRequest} from "../client";

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

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function text(value: unknown, fallback = "") { return typeof value === "string" ? value : fallback; }

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
};
