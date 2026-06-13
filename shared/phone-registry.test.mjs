import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyPhone,
  emptyRegistry,
  normalizePhone,
} from "./phone-registry.mjs";

describe("normalizePhone", () => {
  it("нормализует 8 и форматированные номера", () => {
    assert.equal(normalizePhone("8 (903) 586-90-43"), "79035869043");
    assert.equal(normalizePhone("9035869043"), "79035869043");
  });
});

describe("classifyPhone", () => {
  const catalog = new Map([
    ["74952282288", { developer_id: "DEV-001", developer_name: "ЛСР", url: "https://lsr.ru" }],
  ]);

  it("каталог → developer", () => {
    const hit = classifyPhone(emptyRegistry(), "74952282288", catalog);
    assert.equal(hit.entity_type, "developer");
    assert.equal(hit.source, "catalog");
  });

  it("AVA whitelist 796288 → developer, не spam range", () => {
    const hit = classifyPhone(emptyRegistry(), "79628801234", catalog);
    assert.equal(hit.entity_type, "developer");
    assert.equal(hit.developer_name, "AVA Group");
  });

  it("7963* → spam (Beeline КЦ)", () => {
    const hit = classifyPhone(emptyRegistry(), "79631234567", catalog);
    assert.equal(hit.entity_type, "spam");
    assert.equal(hit.source, "prefix_range");
  });

  it("7906847* → spam block", () => {
    const hit = classifyPhone(emptyRegistry(), "79068471234", catalog);
    assert.equal(hit.entity_type, "spam");
    assert.equal(hit.source, "prefix_block");
    assert.equal(hit.rule, "7906847");
  });

  it("manual в registry имеет приоритет", () => {
    const reg = emptyRegistry();
    reg.phones["79031234567"] = {
      entity_type: "developer",
      source: "manual",
      developer_name: "Тест",
      confidence: "high",
    };
    const hit = classifyPhone(reg, "79031234567", catalog);
    assert.equal(hit.source, "manual");
    assert.equal(hit.developer_name, "Тест");
  });

  it("заметка риэлтор → spam", () => {
    const hit = classifyPhone(emptyRegistry(), "79000000000", catalog, { note: "риэлторы звонят" });
    assert.equal(hit.entity_type, "spam");
    assert.equal(hit.source, "note_keyword");
  });
});
