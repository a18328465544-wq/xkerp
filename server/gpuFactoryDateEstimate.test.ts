import assert from "node:assert/strict";
import test from "node:test";
import {createInitialState, createStoreActions} from "./store.ts";
import {parseGpuSnDate} from "./gpuSnDate.ts";

test("factory date estimate is saved separately from warranty and never replaces an existing confirmation", () => {
  const state = createInitialState();
  const card = state.inventory[0]!;
  card.brand = "技嘉";
  card.model = "RTX 5090";
  card.sn = "GV-RTX-SN251500084640";
  card.warrantyDate = "2028-11-20";
  const warrantyDate = card.warrantyDate;
  const actions = createStoreActions(state);

  const first = actions.saveGpuFactoryDateEstimate(card.id);
  assert.equal(first.saved, true);
  assert.deepEqual(state.inventory.find((item) => item.id === card.id)?.warrantyDate, warrantyDate);
  assert.equal(state.inventory.find((item) => item.id === card.id)?.gpuFactoryDateEstimate?.ruleId, "gigabyte-sn-yyww");

  const savedEstimate = state.inventory.find((item) => item.id === card.id)!.gpuFactoryDateEstimate!;
  const repeated = actions.saveGpuFactoryDateEstimate(card.id);
  assert.equal(repeated.saved, false);
  assert.deepEqual(repeated.estimate, savedEstimate);

  const confirmed = parseGpuSnDate({brandId: "gigabyte", sn: "GV-RTX-SN251500084640", productModel: "RTX 5090"});
  const secondState = createInitialState();
  const secondCard = secondState.inventory[0]!;
  secondCard.brand = "技嘉";
  secondCard.model = "RTX 5090";
  secondCard.sn = "GV-RTX-SN251500084640";
  secondCard.gpuFactoryDateEstimate = {...confirmed, confidence: "high", confidenceScore: 1, explanation: "人工确认", savedAt: "2026-10-09 09:00"};
  const preserved = createStoreActions(secondState).saveGpuFactoryDateEstimate(secondCard.id);
  assert.equal(preserved.saved, false);
  assert.equal(preserved.estimate?.explanation, "人工确认");
});
