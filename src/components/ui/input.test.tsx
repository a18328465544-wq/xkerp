import {renderToStaticMarkup} from "react-dom/server";
import test from "node:test";
import assert from "node:assert/strict";
import {Input} from "./input";

test("Input uses full width when the caller does not provide a width", () => {
  const markup = renderToStaticMarkup(<Input aria-label="默认输入框" />);
  assert.match(markup, /w-full/);
});

test("Input respects a compact width supplied by a filter", () => {
  const markup = renderToStaticMarkup(<Input className="w-32" aria-label="经办人" />);
  assert.match(markup, /w-32/);
  assert.doesNotMatch(markup, /w-full/);
});
