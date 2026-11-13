import assert from "node:assert/strict";
import { test } from "node:test";
import {
  compareOnScreenNames,
  NONE_CATEGORY_ID,
  sortCategoriesByOnScreenName,
  withUncategorizedLast,
} from "./categoryOrder";

const rows = [
  { id: "z", name_en: "Zucchini", name_vn: "Bí ngòi" },
  { id: "a", name_en: "Alcohol", name_vn: "Rượu" },
  { id: "m", name_en: "Meat", name_vn: "Thịt" },
];

test("EN/RU sort by English on-screen names", () => {
  assert.deepEqual(
    sortCategoriesByOnScreenName(rows, "en").map((row) => row.id),
    ["a", "m", "z"],
  );
  assert.deepEqual(
    sortCategoriesByOnScreenName(rows, "ru").map((row) => row.id),
    ["a", "m", "z"],
  );
});

test("VN sort by Vietnamese on-screen names", () => {
  assert.deepEqual(
    sortCategoriesByOnScreenName(rows, "vn").map((row) => row.id),
    ["z", "a", "m"],
  );
  assert.ok(compareOnScreenNames("Bí ngòi", "Rượu", "vn") < 0);
});

test("uncategorized stays last after named A–Z", () => {
  const named = sortCategoriesByOnScreenName(rows, "en").map((row) => ({ id: row.id, label: row.name_en }));
  const options = withUncategorizedLast(named, { id: NONE_CATEGORY_ID, label: "No category" });
  assert.deepEqual(
    options.map((row) => row.id),
    ["a", "m", "z", NONE_CATEGORY_ID],
  );
  assert.equal(options.at(-1)?.label, "No category");
});
