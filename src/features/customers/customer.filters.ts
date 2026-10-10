import type {CustomerDirectoryFilters, CustomerDirectoryItem} from "@/src/types/customer";

export const defaultCustomerFilters: CustomerDirectoryFilters = {keyword: "", type: "all", channel: "all", categoryId: "all", level: "all", page: 1, pageSize: 20};

export function parseCustomerFilters(search: string): CustomerDirectoryFilters {
  const params = new URLSearchParams(search);
  const page = Number(params.get("page"));
  const pageSize = Number(params.get("pageSize"));
  return {
    keyword: params.get("keyword") || "",
    type: params.get("type") || "all",
    channel: params.get("channel") || "all",
    categoryId: params.get("categoryId") || "all",
    level: params.get("level") || "all",
    page: Number.isInteger(page) && page > 0 ? page : 1,
    pageSize: [20, 50, 100].includes(pageSize) ? pageSize : 20,
  };
}

export function customerFiltersToSearch(filters: CustomerDirectoryFilters) {
  const params = new URLSearchParams();
  if (filters.keyword.trim()) params.set("keyword", filters.keyword.trim());
  if (filters.type !== "all") params.set("type", filters.type);
  if (filters.channel !== "all") params.set("channel", filters.channel);
  if (filters.categoryId !== "all") params.set("categoryId", filters.categoryId);
  if (filters.level !== "all") params.set("level", filters.level);
  if (filters.page > 1) params.set("page", String(filters.page));
  if (filters.pageSize !== 20) params.set("pageSize", String(filters.pageSize));
  return params;
}

function normalized(value: string) {
  return value.trim().toLocaleLowerCase("zh-CN").replace(/\s+/g, " ");
}

export function filterCustomers(customers: CustomerDirectoryItem[], filters: CustomerDirectoryFilters) {
  const keyword = normalized(filters.keyword);
  return customers.filter((customer) => {
    if (filters.type !== "all" && customer.type !== filters.type) return false;
    if (filters.channel !== "all" && customer.source !== filters.channel) return false;
    if (filters.categoryId !== "all" && customer.categoryId !== filters.categoryId) return false;
    if (filters.level !== "all" && customer.level !== filters.level) return false;
    if (!keyword) return true;
    return normalized([customer.id, customer.name, customer.contact, customer.phone || "", customer.wechat || "", customer.source, customer.type, customer.owner || "", customer.remarks || "", ...customer.tags].join(" ")).includes(keyword);
  });
}
