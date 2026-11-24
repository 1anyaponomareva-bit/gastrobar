import assert from "node:assert/strict";
import { test } from "node:test";
import { extraNamesOnly, pickContentText, sanitizeLangMap, shownContentLangs } from "./contentLang";

test("sanitize keeps 2–5 letter keys and maps vi to vn", () => {
  assert.deepEqual(sanitizeLangMap({ EN: " Salt ", vi: "Muối", zh: "盐", "zh-CN": "no" }), {
    en: "Salt",
    vn: "Muối",
    zh: "盐",
  });
});

test("extra catalog names never keep EN or VN", () => {
  assert.deepEqual(extraNamesOnly({ en: "Salt", vn: "Muối", ru: "Соль", zh: "盐" }), { ru: "Соль", zh: "盐" });
});

test("pickContentText prefers the UI language then English", () => {
  const map = { en: "Salt", vn: "Muối", ru: "Соль" };
  assert.equal(pickContentText(map, "ru"), "Соль");
  assert.equal(pickContentText(map, "en"), "Salt");
  assert.equal(pickContentText({ en: "Salt", vn: "Muối" }, "ru"), "Salt");
  assert.equal(pickContentText({ vn: "Muối" }, "en"), "Muối");
});

test("EN and VN stay the default pair", () => {
  assert.deepEqual(shownContentLangs(["zh", "ru"]), ["en", "vn", "zh", "ru"]);
});
