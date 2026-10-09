import {purchasePersonalSourceValues, type PurchasePersonalSource} from "../types/purchase";
import type {PurchaseSourceOption} from "../types/purchase";

/** A purchase from a person is settled against a customer, not a vendor. */
export function isPersonalPurchaseSource(value: unknown): value is PurchasePersonalSource {
  return typeof value === "string" && purchasePersonalSourceValues.includes(value as PurchasePersonalSource);
}

/** The purchase picker and its tests share the live permission/search boundary. */
export function selectPurchaseSourceCandidates(options: PurchaseSourceOption[], {canReadCustomers, canReadVendors, keyword = "", recentIds = []}: {canReadCustomers: boolean; canReadVendors: boolean; keyword?: string; recentIds?: string[]}) {
  const normalizedKeyword = keyword.trim().toLocaleLowerCase();
  return options.filter((option) => {
    if (option.partnerType === "customer" && !canReadCustomers) return false;
    if (option.partnerType === "vendor" && !canReadVendors) return false;
    if (!normalizedKeyword) return true;
    return [option.name, option.contact, option.phone, option.wechat, option.level].filter(Boolean).some((value) => String(value).toLocaleLowerCase().includes(normalizedKeyword));
  }).sort((left, right) => {
    if (normalizedKeyword) return 0;
    const leftIndex = recentIds.indexOf(left.id);
    const rightIndex = recentIds.indexOf(right.id);
    if (leftIndex === -1 && rightIndex === -1) return 0;
    if (leftIndex === -1) return 1;
    if (rightIndex === -1) return -1;
    return leftIndex - rightIndex;
  }).slice(0, 20);
}
