"use client";

import { useState } from "react";
import {
  MAX_MAIN_INGREDIENTS,
  mainIngredientIndexes,
  type LocalizedText,
  type Recipe,
  type RecipeFactIcon,
  type RecipeKind,
  type RecipeLang,
  type RecipeStorageIcon,
} from "@/data/recipes";
import { getAssetUrl } from "@/lib/appVersion";
import { useDragReorder } from "@/lib/useDragReorder";

const LANGS: { id: RecipeLang; flag: string }[] = [
  { id: "ru", flag: "Русский" },
  { id: "en", flag: "English" },
  { id: "vn", flag: "Tiếng Việt" },
];
const UNITS = ["g", "kg", "ml", "l", "pcs", "egg"];
const FACT_ICONS: RecipeFactIcon[] = ["weight", "length", "storage", "time", "temperature"];
const FACT_ICON_LABELS: Record<RecipeFactIcon, string> = {
  weight: "⚖️",
  length: "📏",
  storage: "🌡️",
  time: "⏱️",
  temperature: "🔥",
};
const STORAGE_ICONS: RecipeStorageIcon[] = ["freezer", "fridge", "thaw", "no-refreeze"];
const STORAGE_ICON_LABELS: Record<RecipeStorageIcon, string> = {
  freezer: "❄️",
  fridge: "🧊",
  thaw: "🌡️",
  "no-refreeze": "🚫",
};

const emptyText = (): LocalizedText => ({ ru: "", en: "", vn: "" });

type FormDraft = {
  id: string;
  kind: RecipeKind;
  hidden?: boolean;
  name: LocalizedText;
  meta: { cardNo: string; date: string; revision: string };
  photo?: string;
  yieldAmount: string;
  yieldUnit: string;
  yieldLabel: LocalizedText;
  facts: { icon: RecipeFactIcon; label: LocalizedText; value: LocalizedText }[];
  ingredients: { name: LocalizedText; unit: string; amount: string; main?: boolean }[];
  steps: { title: LocalizedText; photo?: string; items: LocalizedText }[];
  storage: { icon: RecipeStorageIcon; title: LocalizedText; text: LocalizedText }[];
};

function joinItems(items: LocalizedText[]): LocalizedText {
  return {
    ru: items.map((item) => item.ru).join("\n"),
    en: items.map((item) => item.en).join("\n"),
    vn: items.map((item) => item.vn).join("\n"),
  };
}

function splitItems(items: LocalizedText): LocalizedText[] {
  const lines = (value: string) => value.split("\n").map((line) => line.trim());
  const ru = lines(items.ru);
  const en = lines(items.en);
  const vn = lines(items.vn);
  return Array.from({ length: Math.max(ru.length, en.length, vn.length) }, (_, index) => ({
    ru: ru[index] ?? "",
    en: en[index] ?? "",
    vn: vn[index] ?? "",
  })).filter((item) => item.ru || item.en || item.vn);
}

export function toFormDraft(recipe: Recipe): FormDraft {
  return {
    id: recipe.id,
    kind: recipe.kind,
    hidden: recipe.hidden,
    name: { ...recipe.name },
    meta: { cardNo: recipe.meta?.cardNo ?? "", date: recipe.meta?.date ?? "", revision: recipe.meta?.revision ?? "" },
    photo: recipe.photo,
    yieldAmount: String(recipe.yield.amount),
    yieldUnit: recipe.yield.unit,
    yieldLabel: recipe.yield.label ? { ...recipe.yield.label } : emptyText(),
    facts: (recipe.facts ?? []).map((fact) => ({ icon: fact.icon, label: { ...fact.label }, value: { ...fact.value } })),
    ingredients: recipe.ingredients.map((ingredient) => ({
      name: { ...ingredient.name },
      unit: ingredient.unit,
      amount: String(ingredient.amount),
      main: ingredient.main,
    })),
    steps: recipe.steps.map((step) => ({
      title: step.title ? { ...step.title } : emptyText(),
      photo: step.photo,
      items: joinItems(step.items),
    })),
    storage: (recipe.storage ?? []).map((rule) => ({
      icon: rule.icon,
      title: { ...rule.title },
      text: rule.text ? { ...rule.text } : emptyText(),
    })),
  };
}

