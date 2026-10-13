import assert from "node:assert/strict";
import test from "node:test";
import {fittedQuickStatusCount} from "./quickStatusLayout";

test("whole status items fit without reserving an unnecessary More entry", () => {
  assert.equal(fittedQuickStatusCount([150, 140, 140, 125], 591, 100, 12, 4), 4);
  assert.equal(fittedQuickStatusCount([], 0, 100, 12, 4), 0);
});

test("overflow reserves its own width and the separating gap", () => {
  assert.equal(fittedQuickStatusCount([150, 140, 140, 125], 590, 100, 12, 4), 3);
  assert.equal(fittedQuickStatusCount([150, 140, 140, 125], 420, 100, 12, 4), 2);
  assert.equal(fittedQuickStatusCount([150, 140, 140, 125], 260, 100, 12, 4), 0);
  assert.equal(fittedQuickStatusCount([150, 140, 140, 125], 262, 100, 12, 4), 1);
});

test("large values, extra statuses and subpixel widths cannot slip past the budget", () => {
  assert.equal(fittedQuickStatusCount([350, 140], 280, 100, 12, 4), 0);
  assert.equal(fittedQuickStatusCount([100, 100, 100, 100, 100], 460, 100, 12, 4), 3);
  assert.equal(fittedQuickStatusCount([100.2, 100.2], 213, 60, 12, 4), 1);
  assert.equal(fittedQuickStatusCount([100, 100], 400, 60, 12, 1), 1);
});
