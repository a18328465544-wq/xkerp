import {z} from "zod";
import {ValidationError} from "./errors.ts";

const requiredText = (label: string, max = 120) => z.string().trim().min(1, `${label}不能为空`).max(max, `${label}不能超过 ${max} 字`);
const optionalText = (max = 300) => z.string().trim().max(max, `内容不能超过 ${max} 字`).optional();
const nonNegativeMoney = z.number().finite().min(0, "金额不能小于 0").max(1_000_000_000, "金额超出允许范围");
const positiveMoney = z.number().finite().positive("金额必须大于 0").max(1_000_000_000, "金额超出允许范围");
const dateText = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式必须为 YYYY-MM-DD");
const dateTimeText = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/, "时间格式无效");

const settlementBusinessTypes = [
  "销售收款", "采购付款", "回收付款", "客户退款", "采购退款", "其他收入", "其他支出", "账户调拨",
  "员工提成", "运费", "维修费", "平台手续费", "赔偿收入", "返点收入", "配件销售", "利息收入",
  "员工费用", "运费支出", "办公费用", "罚款支出", "差旅招待",
] as const;

const sourceTypes = ["个人回收", "同行拿货", "批量采购", "客户置换", "门店自采", "门市自采"] as const;
const productCategories = ["显卡", "CPU", "主板", "内存", "硬盘", "电源", "散热", "机箱", "整机", "显示器", "组装拆卸", "其他配件"] as const;
const purchaseConditions = ["全新", "99新", "95新", "90新", "85新", "轻微瑕疵", "损坏"] as const;

const paymentInFields = {
  customerId: optionalText(120),
  customerPartnerType: z.enum(["customer", "vendor"]).optional(),
  customerName: requiredText("收款对象", 120),
  supplierId: optionalText(120),
  supplierName: optionalText(120),
  accountId: requiredText("收款账户", 120),
  amount: positiveMoney,
  handler: requiredText("经办人", 80),
  paymentMethod: requiredText("收款方式", 80),
  businessType: z.enum(settlementBusinessTypes).optional(),
  relatedDocType: optionalText(80),
  relatedDocNo: optionalText(120),
  referenceNo: optionalText(120),
  time: dateTimeText,
  remarks: optionalText(500),
};

const paymentOutFields = {
  supplierId: optionalText(120),
  supplierName: optionalText(120),
  customerId: optionalText(120),
  customerName: optionalText(120),
  accountId: requiredText("付款账户", 120),
  amount: positiveMoney,
  handler: requiredText("经办人", 80),
  paymentMethod: requiredText("付款方式", 80),
  businessType: z.enum(settlementBusinessTypes),
  relatedDocType: optionalText(80),
  relatedDocNo: optionalText(120),
  referenceNo: optionalText(120),
  time: dateTimeText,
  remarks: optionalText(500),
};

export const paymentInCreateDto = z.object(paymentInFields).strict();
export const paymentInUpdateDto = z.object(paymentInFields).partial().strict();
export const paymentOutCreateDto = z.object(paymentOutFields).strict().superRefine((value, context) => {
  if (!value.supplierName?.trim() && !value.customerName?.trim()) {
    context.addIssue({code: "custom", message: "付款对象不能为空", path: ["supplierName"]});
  }
});
export const paymentOutUpdateDto = z.object(paymentOutFields).partial().strict();

const purchaseItemDto = z.object({
  tempId: z.string().trim().max(120).default(""),
  productId: requiredText("商品", 120),
  productName: requiredText("商品名称", 200),
  category: z.enum(productCategories).optional(),
  model: z.string().trim().max(160),
  brand: z.string().trim().max(120),
  version: z.string().trim().max(160),
  vram: z.string().trim().max(80),
  sn: z.string().trim().max(160),
  condition: z.enum(purchaseConditions),
  inWarranty: z.boolean(),
  warrantyDate: dateText.optional(),
  repaired: z.boolean(),
  gpuRisk: z.boolean(),
  fullBox: z.boolean(),
  quantity: z.number().int().min(1).max(10_000).optional(),
  buyPrice: nonNegativeMoney,
  estSellPrice: nonNegativeMoney,
  warehouseLocation: z.string().trim().max(120),
  remarks: optionalText(500),
}).strict();

const purchaseFields = {
  date: dateText,
  sourceType: z.enum(sourceTypes),
  sourcePartnerId: optionalText(120),
  sourcePartnerType: z.enum(["customer", "vendor"]).optional(),
  supplierName: requiredText("往来对象", 120),
  contact: z.string().trim().max(160),
  expressNo: optionalText(120),
  paymentMethod: requiredText("付款方式", 80),
  isPaid: z.boolean(),
  vendorCreditAppliedAmount: nonNegativeMoney.optional(),
  paidAmount: nonNegativeMoney,
  unpaidAmount: nonNegativeMoney,
  settlementAccountId: optionalText(120),
  settlementAccountName: optionalText(120),
  paymentHandler: optionalText(80),
  paymentStatus: z.enum(["未付款", "部分付款", "已付款", "已退款"]).optional(),
  handleBy: requiredText("开单人", 80),
  remarks: optionalText(500),
  items: z.array(purchaseItemDto).min(1, "进货单至少需要一条商品明细").max(500, "单张进货单商品不能超过 500 件"),
};

export const purchaseInvoiceCreateDto = z.object(purchaseFields).strict();
export const purchaseInvoiceUpdateDto = z.object(purchaseFields).partial().strict();

const inspectionFields = {
  inventoryId: requiredText("库存档案", 120),
  sn: requiredText("SN", 160),
  condition: z.enum(purchaseConditions).optional(),
  inWarranty: z.boolean().optional(),
  warrantyDate: dateText.optional(),
  fullBox: z.boolean().optional(),
  warehouseLocation: optionalText(120),
  inspector: requiredText("检测人", 80),
  exteriorCheck: z.enum(["完美无瑕", "轻微刮花", "氧化发黄", "挡板生锈", "严重磕碰"]),
  fanCheck: z.enum(["静音顺畅", "轻微异响", "抖动偏摆", "风扇停转"]),
  portsCheck: z.enum(["全部正常", "部分接口无信号", "物理变形"]),
  gpuzCheck: z.enum(["核对一致", "规格异常 / 假卡山寨"]),
  furmarkResult: z.string().trim().max(500),
  threedMarkResult: z.string().trim().max(500),
  vramResult: z.enum(["全显存测试通过", "某显卡测试通道错误", "黄屏/花屏"]),
  temperature: z.number().finite().min(0).max(200),
  wattage: z.number().finite().min(0).max(10_000),
  noise: z.enum(["静音", "适中", "噪音明显"]),
  repaired: z.boolean(),
  hiddenDefects: z.boolean(),
  resultStatus: z.enum(["通过", "轻微问题", "需要维修", "拒收入库", "降价入库"]),
  remarks: optionalText(1000),
};

export const inspectionCreateDto = z.object(inspectionFields).strict();
export const inspectionUpdateDto = z.object(inspectionFields).partial().strict();

export function parseHttpDto<Schema extends z.ZodType>(schema: Schema, input: unknown): z.output<Schema> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const path = issue?.path.length ? `${issue.path.join(".")}：` : "";
  throw new ValidationError(`${path}${issue?.message || "请求参数无效"}`);
}
