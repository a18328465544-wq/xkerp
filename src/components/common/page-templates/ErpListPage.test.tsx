import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {renderToStaticMarkup} from "react-dom/server";
import type {ColumnDef} from "@tanstack/react-table";
import {createErpPageSizeOptions, ErpListPage, type ErpListPageProps} from "./ErpListPage";

type Row = {id: string; name: string; balance: number};
const columns: ColumnDef<Row, unknown>[] = [
  {accessorKey: "name", header: "客户", meta: {mobile: "title"}},
  {accessorKey: "balance", header: "应收", meta: {mobile: "amount", mobileLabel: "应收"}},
];
const noop = () => undefined;
const props: ErpListPageProps<Row> = {
  title: "客户档案",
  phoneTitle: "客户",
  subtitle: "集中维护个人客户。",
  countLabel: (total) => `${total} 位客户`,
  metrics: [<div key="a">卡片A</div>, <div key="b">卡片B</div>],
  search: {value: "", onChange: noop, label: "搜索客户档案", placeholder: "客户名称、电话", phonePlaceholder: "搜索名称"},
  filters: [{kind: "select", key: "level", label: "客户等级", value: "S级", defaultValue: "all", options: [{value: "all", label: "全部等级"}, {value: "S级", label: "S级"}], onChange: noop}],
  onResetFilters: noop,
  quickFilters: [{label: "全部", active: false, onSelect: noop}, {label: "核心 / S级", active: true, onSelect: noop}],
  defaultSortLabel: "最近交易",
  primaryAction: {label: "新建客户", onClick: noop},
  actions: [{label: "导出", onClick: noop}],
  onRefresh: noop,
  tableTitle: "个人客户明细",
  table: {columns, data: [{id: "c1", name: "张三", balance: 12}], getRowId: (row) => row.id, mobileRow: "columns", total: 37, page: 1, pageSize: 20, onPageChange: noop, onPageSizeChange: noop},
};

test("desktop keeps header, metrics, filter bar, then the table card", () => {
  const markup = renderToStaticMarkup(<ErpListPage {...props} phone={false} />);
  const order = ["客户档案", "卡片A", "搜索客户档案", "客户等级", "个人客户明细", "张三"].map((text) => markup.indexOf(text));
  assert.ok(order.every((index) => index >= 0), String(order));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.match(markup, /新建客户/);
  assert.match(markup, /共 37 条/);
  assert.doesNotMatch(markup, /erp-list-phone-title|data-phone-layout/);
});

test("desktop can preserve a legacy plain table and its result summary", () => {
  const markup = renderToStaticMarkup(<ErpListPage {...props} phone={false} desktopTableSection={false} desktopResultsSummary={<span>共 37 条</span>} />);
  assert.match(markup, /共 37 条/);
  assert.doesNotMatch(markup, /data-erp-component="dashboard-section"/);
  assert.doesNotMatch(markup, /个人客户明细/);
});

test("semantic page frames survive the shared layout on the target viewport", () => {
  const desktop = renderToStaticMarkup(<ErpListPage {...props} pageFrame="finance" phone={false} />);
  const phone = renderToStaticMarkup(<ErpListPage {...props} pageFrame="finance" phonePageFrame="analytics" phone />);
  assert.match(desktop, /data-page-frame="finance"/);
  assert.match(phone, /data-page-frame="analytics"/);
});

test("specialized desktop and phone table slots keep the shared page shell", () => {
  const desktop = renderToStaticMarkup(<ErpListPage {...props} phone={false} desktopTableSection={false} desktopTableContent={<div>桌面专用表</div>} tableNotice={<p>列表提示</p>} />);
  const phone = renderToStaticMarkup(<ErpListPage {...props} phone phoneTableContent={<div>手机专用表</div>} tableNotice={<p>列表提示</p>} />);
  assert.match(desktop, /桌面专用表/);
  assert.match(phone, /手机专用表/);
  assert.match(desktop, /列表提示/);
  assert.match(phone, /列表提示/);
  assert.match(phone, /erp-list-phone-title/);
});

test("specialized tables can use shared pagination without a fake table model", () => {
  const markup = renderToStaticMarkup(<ErpListPage<Row> {...props} phone table={undefined} pagination={{total: 41, page: 2, pageSize: 20, onPageSizeChange: noop}} phoneTableContent={<div>库存自定义行</div>} />);
  assert.match(markup, /41 位客户/);
  assert.match(markup, /库存自定义行/);
  assert.match(markup, /aria-label="客户筛选与操作"/);
  assert.doesNotMatch(markup, /data-erp-component="data-table"/, "a custom table does not need a fake table model");
  assert.match(readFileSync(new URL("./ErpListPage.tsx", import.meta.url), "utf8"), /aria-label="每页条数" value=\{String\(pageSize\)\} onValueChange=\{\(value\) => onPageSizeChange\(Number\(value\)\)\}/);
});

test("phone page-size choices can preserve a page-specific set", () => {
  assert.deepEqual(createErpPageSizeOptions([10, 20, 50]), [
    {value: "10", label: "10 条/页"},
    {value: "20", label: "20 条/页"},
    {value: "50", label: "50 条/页"},
  ]);
});

test("phone shows the count once, a filter button with its badge and column-built rows", () => {
  const markup = renderToStaticMarkup(<ErpListPage {...props} phone />);
  assert.match(markup, /data-phone-layout="thumb"/);
  assert.match(markup, /erp-list-phone-title">客户<small>37 位客户<\/small>/);
  assert.equal(markup.match(/37 位客户/g)?.length, 1);
  assert.doesNotMatch(markup, /条记录/, "the table's own count bar is replaced by the header count");
  assert.match(markup, /aria-label="客户筛选与操作"[^>]*>[\s\S]*?筛选<span class="tabular-nums">1<\/span>/);
  assert.match(markup, /aria-label="客户快捷筛选"/);
  assert.match(markup, /aria-pressed="true"[^>]*>核心 \/ S级/);
  assert.match(markup, /最近交易/);
  assert.match(markup, /erp-phone-record-title[^>]*>张三/);
  assert.match(markup, /data-erp-component="mobile-summary"/);
  assert.doesNotMatch(markup, /卡片A/, "phone metrics stay inside the closed summary sheet");
  assert.doesNotMatch(markup, /舒适|紧凑|列显示|刷新/, "desktop table chrome stays off phones");
});

test("loading and failed states replace the phone count", () => {
  assert.match(renderToStaticMarkup(<ErpListPage {...props} loading phone />), /<small>正在加载…<\/small>/);
  assert.match(renderToStaticMarkup(<ErpListPage {...props} loadError phone />), /<small>加载失败<\/small>/);
});

test("page-specific queue criteria are included in the phone filter badge", () => {
  const markup = renderToStaticMarkup(<ErpListPage {...props} phone additionalActiveFilterCount={2} />);
  assert.match(markup, /筛选<span class="tabular-nums">3<\/span>/);
});

test("quick filters are capped at four", () => {
  const many = Array.from({length: 6}, (_, index) => ({label: `筛选${index}`, active: false, onSelect: noop}));
  const markup = renderToStaticMarkup(<ErpListPage {...props} quickFilters={many} phone />);
  assert.match(markup, /筛选3/);
  assert.doesNotMatch(markup, /筛选4/);
});
