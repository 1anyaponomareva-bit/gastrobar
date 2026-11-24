import type { ErpRecipe, ErpRecipeStep } from "./types";
import { normalizeContentLang, uniqueContentLangs } from "./contentLang";

export type RecipeCardLang = Record<string, string>;

export type RecipeStepExtra = { title: string; items: string };

export type RecipeStepDraft = {
  titleEn: string;
  titleVn: string;
  photo: string;
  itemsEn: string;
  itemsVn: string;
  extra?: Record<string, RecipeStepExtra>;
};

const isObj = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function readLangMap(value: unknown): RecipeCardLang {
  if (typeof value === "string") {
    const text = value.trim();
    return text ? { en: text } : {};
  }
  if (!isObj(value)) return {};
  const out: RecipeCardLang = {};
  for (const [key, raw] of Object.entries(value)) {
    const code = normalizeContentLang(key);
    if (!code || typeof raw !== "string") continue;
    const text = raw.trim();
    if (text) out[code] = text;
  }
  return out;
}

function extraCodes(title: RecipeCardLang, items: RecipeCardLang[]): string[] {
  return uniqueContentLangs([
    ...Object.keys(title),
    ...items.flatMap((item) => Object.keys(item)),
  ]).filter((code) => code !== "en" && code !== "vn");
}

function joinLang(items: RecipeCardLang[], code: string): string {
  return items.map((item) => item[code] ?? "").join("\n").replace(/\n+$/g, "");
}

function splitLangMaps(maps: Record<string, string>): RecipeCardLang[] {
  const codes = Object.keys(maps);
  if (!codes.length) return [];
  const lines = Object.fromEntries(codes.map((code) => [code, maps[code].split(/\r?\n/)]));
  const length = Math.max(0, ...Object.values(lines).map((row) => row.length));
  const items: RecipeCardLang[] = [];
  for (let i = 0; i < length; i += 1) {
    const item: RecipeCardLang = {};
    for (const code of codes) {
      const text = (lines[code][i] ?? "").trim();
      if (text) item[code] = text;
    }
    if (Object.keys(item).length) items.push(item);
  }
  return items;
}

function compactMap(map: RecipeCardLang): RecipeCardLang | undefined {
  return Object.keys(map).length ? map : undefined;
}

function parseItems(value: unknown): RecipeCardLang[] {
  if (typeof value === "string") return splitLangMaps({ en: value });
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === "string") return splitLangMaps({ en: item });
    const map = readLangMap(item);
    return Object.keys(map).length ? [map] : [];
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
  return { titleEn: "", titleVn: "", photo: "", itemsEn: "", itemsVn: "", extra: {} };
}

export function langsUsedInSteps(steps: RecipeStepDraft[]): string[] {
  return uniqueContentLangs(
    steps.flatMap((step) => [
      ...Object.keys(step.extra ?? {}),
      ...(step.titleEn.trim() || step.itemsEn.trim() ? ["en"] : []),
      ...(step.titleVn.trim() || step.itemsVn.trim() ? ["vn"] : []),
    ]),
  );
}

export function addLangToSteps(steps: RecipeStepDraft[], code: string): RecipeStepDraft[] {
  const lang = normalizeContentLang(code);
  if (!lang || lang === "en" || lang === "vn") return steps;
  return steps.map((step) =>
    step.extra?.[lang] ? step : { ...step, extra: { ...step.extra, [lang]: { title: "", items: "" } } },
  );
}

export function removeLangFromSteps(steps: RecipeStepDraft[], code: string): RecipeStepDraft[] {
  const lang = normalizeContentLang(code);
  if (!lang || lang === "en" || lang === "vn") return steps;
  return steps.map((step) => {
    if (!step.extra?.[lang]) return step;
    const extra = { ...step.extra };
    delete extra[lang];
    return { ...step, extra };
  });
}

function stepPhotoOf(row: Record<string, unknown>): string {
  if (typeof row.photo === "string" && row.photo.trim()) return row.photo.trim();
  if (typeof row.image === "string" && row.image.trim()) return row.image.trim();
  return "";
}

function asDraft(title: RecipeCardLang, photo: string, items: RecipeCardLang[]): RecipeStepDraft | null {
  const extra: Record<string, RecipeStepExtra> = {};
  for (const code of extraCodes(title, items)) {
    extra[code] = { title: title[code] ?? "", items: joinLang(items, code) };
  }
  const titleEn = title.en ?? "";
  const titleVn = title.vn ?? "";
  const itemsEn = joinLang(items, "en");
  const itemsVn = joinLang(items, "vn");
  if (!titleEn && !titleVn && !itemsEn && !itemsVn && !Object.keys(extra).length && !photo) return null;
  return { titleEn, titleVn, photo, itemsEn, itemsVn, extra };
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
    const draft = asDraft(readLangMap(raw.title), stepPhotoOf(raw), itemsFromStep(raw));
    return draft ? [draft] : [];
  }
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((step) => {
    if (typeof step === "string") {
      const itemsEn = step.trim();
      return itemsEn ? [{ ...emptyRecipeStep(), itemsEn }] : [];
    }
    const row = isObj(step) ? step : {};
    const draft = asDraft(readLangMap(row.title), stepPhotoOf(row), itemsFromStep(row));
    return draft ? [draft] : [];
  });
}

export function serializeRecipeInstructions(steps: RecipeStepDraft[]): ErpRecipeStep[] {
  return steps.flatMap((step) => {
    const itemMaps: Record<string, string> = { en: step.itemsEn, vn: step.itemsVn };
    const title: RecipeCardLang = {};
    if (step.titleEn.trim()) title.en = step.titleEn.trim();
    if (step.titleVn.trim()) title.vn = step.titleVn.trim();
    for (const [code, row] of Object.entries(step.extra ?? {})) {
      const lang = normalizeContentLang(code);
      if (!lang || lang === "en" || lang === "vn") continue;
      if (row.title.trim()) title[lang] = row.title.trim();
      itemMaps[lang] = row.items;
    }
    const items = splitLangMaps(itemMaps);
    const photo = step.photo.trim() || undefined;
    if (!compactMap(title) && !items.length && !photo) return [];
    return [{ ...(compactMap(title) ? { title } : {}), ...(photo ? { photo } : {}), items }];
  });
}

export function stepTitleMap(step: RecipeStepDraft): Record<string, string> {
  const map: Record<string, string> = {};
  if (step.titleEn.trim()) map.en = step.titleEn.trim();
  if (step.titleVn.trim()) map.vn = step.titleVn.trim();
  for (const [code, row] of Object.entries(step.extra ?? {})) {
    if (row.title.trim()) map[code] = row.title.trim();
  }
  return map;
}

export function stepItemsMap(step: RecipeStepDraft): Record<string, string> {
  const map: Record<string, string> = { en: step.itemsEn, vn: step.itemsVn };
  for (const [code, row] of Object.entries(step.extra ?? {})) {
    map[code] = row.items;
  }
  return map;
}
