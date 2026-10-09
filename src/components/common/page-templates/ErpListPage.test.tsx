import assert from "node:assert/strict";
import test from "node:test";
import {renderToStaticMarkup} from "react-dom/server";
import type {ColumnDef} from "@tanstack/react-table";
import {ErpListPage, type ErpListPageProps} from "./ErpListPage";

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
  assert.doesNotMatch(markup, /卡片A/, "metrics stay off the phone list");
  assert.doesNotMatch(markup, /舒适|紧凑|列显示|刷新/, "desktop table chrome stays off phones");
});

test("loading and failed states replace the phone count", () => {
  assert.match(renderToStaticMarkup(<ErpListPage {...props} loading phone />), /<small>正在加载…<\/small>/);
  assert.match(renderToStaticMarkup(<ErpListPage {...props} loadError phone />), /<small>加载失败<\/small>/);
});

test("quick filters are capped at four", () => {
  const many = Array.from({length: 6}, (_, index) => ({label: `筛选${index}`, active: false, onSelect: noop}));
  const markup = renderToStaticMarkup(<ErpListPage {...props} quickFilters={many} phone />);
  assert.match(markup, /筛选3/);
  assert.doesNotMatch(markup, /筛选4/);
});
