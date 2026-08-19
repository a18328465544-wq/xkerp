import assert from "node:assert/strict";
import test from "node:test";
import {renderToStaticMarkup} from "react-dom/server";
import {ErpDateTimePicker} from "./ErpDateTimePicker";

test("ErpDateTimePicker keeps the existing local date-time value contract", () => {
  const markup = renderToStaticMarkup(
    <ErpDateTimePicker value="2026-08-19T09:30" onChange={() => undefined} aria-label="下次跟进时间" />,
  );
  assert.match(markup, /2026-08-19 09:30/);
  assert.match(markup, /data-erp-date-time-picker="true"/);
  assert.doesNotMatch(markup, /datetime-local/);
});

test("ErpDateTimePicker supports the shared compact height token", () => {
  const markup = renderToStaticMarkup(<ErpDateTimePicker density="compact" value="" onChange={() => undefined} />);
  assert.match(markup, /h-\[var\(--erp-control-height-compact\)\]/);
});
