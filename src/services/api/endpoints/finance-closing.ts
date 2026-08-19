import {adaptFinanceDailyClosing, adaptFinanceDailyClosingMutation, adaptFinanceDailyClosings, toFinanceDailyClosingRequest} from "../adapters/finance-closing.adapter";
import {apiRequest} from "../client";
import type {FinanceDailyClosingResponseDto} from "../dto/finance-closing.dto";
import type {FinanceDailyClosingRequest} from "@/src/types/finance-closing";

function safeLimit(limit: number) {
  return Math.min(90, Math.max(1, Math.floor(Number.isFinite(limit) ? limit : 30)));
}

export const financeClosingApi = {
  async list(limit = 30, signal?: AbortSignal) {
    const response = await apiRequest<FinanceDailyClosingResponseDto>(`/api/finance/daily-closings?limit=${safeLimit(limit)}`, {signal});
    return adaptFinanceDailyClosings(response);
  },
  async get(date: string, signal?: AbortSignal) {
    const response = await apiRequest<FinanceDailyClosingResponseDto>(`/api/finance/daily-closing?date=${encodeURIComponent(date)}`, {signal});
    const closing = adaptFinanceDailyClosing(response.data);
    if (!closing) throw new Error("该日期没有已保存的日结快照");
    return closing;
  },
  async create(values: FinanceDailyClosingRequest, signal?: AbortSignal) {
    const response = await apiRequest<FinanceDailyClosingResponseDto>("/api/finance/daily-closing", {method: "POST", body: JSON.stringify(toFinanceDailyClosingRequest(values)), signal});
    return adaptFinanceDailyClosingMutation(response);
  },
};
