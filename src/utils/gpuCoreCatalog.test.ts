import assert from "node:assert/strict";
import test from "node:test";
import {officialGpuCores} from "../data/gpuCoreCatalog";
import {canonicalGpuCore, gpuSpecIdentity, inferGpuProductBinding, mergeGpuCoreCatalog} from "./gpuCoreCatalog";

test("official desktop catalog has all 28 distinct 30–50 cores and memory variants", () => {
  assert.equal(officialGpuCores.length, 28);
  assert.equal(new Set(officialGpuCores.map(core => core.id)).size, 28);
  assert.equal(new Set(officialGpuCores.flatMap(core => core.specs.map(spec => spec.id))).size, 36);
  assert.equal(officialGpuCores.find(core => core.model === "RTX4070")?.specs.length, 2);
  assert.notEqual(canonicalGpuCore("NVIDIA", "RTX5090D")?.id, canonicalGpuCore("NVIDIA", "RTX5090D V2")?.id);
});
test("core canonicalization is full-model only; memory specifications do not split cores", () => {
  assert.equal(canonicalGpuCore("NVIDIA", "rTx 4070 Ti")?.id, "GPU-NVIDIA-RTX4070TI");
  assert.equal(canonicalGpuCore("NVIDIA", "4070ti"), null);
  assert.equal(canonicalGpuCore("AMD", "RTX4070TI"), null);
  assert.equal(canonicalGpuCore("NVIDIA", "RTX4070 / RTX4090"), null);
  const core = officialGpuCores.find(core => core.model === "RTX4060TI")!;
  assert.notEqual(core.specs[0]!.id, core.specs[1]!.id);
});
test("legacy matching is a read-only suggestion and keeps unknown memory technology pending", () => {
  const product = {category: "显卡", model: "RTX4070", vram: "12G"};
  assert.equal(inferGpuProductBinding(product, officialGpuCores).status, "ambiguous");
  assert.equal(inferGpuProductBinding({...product, vram: "12GB GDDR6X"}, officialGpuCores).status, "matched");
  assert.equal(inferGpuProductBinding({...product, model: "RTX4060TI", vram: "16G"}, officialGpuCores).status, "matched");
  assert.equal(inferGpuProductBinding({...product, model: "RTX3050", vram: "8GB GDDR6"}, officialGpuCores).status, "ambiguous");
  assert.deepEqual(product, {category: "显卡", model: "RTX4070", vram: "12G"});
});
test("store additions never overwrite official specifications", () => {
  const original = officialGpuCores[0]!;
  const changed = {...original, model: "FAKE", specs: [{...original.specs[0]!, capacityGb: 99}]};
  const merged = mergeGpuCoreCatalog(officialGpuCores, [changed]);
  assert.equal(merged.find(core => core.id === original.id)?.model, original.model);
  assert.equal(merged.find(core => core.id === original.id)?.specs[0]?.capacityGb, 6);
  assert.notEqual(gpuSpecIdentity(original.id, {capacityGb: 8, memoryType: "GDDR6", revision: "OEM"}), gpuSpecIdentity(original.id, {capacityGb: 8, memoryType: "GDDR6", revision: ""}));
});
