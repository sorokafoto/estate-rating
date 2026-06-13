import test from "node:test";
import assert from "node:assert/strict";
import { toDate } from "./match-events-applications.mjs";

test("toDate: DD.MM.YYYY HH:MM — июнь, не март (не через new Date MM.DD)", () => {
  const dt = toDate("03.06.2026 11:50");
  assert.equal(dt.getFullYear(), 2026);
  assert.equal(dt.getMonth(), 5);
  assert.equal(dt.getDate(), 3);
  assert.equal(dt.getHours(), 11);
  assert.equal(dt.getMinutes(), 50);
});

test("toDate: DD.MM.YYYY без времени", () => {
  const dt = toDate("02.06.2026");
  assert.equal(dt.getMonth(), 5);
  assert.equal(dt.getDate(), 2);
});
