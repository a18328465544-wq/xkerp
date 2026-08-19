import {apiRequest} from "../client";
import {fetchFullStateCompat} from "../state-compat";
import {adaptFinanceTransferMutation, adaptFinanceTransferSnapshot, toFinanceTransferRequest} from "../adapters/finance-transfer.adapter";
import type {FinanceTransferListResponseDto, FinanceTransferMutationResponseDto} from "../dto/finance-transfer.dto";
import type {FinanceTransferFormValues} from "@/src/types/finance-transfer";

export const financeTransfersApi = {
  async listAll(signal?: AbortSignal) {
    const response = await fetchFullStateCompat<FinanceTransferListResponseDto>(signal);
    return adaptFinanceTransferSnapshot(response);
  },
  async create(values: FinanceTransferFormValues, handler: string, signal?: AbortSignal) {
    const response = await apiRequest<FinanceTransferMutationResponseDto>("/api/gpu_erp/finance/account-transfer/create", {method: "POST", body: JSON.stringify(toFinanceTransferRequest(values, handler)), signal});
    return adaptFinanceTransferMutation(response);
  },
  async update(id: string, values: FinanceTransferFormValues, handler: string, signal?: AbortSignal) {
    const response = await apiRequest<FinanceTransferMutationResponseDto>(`/api/gpu_erp/finance/account-transfer/${encodeURIComponent(id)}`, {method: "PUT", body: JSON.stringify(toFinanceTransferRequest(values, handler)), signal});
    return adaptFinanceTransferMutation(response);
  },
  async remove(id: string, signal?: AbortSignal) {
    const response = await apiRequest<FinanceTransferMutationResponseDto>(`/api/gpu_erp/finance/account-transfer/${encodeURIComponent(id)}`, {method: "DELETE", signal});
    return adaptFinanceTransferMutation(response);
  },
};
