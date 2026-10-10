import assert from "node:assert/strict";
import test from "node:test";
import {allowedVoiceScenes, voiceEntryDestination} from "./voiceEntryRouting";

test("global voice entry is limited to the user's purchase, sales and CRM permissions", () => {
  assert.deepEqual(allowedVoiceScenes(["purchase_add", "sales_list"]), ["purchase"]);
  assert.deepEqual(allowedVoiceScenes(["sales_add", "crm"]), ["sales", "customer"]);
  assert.deepEqual(allowedVoiceScenes(["all"]), ["purchase", "sales", "customer"]);
  assert.deepEqual(allowedVoiceScenes([]), []);
});

test("global voice routing requires a resolved, authorized scene", () => {
  const allowed = allowedVoiceScenes(["purchase_add", "crm"]);
  assert.equal(voiceEntryDestination("purchase", allowed), "/purchase/new");
  assert.equal(voiceEntryDestination("customer", allowed), "/crm/customers/new");
  assert.throws(() => voiceEntryDestination("sales", allowed), /授权场景/);
  assert.throws(() => voiceEntryDestination(null, allowed), /授权场景/);
});
