import test from "node:test";
import assert from "node:assert/strict";
import { jsonForScript } from "./safe-json.mjs";

test("jsonForScript: экранирует </script>", () => {
  const payload = { name: "</script><script>alert(1)</script>" };
  const out = jsonForScript(payload);
  assert.ok(!out.includes("</script>"));
  const revived = JSON.parse(out.replace(/\\u003c/g, "<").replace(/\\u003e/g, ">"));
  assert.deepEqual(revived, payload);
});

test("jsonForScript: результат безопасен внутри script-тега", () => {
  const out = jsonForScript({ x: "<&>" });
  assert.match(out, /\\u003c/);
  assert.match(out, /\\u003e/);
  assert.match(out, /\\u0026/);
});
