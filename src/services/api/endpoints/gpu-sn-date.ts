import {apiRequest} from "../client";
import type {GpuSnBrandId, GpuSnDateResult, GpuFactoryDateEstimate} from "@/src/types/gpuSn";

export type GpuSnRulesResponse = {data: Array<{id: GpuSnBrandId; name: string; officialUrl: string; rule: string; source: string; sourceUrl: string; description: string}>};

export const gpuSnDateApi = {
  rules(signal?: AbortSignal) {
    return apiRequest<GpuSnRulesResponse>("/api/gpu-sn/rules", {signal});
  },
  parse(input: {brandId: GpuSnBrandId; sn: string; productModel?: string}) {
    return apiRequest<{data: GpuSnDateResult}>("/api/gpu-sn/parse", {method: "POST", body: JSON.stringify(input)});
  },
  save(inventoryId: string) {
    return apiRequest<{data: {saved: boolean; estimate: GpuFactoryDateEstimate}}>("/api/gpu-sn/estimate/save", {method: "POST", body: JSON.stringify({inventoryId})});
  },
};
