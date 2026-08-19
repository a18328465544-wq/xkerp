import type {QueryClient} from "@tanstack/react-query";
import {queryKeys} from "./query-keys";

export type ErpQueryDomain = "state" | "inventory" | "purchase" | "sales" | "finance" | "customers" | "vendors" | "crm" | "products" | "returns" | "aftersales" | "quotes" | "assembly";

/** Central mutation invalidation map. Keep domain effects here instead of copying Promise.all blocks into pages. */
const keyForDomain: Record<ErpQueryDomain, () => readonly unknown[]> = {
  state: () => queryKeys.state.all(),
  inventory: () => queryKeys.inventory.all(),
  purchase: () => queryKeys.purchase.all(),
  sales: () => queryKeys.sales.all(),
  finance: () => queryKeys.finance.all(),
  customers: () => queryKeys.customers.all(),
  vendors: () => queryKeys.vendors.all(),
  crm: () => queryKeys.crm.all(),
  products: () => queryKeys.products.all(),
  returns: () => queryKeys.returns.all(),
  aftersales: () => queryKeys.aftersales.all(),
  quotes: () => queryKeys.quotes.all(),
  assembly: () => queryKeys.assembly.all(),
};

export async function invalidateErpDomains(queryClient: QueryClient, domains: readonly ErpQueryDomain[]) {
  await Promise.all(domains.map((domain) => queryClient.invalidateQueries({queryKey: keyForDomain[domain]()})));
}

