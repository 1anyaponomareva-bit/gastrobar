import assert from "node:assert/strict";
import { test } from "node:test";
import { setErpLang } from "./i18n";
import { categoryFilterOptions, visibleCategories } from "./menuFields";

const rows = [
  { id: "z", code: "z", name_en: "Zucchini", name_vn: "Bí ngòi", sort: 0, archived_at: null },
  { id: "a", code: "a", name_en: "Alcohol", name_vn: "Rượu", sort: 1, archived_at: null },
  { id: "m", code: "m", name_en: "Meat", name_vn: "Thịt", sort: 2, archived_at: null },
  { id: "old", code: "old", name_en: "Archived", name_vn: "Lưu trữ", sort: 3, archived_at: "2026-01-01" },
];

test("visible categories are A–Z by English on RU/EN", () => {
  try {
    setErpLang("en");
    assert.deepEqual(visibleCategories(rows).map((row) => row.id), ["a", "m", "z"]);
    setErpLang("ru");
    assert.deepEqual(visibleCategories(rows).map((row) => row.id), ["a", "m", "z"]);
  } finally {
    setErpLang("ru");
  }
});

test("visible categories are A–Z by Vietnamese on VN; uncategorized last", () => {
  try {
    setErpLang("vn");
    assert.deepEqual(visibleCategories(rows).map((row) => row.id), ["z", "a", "m"]);
    assert.deepEqual(
      categoryFilterOptions(rows, "Chưa phân nhóm").map((row) => [row.id, row.label]),
      [
        ["z", "Bí ngòi"],
        ["a", "Rượu"],
        ["m", "Thịt"],
        ["none", "Chưa phân nhóm"],
      ],
    );
  } finally {
    setErpLang("ru");
  }
});
