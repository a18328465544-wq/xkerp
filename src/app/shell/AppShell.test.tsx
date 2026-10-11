import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./AppShell.tsx", import.meta.url), "utf8");

test("application shell locks the viewport and gives scrolling to the main region", () => {
  assert.match(source, /h-\[100dvh\] min-w-0 overflow-hidden/);
  assert.match(source, /flex min-h-0 min-w-0 flex-1 flex-col/);
  assert.match(source, /erp-scrollbar min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto/);
});

test("pull-to-refresh stays silent on success and still reports failures", () => {
  assert.match(source, /await queryClient\.refetchQueries\(\{type: "active"\}, \{throwOnError: true\}\)/);
  assert.doesNotMatch(source, /notify\.success\("数据已更新"\)/);
  assert.match(source, /notify\.error\("刷新失败，请稍后重试"\)/);
});
