import assert from "node:assert/strict";
import test from "node:test";
import {hasExplicitAny} from "./explicit-any.mjs";

test("explicit-any rule permits string enums, documentation and JSX labels", () => {
  assert.equal(hasExplicitAny('type Warranty = "any" | "in" | "out"; // any means unrestricted\nconst label = <span>any</span>;'), false);
  assert.equal(hasExplicitAny('const value = `any ${1}`; /* any */'), false);
});
test("explicit-any rule still rejects annotations, assertions, arrays and template expressions", () => {
  for (const source of ['const value: any = 1;', 'type Value = Array<any>;', 'const value = input as any;', 'const value = `text ${input as any}`;', 'function value<T extends any>() {}']) {
    assert.equal(hasExplicitAny(source), true, source);
  }
});
