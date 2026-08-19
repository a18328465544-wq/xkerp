import {adaptCreatedProduct, toProductTemplateCreateRequest, type ProductQuickCreateInput} from "../adapters/entity-create.adapter";
import {adaptProductLibrary, adaptProductMutation, toProductTemplateRequest} from "../adapters/product.adapter";
import {apiRequest} from "../client";
import type {EntityCreateResponseDto} from "../dto/entity-create.dto";
import type {ProductImportRequestDto, ProductLibraryResponseDto} from "../dto/product.dto";
import type {PurchaseProductOption} from "@/src/types/purchase";
import type {PermissionModel} from "./auth";
import type {ProductLibraryItem, ProductLibrarySnapshot, ProductTemplateFormValues} from "@/src/types/product";

function createdData(response: EntityCreateResponseDto) {
  if (response.data === undefined || response.data === null) throw new Error("商品模板接口未返回新建规格");
  return response.data;
}

export const productsApi = {
  async list(permissions: Pick<PermissionModel, "showCost" | "showProfit">, signal?: AbortSignal): Promise<ProductLibrarySnapshot> {
    const response = await apiRequest<ProductLibraryResponseDto>("/api/products", {signal});
    return adaptProductLibrary(response, permissions);
  },

  async createTemplate(input: ProductQuickCreateInput, showCost: boolean, showProfit = true, signal?: AbortSignal): Promise<PurchaseProductOption> {
    const permissionSafeInput = {
      ...input,
      refBuyPrice: showCost ? input.refBuyPrice : 0,
      refSellPrice: showProfit ? input.refSellPrice : 0,
    };
    const response = await apiRequest<EntityCreateResponseDto>("/api/products", {method: "POST", body: JSON.stringify(toProductTemplateCreateRequest(permissionSafeInput)), signal});
    return adaptCreatedProduct(createdData(response), {showCost, showProfit});
  },

  async create(input: ProductTemplateFormValues, permissions: Pick<PermissionModel, "showCost" | "showProfit">, signal?: AbortSignal): Promise<ProductLibraryItem> {
    const response = await apiRequest<ProductLibraryResponseDto>("/api/products", {method: "POST", body: JSON.stringify(toProductTemplateRequest(input)), signal});
    return adaptProductMutation(response, permissions);
  },

  async update(id: string, input: ProductTemplateFormValues, permissions: Pick<PermissionModel, "showCost" | "showProfit">, signal?: AbortSignal): Promise<ProductLibraryItem> {
    const response = await apiRequest<ProductLibraryResponseDto>(`/api/products/${encodeURIComponent(id)}`, {method: "PUT", body: JSON.stringify(toProductTemplateRequest(input)), signal});
    return adaptProductMutation(response, permissions);
  },

  async importTemplates(products: ProductImportRequestDto[], signal?: AbortSignal): Promise<number> {
    const response = await apiRequest<ProductLibraryResponseDto>("/api/products/import", {method: "POST", body: JSON.stringify({products}), signal});
    const rows = Array.isArray(response.data) ? response.data : [];
    return rows.length;
  },

  async remove(id: string, signal?: AbortSignal): Promise<void> {
    await apiRequest<ProductLibraryResponseDto>(`/api/products/${encodeURIComponent(id)}`, {method: "DELETE", signal});
  },
};
