import assert from "node:assert/strict";
import test from "node:test";
import {productDisplayName} from "@/src/lib/productName";

test("purchase product options use the canonical full product name", () => {
  assert.equal(productDisplayName({name: "技嘉 RTX5090 魔鹰OC 32G", brand: "技嘉", model: "RTX5090", version: "魔鹰OC", vram: "32G"}), "技嘉 RTX5090 魔鹰OC 32G");
});

test("purchase product options can build a full name for legacy records without name", () => {
  assert.equal(productDisplayName({name: "", brand: "技嘉", model: "RTX5090", version: "魔鹰OC", vram: "32G"}), "技嘉 RTX5090 魔鹰OC 32G");
  assert.equal(productDisplayName({name: "", brand: "", model: "", version: "", vram: ""}), "未命名商品");
});