function draftMainIndexes(draft: FormDraft): number[] {
  return mainIngredientIndexes({
    ingredients: draft.ingredients.map((row) => ({ ...row, amount: Number(row.amount.replace(",", ".")) || 0 })),
  } as Recipe);
}

/** Payload for POST /api/recipes-admin/recipes; the server validates and fills missing translations. */
function fromFormDraft(draft: FormDraft) {
  const mainIndexes = draftMainIndexes(draft);
  return {
    id: draft.id,
    kind: draft.kind,
    hidden: draft.hidden,
    name: draft.name,
    meta: draft.meta,
    photo: draft.photo,
    yield: { amount: draft.yieldAmount, unit: draft.yieldUnit, label: draft.yieldLabel },
    facts: draft.facts,
    ingredients: draft.ingredients.map((row, index) => ({
      name: row.name,
      unit: row.unit,
      amount: row.amount,
      main: mainIndexes.includes(index),
    })),
    steps: draft.steps.map((step) => ({ title: step.title, photo: step.photo, items: splitItems(step.items) })),
    storage: draft.storage,
  };
}

type RecipeFormProps = {
  initial: Recipe;
  t: (key: string) => string;
  onSaved: (data: unknown) => void;
  onCancel: () => void;
  onExpired: () => void;
};

