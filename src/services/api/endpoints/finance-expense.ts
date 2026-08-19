import {apiRequest} from "../client";
import {fetchFullStateCompat} from "../state-compat";
import {adaptFinanceExpenseMutation, adaptFinanceExpenseSnapshot, toFinanceExpenseRequest} from "../adapters/finance-expense.adapter";
import type {FinanceExpenseListResponseDto, FinanceExpenseMutationResponseDto} from "../dto/finance-expense.dto";
import type {FinanceExpenseFormValues} from "@/src/types/finance-expense";
export const financeExpenseApi = {
  async listAll(signal?: AbortSignal) {return adaptFinanceExpenseSnapshot(await fetchFullStateCompat<FinanceExpenseListResponseDto>(signal));},
  async create(values: FinanceExpenseFormValues, handler: string, signal?: AbortSignal) {return adaptFinanceExpenseMutation(await apiRequest<FinanceExpenseMutationResponseDto>("/api/gpu_erp/finance/payment-out/create", {method: "POST", body: JSON.stringify(toFinanceExpenseRequest(values, handler)), signal}));},
  async update(id: string, values: FinanceExpenseFormValues, handler: string, signal?: AbortSignal) {return adaptFinanceExpenseMutation(await apiRequest<FinanceExpenseMutationResponseDto>(`/api/gpu_erp/finance/payment-out/${encodeURIComponent(id)}`, {method: "PUT", body: JSON.stringify(toFinanceExpenseRequest(values, handler)), signal}));},
  async remove(id: string, signal?: AbortSignal) {return adaptFinanceExpenseMutation(await apiRequest<FinanceExpenseMutationResponseDto>(`/api/gpu_erp/finance/payment-out/${encodeURIComponent(id)}`, {method: "DELETE", signal}));},
};
