import type { LocalizedText, Recipe, RecipeLang } from "@/data/recipes";
import { translateTexts, type TranslationTask } from "@/lib/recipes-admin/gemini";

const LANGS: RecipeLang[] = ["ru", "en", "vn"];

type TextSlot = { next: Record<string, unknown>; prev?: LocalizedText };

function asText(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Pairs every localized text of the submitted recipe with the same text of the published version (by position). */
function collectSlots(input: Record<string, unknown>, prev: Recipe | undefined): TextSlot[] {
  const slots: TextSlot[] = [];
  const add = (next: unknown, prevText?: LocalizedText) => {
    const text = asText(next);
    if (text) slots.push({ next: text, prev: prevText });
  };

  add(input.name, prev?.name);
  add(asText(input.yield)?.label, prev?.yield.label);
  list(input.facts).forEach((fact, index) => {
    add(asText(fact)?.label, prev?.facts?.[index]?.label);
    add(asText(fact)?.value, prev?.facts?.[index]?.value);
  });
  list(input.ingredients).forEach((row, index) => add(asText(row)?.name, prev?.ingredients[index]?.name));
  list(input.steps).forEach((step, index) => {
    const prevStep = prev?.steps[index];
    add(asText(step)?.title, prevStep?.title);
    list(asText(step)?.items).forEach((item, itemIndex) => add(item, prevStep?.items[itemIndex]));
  });
  list(input.storage).forEach((rule, index) => {
    add(asText(rule)?.title, prev?.storage?.[index]?.title);
    add(asText(rule)?.text, prev?.storage?.[index]?.text);
  });
  return slots;
}

/**
 * A text edited in some languages but not in others is re-translated into the untouched ones;
 * a text filled in only some languages gets the empty ones translated. Mutates `input`.
 */
export async function translateEditedTexts(input: unknown, prev: Recipe | undefined): Promise<void> {
  const source = asText(input);
  if (!source) return;

  const slots = collectSlots(source, prev);
  const tasks: (TranslationTask & { slot: TextSlot })[] = [];
  for (const slot of slots) {
    const values = Object.fromEntries(LANGS.map((lang) => [lang, str(slot.next[lang])])) as Record<RecipeLang, string>;
    const filled = LANGS.filter((lang) => values[lang]);
    if (!filled.length) continue;

    const changed = slot.prev ? filled.filter((lang) => values[lang] !== (slot.prev?.[lang] ?? "").trim()) : [];
    const from = changed[0] ?? filled[0];
    const to = LANGS.filter((lang) => !values[lang] || (changed.length && !changed.includes(lang)));
    if (to.length) tasks.push({ id: tasks.length, from, text: values[from], to, slot });
  }
  if (!tasks.length) return;

  const translations = await translateTexts(tasks.map(({ slot: _slot, ...task }) => task));
  for (const task of tasks) {
    const values = translations.get(task.id);
    if (values) Object.assign(task.slot.next, values);
  }
}
