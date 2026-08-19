import type {SalesReturnListFilters, SalesReturnStatus} from "@/src/types/returns";

export const defaultSalesReturnListFilters: SalesReturnListFilters = {
  keyword: "",
  status: "",
  page: 1,
  pageSize: 20,
};

const statuses: readonly SalesReturnStatus[] = ["待处理", "已完成", "已作废"];

function positiveInt(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function parseSalesReturnListFilters(search: string): SalesReturnListFilters {
  const params = new URLSearchParams(search);
  const status = params.get("status") || "";
  return {
    keyword: params.get("keyword") || "",
    status: statuses.includes(status as SalesReturnStatus) ? status as SalesReturnStatus : "",
    page: positiveInt(params.get("page"), 1),
    pageSize: positiveInt(params.get("pageSize"), 20),
  };
}

export function salesReturnListFiltersToSearch(filters: SalesReturnListFilters) {
  const params = new URLSearchParams();
  if (filters.keyword.trim()) params.set("keyword", filters.keyword.trim());
  if (filters.status) params.set("status", filters.status);
  if (filters.page !== 1) params.set("page", String(filters.page));
  if (filters.pageSize !== 20) params.set("pageSize", String(filters.pageSize));
  return params;
}

export function countActiveSalesReturnFilters(filters: SalesReturnListFilters) {
  return [filters.keyword, filters.status].filter(Boolean).length;
}
