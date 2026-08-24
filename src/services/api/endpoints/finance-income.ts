import {apiRequest} from "../client";
import {adaptFinanceIncomeCollection, adaptFinanceIncomeMutation, adaptFinanceIncomeSnapshot, toFinanceIncomeRequest} from "../adapters/finance-income.adapter";
import type {FinanceIncomeListResponseDto, FinanceIncomeMutationResponseDto} from "../dto/finance-income.dto";
import type {FinanceIncomeFilters, FinanceIncomeFormValues} from "@/src/types/finance-income";

export const financeIncomeApi = {
  async list(filters: FinanceIncomeFilters, signal?: AbortSignal) {
    const params = new URLSearchParams({page: String(filters.page), pageSize: String(filters.pageSize)});
    if (filters.keyword.trim()) params.set("keyword", filters.keyword.trim());
    if (filters.businessType !== "all") params.set("businessType", filters.businessType);
    if (filters.accountId !== "all") params.set("accountId", filters.accountId);
    if (filters.handler) params.set("handler", filters.handler);
    if (filters.startDate) params.set("startDate", filters.startDate);
    if (filters.endDate) params.set("endDate", filters.endDate);
    const response = await apiRequest<FinanceIncomeListResponseDto>(`/api/gpu_erp/finance/payment-ins?${params.toString()}`, {signal});
    return adaptFinanceIncomeCollection(response, filters);
  },
  async create(values: FinanceIncomeFormValues, handler: string, signal?: AbortSignal) {
    const response = await apiRequest<FinanceIncomeMutationResponseDto>("/api/gpu_erp/finance/payment-in/create", {method: "POST", body: JSON.stringify(toFinanceIncomeRequest(values, handler)), signal});
    return adaptFinanceIncomeMutation(response);
  },
  async update(id: string, values: FinanceIncomeFormValues, handler: string, signal?: AbortSignal) {
    const response = await apiRequest<FinanceIncomeMutationResponseDto>(`/api/gpu_erp/finance/payment-in/${encodeURIComponent(id)}`, {method: "PUT", body: JSON.stringify(toFinanceIncomeRequest(values, handler)), signal});
    return adaptFinanceIncomeMutation(response);
  },
  async remove(id: string, signal?: AbortSignal) {
    const response = await apiRequest<FinanceIncomeMutationResponseDto>(`/api/gpu_erp/finance/payment-in/${encodeURIComponent(id)}`, {method: "DELETE", signal});
    return adaptFinanceIncomeMutation(response);
  },
};
