import {keepPreviousData, useQuery} from "@tanstack/react-query";
import {useCallback, useEffect, useState} from "react";
import {inventoryApi, queryKeys, type InventoryPermissions} from "@/src/services/api";
import type {ProductLedgerFilters} from "@/src/types/product-ledger";

export const defaultProductLedgerFilters: ProductLedgerFilters = {
  documentNo: "",
  createdBy: "",
  documentType: "",
  startDate: "",
  endDate: "",
  page: 1,
  pageSize: 20,
};

export function useProductLedger({open, productSkuId, permissions}: {open: boolean; productSkuId: string; permissions: InventoryPermissions}) {
  const [filters, setFilters] = useState<ProductLedgerFilters>(defaultProductLedgerFilters);

  useEffect(() => {
    if (open) setFilters(defaultProductLedgerFilters);
  }, [open, productSkuId]);

  const query = useQuery({
    queryKey: queryKeys.inventory.productLedger(productSkuId, filters, permissions),
    queryFn: ({signal}) => inventoryApi.productLedger(productSkuId, filters, permissions, signal),
    enabled: open && Boolean(productSkuId),
    placeholderData: keepPreviousData,
    retry: false,
  });

  const updateFilter = useCallback((patch: Partial<ProductLedgerFilters>) => {
    setFilters((current) => ({...current, ...patch, page: 1}));
  }, []);
  const clearFilters = useCallback(() => setFilters(defaultProductLedgerFilters), []);
  const changePage = useCallback((page: number) => setFilters((current) => ({...current, page})), []);
  const changePageSize = useCallback((pageSize: number) => setFilters((current) => ({...current, page: 1, pageSize})), []);

  return {filters, query, updateFilter, clearFilters, changePage, changePageSize};
}
