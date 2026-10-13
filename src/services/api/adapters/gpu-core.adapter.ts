import {z} from "zod";
import {gpuMemoryTypeValues, gpuVendorValues, type GpuCoreCatalog, type GpuCoreRecord} from "@/src/types/gpuCore";
import type {GpuCoreResponseDto} from "../dto/gpu-core.dto";

const spec = z.object({id: z.string().min(1), capacityGb: z.number().int().min(1).max(512), memoryType: z.enum(gpuMemoryTypeValues), revision: z.string(), isStandard: z.boolean()});
const core = z.object({id: z.string().min(1), vendor: z.enum(gpuVendorValues), model: z.string().min(1), deviceType: z.literal("desktop"), series: z.string(), origin: z.enum(["official", "custom"]), specs: z.array(spec), evidenceUrl: z.string().optional(), createdAt: z.string().optional(), createdBy: z.string().optional()});
export function adaptGpuCore(value: unknown): GpuCoreRecord {return core.parse(value);}
export function adaptGpuCoreCatalog(response: GpuCoreResponseDto): GpuCoreCatalog {
  return z.object({cores: z.array(core), canManage: z.boolean()}).parse(response.data);
}