export function RecipeForm({ initial, t, onSaved, onCancel, onExpired }: RecipeFormProps) {
  const [draft, setDraft] = useState<FormDraft>(() => toFormDraft(initial));
  const [lang, setLang] = useState<RecipeLang>("ru");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mainIndexes = draftMainIndexes(draft);
  const toggleMain = (selected: number) => {
    const next = mainIndexes.includes(selected)
      ? mainIndexes.filter((index) => index !== selected)
      : [...mainIndexes, selected];
    if (!next.length || next.length > MAX_MAIN_INGREDIENTS) return;
    patch({ ingredients: draft.ingredients.map((row, index) => ({ ...row, main: next.includes(index) })) });
  };

  const patch = (update: Partial<FormDraft>) => setDraft((prev) => ({ ...prev, ...update }));
  const setText = (value: LocalizedText, text: string): LocalizedText => ({ ...value, [lang]: text });

  function updateList<K extends "facts" | "ingredients" | "steps" | "storage">(
    key: K,
    index: number,
    update: Partial<FormDraft[K][number]>,
  ) {
    setDraft((prev) => ({
      ...prev,
      [key]: prev[key].map((item, itemIndex) => (itemIndex === index ? { ...item, ...update } : item)),
    }));
  }

  function removeFromList(key: "facts" | "ingredients" | "steps" | "storage", index: number) {
    setDraft((prev) => ({ ...prev, [key]: prev[key].filter((_, itemIndex) => itemIndex !== index) }));
  }

  const ingredientDrag = useDragReorder((from, to) =>
    setDraft((prev) => {
      const ingredients = [...prev.ingredients];
      const [moved] = ingredients.splice(from, 1);
      ingredients.splice(to, 0, moved);
      return { ...prev, ingredients };
    }),
    { bottomEdge: 160 },
  );

  const save = async () => {
    setError(null);
    if (!(draft.name.ru || draft.name.en || draft.name.vn) || !draft.yieldAmount.trim() || !draft.ingredients.length) {
      setError(t("recipes_admin_err_invalid_recipe"));
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/recipes-admin/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipe: fromFormDraft(draft) }),
      });
      if (response.status === 401) {
        onExpired();
        return;
      }
      const data = await response.json().catch(() => null);
      if (response.ok && data) onSaved(data);
      else setError(t(response.status === 400 ? "recipes_admin_err_invalid_recipe" : "recipes_admin_err_server"));
    } catch {
      setError(t("recipes_admin_err_server"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="recipeForm">
      <div className="exampleNotice">{t("recipes_admin_review_hint")}</div>

      <div className="formLangs" role="tablist" aria-label={t("recipes_admin_edit_lang")}>
        {LANGS.map((option) => (
          <button
            key={option.id}
            type="button"
            className={`adminRecipeBtn ${lang === option.id ? "active" : ""}`}
            onClick={() => setLang(option.id)}
          >
            {option.flag}
          </button>
        ))}
      </div>

      <section className="card formSection">
        <div className="formGrid two">
          <label>
            <span>{t("recipes_admin_f_kind")}</span>
            <select value={draft.kind} onChange={(event) => patch({ kind: event.target.value as RecipeKind })}>
              <option value="dish">{t("recipes_tab_dish")}</option>
              <option value="prep">{t("recipes_tab_prep")}</option>
            </select>
          </label>
          <label>
            <span>{t("recipes_admin_f_name")}</span>
            <input value={draft.name[lang]} onChange={(event) => patch({ name: setText(draft.name, event.target.value) })} />
          </label>
        </div>
        <div className="formGrid three">
          <label>
            <span>{t("recipes_card_no")}</span>
            <input value={draft.meta.cardNo} onChange={(event) => patch({ meta: { ...draft.meta, cardNo: event.target.value } })} />
          </label>
          <label>
            <span>{t("recipes_date")}</span>
            <input value={draft.meta.date} onChange={(event) => patch({ meta: { ...draft.meta, date: event.target.value } })} />
          </label>
          <label>
            <span>{t("recipes_revision")}</span>
            <input
              value={draft.meta.revision}
              onChange={(event) => patch({ meta: { ...draft.meta, revision: event.target.value } })}
            />
          </label>
        </div>
        {draft.photo ? (
          <div className="formPhoto">
            <img src={getAssetUrl(draft.photo)} alt="" />
            <button type="button" className="white" onClick={() => patch({ photo: undefined })}>
              {t("recipes_admin_f_remove_photo")}
            </button>
          </div>
        ) : null}
        <div className="formGrid yield">
          <label>
            <span>{t("recipes_admin_f_yield")}</span>
            <input
              inputMode="decimal"
              value={draft.yieldAmount}
              onChange={(event) => patch({ yieldAmount: event.target.value })}
            />
          </label>
          <label>
            <span>{t("recipes_admin_f_unit")}</span>
            <select value={draft.yieldUnit} onChange={(event) => patch({ yieldUnit: event.target.value })}>
              {UNITS.filter((unit) => unit !== "egg").map((unit) => (
                <option key={unit}>{unit}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <div className="tcSection">{t("recipes_admin_f_facts")}</div>
      <section className="card formSection">
        {draft.facts.map((fact, index) => (
          <div key={index} className="formRow fact">
            <select value={fact.icon} onChange={(event) => updateList("facts", index, { icon: event.target.value as RecipeFactIcon })}>
              {FACT_ICONS.map((icon) => (
                <option key={icon} value={icon}>
                  {FACT_ICON_LABELS[icon]}
                </option>
              ))}
            </select>
            <input
              placeholder={t("recipes_admin_f_fact_label")}
              value={fact.label[lang]}
              onChange={(event) => updateList("facts", index, { label: setText(fact.label, event.target.value) })}
            />
            <input
              placeholder={t("recipes_admin_f_fact_value")}
              value={fact.value[lang]}
              onChange={(event) => updateList("facts", index, { value: setText(fact.value, event.target.value) })}
            />
            <button type="button" className="formRemove" onClick={() => removeFromList("facts", index)} aria-label={t("recipes_admin_f_remove")}>
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          className="formAdd"
          onClick={() => patch({ facts: [...draft.facts, { icon: "weight", label: emptyText(), value: emptyText() }] })}
        >
          {t("recipes_admin_f_add")}
        </button>
      </section>

      <div className="tcSection">{t("recipes_ingredients")}</div>
      <section className="card formSection">
        {draft.ingredients.length ? (
          <div className="formMain">
            <span>{t("recipes_admin_f_main")}</span>
            <div className="formMainChips">
              {draft.ingredients.map((row, index) => {
                const active = mainIndexes.includes(index);
                return (
                  <button
                    key={index}
                    type="button"
                    aria-pressed={active}
                    className={`formMainChip ${active ? "active" : ""}`}
                    disabled={!active && mainIndexes.length >= MAX_MAIN_INGREDIENTS}
                    onClick={() => toggleMain(index)}
                  >
                    {active ? "★ " : ""}
                    {row.name[lang] || row.name.ru || row.name.en || `#${index + 1}`}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
        <div className="formRow ingredient head">
          <span />
          <span>{t("recipes_col_name")}</span>
          <span>{t("recipes_admin_f_unit")}</span>
          <span>{t("recipes_col_net")}</span>
          <span />
        </div>
        {draft.ingredients.map((row, index) => (
          <div
            key={index}
            ref={(element) => {
              ingredientDrag.rowRefs.current[index] = element;
            }}
            className={`formRow ingredient ${ingredientDrag.dragIndex === index ? "dragging" : ""}`}
          >
            <button
              type="button"
              className="formDrag"
              aria-label={t("recipes_admin_f_drag")}
              {...ingredientDrag.handleProps(index)}
            >
              ⠿
            </button>
            <input
              value={row.name[lang]}
              onChange={(event) => updateList("ingredients", index, { name: setText(row.name, event.target.value) })}
            />
            <select value={row.unit} onChange={(event) => updateList("ingredients", index, { unit: event.target.value })}>
              {UNITS.map((unit) => (
                <option key={unit}>{unit}</option>
              ))}
            </select>
            <input
              inputMode="decimal"
              value={row.amount}
              onChange={(event) => updateList("ingredients", index, { amount: event.target.value })}
            />
            <button
              type="button"
              className="formRemove"
              onClick={() => removeFromList("ingredients", index)}
              aria-label={t("recipes_admin_f_remove")}
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          className="formAdd"
          onClick={() =>
            patch({ ingredients: [...draft.ingredients, { name: emptyText(), unit: "g", amount: "" }] })
          }
        >
          {t("recipes_admin_f_add")}
        </button>
      </section>

      <div className="tcSection">{t("recipes_steps")}</div>
      {draft.steps.map((step, index) => (
        <section key={index} className="card formSection formStep">
          <div className="formStepHead">
            <span className="tcStepNum">{index + 1}</span>
            <input
              placeholder={t("recipes_admin_f_step_title")}
              value={step.title[lang]}
              onChange={(event) => updateList("steps", index, { title: setText(step.title, event.target.value) })}
            />
            <button type="button" className="formRemove" onClick={() => removeFromList("steps", index)} aria-label={t("recipes_admin_f_remove")}>
              ✕
            </button>
          </div>
          {step.photo ? (
            <div className="formPhoto small">
              <img src={getAssetUrl(step.photo)} alt="" />
              <button type="button" className="white" onClick={() => updateList("steps", index, { photo: undefined })}>
                {t("recipes_admin_f_remove_photo")}
              </button>
            </div>
          ) : null}
          <label>
            <span>{t("recipes_admin_f_step_items")}</span>
            <textarea
              rows={Math.max(3, step.items[lang].split("\n").length + 1)}
              value={step.items[lang]}
              onChange={(event) => updateList("steps", index, { items: setText(step.items, event.target.value) })}
            />
          </label>
        </section>
      ))}
      <button
        type="button"
        className="formAdd standalone"
        onClick={() => patch({ steps: [...draft.steps, { title: emptyText(), items: emptyText() }] })}
      >
        {t("recipes_admin_f_add")}
      </button>

      <div className="tcSection">{t("recipes_storage")}</div>
      <section className="card formSection">
        {draft.storage.map((rule, index) => (
          <div key={index} className="formRow fact">
            <select
              value={rule.icon}
              onChange={(event) => updateList("storage", index, { icon: event.target.value as RecipeStorageIcon })}
            >
              {STORAGE_ICONS.map((icon) => (
                <option key={icon} value={icon}>
                  {STORAGE_ICON_LABELS[icon]}
                </option>
              ))}
            </select>
            <input
              placeholder={t("recipes_admin_f_storage_title")}
              value={rule.title[lang]}
              onChange={(event) => updateList("storage", index, { title: setText(rule.title, event.target.value) })}
            />
            <input
              placeholder={t("recipes_admin_f_storage_text")}
              value={rule.text[lang]}
              onChange={(event) => updateList("storage", index, { text: setText(rule.text, event.target.value) })}
            />
            <button type="button" className="formRemove" onClick={() => removeFromList("storage", index)} aria-label={t("recipes_admin_f_remove")}>
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          className="formAdd"
          onClick={() => patch({ storage: [...draft.storage, { icon: "freezer", title: emptyText(), text: emptyText() }] })}
        >
          {t("recipes_admin_f_add")}
        </button>
      </section>

      {error ? <div className="adminError">{error}</div> : null}
      <div className="adminActions formActions">
        <button type="button" className="dark" disabled={busy} onClick={save}>
          {t("recipes_admin_publish")}
        </button>
        <button type="button" className="white" disabled={busy} onClick={onCancel}>
          {t("recipes_admin_cancel")}
        </button>
      </div>
    </div>
  );
}
