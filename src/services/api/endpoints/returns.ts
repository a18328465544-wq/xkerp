import {apiRequest} from "../client";
import {adaptPurchaseReturnList, adaptSalesReturnComplete, adaptSalesReturnList, adaptSalesReturnMutation, toPurchaseReturnRequestDto, toSalesReturnUpdateRequestDto} from "../adapters/returns.adapter";
import type {SalesReturnCompleteResponseDto, SalesReturnListResponseDto, SalesReturnMutationResponseDto} from "../dto/returns.dto";
import type {PurchaseReturnFormValues, SalesReturnFormValues, SalesReturnListFilters, SalesReturnListItem} from "@/src/types/returns";
import {adaptPublicState} from "../adapters/state.adapter";
import type {PublicStateResponseDto} from "../dto/state.dto";

export function toSalesReturnListQueryParams(filters: SalesReturnListFilters) {
  const params = new URLSearchParams({type: "销售退货", page: String(filters.page), pageSize: String(filters.pageSize)});
  if (filters.keyword.trim()) params.set("keyword", filters.keyword.trim());
  if (filters.status) params.set("status", filters.status);
  return params;
}

export function toPurchaseReturnListQueryParams(filters: SalesReturnListFilters) {
  const params = new URLSearchParams({type: "进货退货", page: String(filters.page), pageSize: String(filters.pageSize)});
  if (filters.keyword.trim()) params.set("keyword", filters.keyword.trim());
  if (filters.status) params.set("status", filters.status);
  return params;
}

export const returnsApi = {
  async reference(filters: {type?: "sales" | "purchase"; keyword?: string; selectedDocNo?: string} = {}, signal?: AbortSignal) {
    const params = new URLSearchParams();
    if (filters.type) params.set("type", filters.type);
    if (filters.keyword?.trim()) params.set("keyword", filters.keyword.trim());
    if (filters.selectedDocNo?.trim()) params.set("selectedDocNo", filters.selectedDocNo.trim());
    const query = params.toString();
    return adaptPublicState(await apiRequest<PublicStateResponseDto>(`/api/returns/reference${query ? `?${query}` : ""}`, {signal}));
  },
  async listSales(filters: SalesReturnListFilters, signal?: AbortSignal) {
    const params = toSalesReturnListQueryParams(filters);
    const response = await apiRequest<SalesReturnListResponseDto>(`/api/returns?${params.toString()}`, {signal});
    return adaptSalesReturnList(response);
  },

  /** Resolve a return drawer reference across pages, including batch-return inventory cards. */
  async findSalesByReference(reference: string, signal?: AbortSignal) {
    const keyword = reference.trim();
    if (!keyword) return null;
    const result = await this.listSales({keyword, status: "", page: 1, pageSize: 100}, signal);
    return result.items.find((item) => item.id === keyword || item.returnNo === keyword || item.sourceInventoryId === keyword || item.sourceInventoryIds?.includes(keyword)) || null;
  },

  async listPurchase(filters: SalesReturnListFilters, signal?: AbortSignal) {
    const params = toPurchaseReturnListQueryParams(filters);
    const response = await apiRequest<SalesReturnListResponseDto>(`/api/returns?${params.toString()}`, {signal});
    return adaptPurchaseReturnList(response);
  },

  /** Resolve a purchase-return drawer reference across pages, including batch-return inventory cards. */
  async findPurchaseByReference(reference: string, signal?: AbortSignal) {
    const keyword = reference.trim();
    if (!keyword) return null;
    const result = await this.listPurchase({keyword, status: "", page: 1, pageSize: 100}, signal);
    return result.items.find((item) => item.id === keyword || item.returnNo === keyword || item.sourceInventoryId === keyword || item.sourceInventoryIds?.includes(keyword)) || null;
  },

  async createSales(values: SalesReturnFormValues, signal?: AbortSignal) {
    const {returnScope, returnItems, ...formValues} = values;
    return apiRequest<{data?: unknown; state?: unknown}>("/api/returns", {method: "POST", body: JSON.stringify({type: "销售退货", relatedDocType: "销售单", settlementMode: "原路退款", ...formValues, sourceInventoryId: formValues.sourceInventoryId || undefined, partyId: formValues.partyId || undefined, ...(returnScope === "document" && returnItems?.length ? {batchMode: "整单退货", items: returnItems} : {})}), signal});
  },

  async createPurchase(values: PurchaseReturnFormValues, signal?: AbortSignal) {
    return apiRequest<{data?: unknown; state?: unknown}>("/api/returns", {method: "POST", body: JSON.stringify(toPurchaseReturnRequestDto(values)), signal});
  },

  async complete(id: string, signal?: AbortSignal) {
    const response = await apiRequest<SalesReturnCompleteResponseDto>(`/api/returns/${encodeURIComponent(id)}/complete`, {method: "POST", signal});
    return adaptSalesReturnComplete(response.data);
  },

  async update(id: string, values: Pick<SalesReturnListItem, "handler" | "reason" | "remarks">, signal?: AbortSignal) {
    const response = await apiRequest<SalesReturnMutationResponseDto>(`/api/returns/${encodeURIComponent(id)}`, {method: "PATCH", body: JSON.stringify(toSalesReturnUpdateRequestDto(values)), signal});
    return adaptSalesReturnMutation(response);
  },

  async remove(id: string, signal?: AbortSignal) {
    const response = await apiRequest<SalesReturnMutationResponseDto>(`/api/returns/${encodeURIComponent(id)}`, {method: "DELETE", signal});
    return adaptSalesReturnMutation(response);
  },
};
