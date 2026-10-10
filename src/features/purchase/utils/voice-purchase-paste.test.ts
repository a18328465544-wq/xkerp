import assert from "node:assert/strict";
import test from "node:test";
import {createPurchaseLineDefaults} from "@/src/features/purchase/purchase.defaults";
import {createPurchasePasteRowsFromVoice, selectPurchasePasteProduct} from "./parse-purchase-paste";
import type {PurchaseProductOption} from "@/src/types/purchase";
import type {VoicePurchaseLineDraft} from "@/src/types/voice";

const first: PurchaseProductOption = {id: "P-1", name: "华硕 RTX 4090 猛禽 24G", category: "显卡", model: "RTX 4090", brand: "华硕", version: "猛禽", vram: "24G"};
const second: PurchaseProductOption = {...first, id: "P-2", name: "微星 RTX 4090 猛禽 24G", brand: "微星"};
const options = {defaults: createPurchaseLineDefaults(), products: [first, second], canEnterCost: true, canEnterEstimatedSell: true};

test("voice purchase lines enter the shared preview with condition, box, repair, quantity and price", () => {
  const draft: VoicePurchaseLineDraft = {productQuery: "4090 猛禽", candidates: [first], productId: first.id, quantity: 2, buyPrice: 7_800, condition: "99新", fullBox: false, repaired: true};
  const [row] = createPurchasePasteRowsFromVoice([draft], options);
  assert.equal(row?.line.productId, first.id);
  assert.equal(row?.line.quantity, 2);
  assert.equal(row?.line.buyPrice, 7_800);
  assert.equal(row?.line.condition, "99新");
  assert.equal(row?.line.fullBox, false);
  assert.equal(row?.line.repaired, true);
  assert.deepEqual(row?.voiceSuggestions, {condition: "99新", fullBox: false, repaired: true});
  assert.equal(row?.status, "warning");
});

test("multiple voice candidates remain unselected until the user chooses one", () => {
  const draft: VoicePurchaseLineDraft = {productQuery: "4090 猛禽", candidates: [first, second], productId: first.id, quantity: 1, buyPrice: 7_800};
  const [row] = createPurchasePasteRowsFromVoice([draft], options);
  assert.equal(row?.line.productId, "");
  assert.equal(row?.status, "needs-confirmation");
  const selected = selectPurchasePasteProduct(row!, second.id, options);
  assert.equal(selected.line.productId, second.id);
  assert.equal(selected.status, "warning");
});

test("a voice product not in the existing catalog requires manual selection", () => {
  const draft: VoicePurchaseLineDraft = {productQuery: "不存在的型号", candidates: [], productId: "not-trusted", quantity: 1, buyPrice: 7_800};
  const [row] = createPurchasePasteRowsFromVoice([draft], options);
  assert.equal(row?.line.productId, "");
  assert.equal(row?.status, "needs-confirmation");
});
