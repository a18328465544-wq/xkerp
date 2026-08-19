import type {FinanceIncomeFilters} from "@/src/types/finance-income";
import {readDateRange} from "@/src/lib/dateRangePickerUtils";

export const defaultFinanceIncomeFilters: FinanceIncomeFilters = {keyword: "", businessType: "all", accountId: "all", handler: "", startDate: "", endDate: "", page: 1, pageSize: 20};
function positive(value: string | null, fallback: number) {const parsed = Number(value); return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;}

export function parseFinanceIncomeFilters(search: string): FinanceIncomeFilters {
  const params = new URLSearchParams(search);
  const pageSize = positive(params.get("pageSize"), 20);
  const dateRange = readDateRange(params, "startDate", "endDate");
  return {keyword: (params.get("keyword") || "").trim(), businessType: (params.get("businessType") || "all").trim() || "all", accountId: (params.get("accountId") || "all").trim() || "all", handler: (params.get("handler") || "").trim(), ...dateRange, page: positive(params.get("page"), 1), pageSize: [20, 50, 100].includes(pageSize) ? pageSize : 20};
}

export function financeIncomeFiltersToSearch(filters: FinanceIncomeFilters) {
  const params = new URLSearchParams();
  if (filters.keyword) params.set("keyword", filters.keyword);
  if (filters.businessType !== "all") params.set("businessType", filters.businessType);
  if (filters.accountId !== "all") params.set("accountId", filters.accountId);
  if (filters.handler) params.set("handler", filters.handler);
  if (filters.startDate) params.set("startDate", filters.startDate);
  if (filters.endDate) params.set("endDate", filters.endDate);
  if (filters.page > 1) params.set("page", String(filters.page));
  if (filters.pageSize !== 20) params.set("pageSize", String(filters.pageSize));
  return params;
}
