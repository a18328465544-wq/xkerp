import assert from "node:assert/strict";
import test from "node:test";
import {renderToStaticMarkup} from "react-dom/server";
import type {ColumnDef, SortingState} from "@tanstack/react-table";
import {ErpDataTable, resolveMobileCardDetails} from "./ErpDataTable";

type Row = {id: string; amount: number};

const columns: ColumnDef<Row, unknown>[] = [
  {accessorKey: "amount", header: "金额"},
];

test("client-side sorting reorders data rows", () => {
  const sorting: SortingState = [{id: "amount", desc: true}];
  const markup = renderToStaticMarkup(
    <ErpDataTable
      columns={columns}
      data={[{id: "low", amount: 10}, {id: "high", amount: 30}]}
      getRowId={(row) => row.id}
      sorting={sorting}
      mobileMode="table"
    />,
  );

  assert.ok(markup.indexOf(">30<") < markup.indexOf(">10<"));
});

test("expanded cards retain their disclosure even after every hidden field is shown", () => {
  assert.deepEqual(resolveMobileCardDetails(12, 4, false), {hiddenCount: 8, visibleCount: 4});
  assert.deepEqual(resolveMobileCardDetails(12, 4, true), {hiddenCount: 8, visibleCount: 12});
  assert.deepEqual(resolveMobileCardDetails(12, 4, false), {hiddenCount: 8, visibleCount: 4});
  assert.deepEqual(resolveMobileCardDetails(2, 4, false), {hiddenCount: 0, visibleCount: 2});
});

test("manual sorting preserves server row order rather than sorting just the loaded page", () => {
  const markup = renderToStaticMarkup(<ErpDataTable columns={columns} data={[{id: "low", amount: 10}, {id: "high", amount: 30}]} sorting={[{id: "amount", desc: true}]} manualSorting />);
  assert.ok(markup.indexOf(">10<") < markup.indexOf(">30<"));
});

test("short tables derive their minimum width from visible columns, not a global 1180px floor", () => {
  const markup = renderToStaticMarkup(<ErpDataTable columns={[{accessorKey: "amount", header: "金额", size: 120}]} data={[{id: "row", amount: 100}]} mobileMode="table" enableColumnResizing />);
  assert.match(markup, /min-width:120px/);
  assert.doesNotMatch(markup, /1180/);
  assert.match(markup, /aria-label="调整金额列宽"/);
  assert.match(markup, /Shift 加速，Home 恢复默认/);
});

test("generic mobile card makes whole card clickable and removes detail button on phone", () => {
  const markup = renderToStaticMarkup(
    <ErpDataTable
      columns={columns}
      data={[{id: "row1", amount: 100}]}
      onRowClick={() => {}}
      phone={true}
      compactViewport={true}
    />,
  );
  assert.match(markup, /data-clickable="true"/);
  assert.match(markup, /role="button"/);
  assert.doesNotMatch(markup, />查看详情</);
});

test("generic mobile card renders MoreHorizontal icon button and ChevronDown expander on phone", () => {
  type ExtraRow = {id: string; amount: number; remark: string};
  const extraColumns: ColumnDef<ExtraRow, unknown>[] = [
    {accessorKey: "id", header: "编号"},
    {accessorKey: "amount", header: "金额"},
    {accessorKey: "remark", header: "备注"},
    {id: "actions", header: "操作", cell: () => <span>按钮</span>},
  ];
  const markup = renderToStaticMarkup(
    <ErpDataTable
      columns={extraColumns}
      data={[{id: "row1", amount: 100, remark: "测试"}]}
      phone={true}
      compactViewport={true}
      mobileFields={1}
    />,
  );
  // Action button uses MoreHorizontal, not text "操作"
  assert.doesNotMatch(markup, />操作</);
  assert.match(markup, /data-erp-button-size="iconTouch"/);
  // Expand button uses ChevronDown with touch target
  assert.match(markup, /aria-label="查看其余 1 项"/);
});

