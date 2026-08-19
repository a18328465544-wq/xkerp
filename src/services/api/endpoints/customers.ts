import {adaptCustomerDirectory, adaptCustomerMutation, toCustomerCreateRequest, toCustomerUpdateRequest} from "../adapters/customer.adapter";
import {apiRequest} from "../client";
import {fetchFullStateCompat} from "../state-compat";
import type {CustomerDirectoryResponseDto, CustomerMutationResponseDto} from "../dto/customer.dto";
import type {CustomerDirectorySnapshot, CustomerRecordFormValues} from "@/src/types/customer";

export const customersApi = {
  async list(permissions: {showProfit: boolean}, signal?: AbortSignal): Promise<CustomerDirectorySnapshot> {
    const response = await fetchFullStateCompat<CustomerDirectoryResponseDto>(signal);
    return adaptCustomerDirectory(response, permissions);
  },

  async create(values: CustomerRecordFormValues, permissions: {showProfit: boolean}, signal?: AbortSignal) {
    const response = await apiRequest<CustomerMutationResponseDto>("/api/customers", {method: "POST", body: JSON.stringify(toCustomerCreateRequest(values)), signal});
    return adaptCustomerMutation(response, permissions);
  },

  async update(id: string, values: CustomerRecordFormValues, permissions: {showProfit: boolean}, signal?: AbortSignal) {
    const response = await apiRequest<CustomerMutationResponseDto>(`/api/gpu_erp/crm/customer/${encodeURIComponent(id)}`, {method: "PATCH", body: JSON.stringify(toCustomerUpdateRequest(values)), signal});
    return adaptCustomerMutation(response, permissions);
  },

  async remove(id: string, signal?: AbortSignal) {
    await apiRequest<CustomerMutationResponseDto>(`/api/customers/${encodeURIComponent(id)}`, {method: "DELETE", signal});
  },
};
