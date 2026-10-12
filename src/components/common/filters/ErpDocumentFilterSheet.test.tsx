import test from "node:test";
import assert from "node:assert/strict";
import {filterDraftValues, filterFieldsWithDraft} from "./ErpDocumentFilterSheet";
import type {ErpFilterField} from "./ErpFilterFields";

test("draft changes never invoke live field callbacks or mutate applied criteria", () => {
  const calls: string[] = [];
  const fields: ErpFilterField[] = [
    {kind: "select", key: "status", label: "状态", value: "已完成", defaultValue: "", options: [], onChange: () => calls.push("status")},
    {kind: "text", key: "handler", label: "经办人", value: "甲", onChange: () => calls.push("handler")},
    {kind: "checkbox", key: "history", label: "历史", checked: true, onChange: () => calls.push("history")},
    {kind: "dateRange", key: "dates", label: "日期", value: {startDate: "2026-10-01", endDate: "2026-10-12"}, onChange: () => calls.push("dates")},
  ];
  const original = filterDraftValues(fields);
  let draft = {...original};
  for (const field of filterFieldsWithDraft(fields, draft, (key, value) => {draft = {...draft, [key]: value};})) {
    if (field.kind === "select") field.onChange("待处理");
    if (field.kind === "text") field.onChange("乙");
    if (field.kind === "checkbox") field.onChange(false);
    if (field.kind === "dateRange") field.onChange({startDate: "", endDate: "2026-10-11"});
  }
  assert.deepEqual(calls, []);
  assert.deepEqual(filterDraftValues(fields), original);
  assert.deepEqual(draft, {status: "待处理", handler: "乙", history: false, dates: {startDate: "", endDate: "2026-10-11"}});
  assert.deepEqual(filterDraftValues(fields, true), {status: "", handler: "", history: false, dates: {startDate: "", endDate: ""}});
  assert.equal("keyword" in draft, false);
  assert.equal("sortKey" in draft, false);
  assert.equal("pageSize" in draft, false);
});
