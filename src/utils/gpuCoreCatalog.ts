import type {GpuCoreRecord, GpuMemorySpec, GpuSpecInput, GpuVendor} from "../types/gpuCore";
import {gpuCoreIdentity} from "./quoteReference";

/** Canonical complete commercial model; never infer a missing vendor prefix. */
export function canonicalGpuCore(vendor: GpuVendor, value: string) {
  const model = value.normalize("NFKC").toUpperCase().replace(/[\s-]+/g, "");
  const identity = gpuCoreIdentity(model);
  if (!identity || identity.vendor !== vendor || identity.coreModel !== model) return null;
  return {id: identity.coreId, model, vendor};
}
export function gpuSpecLabel(spec: Pick<GpuMemorySpec, "capacityGb" | "memoryType" | "revision" | "isStandard">) {
  return `${spec.capacityGb}GB ${spec.memoryType}${spec.revision ? ` · ${spec.revision}` : ""}${spec.isStandard ? "" : " · 非标准"}`;
}
export function gpuSpecIdentity(coreId: string, spec: GpuSpecInput) {
  const revision = spec.revision.normalize("NFKC").trim().toUpperCase();
  return `${coreId}-${spec.capacityGb}GB-${spec.memoryType}${revision ? `-${encodeURIComponent(revision)}` : ""}`;
}
export function mergeGpuCoreCatalog(official: readonly GpuCoreRecord[], custom: readonly GpuCoreRecord[]) {
  const result = new Map(official.map(core => [core.id, {...core, specs: core.specs.map(spec => ({...spec}))}]));
  for (const core of custom) {
    const existing = result.get(core.id);
    if (!existing) {result.set(core.id, {...core, specs: core.specs.map(spec => ({...spec}))}); continue;}
    const specs = new Map(existing.specs.map(spec => [spec.id, spec]));
    // Store extensions cannot replace a published official specification.
    for (const spec of core.specs) if (!specs.has(spec.id)) specs.set(spec.id, {...spec, isStandard: false});
    result.set(core.id, {...existing, specs: [...specs.values()]});
  }
  return [...result.values()].sort((a, b) => b.model.localeCompare(a.model, "en", {numeric: true}));
}
export function inferGpuProductBinding(product: {category?: string; model: string; vram: string}, cores: readonly GpuCoreRecord[]) {
  if (product.category !== "显卡") return {status: "not-gpu" as const};
  const identity = gpuCoreIdentity(product.model);
  if (!identity) return {status: "unmatched" as const};
  const core = cores.find(item => item.id === identity.coreId);
  if (!core) return {status: "unmatched" as const};
  const raw = product.vram.normalize("NFKC").toUpperCase().replace(/\s+/g, "");
  const match = /^(\d+)(?:GB|G)(GDDR5X?|GDDR6X?|GDDR7|HBM[23]?)?$/.exec(raw);
  if (!match) return {status: "ambiguous" as const, core};
  const specs = core.specs.filter(spec => spec.isStandard && spec.capacityGb === Number(match[1]) && (!match[2] || spec.memoryType === match[2]));
  return specs.length === 1 ? {status: "matched" as const, core, spec: specs[0]!} : {status: "ambiguous" as const, core};
}
