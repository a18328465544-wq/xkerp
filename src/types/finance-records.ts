export type SettlementDirection = "收入" | "支出" | "转入" | "转出" | "冲销";
export type NonOperatingIncomeType =
  | "赔偿收入"
  | "返点收入"
  | "配件销售"
  | "利息收入"
  | "其他收入";
export type NonOperatingExpenseType =
  | "员工费用"
  | "运费支出"
  | "办公费用"
  | "罚款支出"
  | "差旅招待"
  | "其他支出";
export type SettlementBusinessType =
  | "销售收款"
  | "采购付款"
  | "回收付款"
  | "客户退款"
  | "采购退款"
  | "其他收入"
  | "其他支出"
  | "账户调拨"
  | "员工提成"
  | "运费"
  | "维修费"
  | "平台手续费"
  | NonOperatingIncomeType
  | NonOperatingExpenseType;

export interface PaymentInRecord {
  id: string;
  customerId?: string;
  customerPartnerType?: "customer" | "vendor";
  customerName: string;
  supplierId?: string;
  supplierName?: string;
  accountId: string;
  accountName: string;
  amount: number;
  handler: string;
  paymentMethod: string;
  businessType?: SettlementBusinessType;
  settlementLedgerId?: string;
  financeLedgerId?: string;
  relatedDocType?: string;
  relatedDocNo?: string;
  referenceNo?: string;
  time: string;
  images?: string[];
  remarks?: string;
}

export interface PaymentOutRecord {
  id: string;
  supplierId?: string;
  supplierName?: string;
  customerId?: string;
  customerName?: string;
  accountId: string;
  accountName: string;
  amount: number;
  handler: string;
  paymentMethod: string;
  businessType: SettlementBusinessType;
  settlementLedgerId?: string;
  financeLedgerId?: string;
  relatedDocType?: string;
  relatedDocNo?: string;
  referenceNo?: string;
  time: string;
  images?: string[];
  remarks?: string;
}

export interface AccountTransferRecord {
  id: string;
  fromAccountId: string;
  fromAccountName: string;
  toAccountId: string;
  toAccountName: string;
  amount: number;
  fee: number;
  receivedAmount: number;
  handler: string;
  time: string;
  remarks?: string;
}
