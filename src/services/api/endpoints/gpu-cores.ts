import {apiRequest} from "../client";
import {adaptGpuCore, adaptGpuCoreCatalog} from "../adapters/gpu-core.adapter";
import type {GpuCoreResponseDto} from "../dto/gpu-core.dto";
import type {GpuCoreCreateInput, GpuSpecInput} from "@/src/types/gpuCore";

export const gpuCoresApi = {
  async list(signal?: AbortSignal) {return adaptGpuCoreCatalog(await apiRequest<GpuCoreResponseDto>("/api/gpu-cores", {signal}));},
  async create(input: GpuCoreCreateInput, idempotencyKey?: string) {return adaptGpuCore((await apiRequest<GpuCoreResponseDto>("/api/gpu-cores", {method: "POST", body: JSON.stringify(input), headers: idempotencyKey ? {"Idempotency-Key": idempotencyKey} : undefined})).data);},
  async addSpec(coreId: string, input: GpuSpecInput, idempotencyKey?: string) {return adaptGpuCore((await apiRequest<GpuCoreResponseDto>(`/api/gpu-cores/${encodeURIComponent(coreId)}/specs`, {method: "POST", body: JSON.stringify(input), headers: idempotencyKey ? {"Idempotency-Key": idempotencyKey} : undefined})).data);},
};
