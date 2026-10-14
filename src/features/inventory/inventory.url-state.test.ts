import assert from "node:assert/strict";
import test from "node:test";
import {defaultInventoryUrlState, parseInventoryUrlState, serializeInventoryUrlState} from "./inventory.url-state";

test("inventory model view cannot carry a card detail reference", () => {
  const state = parseInventoryUrlState("?view=models&detail=KC-1&keyword=RTX");
  assert.equal(state.view, "models");
  assert.equal(state.detailId, null);
  assert.equal(state.filters.keyword, "RTX");
});

test("inventory URL serialization excludes a model-level card detail", () => {
  const params = serializeInventoryUrlState({...defaultInventoryUrlState, view: "models", detailId: "KC-1"});
  assert.equal(params.get("view"), "models");
  assert.equal(params.get("detail"), null);
});

test("market-risk detail preserves its list, category, paging and search on round-trip", () => {
  const state = parseInventoryUrlState("?view=market-risk&detail=KC-1&category=CPU&page=2&keyword=SN-001");
  assert.equal(state.detailId, "KC-1");
  assert.deepEqual(parseInventoryUrlState(serializeInventoryUrlState(state).toString()), state);
  const closed = serializeInventoryUrlState({...state, detailId: null});
  assert.equal(closed.get("view"), "market-risk");
  assert.equal(closed.get("page"), "2");
  assert.equal(closed.has("detail"), false);
});
