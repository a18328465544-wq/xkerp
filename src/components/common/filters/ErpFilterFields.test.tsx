import assert from "node:assert/strict";
import test from "node:test";
import {renderToStaticMarkup} from "react-dom/server";
import {countActiveErpFilterFields, ErpFilterFields, erpFilterPhoneControl, type ErpFilterField} from "./ErpFilterFields";

const noop = () => undefined;
const fields: ErpFilterField[] = [
  {kind: "select", key: "type", label: "客户类型", value: "all", defaultValue: "all", options: [{value: "all", label: "全部类型"}, {value: "同行", label: "同行"}], onChange: noop, width: "w-40"},
  {kind: "select", key: "level", label: "客户等级", value: "S级", defaultValue: "all", options: [{value: "all", label: "全部等级"}, {value: "S级", label: "S级"}], onChange: noop},
  {kind: "dateRange", key: "date", label: "交易日期", value: {startDate: "2026-10-01", endDate: "2026-10-10"}, onChange: noop},
  {kind: "text", key: "handler", label: "经办人", value: "", onChange: noop},
  {kind: "checkbox", key: "include-archived", label: "包含已归档", checked: true, onChange: noop},
];

test("active filters are counted against each field's default", () => {
  assert.equal(countActiveErpFilterFields(fields), 3);
  assert.equal(countActiveErpFilterFields(fields.slice(0, 1)), 0);
});

test("desktop bar and phone sheet render the same fields", () => {
  const bar = renderToStaticMarkup(<ErpFilterFields fields={fields} layout="bar" />);
  const sheet = renderToStaticMarkup(<ErpFilterFields fields={fields} layout="sheet" />);
  for (const label of ["客户类型", "客户等级", "经办人"]) {
    assert.match(bar, new RegExp(`aria-label="${label}"`));
    assert.match(sheet, new RegExp(`aria-label="${label}"`));
  }
  assert.match(bar, /type="checkbox"[^>]*checked=""/);
  assert.match(sheet, /包含已归档/);
  assert.doesNotMatch(bar, /phone-filter-fields/);
  assert.match(sheet, /data-erp-region="phone-filter-fields"/);
  assert.match(sheet, />客户等级<\/span>/);
});

test("bar controls without an explicit width keep a compact default", () => {
  const bar = renderToStaticMarkup(<ErpFilterFields fields={[fields[1]!]} layout="bar" />);
  assert.match(bar, /w-36/);
});

test("phone sheet: fixed short enums become choice chips, data-driven lists stay picker rows", () => {
  const status: ErpFilterField = {kind: "select", key: "paymentStatus", label: "收款状态", phoneControl: "chips", value: "", defaultValue: "", options: [{value: "", label: "全部收款状态"}, {value: "paid", label: "已收"}, {value: "partial", label: "部分"}], onChange: noop};
  const account: ErpFilterField = {kind: "select", key: "accountId", label: "结算账户", value: "all", defaultValue: "all", options: [{value: "all", label: "全部账户"}, {value: "a", label: "招商银行"}], onChange: noop};
  const sheet = renderToStaticMarkup(<ErpFilterFields fields={[status, account]} layout="sheet" />);
  assert.match(sheet, /data-erp-filter-field="paymentStatus" data-erp-filter-control="chips"/);
  assert.match(sheet, /role="radiogroup" aria-label="收款状态"/);
  assert.match(sheet, /<span>全部<\/span>/, "the default 「全部收款状态」 reads 「全部」 under its field label");
  assert.match(sheet, /data-erp-filter-field="accountId" data-erp-filter-control="picker"/);
  assert.match(sheet, /erp-filter-picker-label">结算账户</);
  assert.doesNotMatch(renderToStaticMarkup(<ErpFilterFields fields={[status]} layout="bar" />), /radiogroup/, "desktop keeps the select");
});

test("chips fall back to the picker row once a field has more than six choices besides 全部", () => {
  const options = [{value: "", label: "全部"}, ...Array.from({length: 7}, (_, index) => ({value: String(index), label: `类型${index}`}))];
  const many: ErpFilterField = {kind: "select", key: "type", label: "类型", phoneControl: "chips", value: "", defaultValue: "", options, onChange: noop};
  assert.equal(erpFilterPhoneControl(many), "picker");
  assert.equal(erpFilterPhoneControl({...many, options: options.slice(0, 7)}), "chips");
});
