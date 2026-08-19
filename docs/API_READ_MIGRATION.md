# Frontend V2 API 读取迁移清单

## 统一兼容边界

暂时没有专用分页接口的资源统一通过：

```ts
fetchFullStateCompat<T>(signal)
```

位置：`src/services/api/state-compat.ts`。

业务 Endpoint 只能在 API 层调用该兼容函数，页面和 Adapter 不得直接拼接 `/api/state?mode=full`。

## 当前仍使用兼容读取的资源

| 资源 | Endpoint | 原因 | 下一步 |
| --- | --- | --- | --- |
| 采购列表、采购详情、采购参考 | `purchase.ts` | 后端暂无专用列表/详情/候选接口 | 增加服务端分页和按权限候选接口 |
| 销售列表、销售出库池 | `sales.ts` | 后端暂无专用列表/出库池接口 | 增加分页、状态和日期筛选 |
| 财务收入、支出、调拨 | `finance-income.ts`、`finance-expense.ts`、`finance-transfers.ts` | 当前只有写接口，缺少读列表接口 | 增加分页、排序和日期/账户筛选 |
| 财务经营驾驶舱 | `finance.ts` | 统计口径依赖完整状态集合 | 后端提供权限裁剪后的统计快照 |
| 检测、售后 | `inspection.ts`、`aftersales.ts` | 当前专用读接口尚未完整落地 | 按待检/状态/日期分页 |
| 客户、供应商 | `customers.ts`、`vendors.ts` | 客户目录仍保留 V1 兼容读路径 | 统一使用 CRM/实体分页接口 |

该清单是已知 API Gap，不代表前端伪装成服务端分页。页面必须标注当前为兼容读取，并且只消费 Adapter 投影后的 Domain Model。

