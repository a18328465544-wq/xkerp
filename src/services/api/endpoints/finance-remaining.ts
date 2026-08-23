import {apiRequest} from "../client";
import {adaptCommissionRecords, adaptCustomerFunds, adaptLogs, adaptUserMutation, adaptUsers} from "../adapters/finance-remaining.adapter";
import type {CustomerFundsResponseDto, LogsResponseDto, UserMutationResponseDto, UsersResponseDto} from "../dto/finance-remaining.dto";
import type {PagedCollection} from "@/src/types/finance-remaining";
import type {PublicStateResponseDto} from "../dto/state.dto";
import type {StoreRole} from "@/src/types/auth";

export interface CustomerFundsFilters {startDate: string; endDate: string; trendStartDate: string; trendEndDate: string}
export interface LogsFilters {page: number; pageSize: number; keyword: string}
export type PermissionOverridePatch = {
  allowedMenus?: string[] | null;
  showCost?: boolean | null;
  showProfit?: boolean | null;
  canDelete?: boolean | null;
  canEditHistory?: boolean | null;
  canManualOutbound?: boolean | null;
};
export interface UserMutationInput {
  username?: string;
  password?: string;
  displayName: string;
  role: StoreRole;
  enabled: boolean;
  remarks?: string;
  permissionOverrides?: PermissionOverridePatch;
}

export function toUserMutationRequest(input: UserMutationInput) {
  const body: Record<string, unknown> = {
    displayName: input.displayName.trim(),
    role: input.role,
    enabled: input.enabled,
    remarks: input.remarks?.trim() || undefined,
  };
  if (input.username !== undefined) body.username = input.username.trim();
  if (input.password?.trim()) body.password = input.password.trim();
  if (input.permissionOverrides !== undefined) body.permissionOverrides = input.permissionOverrides;
  return body;
}

export const customerFundsApi = { async snapshot(filters: CustomerFundsFilters, signal?: AbortSignal) { const params = new URLSearchParams({startDate: filters.startDate, endDate: filters.endDate, trendStartDate: filters.trendStartDate, trendEndDate: filters.trendEndDate}); return adaptCustomerFunds(await apiRequest<CustomerFundsResponseDto>(`/api/gpu_erp/finance/customer-funds?${params.toString()}`, {signal})); } };
export const usersApi = {
  async list(signal?: AbortSignal) { return adaptUsers(await apiRequest<UsersResponseDto>("/api/users", {signal})); },
  async create(input: UserMutationInput, signal?: AbortSignal) { return adaptUserMutation(await apiRequest<UserMutationResponseDto>("/api/users", {method: "POST", body: JSON.stringify(toUserMutationRequest(input)), signal})); },
  async update(id: string, input: UserMutationInput, signal?: AbortSignal) { return adaptUserMutation(await apiRequest<UserMutationResponseDto>(`/api/users/${encodeURIComponent(id)}`, {method: "PUT", body: JSON.stringify(toUserMutationRequest(input)), signal})); },
};
export const logsApi = { async list(filters: LogsFilters, signal?: AbortSignal): Promise<PagedCollection<import("@/src/types/finance-remaining").AuditLogItem>> { const params = new URLSearchParams({page: String(filters.page), pageSize: String(filters.pageSize)}); if (filters.keyword.trim()) params.set("keyword", filters.keyword.trim()); return adaptLogs(await apiRequest<LogsResponseDto>(`/api/logs?${params.toString()}`, {signal})); } };
export const financeCommissionApi = { async list(mode: "purchase" | "sales", signal?: AbortSignal) { const response = await apiRequest<PublicStateResponseDto>("/api/finance/commissions", {signal}); const payload = response.data && typeof response.data === "object" ? response.data as {purchaseCommissions?: unknown} : {}; return adaptCommissionRecords(Array.isArray(payload.purchaseCommissions) ? payload.purchaseCommissions : [], mode); } };
