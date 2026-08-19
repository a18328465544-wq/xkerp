import type {PurchaseDetail} from "@/src/types/purchase";

export type PurchaseEditRisk = "green" | "yellow" | "red";

export interface PurchaseEditPolicy {
  mode: "read-only";
  inventoryStage: "not-created" | "pending-inspection" | "processing" | "completed";
  summary: string;
  reasons: string[];
  fields: {
    green: readonly string[];
    yellow: readonly string[];
    red: readonly string[];
  };
}

const greenFields = ["采购备注", "行备注", "快递单号"] as const;
const yellowFields = ["联系方式", "日期", "经办人", "预计售价", "新增图片"] as const;
const redFields = ["商品模板", "数量", "SN", "采购价", "来源客户 / 供应商", "现金付款", "供应商抵扣", "结算账户"] as const;

export function derivePurchaseEditPolicy(detail: PurchaseDetail): PurchaseEditPolicy {
  const statuses = new Set(detail.inventory.map((item) => item.status));
  const hasCompletedInventory = [...statuses].some((status) => ["已入库", "已上架", "已锁定", "已售出", "已退货", "已报废"].includes(status));
  const hasProcessingInventory = detail.inspectionCount > 0 || [...statuses].some((status) => status !== "待检测");
  const inventoryStage = detail.inventory.length === 0
    ? "not-created"
    : hasCompletedInventory
      ? "completed"
      : hasProcessingInventory
        ? "processing"
        : "pending-inspection";

  const reasons = [
    "当前后端只有全量 PUT，没有字段白名单和独立编辑权限。",
    "采购单没有 version / ETag，无法防止两人同时编辑互相覆盖。",
  ];
  if (inventoryStage === "processing" || inventoryStage === "completed") reasons.push("部分实物库存已检测或入库，商品、数量和 SN 不能由采购页直接改写。");
  if (detail.paymentCount === null) reasons.push("当前账号无法读取付款流水，不能安全判断结算是否可编辑。");
  else if (detail.paymentCount > 0) reasons.push(`该单据关联 ${detail.paymentCount} 笔付款流水，调整结算必须走冲销 / 调整流程。`);
  if (detail.completedReturnCount === null) reasons.push("当前账号无法确认是否存在已完成采购退货。");
  else if (detail.completedReturnCount > 0) reasons.push("该单据已存在完成的采购退货，往来对象、商品和结算结构已受保护。");

  return {
    mode: "read-only",
    inventoryStage,
    summary: "当前先提供完整只读详情；低风险字段将在后端补齐安全编辑契约后开放。",
    reasons,
    fields: {green: greenFields, yellow: yellowFields, red: redFields},
  };
}

export function purchaseInventoryStageLabel(stage: PurchaseEditPolicy["inventoryStage"]) {
  return stage === "not-created" ? "未生成库存" : stage === "pending-inspection" ? "待检测" : stage === "processing" ? "检测 / 入库中" : "已形成库存事实";
}
