import test from "node:test";
import assert from "node:assert/strict";
import { validatePublicData } from "./validate.mjs";

function withExitMock(fn) {
  const original = process.exit;
  let code = null;
  process.exit = (c) => {
    code = c;
    throw new Error("process.exit:" + c);
  };
  try {
    fn();
    return code;
  } catch (e) {
    if (String(e.message).startsWith("process.exit:")) return code;
    throw e;
  } finally {
    process.exit = original;
  }
}

test("validatePublicData: пропускает чистые агрегаты", () => {
  assert.doesNotThrow(() =>
    validatePublicData({
      developers: [{ developer_name: "Альфа", url: "alfa.ru", avg_response: 12 }],
    })
  );
});

test("validatePublicData: падает на запрещённый ключ", () => {
  const code = withExitMock(() =>
    validatePublicData({
      developers: [{ developer_name: "Альфа", phone_number: "+79991234567" }],
    })
  );
  assert.equal(code, 1);
});

test("validatePublicData: падает на телефон в строке", () => {
  const code = withExitMock(() =>
    validatePublicData({
      developers: [{ developer_name: "Звонок +79991234567", url: "x.ru" }],
    })
  );
  assert.equal(code, 1);
});
