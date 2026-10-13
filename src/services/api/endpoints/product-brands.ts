import {apiRequest} from "../client";
import type {ProductBrandBindingInput, ProductBrandCatalog, ProductBrandInput, ProductBrandLegacyMatch, ProductBrandRecord} from "@/src/types/productBrand";

export const productBrandsApi = {
  async list(signal?: AbortSignal) {return (await apiRequest<{data: ProductBrandCatalog}>("/api/product-brands", {signal})).data;},
  async legacyMatches(signal?: AbortSignal) {return (await apiRequest<{data: ProductBrandLegacyMatch[]}>("/api/product-brands/legacy-matches", {signal})).data;},
  async create(input: ProductBrandInput, key: string) {return (await apiRequest<{data: ProductBrandRecord}>("/api/product-brands", {method: "POST", body: JSON.stringify(input), headers: {"Idempotency-Key": key}})).data;},
  async addAliases(id: string, aliases: string[], key: string) {return (await apiRequest<{data: ProductBrandRecord}>(`/api/product-brands/${encodeURIComponent(id)}/aliases`, {method: "POST", body: JSON.stringify({aliases}), headers: {"Idempotency-Key": key}})).data;},
  async bind(bindings: ProductBrandBindingInput[], key: string) {await apiRequest("/api/product-brands/bindings", {method: "POST", body: JSON.stringify({bindings}), headers: {"Idempotency-Key": key}});},
};
