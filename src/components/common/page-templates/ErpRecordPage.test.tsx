import assert from "node:assert/strict";
import test from "node:test";
import {resolveRecordPageActions, type ErpRecordPageAction} from "./ErpRecordPage";

const action = (key: string, phone?: ErpRecordPageAction["phone"]): ErpRecordPageAction => ({key, label: key, phone});

test("the first primary-capable action takes the phone bottom bar", () => {
  const {primary, more} = resolveRecordPageActions([action("settle", "primary"), action("edit", "both"), action("refresh", "more")]);
  assert.equal(primary?.key, "settle");
  assert.deepEqual(more.map((item) => item.key), ["edit", "refresh"]);
});

test("without a payable balance, editing becomes the phone primary and stays in 更多", () => {
  const {primary, more} = resolveRecordPageActions([action("edit", "both"), action("delete", "more")]);
  assert.equal(primary?.key, "edit");
  assert.deepEqual(more.map((item) => item.key), ["edit", "delete"]);
});

test("desktop-only actions never reach the phone layout", () => {
  const {primary, more} = resolveRecordPageActions([action("print")]);
  assert.equal(primary, undefined);
  assert.equal(more.length, 0);
});
