import assert from "node:assert/strict";
import {readFileSync, statSync} from "node:fs";
import test from "node:test";

for (const file of ["ecosystem.config.cjs", "ecosystem.staging.config.cjs"]) {
  test(`${file} starts the API through the canonical package entrypoint`, () => {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    assert.match(source, /script:\s*["']npm["']/);
    assert.match(source, /args:\s*["']run start:api["']/);
    assert.doesNotMatch(source, /script:\s*["']server-dist\/index\.mjs["']/);
  });
}

for (const file of ["pg_backup.sh", "pg_restore_drill.sh"]) {
  test(`${file} is executable for systemd and operator runs`, () => {
    const mode = statSync(new URL(`../scripts/${file}`, import.meta.url)).mode;
    assert.notEqual(mode & 0o111, 0);
  });
}
