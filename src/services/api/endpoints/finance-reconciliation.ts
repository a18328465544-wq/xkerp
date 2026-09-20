import {apiRequest} from "../client";
import type {FinanceReconciliationReport} from "@/src/types/finance-reconciliation";

type FinanceReconciliationResponseDto = {data?: FinanceReconciliationReport};

function safeLimit(limit: number) {
  return Math.min(500, Math.max(1, Math.floor(Number.isFinite(limit) ? limit : 200)));
}

export const financeReconciliationApi = {
  async inspect(limit = 200, signal?: AbortSignal) {
    const response = await apiRequest<FinanceReconciliationResponseDto>(`/api/finance/reconciliation?limit=${safeLimit(limit)}`, {signal});
    if (!response.data) throw new Error("账务体检没有返回结果");
    return response.data;
  },
};
