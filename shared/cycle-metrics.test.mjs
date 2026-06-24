import test from "node:test";
import assert from "node:assert/strict";
import { Q3_TARGETS, compareToQ3Targets } from "./cycle-metrics.mjs";

test("Q3_TARGETS: ключевые пороги", () => {
  assert.equal(Q3_TARGETS.identified_share_calls_pct, 70);
  assert.equal(Q3_TARGETS.unknown_share_calls_pct, 10);
  assert.equal(Q3_TARGETS.should_match_false_positives, 0);
});

test("compareToQ3Targets: met flags", () => {
  const good = compareToQ3Targets(
    { developer_share_pct: 72, unknown_share_pct: 8 },
    { orphan_share_pct: 20, identified_calls: 100, orphan_reasons: { до_заявки: 4 }, should_match_false_positives: 0 }
  );
  assert.equal(good.identified_share_calls_pct.met, true);
  assert.equal(good.unknown_share_calls_pct.met, true);
  assert.equal(good.should_match_false_positives.met, true);

  const bad = compareToQ3Targets(
    { developer_share_pct: 50, unknown_share_pct: 20 },
    { orphan_share_pct: 30, identified_calls: 100, orphan_reasons: {}, should_match_false_positives: 7 }
  );
  assert.equal(bad.identified_share_calls_pct.met, false);
  assert.equal(bad.should_match_false_positives.met, false);
});
