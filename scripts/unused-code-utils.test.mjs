import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {inspectUnusedCode, reviewUnusedExports} from "./unused-code-utils.mjs";

function fixture(t, files) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "erp-unused-check-"));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  files["tsconfig.json"] = JSON.stringify({compilerOptions: {target: "ES2022", module: "ESNext", moduleResolution: "bundler", jsx: "react-jsx", allowJs: true, paths: {"@/*": ["./*"]}}});
  for (const [file, source] of Object.entries(files)) {
    const target = path.join(directory, file);
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.writeFileSync(target, source);
  }
  return directory;
}

test("module graph follows aliased, dynamic, require, re-export and worker imports", (t) => {
  const root = fixture(t, {
    "src/main.tsx": 'import {used} from "@/src/shared"; used(); import("./lazy"); new URL("./worker.ts", import.meta.url);',
    "src/shared.ts": 'export {used} from "./actual";',
    "src/actual.ts": "export function used() {}",
    "src/lazy.ts": 'require("./required");',
    "src/required.ts": "export const value = 1;",
    "src/worker.ts": "export const worker = true;",
    "src/orphan/index.ts": 'export {used} from "../actual";',
    "src/assets.d.ts": 'declare module "*?url";',
  });
  assert.deepEqual(inspectUnusedCode(root).unusedModules, ["src/orphan/index.ts"]);
});

test("tests and maintenance CLIs keep intentional modules reachable", (t) => {
  const root = fixture(t, {
    "src/main.tsx": "export {};",
    "server/app.ts": "export const app = {};",
    "server/app.test.ts": 'import {app} from "./app"; console.log(app);',
    "server/repairCli.ts": 'import "./migration";',
    "server/migration.ts": "export {};",
    "scripts/verify.mjs": 'import "../src/tool";',
    "src/tool.ts": "export {};",
  });
  assert.deepEqual(inspectUnusedCode(root).unusedModules, []);
});

test("export report handles aliases, namespace access, shorthand and string-named lazy pages", (t) => {
  const root = fixture(t, {
    "src/main.tsx": 'import {live as renamed} from "./helpers"; import * as helpers from "./helpers"; renamed(); helpers.namespace(); const service = {renamed}; console.log(service); import("./page"); choose("LivePage"); import("./default"); import("./named-default");',
    "src/helpers.ts": "export function live() {} export function namespace() {} export function unused() {}",
    "src/page.ts": "export function LivePage() {}",
    "src/default.ts": "export default function DefaultPage() {}",
    "src/named-default.ts": "export function DefaultPage() {} export {DefaultPage as default};",
  });
  assert.deepEqual(inspectUnusedCode(root).unusedExports.map(({file, name}) => ({file, name})), [{file: "src/helpers.ts", name: "unused"}]);
});

test("a bare re-export does not conceal an unused implementation", (t) => {
  const root = fixture(t, {
    "src/main.tsx": 'import "./public";',
    "src/public.ts": 'export {unused} from "./helpers";',
    "src/helpers.ts": "export function unused() {}",
  });
  assert.equal(inspectUnusedCode(root).unusedExports[0]?.name, "unused");
});

test("reviewed contracts do not allow other unused exports in the same file", () => {
  const candidates = [{file: "src/types/accounting.ts", name: "contract", line: 1}, {file: "src/types/accounting.ts", name: "unused", line: 2}];
  const result = reviewUnusedExports(candidates, [{file: "src/types/accounting.ts", name: "contract", reason: "shared contract"}]);
  assert.deepEqual(result.unexpected, [candidates[1]]);
  assert.equal(result.retained[0].reason, "shared contract");
  assert.throws(() => reviewUnusedExports(candidates, [{file: "src/types/accounting.ts", name: "contract"}]), /保留理由/);
  assert.throws(() => reviewUnusedExports(candidates, [{file: "x.ts", name: "a", reason: "contract"}, {file: "x.ts", name: "a", reason: "again"}]), /重复/);
});
