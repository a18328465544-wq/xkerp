import assert from "node:assert/strict";
import test from "node:test";
import {renderToStaticMarkup} from "react-dom/server";
import {ErpChoiceChips} from "./ErpChoiceChips";

const options = [{value: "all", label: "全部", count: 128}, {value: "unpaid", label: "待收款", count: 12}, {value: "blocked", label: "停用", disabled: true}] as const;
const chips = (markup: string) => [...markup.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map((match) => match[0]);

test("choice chips are a named radio group with one checked option", () => {
  const markup = renderToStaticMarkup(<ErpChoiceChips label="收款状态" value="unpaid" options={options} onValueChange={() => undefined} />);
  assert.match(markup, /role="radiogroup" aria-label="收款状态"/);
  const [all, unpaid, blocked] = chips(markup);
  assert.ok(all && unpaid && blocked);
  for (const chip of [all, unpaid, blocked]) assert.match(chip, /role="radio"/);
  assert.match(unpaid, /aria-checked="true"/);
  assert.match(all, /aria-checked="false"/);
  assert.match(blocked, /disabled=""/);
});

test("the selected chip shows a check mark, so selection does not rely on colour", () => {
  const [all, unpaid] = chips(renderToStaticMarkup(<ErpChoiceChips label="收款状态" value="unpaid" options={options} onValueChange={() => undefined} />));
  assert.match(unpaid!, /erp-choice-chip-check/);
  assert.doesNotMatch(all!, /erp-choice-chip-check/);
});

test("counts render after the label and chips never borrow the primary action style", () => {
  const markup = renderToStaticMarkup(<ErpChoiceChips label="收款状态" value="all" options={options} onValueChange={() => undefined} />);
  assert.match(markup, /<span>待收款<\/span><span class="erp-choice-chip-count">12<\/span>/);
  assert.doesNotMatch(markup, /data-erp-button-variant="primary"/);
});

test("only one chip is a tab stop and a disabled selection falls back to an enabled chip", () => {
  const markup = renderToStaticMarkup(<ErpChoiceChips label="状态" value="blocked" options={options} onValueChange={() => undefined} />);
  assert.equal((markup.match(/tabindex="0"/g) || []).length, 1);
  assert.match(chips(markup)[0]!, /tabindex="0"/);
});

test("scroll layout is declared for quick-filter rows", () => {
  assert.match(renderToStaticMarkup(<ErpChoiceChips label="快捷筛选" layout="scroll" value="all" options={options} onValueChange={() => undefined} />), /data-layout="scroll"/);
});
