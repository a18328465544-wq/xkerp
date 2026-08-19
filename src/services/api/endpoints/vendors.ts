import {adaptVendorDirectory, adaptVendorMutation, toVendorCreateRequest, toVendorUpdateRequest} from "../adapters/vendor.adapter";
import {apiRequest} from "../client";
import {fetchFullStateCompat} from "../state-compat";
import type {VendorDirectoryResponseDto, VendorMutationResponseDto} from "../dto/vendor.dto";
import type {VendorDirectorySnapshot, VendorRecordFormValues} from "@/src/types/vendor";

export const vendorsApi = {
  async list(permissions: {showProfit: boolean}, signal?: AbortSignal): Promise<VendorDirectorySnapshot> {
    const response = await fetchFullStateCompat<VendorDirectoryResponseDto>(signal);
    return adaptVendorDirectory(response, permissions);
  },

  async create(values: VendorRecordFormValues, permissions: {showProfit: boolean}, signal?: AbortSignal) {
    const response = await apiRequest<VendorMutationResponseDto>("/api/vendors", {method: "POST", body: JSON.stringify(toVendorCreateRequest(values)), signal});
    return adaptVendorMutation(response, permissions);
  },

  async update(id: string, values: VendorRecordFormValues, permissions: {showProfit: boolean}, signal?: AbortSignal) {
    const response = await apiRequest<VendorMutationResponseDto>(`/api/vendors/${encodeURIComponent(id)}`, {method: "PUT", body: JSON.stringify(toVendorUpdateRequest(values)), signal});
    return adaptVendorMutation(response, permissions);
  },

  async remove(id: string, signal?: AbortSignal) {
    await apiRequest<VendorMutationResponseDto>(`/api/vendors/${encodeURIComponent(id)}`, {method: "DELETE", signal});
  },
};
