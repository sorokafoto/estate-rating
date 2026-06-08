import test from "node:test";
import assert from "node:assert/strict";
import { hrefFromRaw, hrefFromStored, cleanUrl } from "./url.mjs";

test("hrefFromRaw: принимает https URL", () => {
  assert.equal(hrefFromRaw("https://example.ru/path"), "https://example.ru/path");
});

test("hrefFromRaw: отклоняет userinfo", () => {
  assert.equal(hrefFromRaw("https://evil.com@trusted.ru"), null);
});

test("hrefFromRaw: отклоняет javascript:", () => {
  assert.equal(hrefFromRaw("javascript:alert(1)"), null);
});

test("hrefFromStored: строит ссылку из домена", () => {
  assert.equal(hrefFromStored("example.ru"), "https://example.ru/");
});

test("cleanUrl: нормализует домен", () => {
  assert.equal(cleanUrl("https://www.Example.RU/"), "example.ru");
});
