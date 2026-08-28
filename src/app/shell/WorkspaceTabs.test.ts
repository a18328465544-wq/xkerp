import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const tabsSource = readFileSync(new URL("./WorkspaceTabs.tsx", import.meta.url), "utf8");
const workspaceSource = readFileSync(new URL("./WorkspaceTabWorkspace.tsx", import.meta.url), "utf8");

test("workspace tab links delegate switch intent before route navigation", () => {
  assert.match(tabsSource, /<Link[\s\S]*onClick=\{\(event\) => navigateToTab\(item, event\)\}/);
  assert.match(workspaceSource, /event\.preventDefault\(\);[\s\S]*setNavigationIntent\(current \? null : "switch"\);[\s\S]*activate\(item\.id\);[\s\S]*const targetPath = routeByTabRef\.current\[item\.id\] \|\| item\.path;[\s\S]*void navigate\(\{to: targetPath\}\)/);
  assert.doesNotMatch(tabsSource, /onClick=\{\(\) => activate\(item\.id\)\}/);
});
