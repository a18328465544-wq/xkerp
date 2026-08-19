import assert from "node:assert/strict";
import test from "node:test";
import {adaptInspectionCreateResult, adaptInspectionWorkspace, toInspectionCreateRequestDto} from "./inspection.adapter";
import type {InspectionFormValues} from "@/src/types/inspection";

function gpuValues(): InspectionFormValues {
  return {
    inventoryId: "KC-1", isGpu: true, serialNumber: " SN-1 ", condition: "95新", inWarranty: true, warrantyDate: "2028-01-01", fullBox: true, warehouseLocation: " A区-01 ", inspector: " 郭鑫 ",
    exteriorCheck: "完美无瑕", fanCheck: "静音顺畅", portsCheck: "全部正常", gpuzCheck: "核对一致", furmarkResult: " 20 分钟稳定 ", threedMarkResult: " 98.5% ", vramResult: "全显存测试通过", temperature: 72, wattage: 350, noise: "适中", repaired: false, hiddenDefects: false, resultStatus: "通过", remarks: " 正常 ", images: ["/api/media/assets/IMG-1", "data:image/jpeg;base64,bad"],
  };
}

test("inspection workspace keeps only valid pending candidates and enriches history", () => {
  const result = adaptInspectionWorkspace({data: {
    inventory: [
      {id: "GPU-1", category: "显卡", productName: "RTX 4090", status: "待检测", entryTime: "2026-08-09", condition: "95新"},
      {id: "GPU-2", category: "显卡", productName: "RTX 4080", status: "已入库", entryTime: "2026-08-08"},
      {id: "CPU-1", category: "CPU", productName: "i9", status: "待检测", entryTime: "2026-08-07"},
      {id: "CPU-2", category: "CPU", productName: "i7", status: "已售出", entryTime: "2026-08-06"},
    ],
    inspections: [{id: "JC-1", inventoryId: "CPU-1", sn: "CPU-SN", resultStatus: "通过", inspectTime: "2026-08-09 10:00", images: ["/api/media/assets/IMG-2"]}],
  }});
  assert.deepEqual(result.candidates.map((item) => item.id), ["GPU-1"]);
  assert.equal(result.history[0]?.productName, "i9");
  assert.equal(result.history[0]?.category, "CPU");
  assert.equal(result.history[0]?.temperature, undefined);
  assert.equal(result.history[0]?.candidate.id, "CPU-1");
  assert.deepEqual(result.history[0]?.images, ["/api/media/assets/IMG-2"]);
});

test("inspection adapter normalizes legacy condition labels before form validation", () => {
  const result = adaptInspectionWorkspace({data: {
    inventory: [
      {id: "GPU-LEGACY-99", category: "显卡", productName: "RTX 4090", status: "待检测", condition: "充新99新"},
      {id: "GPU-LEGACY-95", category: "显卡", productName: "RTX 4080", status: "待检测", condition: "靓机95新"},
    ],
    inspections: [],
  }});
  assert.deepEqual(result.candidates.map((item) => item.condition), ["99新", "95新"]);
});

test("GPU inspection request preserves measured values and trims identifiers", () => {
  const request = toInspectionCreateRequestDto(gpuValues());
  assert.equal(request.sn, "SN-1");
  assert.equal(request.warehouseLocation, "A区-01");
  assert.equal(request.inspector, "郭鑫");
  assert.equal(request.temperature, 72);
  assert.equal(request.furmarkResult, "20 分钟稳定");
  assert.deepEqual(request.images, ["/api/media/assets/IMG-1"]);
});

test("accessory inspection request uses the existing simple inspection contract", () => {
  const values = {...gpuValues(), isGpu: false, inventoryId: "CPU-1", resultStatus: "需要维修" as const, temperature: 91, wattage: 999, hiddenDefects: true, repaired: true};
  const request = toInspectionCreateRequestDto(values);
  assert.equal(request.resultStatus, "通过");
  assert.equal(request.temperature, 0);
  assert.equal(request.wattage, 0);
  assert.equal(request.repaired, false);
  assert.equal(request.hiddenDefects, false);
  assert.match(request.remarks || "", /其他配件简易检测/);
});

test("inspection create response excludes state patches", () => {
  assert.deepEqual(adaptInspectionCreateResult({id: "JC-1", inventoryId: "KC-1", sn: "SN-1", resultStatus: "通过", inspectTime: "2026-08-09 12:00", stateMerge: {inventory: []}}), {
    id: "JC-1", inventoryId: "KC-1", serialNumber: "SN-1", resultStatus: "通过", inspectTime: "2026-08-09 12:00",
  });
});
