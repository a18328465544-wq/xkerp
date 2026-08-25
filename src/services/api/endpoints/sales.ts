import {apiRequest} from "../client";
import {adaptSalesCustomers, adaptSalesInventoryCandidates, adaptSalesInvoice, adaptSalesListState, adaptSalesOutboundResult, adaptSalesOutboundState, adaptSalesSettlementAccounts, toSalesOutboundRequestDto} from "../adapters/sales.adapter";
import type {SalesCreateResponseDto, SalesCustomerListResponseDto, SalesInventoryListResponseDto, SalesListStateResponseDto, SalesOutboundResponseDto, SalesSettlementAccountsResponseDto} from "../dto/sales.dto";
import type {SalesFormValues, SalesCustomerOption, SalesInventoryCandidate, SalesInvoiceResult, SalesListDataset, SalesListFilters, SalesOutboundDataset, SalesOutboundRequest, SalesOutboundResult, SalesSettlementAccountOption} from "@/src/types/sales";
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
  async list(filters: SalesListFilters, permissions: SalesApiPermissions, signal?: AbortSignal): Promise<SalesListDataset> {
    const params = new URLSearchParams(); Object.entries(filters).forEach(([key, value]) => {if (value !== "") params.set(key, String(value));});
    const response = await apiRequest<SalesListStateResponseDto>(`/api/sales-invoices?${params.toString()}`, {signal});
    return adaptSalesListState(response, permissions);
  },

  async listAllForReport(permissions: SalesApiPermissions, signal?: AbortSignal): Promise<SalesListDataset> {
    const base: SalesListFilters = {keyword: "", channel: "", paymentStatus: "", outboundStatus: "", dateStart: "", dateEnd: "", page: 1, pageSize: 200, sortKey: "date", sortDirection: "desc"};
    const first = await this.list(base, permissions, signal);
    const totalPages = first.selection?.meta.totalPages || 1;
    if (totalPages <= 1) return first;
    const items = [...first.items];
    // This is an explicit whole-period finance report, not an interactive list. Walk the
    // database pages sequentially so a long history cannot create an unbounded request burst.
    for (let page = 2; page <= totalPages; page += 1) {
      const next = await this.list({...base, page}, permissions, signal);
      items.push(...next.items);
    }
    return {items, source: "database-page"};
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

  async remove(id: string, signal?: AbortSignal): Promise<SalesInvoiceResult> {
    const response = await apiRequest<SalesCreateResponseDto>(`/api/sales-invoices/${encodeURIComponent(id)}`, {method: "DELETE", signal});
    return adaptSalesInvoice(response.data);
  },
};

export type {SalesApiPermissions, SalesCreateResponseDto};
