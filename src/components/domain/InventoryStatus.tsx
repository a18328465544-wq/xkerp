import {ErpStatusBadge} from "@/src/components/common";
import type {InventoryStatusValue} from "@/src/types/index";

const toneForStatus = (status: InventoryStatusValue) => {
  if (["待检测", "检测中"].includes(status)) return "warning" as const;
  if (["已售出", "已退货", "已报废"].includes(status)) return "neutral" as const;
  if (["退货中", "售后中", "维修中"].includes(status)) return "danger" as const;
  return "success" as const;
};

export function InventoryStatus({status}: {status: InventoryStatusValue}) {
  return <ErpStatusBadge label={status} tone={toneForStatus(status)} />;
}
