import test from "node:test";
import assert from "node:assert/strict";
import {renderToStaticMarkup} from "react-dom/server";
import {ErpDocumentRecordRow} from "./ErpDocumentRecordRow";

test("document rows retain long identity, independent status, party, handler and original amount", () => {
  const html = renderToStaticMarkup(<ErpDocumentRecordRow documentNo="XS-20261012-LONG-000000001" status={<span>已收款 · 待出库</span>} quantity="2 件" party="很长的客户公司全称" handler="测试员" date="2026-10-12" summary="显卡、内存" relatedDocument="XS-1" amount="−¥41,200.00" amountLabel="变动金额" onOpen={() => undefined} />);
  for (const value of ["XS-20261012-LONG-000000001", "已收款 · 待出库", "2 件", "很长的客户公司全称", "经办人 ·", "测试员", "2026-10-12", "关联单据 · XS-1", "−¥41,200.00", "变动金额"]) assert.ok(html.includes(value), value);
  assert.match(html, /data-record-layout="document"/);
  assert.doesNotMatch(html, /<img|erp-phone-record-image|暂无商品图片|title-mono/);
});

test("zero amount and zero quantity are facts, not missing values", () => {
  const html = renderToStaticMarkup(<ErpDocumentRecordRow documentNo="ZERO" amount={0} quantity={0} />);
  assert.match(html, /erp-data-number[^>]*>0</);
  assert.match(html, /erp-document-row-state[^>]*><span>0/);
  assert.doesNotMatch(html, /erp-phone-record-subtitle|erp-phone-record-meta|<button/);
});
