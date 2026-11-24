import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addLangToSteps,
  emptyRecipeStep,
  langsUsedInSteps,
  parseRecipeInstructions,
  removeLangFromSteps,
  serializeRecipeInstructions,
} from "./recipeCard";

test("parse keeps extra languages instead of dumping them into English", () => {
  const parsed = parseRecipeInstructions([
    {
      title: { ru: "Обжарить", zh: "煎" },
      items: [{ ru: "На сильном огне", zh: "大火" }, { ru: "Посолить" }],
    },
  ]);
  assert.equal(parsed[0].titleEn, "");
  assert.equal(parsed[0].extra?.ru?.title, "Обжарить");
  assert.equal(parsed[0].extra?.zh?.title, "煎");
  assert.match(parsed[0].extra?.ru?.items ?? "", /На сильном огне/);
  assert.match(parsed[0].extra?.zh?.items ?? "", /大火/);
});

test("serialize round-trips Russian and Chinese cooking steps", () => {
  const steps = addLangToSteps(addLangToSteps([emptyRecipeStep()], "ru"), "zh");
  steps[0].titleEn = "Fry";
  steps[0].titleVn = "Chiên";
  steps[0].itemsEn = "High heat\nSalt";
  steps[0].itemsVn = "Lửa lớn\nMuối";
  steps[0].extra = {
    ru: { title: "Обжарить", items: "Сильный огонь\nПосолить" },
    zh: { title: "煎", items: "大火\n盐" },
  };
  const stored = serializeRecipeInstructions(steps);
  assert.equal(stored[0].title?.ru, "Обжарить");
  assert.equal(stored[0].title?.zh, "煎");
  assert.equal(stored[0].items?.[0].zh, "大火");
  const again = parseRecipeInstructions(stored);
  assert.equal(again[0].extra?.ru?.title, "Обжарить");
  assert.equal(again[0].itemsEn.split("\n")[1], "Salt");
  assert.ok(langsUsedInSteps(again).includes("zh"));
});

test("removing a language drops it from every step", () => {
  const withZh = addLangToSteps([{ ...emptyRecipeStep(), extra: { zh: { title: "煎", items: "大火" } } }], "ru");
  const withoutZh = removeLangFromSteps(withZh, "zh");
  assert.equal(withoutZh[0].extra?.zh, undefined);
  assert.ok(withoutZh[0].extra?.ru);
});
