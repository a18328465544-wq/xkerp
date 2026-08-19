import {apiRequest} from "../client";
import {fetchFullStateCompat} from "../state-compat";
import {adaptFinanceIncomeCollection, adaptFinanceIncomeMutation, adaptFinanceIncomeSnapshot, toFinanceIncomeRequest} from "../adapters/finance-income.adapter";
import type {FinanceIncomeListResponseDto, FinanceIncomeMutationResponseDto} from "../dto/finance-income.dto";
import type {FinanceIncomeFilters, FinanceIncomeFormValues} from "@/src/types/finance-income";

export const financeIncomeApi = {
  async listAll(signal?: AbortSignal) {
    const response = await fetchFullStateCompat<FinanceIncomeListResponseDto>(signal);
    return adaptFinanceIncomeSnapshot(response);
  },
  async list(filters: FinanceIncomeFilters, signal?: AbortSignal) {
    const response = await fetchFullStateCompat<FinanceIncomeListResponseDto>(signal);
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
