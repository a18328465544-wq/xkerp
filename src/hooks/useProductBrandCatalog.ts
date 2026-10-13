import {useRef} from "react";
import {useQuery, useQueryClient} from "@tanstack/react-query";
import {useAuth} from "@/src/app/auth";
import {productBrandsApi} from "@/src/services/api/endpoints/product-brands";
import {queryKeys} from "@/src/services/api/query-keys";
import {createSubmissionIdentity} from "@/src/services/api/submissionIdentity";
import type {ProductBrandBindingInput, ProductBrandCatalog, ProductBrandInput, ProductBrandRecord} from "@/src/types/productBrand";

export function useProductBrandCatalog(enabled: boolean, includeLegacy = false) {
  const {session} = useAuth(), client = useQueryClient();
  const identity = useRef(createSubmissionIdentity("brand-catalog"));
  const queryKey = queryKeys.productBrands.list(session?.user.id || "");
  const query = useQuery({queryKey, queryFn: ({signal}) => productBrandsApi.list(signal), enabled: enabled && Boolean(session), staleTime: 60_000, retry: false});
  const legacyQuery = useQuery({queryKey: [...queryKey, "legacy"], queryFn: ({signal}) => productBrandsApi.legacyMatches(signal), enabled: enabled && includeLegacy && Boolean(session), staleTime: 60_000, retry: false});
  const accepted = (saved: ProductBrandRecord) => {
    client.setQueryData<ProductBrandCatalog>(queryKey, previous => previous ? {...previous, brands: [...previous.brands.filter(brand => brand.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name, "zh-CN"))} : previous);
    void client.invalidateQueries({queryKey: [...queryKey, "legacy"]});
    identity.current.reset(); return saved;
  };
  const createBrand = async (input: ProductBrandInput) => accepted(await productBrandsApi.create(input, identity.current.keyFor({kind: "create", input})));
  const addAliases = async (id: string, aliases: string[]) => accepted(await productBrandsApi.addAliases(id, aliases, identity.current.keyFor({kind: "aliases", id, aliases})));
  const bindBrands = async (bindings: ProductBrandBindingInput[]) => {
    await productBrandsApi.bind(bindings, identity.current.keyFor({kind: "bindings", bindings}));
    identity.current.reset();
    await Promise.all([client.invalidateQueries({queryKey}), client.invalidateQueries({queryKey: queryKeys.products.all()}), client.invalidateQueries({queryKey: queryKeys.inventory.all()})]);
  };
  return {...query, data: query.data ? {...query.data, legacyMatches: legacyQuery.data || []} : undefined, legacyQuery, createBrand, addAliases, bindBrands};
}
