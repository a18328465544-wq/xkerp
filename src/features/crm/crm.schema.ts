import {z} from "zod";

export const crmFollowUpSchema = z.object({
  customerId: z.string().trim().min(1, "缺少可关联的客户档案"),
  contactMethod: z.enum(["电话", "微信", "闲鱼", "淘宝", "到店", "其他"]),
  content: z.string().trim().min(2, "请填写跟进内容").max(500, "跟进内容最多 500 字"),
  result: z.enum(["继续跟进", "已报价", "已成交", "暂缓", "无效线索", "售后维护"]),
  nextFollowTime: z.string(),
  nextAction: z.string().max(100, "下一步动作最多 100 字"),
  dealProbability: z.number().min(0).max(100),
  estimatedAmount: z.number().min(0),
  remarks: z.string().max(300, "备注最多 300 字"),
});
