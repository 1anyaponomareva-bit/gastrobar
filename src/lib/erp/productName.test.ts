import assert from "node:assert/strict";
import { test } from "node:test";
import { liveCatalogName, productDisplayName, productTitle } from "./productName";

const salt = { nameEn: "Salt", nameVn: "Muối" };
const foil = { name_en: "Aluminum Foil (45x285m)", name_vn: "Giấy bạc cuộn (45x285m)" };
const englishOnly = { nameEn: "Lime", nameVn: "  " };
const dairy = { nameEn: "Dairy Products & Eggs", nameVn: "Sữa và trứng" };

test("RU shows the English product name, never EN / VN", () => {
  assert.equal(productDisplayName({ locale: "ru", ...salt }), "Salt");
  assert.equal(productDisplayName(foil, "ru"), "Aluminum Foil (45x285m)");
  assert.ok(!productDisplayName({ locale: "ru", ...salt }).includes("/"));
});

test("EN shows the English product name", () => {
  assert.equal(productDisplayName({ locale: "en", nameEn: "Salt", nameVn: "Muối" }), "Salt");
  assert.equal(productDisplayName(foil, "en"), "Aluminum Foil (45x285m)");
});

test("VN shows the Vietnamese product name", () => {
  assert.equal(productDisplayName({ locale: "vn", ...salt }), "Muối");
  assert.equal(productDisplayName(foil, "vn"), "Giấy bạc cuộn (45x285m)");
});

test("VN falls back to English when Vietnamese is empty", () => {
  assert.equal(productDisplayName({ locale: "vn", ...englishOnly }), "Lime");
  assert.equal(productDisplayName({ name_en: "PANTRY", name_vn: "" }, "vn"), "PANTRY");
});

test("category names follow the same locale rule", () => {
  assert.equal(productDisplayName({ locale: "ru", ...dairy }), "Dairy Products & Eggs");
  assert.equal(productDisplayName({ locale: "en", ...dairy }), "Dairy Products & Eggs");
  assert.equal(productDisplayName({ locale: "vn", ...dairy }), "Sữa và trứng");
  assert.equal(productDisplayName({ locale: "vn", nameEn: "Alcohol", nameVn: "" }), "Alcohol");
});

test("brand stays on the title; still one language", () => {
  assert.equal(productTitle({ name_en: "Salt", name_vn: "Muối", brand: "Mlekpol" }, "ru"), "Salt · Mlekpol");
  assert.equal(productTitle({ name_en: "Salt", name_vn: "Muối", brand: "Mlekpol" }, "vn"), "Muối · Mlekpol");
});

test("composition lines read live catalog names, not a snapshot", () => {
  const products = [{ id: "prep-1", name_en: "New sauce", name_vn: "Sốt mới" }];
  assert.equal(liveCatalogName(products, "prep-1", "en"), "New sauce");
  assert.equal(liveCatalogName(products, "prep-1", "vn"), "Sốt mới");
  assert.equal(liveCatalogName(products, "prep-1", "ru"), "New sauce");
  assert.equal(liveCatalogName(products, "missing", "en"), "—");
  assert.equal(liveCatalogName(products, null, "en"), "—");
});
