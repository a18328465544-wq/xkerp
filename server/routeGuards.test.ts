import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));

test("inspection history update route requires history edit permission", async () => {
  const source = await readFile(resolve(here, "index.ts"), "utf8");
  assert.match(
    source,
    /app\.put\("\/api\/inspections\/:id",\s*requireMenu\("inspections"\),\s*requireHistoryEditPermission,\s*asyncRoute/,
  );
});
