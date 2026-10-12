import assert from "node:assert/strict";
import test from "node:test";
import {renderToStaticMarkup} from "react-dom/server";
import {getActiveErpFilterTags, type ErpFilterField} from "./ErpFilterFields";
import {ErpFilterTags} from "./ErpFilterTags";

const noop = () => undefined;

test("only active fields become tags, described as 「字段：值」", () => {
  const removed: string[] = [];
  const fields: ErpFilterField[] = [
    {kind: "select", key: "channel", label: "渠道", value: "xianyu", defaultValue: "", options: [{value: "", label: "全部渠道"}, {value: "xianyu", label: "闲鱼"}], onChange: (value) => removed.push(`channel=${value}`)},
    {kind: "select", key: "level", label: "等级", value: "", defaultValue: "", options: [{value: "", label: "全部"}], onChange: noop},
    {kind: "dateRange", key: "date", label: "日期", value: {startDate: "2020-10-01", endDate: "2020-10-31"}, onChange: (value) => removed.push(`date=${value.startDate}`)},
    {kind: "text", key: "handler", label: "经办人", value: "张三", onChange: noop},
    {kind: "checkbox", key: "archived", label: "包含已归档", checked: true, onChange: noop},
  ];
  const tags = getActiveErpFilterTags(fields);
  assert.deepEqual(tags.map((tag) => tag.label), ["渠道：闲鱼", "日期：2020-10-01 至 2020-10-31", "经办人：张三", "包含已归档"]);
  tags[0]!.onRemove?.();
  tags[1]!.onRemove?.();
  assert.deepEqual(removed, ["channel=", "date="]);
});

test("tags render with remove buttons and a clear-all action only when several are active", () => {
  const one = renderToStaticMarkup(<ErpFilterTags tags={[{key: "a", label: "渠道：闲鱼", onRemove: noop}]} onClearAll={noop} />);
  assert.match(one, /aria-label="移除筛选：渠道：闲鱼"/);
  assert.doesNotMatch(one, />清空</);
  const two = renderToStaticMarkup(<ErpFilterTags tags={[{key: "a", label: "渠道：闲鱼", onRemove: noop}, {key: "b", label: "其他条件"}]} onClearAll={noop} />);
  assert.match(two, />清空</);
  assert.equal((two.match(/erp-filter-tag-remove/g) || []).length, 1);
});

test("more than five tags collapse into an interactive +n tag; none renders nothing", () => {
  const tags = Array.from({length: 7}, (_, index) => ({key: String(index), label: `条件${index}`, onRemove: noop}));
  const markup = renderToStaticMarkup(<ErpFilterTags tags={tags} />);
  assert.match(markup, />\+2</);
  assert.doesNotMatch(markup, /条件6/);
  assert.equal(renderToStaticMarkup(<ErpFilterTags tags={[]} />), "");
});
