import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

for (const file of ["ecosystem.config.cjs", "ecosystem.staging.config.cjs"]) {
  test(`${file} starts the API through the canonical package entrypoint`, () => {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    assert.match(source, /script:\s*["']npm["']/);
    assert.match(source, /args:\s*["']run start:api["']/);
    assert.doesNotMatch(source, /script:\s*["']server-dist\/index\.mjs["']/);
  });
}
