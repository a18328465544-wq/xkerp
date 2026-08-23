import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./pages/InspectionWorkspacePage.tsx", import.meta.url), "utf8");

test("inspection workspace uses the canonical page frame without changing its two-pane workflow", () => {
  const frame = source.indexOf("<ErpPageFrame");
  const header = source.indexOf("<ErpPageHeader");
  const content = source.indexOf("<ErpPageContent>");
  assert.ok(frame >= 0, "inspection workspace must use ErpPageFrame");
  assert.ok(header > frame, "page header must be inside the page frame");
  assert.ok(content > header, "page content must follow the canonical header");
  assert.match(source, /lg:grid-cols-\[minmax\(300px,360px\)_minmax\(0,1fr\)\]/);
});
