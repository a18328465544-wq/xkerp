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


type Customer = {id: string; name: string; phone: string; level: string; balance: number; internal: string};
const customerColumns: ColumnDef<Customer, unknown>[] = [
  {accessorKey: "name", header: "客户", meta: {mobile: "title"}},
  {accessorKey: "phone", header: "电话", meta: {mobile: "meta"}},
  {accessorKey: "level", header: "等级", meta: {mobile: "status"}, cell: ({row}) => <b>{row.original.level}级</b>},
  {accessorKey: "balance", header: "应收", meta: {mobile: "amount", mobileLabel: "应收"}, cell: ({row}) => `¥${row.original.balance}`},
  {accessorKey: "internal", header: "内部备注"},
];
const customers: Customer[] = [{id: "c1", name: "张三", phone: "13800000000", level: "S", balance: 0, internal: "不该出现在手机行"}];

test("column roles build the phone row without a hand-written mobileRow", () => {
  const markup = renderToStaticMarkup(<ErpDataTable columns={customerColumns} data={customers} getRowId={(row) => row.id} mobileRow="columns" mobileEntity="customer" onRowClick={() => undefined} phone compactViewport />);
  assert.match(markup, /data-mobile-projection="list"/);
  assert.match(markup, /erp-phone-record-title[^>]*>张三</);
  assert.match(markup, /13800000000/);
  assert.match(markup, /<b>S级<\/b>/);
  assert.match(markup, /应收[\s\S]*¥0/);
  assert.match(markup, /aria-label="查看 张三"/);
  assert.doesNotMatch(markup, /不该出现在手机行/);
  assert.doesNotMatch(markup, /data-erp-region="mobile-card-header"/);
});

test("column-built rows keep desktop tables unchanged", () => {
  const markup = renderToStaticMarkup(<ErpDataTable columns={customerColumns} data={customers} getRowId={(row) => row.id} mobileRow="columns" phone={false} compactViewport={false} />);
  assert.match(markup, /<table/);
  assert.match(markup, /不该出现在手机行/);
  assert.doesNotMatch(markup, /erp-phone-record/);
});

test("a hand-written mobileRow still wins over column roles", () => {
  const markup = renderToStaticMarkup(<ErpDataTable columns={customerColumns} data={customers} getRowId={(row) => row.id} mobileRow={(row) => <span>自定义 {row.name}</span>} phone compactViewport />);
  assert.match(markup, /自定义 张三/);
  assert.doesNotMatch(markup, /erp-phone-record-title/);
});

test("hidden columns stay hidden in column-built phone rows", () => {
  const markup = renderToStaticMarkup(<ErpDataTable columns={customerColumns} data={customers} getRowId={(row) => row.id} mobileRow="columns" columnVisibility={{balance: false}} phone compactViewport />);
  assert.doesNotMatch(markup, /¥0/);
  assert.match(markup, /张三/);
});
