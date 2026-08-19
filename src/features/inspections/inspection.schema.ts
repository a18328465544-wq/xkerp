import {z} from "zod";

const conditions = ["全新", "99新", "95新", "90新", "85新", "轻微瑕疵", "损坏"] as const;
const resultStatuses = ["通过", "轻微问题", "需要维修", "拒收入库", "降价入库"] as const;

export const inspectionSchema = z.object({
  inventoryId: z.string().min(1, "请选择待检测库存"),
  isGpu: z.boolean(),
  serialNumber: z.string().trim().min(1, "必须录入实物 SN").max(120, "SN 不能超过 120 个字符"),
  condition: z.enum(conditions),
  inWarranty: z.boolean(),
  warrantyDate: z.string(),
  fullBox: z.boolean(),
  warehouseLocation: z.string().trim().min(1, "必须填写最终存放位置").max(100, "库位不能超过 100 个字符"),
  inspector: z.string().trim().min(1, "缺少检测经办人"),
  exteriorCheck: z.enum(["完美无瑕", "轻微刮花", "氧化发黄", "挡板生锈", "严重磕碰"]),
  fanCheck: z.enum(["静音顺畅", "轻微异响", "抖动偏摆", "风扇停转"]),
  portsCheck: z.enum(["全部正常", "部分接口无信号", "物理变形"]),
  gpuzCheck: z.enum(["核对一致", "规格异常 / 假卡山寨"]),
  furmarkResult: z.string().max(500, "FurMark 结果不能超过 500 个字符"),
  threedMarkResult: z.string().max(500, "3DMark 结果不能超过 500 个字符"),
  vramResult: z.enum(["全显存测试通过", "某显卡测试通道错误", "黄屏/花屏"]),
  temperature: z.number().min(0).max(150, "核心温度不能超过 150℃"),
  wattage: z.number().min(0).max(2000, "功耗不能超过 2000W"),
  noise: z.enum(["静音", "适中", "噪音明显"]),
  repaired: z.boolean(),
  hiddenDefects: z.boolean(),
  resultStatus: z.enum(resultStatuses),
  remarks: z.string().max(1000, "备注不能超过 1000 个字符"),
  images: z.array(z.string().trim().min(1, "图片必须是已上传的媒体引用")).max(6, "最多上传 6 张图片"),
}).superRefine((values, context) => {
  if (values.inWarranty && !values.warrantyDate) {
    context.addIssue({code: "custom", path: ["warrantyDate"], message: "在保商品必须填写保修日期"});
  }
  if (!values.isGpu) return;
  if (!values.furmarkResult.trim()) context.addIssue({code: "custom", path: ["furmarkResult"], message: "必须填写实际 FurMark 检测结果"});
  if (!values.threedMarkResult.trim()) context.addIssue({code: "custom", path: ["threedMarkResult"], message: "必须填写实际 3DMark 检测结果"});
  if (values.temperature <= 0) context.addIssue({code: "custom", path: ["temperature"], message: "必须填写实际核心温度"});
  if (values.wattage <= 0) context.addIssue({code: "custom", path: ["wattage"], message: "必须填写实际烤机功耗"});
});

export const inspectionConditionOptions = conditions.map((value) => ({value, label: value}));
export const inspectionResultOptions = resultStatuses.map((value) => ({value, label: value}));
