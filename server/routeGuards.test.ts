import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));

test("inspection history update route requires history edit permission", async () => {
  const source = await readFile(resolve(here, "routes/inspectionMutations.ts"), "utf8");
  assert.match(
    source,
    /app\.put\(\s*"\/api\/inspections\/:id",\s*dependencies\.requireMenu\("inspections"\),\s*dependencies\.requireHistoryEditPermission,\s*dependencies\.asyncRoute/,
  );
});
