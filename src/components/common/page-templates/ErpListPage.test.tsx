import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {renderToStaticMarkup} from "react-dom/server";
import type {ColumnDef} from "@tanstack/react-table";
import {Button} from "@/src/components/ui";
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

test("phone search actions cannot change desktop search or creation actions", () => {
  const original = renderToStaticMarkup(<ErpListPage {...props} phone={false} />);
  const withScan = renderToStaticMarkup(<ErpListPage {...props} phone={false} phoneSearchAction={{label: "扫码", onClick: noop, icon: <span>扫码图标</span>}} />);
  assert.equal(withScan, original);
  assert.match(withScan, /新建客户/);
  assert.doesNotMatch(withScan, /扫码图标|data-erp-search-action/);
});

test("a domain-owned phone More trigger can stay inline without another action sheet", () => {
  const headerActions = <Button aria-label="库存更多" onClick={noop}>库存更多</Button>;
  const inline = renderToStaticMarkup(<ErpListPage {...props} phone phoneHeaderActions={headerActions} phoneHeaderActionsMode="inline" />);
  assert.match(inline, /aria-label="库存更多"/);
  assert.doesNotMatch(inline, /aria-label="更多页面操作"/);
  const unchanged = renderToStaticMarkup(<ErpListPage {...props} phone phoneHeaderActions={headerActions} />);
  assert.match(unchanged, /aria-label="更多页面操作"/);
  const desktop = renderToStaticMarkup(<ErpListPage {...props} phone={false} phoneHeaderActions={headerActions} phoneHeaderActionsMode="inline" />);
  assert.doesNotMatch(desktop, /库存更多/);
});

test("desktop keeps header, metrics, filter bar, then the table card", () => {
  const markup = renderToStaticMarkup(<ErpListPage {...props} phone={false} />);
  const order = ["客户档案", "卡片A", "搜索客户档案", "客户等级", "个人客户明细", "张三"].map((text) => markup.indexOf(text));
  assert.ok(order.every((index) => index >= 0), String(order));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.match(markup, /新建客户/);
  assert.match(markup, /共 37 条/);
  assert.doesNotMatch(markup, /erp-list-phone-title|data-phone-layout/);
});

test("a specialized filter sheet is phone-only and does not replace desktop filters", () => {
  let calls = 0;
  const phoneFilterSheet: ErpListPageProps<Row>["phoneFilterSheet"] = ({open}) => {calls += 1; return <div>专用筛选面板：{String(open)}</div>;};
  const desktop = renderToStaticMarkup(<ErpListPage {...props} phone={false} phoneFilterSheet={phoneFilterSheet} />);
  assert.equal(calls, 0);
  assert.match(desktop, /客户等级/);
  assert.doesNotMatch(desktop, /专用筛选面板/);
  const phone = renderToStaticMarkup(<ErpListPage {...props} phone phoneFilterSheet={phoneFilterSheet} />);
  assert.equal(calls, 1);
  assert.match(phone, /专用筛选面板：false/);
  assert.match(phone, /aria-label="客户筛选"/);
  assert.doesNotMatch(phone, /客户筛选与操作/);
});

test("desktop can preserve a legacy plain table and its result summary", () => {
  const markup = renderToStaticMarkup(<ErpListPage {...props} phone={false} desktopTableSection={false} desktopResultsSummary={<span>共 37 条</span>} />);
  assert.match(markup, /共 37 条/);
  assert.doesNotMatch(markup, /data-erp-component="dashboard-section"/);
  assert.doesNotMatch(markup, /个人客户明细/);
});

