export const financeIncomeCategories = ["赔偿收入", "返点收入", "配件销售", "利息收入", "其他收入"] as const;
export const financeIncomePaymentMethods = ["微信", "支付宝", "银行卡", "现金", "其他"] as const;

export type FinanceIncomeCategory = (typeof financeIncomeCategories)[number];

export interface FinanceIncomeItem {
  id: string;
  source: string;
  accountId: string;
  accountName: string;
  amount: number;
  handler: string;
  paymentMethod: string;
  businessType: string;
  referenceNo?: string;
  time: string;
  images: string[];
  remarks?: string;
  editable: boolean;
  deletable: boolean;
  restrictionReason?: string;
}

export interface FinanceIncomeFormValues {
  source: string;
  accountId: string;
  amount: number;
  paymentMethod: string;
  businessType: FinanceIncomeCategory;
  referenceNo: string;
  date: string;
  remarks: string;
  images: string[];
}

export interface FinanceIncomeFilters {
  keyword: string;
  businessType: string;
  accountId: string;
  handler: string;
  startDate: string;
  endDate: string;
  page: number;
  pageSize: number;
}

export interface FinanceIncomeCollection {
  items: FinanceIncomeItem[];
  total: number;
  totalAmount: number;
  page: number;
  pageSize: number;
  source: "authorized-full-state";
}
