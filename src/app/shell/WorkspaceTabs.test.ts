import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./WorkspaceTabs.tsx", import.meta.url), "utf8");

test("workspace tab links register the switch intent before route navigation", () => {
  assert.match(source, /<Link[\s\S]*onClick=\{\(event\) => navigateToTab\(item, event\)\}/);
  assert.match(source, /event\.preventDefault\(\);[\s\S]*setNavigationIntent\(current \? null : "switch"\);[\s\S]*activate\(item\.id\);[\s\S]*void navigate\(\{to: item\.path\}\)/);
  assert.doesNotMatch(source, /onClick=\{\(\) => activate\(item\.id\)\}/);
});
