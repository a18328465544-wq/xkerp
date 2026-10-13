import assert from "node:assert/strict";
import test from "node:test";
import {createInitialState, createStoreActions} from "./store.ts";
import {addGpuCoreSpec, createGpuCore, currentGpuCoreCatalog, validateGpuProduct} from "./gpuCoreCatalog.ts";
import {gpuCoreCreateDto, gpuSpecDto} from "./routes/gpuCoreCatalog.ts";

test("custom cores and specs are store-owned metadata and never create business facts", () => {
  const state = createInitialState();
  const before = structuredClone({products: state.products, inventory: state.inventory, marketQuotes: state.marketQuotes});
  const created = createGpuCore(state, {vendor: "NVIDIA", model: "rtx 2080 ti", specs: []}, "测试员");
  assert.equal(created.id, "GPU-NVIDIA-RTX2080TI");
  assert.equal(created.specs.length, 0);
  assert.throws(() => createGpuCore(state, {vendor: "NVIDIA", model: "RTX2080TI", specs: []}, "测试员"), /已存在/);
  const updated = addGpuCoreSpec(state, created.id, {capacityGb: 22, memoryType: "GDDR6", revision: "扩容"}, "测试员");
  assert.equal(updated.specs[0]?.isStandard, false);
  assert.throws(() => addGpuCoreSpec(state, created.id, {capacityGb: 22, memoryType: "GDDR6", revision: "扩容"}, "测试员"), /已存在/);
  assert.deepEqual({products: state.products, inventory: state.inventory, marketQuotes: state.marketQuotes}, before);
  const other = createInitialState();
  assert.equal(currentGpuCoreCatalog(other).some(core => core.id === created.id), false);
});
test("official catalog cannot be recreated, overridden or confused with a wrong prefix", () => {
  const state = createInitialState();
  assert.throws(() => createGpuCore(state, {vendor: "NVIDIA", model: "5090", specs: []}, "测试"), /完整型号/);
  assert.throws(() => createGpuCore(state, {vendor: "AMD", model: "RTX5090", specs: []}, "测试"), /厂商/);
  assert.throws(() => createGpuCore(state, {vendor: "NVIDIA", model: "rtx5090", specs: []}, "测试"), /已存在/);
  assert.throws(() => addGpuCoreSpec(state, "GPU-NVIDIA-RTX5090", {capacityGb: 32, memoryType: "GDDR7", revision: ""}, "测试"), /已存在/);
  assert.equal(gpuSpecDto.safeParse({capacityGb: 0, memoryType: "GDDR7"}).success, false);
  assert.equal(gpuCoreCreateDto.safeParse({vendor: "NVIDIA", model: "RTX5090", origin: "official"}).success, false);
});
test("product binding rejects cross-core and conflicting memory facts; legacy ambiguity is not guessed", () => {
  const state = createInitialState();
  const product = {...state.products[0]!, model: "RTX4060TI", vram: "16GB GDDR6", category: "显卡" as const, gpuCoreId: "GPU-NVIDIA-RTX4060TI", gpuSpecId: "GPU-NVIDIA-RTX4060TI-16GB-GDDR6"};
  assert.equal(validateGpuProduct(state, product).gpuSpecId, product.gpuSpecId);
  assert.throws(() => validateGpuProduct(state, {...product, gpuSpecId: "GPU-NVIDIA-RTX5090-32GB-GDDR7"}), /不属于/);
  assert.throws(() => validateGpuProduct(state, {...product, vram: "8GB GDDR6"}), /不一致/);
  assert.throws(() => validateGpuProduct(state, {...product, gpuCoreId: undefined, gpuSpecId: undefined, model: "RTX4070", vram: "12G"}, true), /人工核对/);
});
test("linked template cannot swap core or memory; importing cannot silently change a bound identity", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const product = state.products[0]!;
  const before = structuredClone(state.inventory);
  assert.throws(() => actions.updateProductTemplate({...product, model: "RTX5090"}), /不能改变核心/);
  assert.throws(() => actions.addProductTemplates([{...product, model: "RTX5090"}]), /不能改变核心/);
  assert.throws(() => actions.addProductTemplate({...product, vram: "8G"}), /不能改变核心/);
  assert.deepEqual(state.inventory, before);
});
