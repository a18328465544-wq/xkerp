import {apiRequest} from "../client";
import {adaptSalesCustomers, adaptSalesInventoryCandidates, adaptSalesInvoice, adaptSalesListState, adaptSalesOutboundResult, adaptSalesOutboundState, adaptSalesSettlementAccounts, toSalesOutboundRequestDto} from "../adapters/sales.adapter";
import type {SalesCreateResponseDto, SalesCustomerListResponseDto, SalesInventoryListResponseDto, SalesListStateResponseDto, SalesOutboundResponseDto, SalesSettlementAccountsResponseDto} from "../dto/sales.dto";
import type {SalesFormValues, SalesCustomerOption, SalesInventoryCandidate, SalesInvoiceResult, SalesListDataset, SalesOutboundDataset, SalesOutboundRequest, SalesOutboundResult, SalesSettlementAccountOption} from "@/src/types/sales";
import {toCreateSalesRequest} from "../adapters/sales.adapter";
import type {SalesApiPermissions} from "../adapters/sales.adapter";

export function toSalesCustomerQueryParams(keyword: string, page = 1, pageSize = 20) {
  const params = new URLSearchParams({page: String(page), pageSize: String(pageSize), role: "customer"});
  if (keyword.trim()) params.set("keyword", keyword.trim());
  return params;
}

export function toSalesInventoryQueryParams(keyword: string, page = 1, pageSize = 20) {
  const params = new URLSearchParams({page: String(page), pageSize: String(pageSize), activeOnly: "true", includeSold: "false", sortKey: "entryTime", sortDirection: "desc"});
  if (keyword.trim()) params.set("keyword", keyword.trim());
  return params;
}

export const salesApi = {
  async list(permissions: SalesApiPermissions, signal?: AbortSignal): Promise<SalesListDataset> {
    const response = await apiRequest<SalesListStateResponseDto>("/api/sales-invoices", {signal});
    return adaptSalesListState(response, permissions);
  },

  async outbound(signal?: AbortSignal): Promise<SalesOutboundDataset> {
    const response = await apiRequest<SalesListStateResponseDto>("/api/sales-invoices/outbound", {signal});
    return adaptSalesOutboundState(response);
  },

  async confirmOutbound(invoiceId: string, values: SalesOutboundRequest, signal?: AbortSignal): Promise<SalesOutboundResult> {
    const request = toSalesOutboundRequestDto(values);
    const response = await apiRequest<SalesOutboundResponseDto>(`/api/sales-invoices/${encodeURIComponent(invoiceId)}/outbound`, {method: "POST", body: JSON.stringify(request), signal});
    return adaptSalesOutboundResult(response.data);
  },

  async searchCustomers(keyword: string, signal?: AbortSignal): Promise<SalesCustomerOption[]> {
    const params = toSalesCustomerQueryParams(keyword, 1, 200);
    const response = await apiRequest<SalesCustomerListResponseDto>(`/api/gpu_erp/crm/accounts?${params.toString()}`, {signal});
    return adaptSalesCustomers(response);
  },

  async searchInventory(keyword: string, permissions: SalesApiPermissions, signal?: AbortSignal): Promise<SalesInventoryCandidate[]> {
    const params = toSalesInventoryQueryParams(keyword);
    const response = await apiRequest<SalesInventoryListResponseDto>(`/api/inventory/items?${params.toString()}`, {signal});
    return adaptSalesInventoryCandidates(response, permissions);
  },

  async settlementAccounts(signal?: AbortSignal): Promise<SalesSettlementAccountOption[]> {
    const response = await apiRequest<SalesSettlementAccountsResponseDto>("/api/gpu_erp/finance/settlement-accounts?page=1&pageSize=100", {signal});
    return adaptSalesSettlementAccounts(response);
  },

  async create(values: SalesFormValues, account?: SalesSettlementAccountOption, signal?: AbortSignal): Promise<SalesInvoiceResult> {
    const request = toCreateSalesRequest(values, account);
    const response = await apiRequest<SalesCreateResponseDto>("/api/sales-invoices", {method: "POST", body: JSON.stringify(request), signal});
    return adaptSalesInvoice(response.data);
  },
};

export type {SalesApiPermissions, SalesCreateResponseDto};
