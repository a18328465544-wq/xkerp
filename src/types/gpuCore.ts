export const gpuVendorValues = ["NVIDIA", "AMD", "INTEL"] as const;
export type GpuVendor = typeof gpuVendorValues[number];
export const gpuMemoryTypeValues = ["GDDR5", "GDDR5X", "GDDR6", "GDDR6X", "GDDR7", "HBM", "HBM2", "HBM3"] as const;
export type GpuMemoryType = typeof gpuMemoryTypeValues[number];

export interface GpuMemorySpec {
  id: string;
  capacityGb: number;
  memoryType: GpuMemoryType;
  revision: string;
  isStandard: boolean;
}
export interface GpuCoreRecord {
  id: string;
  vendor: GpuVendor;
  model: string;
  deviceType: "desktop";
  series: string;
  origin: "official" | "custom";
  specs: GpuMemorySpec[];
  evidenceUrl?: string;
  createdAt?: string;
  createdBy?: string;
}
export type GpuSpecInput = Pick<GpuMemorySpec, "capacityGb" | "memoryType" | "revision">;
export interface GpuCoreCreateInput {vendor: GpuVendor; model: string; specs: GpuSpecInput[]}
export interface GpuCoreCatalog {cores: GpuCoreRecord[]; canManage: boolean}
export interface GpuProductBinding {gpuCoreId?: string; gpuSpecId?: string}
