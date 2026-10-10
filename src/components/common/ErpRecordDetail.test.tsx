import assert from "node:assert/strict";
import test from "node:test";
import {renderToStaticMarkup} from "react-dom/server";
import {ErpRecordDetail, type ErpRecordDetailProps} from "./ErpRecordDetail";

const props: ErpRecordDetailProps = {
  hero: {title: "星河硬件", status: <span>S级</span>, amount: {label: "累计交易", value: "¥128,600"}},
  sections: [
    {title: "往来概览", facts: [{label: "应收余额", value: "¥0"}, false, {label: "最近交易", value: "2026-10-07"}]},
    {title: "档案与备注", collapsed: true, facts: [{label: "备注", value: "老客户"}], extra: <span>标签A</span>},
    {title: "空分组", facts: [null]},
  ],
};

test("phones get identity, sections in order and folded extras", () => {
  const markup = renderToStaticMarkup(<ErpRecordDetail {...props} phone />);
  assert.match(markup, /data-phone-detail="document"/);
  assert.match(markup, /<h2>星河硬件<\/h2><span>S级<\/span>/);
  assert.match(markup, /累计交易<\/span><strong class="erp-data-number">¥128,600/);
  assert.match(markup, /<section><h2>往来概览<\/h2>[\s\S]*应收余额[\s\S]*最近交易/);
  assert.match(markup, /<details><summary>档案与备注<\/summary>[\s\S]*老客户[\s\S]*标签A<\/span><\/details>/);
  assert.doesNotMatch(markup, /空分组/, "sections without facts are dropped");
});

test("desktop keeps one two-column fact grid led by the hero amount", () => {
  const markup = renderToStaticMarkup(<ErpRecordDetail {...props} phone={false} />);
  assert.match(markup, /data-erp-component="detail-fact-grid"/);
  assert.ok(markup.indexOf("累计交易") < markup.indexOf("应收余额"));
  assert.match(markup, /老客户/);
  assert.match(markup, /标签A/);
  assert.doesNotMatch(markup, /<details|erp-phone-document|空分组/);
});

test("desktop shows hero status and titles table-only sections", () => {
  const markup = renderToStaticMarkup(<ErpRecordDetail hero={{title: "XS-1", status: <span>已收款</span>}} sections={[{title: "商品明细", facts: [], extra: <table />}]} phone={false} />);
  assert.match(markup, /<span>已收款<\/span>/);
  assert.match(markup, /<h3[^>]*>商品明细<\/h3><table/);
});
