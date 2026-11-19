import type { ErpRecipe, ErpRecipeStep } from "./types";

export type RecipeCardLang = { en?: string; vn?: string; ru?: string };

export type RecipeStepDraft = {
  titleEn: string;
  titleVn: string;
  photo: string;
  itemsEn: string;
  itemsVn: string;
};

const isObj = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function langOf(value: unknown): { en: string; vn: string } {
  if (typeof value === "string") return { en: value, vn: "" };
  if (!isObj(value)) return { en: "", vn: "" };
  const en = typeof value.en === "string" ? value.en : "";
  const vn = typeof value.vn === "string" ? value.vn : "";
  const ru = typeof value.ru === "string" ? value.ru : "";
  return { en: en || ru, vn };
}

function compactLang(en: string, vn: string): RecipeCardLang | undefined {
  const next: RecipeCardLang = {};
  if (en.trim()) next.en = en.trim();
  if (vn.trim()) next.vn = vn.trim();
  return next.en || next.vn ? next : undefined;
}

function splitLines(en: string, vn: string): RecipeCardLang[] {
  const enLines = en.split(/\r?\n/);
  const vnLines = vn.split(/\r?\n/);
  const length = Math.max(enLines.length, vnLines.length);
  const items: RecipeCardLang[] = [];
  for (let i = 0; i < length; i += 1) {
    const item = compactLang(enLines[i] ?? "", vnLines[i] ?? "");
    if (item) items.push(item);
  }
  return items;
}

function parseItems(value: unknown): RecipeCardLang[] {
  if (typeof value === "string") return splitLines(value, "");
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === "string") return splitLines(item, "");
    const lang = langOf(item);
    return lang.en || lang.vn ? [lang] : [];
  });
}

const STEP_ITEM_KEYS = ["items", "method", "text", "body", "instructions", "cooking"] as const;

function itemsFromStep(row: Record<string, unknown>): RecipeCardLang[] {
  for (const key of STEP_ITEM_KEYS) {
    const items = parseItems(row[key]);
    if (items.length) return items;
  }
  return [];
}

export function emptyRecipeStep(): RecipeStepDraft {
  return { titleEn: "", titleVn: "", photo: "", itemsEn: "", itemsVn: "" };
}

function stepPhotoOf(row: Record<string, unknown>): string {
  if (typeof row.photo === "string" && row.photo.trim()) return row.photo.trim();
  if (typeof row.image === "string" && row.image.trim()) return row.image.trim();
  return "";
}

function asDraft(titleEn: string, titleVn: string, photo: string, items: RecipeCardLang[]): RecipeStepDraft | null {
  if (!titleEn && !titleVn && !items.length && !photo) return null;
  return {
    titleEn,
    titleVn,
    photo,
    itemsEn: items.map((item) => item.en ?? "").join("\n"),
    itemsVn: items.map((item) => item.vn ?? "").join("\n"),
  };
}

/** Turns stored jsonb / legacy text into editor rows. Does not read Staff JSON files. */
export function parseRecipeInstructions(raw: ErpRecipe["instructions"] | null | undefined | unknown): RecipeStepDraft[] {
  if (raw == null || raw === "") return [];
  if (typeof raw === "string") {
    const itemsEn = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .join("\n");
    return itemsEn ? [{ ...emptyRecipeStep(), itemsEn }] : [];
  }
  if (isObj(raw) && !Array.isArray(raw)) {
    const wrapper = raw.steps ?? raw.cooking ?? (raw.title == null && raw.items == null ? raw.instructions : undefined);
    if (wrapper != null && wrapper !== raw) return parseRecipeInstructions(wrapper);
    const title = langOf(raw.title);
    const draft = asDraft(title.en, title.vn, stepPhotoOf(raw), itemsFromStep(raw));
    return draft ? [draft] : [];
  }
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((step) => {
    if (typeof step === "string") {
      const itemsEn = step.trim();
      return itemsEn ? [{ ...emptyRecipeStep(), itemsEn }] : [];
    }
    const row = isObj(step) ? step : {};
    const title = langOf(row.title);
    const draft = asDraft(title.en, title.vn, stepPhotoOf(row), itemsFromStep(row));
    return draft ? [draft] : [];
  });
}

export function serializeRecipeInstructions(steps: RecipeStepDraft[]): ErpRecipeStep[] {
  return steps.flatMap((step) => {
    const title = compactLang(step.titleEn, step.titleVn);
    const items = splitLines(step.itemsEn, step.itemsVn);
    const photo = step.photo.trim() || undefined;
    if (!title && !items.length && !photo) return [];
    return [{ ...(title ? { title } : {}), ...(photo ? { photo } : {}), items }];
  });
}
