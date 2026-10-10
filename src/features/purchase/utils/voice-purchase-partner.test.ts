import assert from "node:assert/strict";
import test from "node:test";
import type {PurchaseSourceOption} from "@/src/types/purchase";
import {findExactVoicePurchasePartner, voicePurchasePartnerType, voiceSourceTypeMatchesPartner} from "./voice-purchase-partner";

const source = (id: string, name: string, partnerType: PurchaseSourceOption["partnerType"], selectable = true): PurchaseSourceOption => ({id, name, partnerType, contact: "", selectable});

test("purchase source intent routes personal recovery to customers and all purchase channels to vendors", () => {
  assert.equal(voicePurchasePartnerType("个人回收"), "customer");
  assert.equal(voicePurchasePartnerType("客户置换"), "customer");
  assert.equal(voicePurchasePartnerType("同行拿货"), "vendor");
  assert.equal(voicePurchasePartnerType("批量采购"), "vendor");
  assert.equal(voiceSourceTypeMatchesPartner("同行拿货", "vendor"), true);
  assert.equal(voiceSourceTypeMatchesPartner("个人回收", "vendor"), false);
});

test("only a selectable exact-name source already in the voice candidate set can be auto-selected", () => {
  const partner = {query: "李四", candidates: [{id: "C-1", name: "李四"}, {id: "C-2", name: "李四"}]};
  assert.deepEqual(findExactVoicePurchasePartner(partner, [source("C-1", "李四", "customer"), source("C-2", "李四", "customer")]).map((item) => item.id), ["C-1", "C-2"]);
  assert.deepEqual(findExactVoicePurchasePartner(partner, [source("C-1", "李四硬件店", "customer"), source("C-2", "李四", "customer", false)]), []);
  assert.deepEqual(findExactVoicePurchasePartner({query: "李四", candidates: []}, [source("C-1", "李四", "customer")]), []);
});
