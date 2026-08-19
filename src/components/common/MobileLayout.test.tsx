import assert from "node:assert/strict";
import test from "node:test";
import {renderToStaticMarkup} from "react-dom/server";
import type {ColumnDef} from "@tanstack/react-table";
import {ErpDataTable} from "./ErpDataTable";
import {ErpFilterBar} from "./ErpFilterBar";

type Row = {id: string; name: string; amount: string};

const columns: ColumnDef<Row, unknown>[] = [
  {accessorKey: "name", header: "名称"},
  {accessorKey: "amount", header: "金额"},
  {id: "actions", header: "操作", cell: () => <button type="button">打开</button>},
];

test("ordinary data tables expose a mobile card region and keep the desktop table", () => {
  const markup = renderToStaticMarkup(
    <ErpDataTable
      columns={columns}
      data={[{id: "1", name: "测试记录", amount: "¥100"}]}
      getRowId={(row) => row.id}
      total={1}
      page={1}
      pageSize={20}
      ariaLabel="测试列表"
    />,
  );

  assert.match(markup, /data-erp-region="mobile-table-cards"/);
  assert.match(markup, /sm:hidden/);
  assert.match(markup, /hidden sm:block/);
  assert.match(markup, /测试记录/);
  assert.match(markup, /上一页/);
});

test("dense tables can opt out of mobile cards", () => {
  const markup = renderToStaticMarkup(
    <ErpDataTable columns={columns} data={[{id: "1", name: "测试记录", amount: "¥100"}]} mobileMode="table" />,
  );

  assert.doesNotMatch(markup, /mobile-table-cards/);
  assert.match(markup, /min-w-\[1180px\]/);
});

test("filter bars expose stable mobile regions for one-column stacking", () => {
  const markup = renderToStaticMarkup(
    <ErpFilterBar actions={<button type="button">重置</button>}>
      <input aria-label="关键词" />
      <span>全部状态</span>
    </ErpFilterBar>,
  );

  assert.match(markup, /data-erp-region="filter-content"/);
  assert.match(markup, /data-erp-region="filter-actions"/);
});
