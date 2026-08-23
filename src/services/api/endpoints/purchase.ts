import {apiRequest} from "../client";
import {adaptPurchaseCreateResponse, adaptPurchaseDetailState, adaptPurchaseListState, adaptPurchaseReferenceData, toPurchaseRequestDto} from "../adapters/purchase.adapter";
import type {PurchaseCreateResponseDto, PurchaseDetailStateResponseDto, PurchaseListStateResponseDto, PurchaseReferenceStateResponseDto} from "../dto/purchase.dto";
import type {PurchaseDetail, PurchaseFormValues, PurchaseListDataset, PurchaseReferenceData, PurchaseSettlementAccountOption, PurchaseCreateResult} from "@/src/types/purchase";
import type {PurchaseDetailPermissions, PurchaseListPermissions, PurchaseReferencePermissions} from "../adapters/purchase.adapter";
import {ApiError} from "../errors";

export const purchaseApi = {
  async list(permissions: PurchaseListPermissions, signal?: AbortSignal): Promise<PurchaseListDataset> {
    const response = await apiRequest<PurchaseListStateResponseDto>("/api/purchase-invoices", {signal});
    return adaptPurchaseListState(response, permissions);
  },

  async referenceData(permissions: PurchaseReferencePermissions, signal?: AbortSignal): Promise<PurchaseReferenceData> {
    const response = await apiRequest<PurchaseReferenceStateResponseDto>("/api/purchase-invoices/reference", {signal});
    return adaptPurchaseReferenceData(response, permissions);
  },

  async create(values: PurchaseFormValues, account?: PurchaseSettlementAccountOption, signal?: AbortSignal): Promise<PurchaseCreateResult> {
    const request = toPurchaseRequestDto(values, account);
    const response = await apiRequest<PurchaseCreateResponseDto>("/api/purchase-invoices", {method: "POST", body: JSON.stringify(request), signal});
    return adaptPurchaseCreateResponse(response);
  },

  async detail(id: string, permissions: PurchaseDetailPermissions, signal?: AbortSignal): Promise<PurchaseDetail> {
    const response = await apiRequest<PurchaseDetailStateResponseDto>(`/api/purchase-invoices/detail?id=${encodeURIComponent(id)}`, {signal});
    const detail = adaptPurchaseDetailState(response, id, permissions);
    if (!detail) throw new ApiError(404, "采购单不存在，或当前账号无权查看该单据");
    return detail;
  },
};
