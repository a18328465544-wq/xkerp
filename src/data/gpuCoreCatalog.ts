import type {GpuCoreRecord, GpuMemoryType} from "../types/gpuCore";
import {gpuSpecIdentity} from "../utils/gpuCoreCatalog";

type Seed = [model: string, specs: Array<[capacity: number, memoryType: GpuMemoryType, revision?: string]>];
const seeds: Seed[] = [
  ["RTX3050", [[6, "GDDR6"], [8, "GDDR6"], [8, "GDDR6", "OEM"]]],
  ["RTX3060", [[8, "GDDR6"], [12, "GDDR6"]]],
  ["RTX3060TI", [[8, "GDDR6"], [8, "GDDR6X"]]],
  ["RTX3070", [[8, "GDDR6"]]], ["RTX3070TI", [[8, "GDDR6X"]]],
  ["RTX3080", [[10, "GDDR6X"], [12, "GDDR6X"]]], ["RTX3080TI", [[12, "GDDR6X"]]],
  ["RTX3090", [[24, "GDDR6X"]]], ["RTX3090TI", [[24, "GDDR6X"]]],
  ["RTX4060", [[8, "GDDR6"]]], ["RTX4060TI", [[8, "GDDR6"], [16, "GDDR6"]]],
  ["RTX4070", [[12, "GDDR6"], [12, "GDDR6X"]]], ["RTX4070SUPER", [[12, "GDDR6X"]]],
  ["RTX4070TI", [[12, "GDDR6X"]]], ["RTX4070TISUPER", [[16, "GDDR6X"]]],
  ["RTX4080", [[16, "GDDR6X"]]], ["RTX4080SUPER", [[16, "GDDR6X"]]],
  ["RTX4090", [[24, "GDDR6X"]]], ["RTX4090D", [[24, "GDDR6X"]]],
  ["RTX5050", [[8, "GDDR6"]]], ["RTX5060", [[8, "GDDR7"]]],
  ["RTX5060TI", [[8, "GDDR7"], [16, "GDDR7"]]], ["RTX5070", [[12, "GDDR7"]]],
  ["RTX5070TI", [[16, "GDDR7"]]], ["RTX5080", [[16, "GDDR7"]]],
  ["RTX5090", [[32, "GDDR7"]]], ["RTX5090D", [[32, "GDDR7"]]], ["RTX5090DV2", [[24, "GDDR7"]]],
];
const comparisonUrl = "https://www.nvidia.com/en-us/geforce/graphics-cards/compare/";
const specialSources: Record<string, string> = {
  RTX3050: "https://www.nvidia.com/en-eu/geforce/graphics-cards/30-series/rtx-3050/",
  RTX4090D: "https://www.nvidia.cn/geforce/graphics-cards/40-series/rtx-4090-d/",
  RTX5090D: "https://storage-asset.msi.com/datasheet/vga/hk/GeForce-RTX-5090-D-32G-SUPRIM-SOC.pdf",
  RTX5090DV2: "https://www.nvidia.cn/geforce/graphics-cards/50-series/rtx-5090-d-v2/",
};
/** Versioned reference configuration, not invented stock, templates or prices. */
export const officialGpuCores: readonly GpuCoreRecord[] = seeds.map(([model, memories]) => {
  const id = `GPU-NVIDIA-${model}`;
  return {id, model, vendor: "NVIDIA", deviceType: "desktop", series: `${model.slice(3, 5)} 系列`, origin: "official", evidenceUrl: specialSources[model] || comparisonUrl,
    specs: memories.map(([capacityGb, memoryType, revision = ""]) => ({id: gpuSpecIdentity(id, {capacityGb, memoryType, revision}), capacityGb, memoryType, revision, isStandard: true}))};
});
