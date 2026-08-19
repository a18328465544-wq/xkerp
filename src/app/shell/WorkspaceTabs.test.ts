import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./WorkspaceTabs.tsx", import.meta.url), "utf8");

test("workspace tab links own route navigation while activation only updates tab state", () => {
  assert.match(source, /<Link[\s\S]*onClick=\{\(\) => activate\(item\.id\)\}/);
  assert.doesNotMatch(source, /if \(pathname !== item\.path\) void navigate\(\{to: item\.path\}\)/);
});
