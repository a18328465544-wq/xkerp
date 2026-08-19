import {toCreateSalesRequest} from "@/src/services/api/adapters/sales.adapter";
import type {SalesFormValues, SalesSettlementAccountOption} from "@/src/types/sales";

export function buildSalesRequest(values: SalesFormValues, account?: SalesSettlementAccountOption) {
  return toCreateSalesRequest(values, account);
}

