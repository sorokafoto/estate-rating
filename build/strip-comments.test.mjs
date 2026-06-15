import { test } from "node:test";
import assert from "node:assert/strict";
import { stripJsComments } from "./strip-comments.mjs";

test("stripJsComments сохраняет regex с //", () => {
  const src = 'var re = /^https?:\\/\\//i;\nvar x = 1; // comment\n';
  const out = stripJsComments(src);
  assert.ok(out.includes("/^https?:\\/\\//i"));
  assert.doesNotMatch(out, /\/\/ comment/);
});

test("stripJsComments сохраняет деление", () => {
  const src = "var n = a / b; // tail";
  const out = stripJsComments(src);
  assert.match(out, /a \/ b/);
});
