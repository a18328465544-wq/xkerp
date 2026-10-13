import {officialGpuCores} from "../src/data/gpuCoreCatalog.ts";
import type {GpuCoreCreateInput, GpuCoreRecord, GpuSpecInput} from "../src/types/gpuCore.ts";
import {canonicalGpuCore, gpuSpecIdentity, mergeGpuCoreCatalog} from "../src/utils/gpuCoreCatalog.ts";
import type {AppState} from "./store.ts";
import {ConflictError, NotFoundError, ValidationError} from "./errors.ts";
import {storeDateTime} from "../src/utils/storeTime.ts";
import type {ProductTemplate} from "../src/types.ts";
import {buildProductTemplateName} from "../src/lib/productName.ts";
import {gpuSpecLabel, inferGpuProductBinding} from "../src/utils/gpuCoreCatalog.ts";

export function currentGpuCoreCatalog(state: Pick<AppState, "gpuCores">) {
  return mergeGpuCoreCatalog(officialGpuCores, state.gpuCores || []);
}
function customSpec(coreId: string, input: GpuSpecInput) {
  const revision = input.revision.normalize("NFKC").trim().toUpperCase();
  return {...input, revision, id: gpuSpecIdentity(coreId, {...input, revision}), isStandard: false};
}
export function createGpuCore(state: AppState, input: GpuCoreCreateInput, actor: string): GpuCoreRecord {
  const core = canonicalGpuCore(input.vendor, input.model);
  if (!core) throw new ValidationError("请输入带 RTX、GTX、RX 或 ARC 前缀的完整型号，并核对核心厂商");
  if (currentGpuCoreCatalog(state).some(item => item.id === core.id)) throw new ConflictError("核心型号已存在，请直接选择；缺少显存时为已有核心新增规格");
  const specs = input.specs.map(spec => customSpec(core.id, spec));
  if (new Set(specs.map(spec => spec.id)).size !== specs.length) throw new ConflictError("显存规格重复，请保留一条");
  const created: GpuCoreRecord = {...core, deviceType: "desktop", series: "自定义", origin: "custom", specs, createdAt: storeDateTime(), createdBy: actor};
  state.gpuCores = [...(state.gpuCores || []), created];
  return created;
}
export function addGpuCoreSpec(state: AppState, coreId: string, input: GpuSpecInput, actor: string): GpuCoreRecord {
  const core = currentGpuCoreCatalog(state).find(item => item.id === coreId);
  if (!core) throw new NotFoundError("核心型号不存在，请刷新后重新选择");
  const spec = customSpec(coreId, input);
  if (core.specs.some(item => item.id === spec.id)) throw new ConflictError("该显存规格已存在，请直接选择");
  const previous = (state.gpuCores || []).find(item => item.id === coreId);
  const updated: GpuCoreRecord = {...core, origin: "custom", specs: [...(previous?.specs || []), spec], createdAt: previous?.createdAt || storeDateTime(), createdBy: previous?.createdBy || actor};
  state.gpuCores = [...(state.gpuCores || []).filter(item => item.id !== coreId), updated];
  return updated;
}

/** Validate bindings at the domain boundary; legacy imports remain explicit unbound records. */
export function validateGpuProduct<T extends Pick<ProductTemplate, "name" | "category" | "model" | "brand" | "version" | "vram" | "gpuCoreId" | "gpuSpecId">>(state: Pick<AppState, "gpuCores">, product: T, requireBinding = false): T {
  if (product.category !== "显卡") {
    if (product.gpuCoreId || product.gpuSpecId) throw new ValidationError("只有显卡商品可以绑定 GPU 核心");
    return product;
  }
  let {gpuCoreId, gpuSpecId} = product;
  if (!gpuCoreId && !gpuSpecId && requireBinding) {
    const inferred = inferGpuProductBinding(product, currentGpuCoreCatalog(state));
    if (inferred.status !== "matched") throw new ValidationError("请选择 GPU 核心及其绑定的显存规格，无法确认的旧规格需要人工核对");
    gpuCoreId = inferred.core.id; gpuSpecId = inferred.spec.id;
  }
  if (!gpuCoreId && !gpuSpecId) return product;
  const core = currentGpuCoreCatalog(state).find(item => item.id === gpuCoreId);
  const spec = core?.specs.find(item => item.id === gpuSpecId);
  if (!core || !spec) throw new ValidationError("显存规格不属于所选核心，请重新选择");
  const identity = canonicalGpuCore(core.vendor, product.model);
  if (identity?.id !== core.id) throw new ValidationError("GPU 型号与核心绑定不一致");
  const vram = gpuSpecLabel(spec);
  const text = product.vram.normalize("NFKC").toUpperCase().replace(/\s+/g, "");
  const simple = /^(\d+)(?:GB|G)(GDDR5X?|GDDR6X?|GDDR7|HBM[23]?)?$/.exec(text);
  if (text !== vram.toUpperCase().replace(/\s+/g, "") && (!simple || Number(simple[1]) !== spec.capacityGb || simple[2] && simple[2] !== spec.memoryType || spec.revision)) throw new ValidationError("显存文字与绑定规格不一致，请重新选择显存规格");
  return {...product, gpuCoreId, gpuSpecId, model: core.model, vram, name: buildProductTemplateName(product.brand, core.model, product.version, vram)};
}
