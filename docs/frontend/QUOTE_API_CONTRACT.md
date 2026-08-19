# 行情参考 API Contract

## 读取

- `GET /api/products`
- 权限：`quotes`（服务端 `requireAnyMenu` 已允许）
- V2 只从 `data.marketQuotes` 和最小化的 `data.inventory` 聚合行情与关联在库数量。
- 页面不直接消费 DTO；响应先经过 `adaptMarketQuoteSnapshot()`。

## 写入

- `POST /api/market-quotes`：创建当前行情。
- `PATCH /api/market-quotes/:id`：提交 `todayBuyPrice`、`todaySellPrice`、`remarks`。历史点、涨跌幅和关联库存价格同步由服务端处理。
- `POST /api/market-quotes/import`：按现有服务端品牌 + 型号规则批量新增或更新，单次最多 2000 条。
- `DELETE /api/market-quotes/:id`：需要现有删除权限。

## 前端边界

```text
FastAPI Response → Quote DTO → Quote Adapter → MarketQuote Domain → Quotes Feature
```

- 不生成模拟历史点。
- 不在页面直接 `fetch` 或解析原始字段。
- 不修改服务端行情、库存同步和日志规则。
- 无完整成本及利润权限时，Adapter 移除价格和历史点，并禁用写入口以防覆盖不可见数据。