test("semantic page frames survive the shared layout on the target viewport", () => {
  const desktop = renderToStaticMarkup(<ErpListPage {...props} pageFrame="finance" phone={false} />);
  const phone = renderToStaticMarkup(<ErpListPage {...props} pageFrame="finance" phone />);
  assert.match(desktop, /data-page-frame="finance"/);
  assert.match(phone, /data-page-frame="finance"/);
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
  assert.match(markup, /role="radiogroup" aria-label="客户快捷筛选"/);
  assert.match(markup, /aria-checked="true"[^>]*>[\s\S]*?<span>核心 \/ S级<\/span>/);
  assert.match(markup, /最近交易/);
  assert.match(markup, /erp-phone-record-title[^>]*>张三/);
  assert.doesNotMatch(markup, /data-erp-component="mobile-summary"|卡片A/, "summary metrics stay off phone lists");
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

test("quick filters are one scrollable chip row instead of a truncated list", () => {
  const many = Array.from({length: 6}, (_, index) => ({label: `筛选${index}`, active: index === 0, onSelect: noop}));
  const markup = renderToStaticMarkup(<ErpListPage {...props} quickFilters={many} phone />);
  assert.match(markup, /data-erp-component="choice-chips" data-layout="scroll"/);
  assert.match(markup, /筛选5/);
  assert.doesNotMatch(markup, /data-erp-button-variant="primary"[^>]*aria-checked/);
});

test("desktop results bar lists applied filters as removable tags", () => {
  const markup = renderToStaticMarkup(<ErpListPage {...props} search={{...props.search!, value: "4090"}} onResetFilters={noop} phone={false} />);
  assert.match(markup, /data-erp-component="filter-tags"/);
  assert.match(markup, /搜索：4090/);
  assert.match(markup, />清空</);
  assert.doesNotMatch(markup, /项筛选/);
});

test("document lists opt into compact rows without changing the desktop layout", () => {
  const documentProps: ErpListPageProps<Row> = {...props, phonePresentation: "documents", onApplyPhoneFilters: noop};
  assert.equal(renderToStaticMarkup(<ErpListPage {...props} phone={false} />), renderToStaticMarkup(<ErpListPage {...documentProps} phone={false} />));
  const markup = renderToStaticMarkup(<ErpListPage {...documentProps} phone />);
  assert.match(markup, /erp-document-list/);
  assert.match(markup, /aria-label="客户筛选"/);
  assert.match(markup, /aria-label="新建客户"/);
  assert.match(markup, /aria-label="客户更多操作"/);
  assert.equal(markup.match(/37 位客户/g)?.length, 1);
  assert.doesNotMatch(markup, /共 37 条|客户筛选与操作/);
});

test("documents cannot pretend a server-ordered page has global sorting", () => {
  const markup = renderToStaticMarkup(<ErpListPage {...props} phone phonePresentation="documents" table={{...props.table!, mobileSorting: false}} />);
  assert.doesNotMatch(markup, /aria-label="客户排序"/);
});

test("legacy desktop workspaces and overlays are retained verbatim", () => {
  const markup = renderToStaticMarkup(<ErpListPage {...props} phone={false} desktopPageContent={<main>原桌面工作台</main>} overlays={<aside>原确认窗口</aside>} />);
  assert.equal(markup, "<main>原桌面工作台</main><aside>原确认窗口</aside>");
});

test("phone workbench uses one task instead of duplicating list and scan controls", () => {
  const task = {open: true, active: true, title: "出库核验", onClose: noop, actions: <button>SN 日期</button>, content: <textarea aria-label="扫码草稿" defaultValue="SN-4090" />};
  const phone = renderToStaticMarkup(<ErpListPage {...props} phone phoneTask={task} overlays={<aside>原扫码窗口</aside>} />);
  assert.match(phone, /data-phone-task="true"/);
  assert.match(phone, /返回单据列表/);
  assert.equal(phone.match(/>SN 日期</g)?.length, 1);
  assert.equal(phone.match(/aria-label="扫码草稿"/g)?.length, 1);
  assert.doesNotMatch(phone, /个人客户明细|erp-list-phone-title|搜索客户档案/);
  assert.match(phone, /原扫码窗口/);
  const desktop = renderToStaticMarkup(<ErpListPage {...props} phone={false} phoneTask={task} desktopPageContent={<main>原双栏工作台</main>} />);
  assert.equal(desktop, "<main>原双栏工作台</main>");
});

test("returning from a phone task restores the original list projection", () => {
  const markup = renderToStaticMarkup(<ErpListPage {...props} phone phoneTask={{open: false, active: true, title: "出库核验", onClose: noop, content: <div>核验表单</div>}} />);
  assert.match(markup, /erp-list-phone-title/);
  assert.doesNotMatch(markup, /data-phone-task|核验表单/);
});

test("list section counts use the shared gray inline tally without a status dot", () => {
  const markup = renderToStaticMarkup(<ErpListPage {...props} phone={false} desktopTableSection />);
  assert.match(markup, /data-erp-region="section-count"[^>]*>共 37 条/);
  assert.doesNotMatch(markup, /label="共 37 条"/);
});

test("empty lists offer the already-authorized creation action once per screen", () => {
  for (const phone of [false, true]) {
    const markup = renderToStaticMarkup(<ErpListPage {...props} phone={phone} table={{...props.table!, data: [], total: 0}} />);
    // Phones already show 新建客户 in the search dock, so the empty state does not repeat it.
    if (phone) assert.doesNotMatch(markup, /data-erp-component="empty-state"[\s\S]*新建客户/);
    else assert.match(markup, /data-erp-component="empty-state"[\s\S]*新建客户/);
    const restricted = renderToStaticMarkup(<ErpListPage {...props} phone={phone} primaryAction={undefined} table={{...props.table!, data: [], total: 0}} />);
    assert.doesNotMatch(restricted, /新建客户/);
  }
});
