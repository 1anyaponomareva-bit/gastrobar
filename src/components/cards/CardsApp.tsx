"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  applyRecipeOverrides,
  baseUnitAmount,
  mainIngredientIndexes,
  mergeRecipes,
  type Recipe,
  type RecipeFactIcon,
  type RecipeKind,
  type RecipeLang,
  type RecipeOverrides,
  type RecipeStorageIcon,
  type StoredRecipes,
} from "@/data/recipes";
import { getAssetUrl } from "@/lib/appVersion";
import { translate } from "@/lib/i18n";
import { toStaffAppLang } from "@/lib/staffInventoryI18n";
import { useTranslation } from "@/lib/useTranslation";
import { CardsChrome, CardsLoading } from "./CardsChrome";

const NUMBER_LOCALE: Record<RecipeLang, string> = { ru: "ru-RU", en: "en-US", vn: "vi-VN" };

const UNIT_LABELS: Record<string, Record<RecipeLang, string>> = {
  g: { ru: "г", en: "g", vn: "g" },
  kg: { ru: "кг", en: "kg", vn: "kg" },
  ml: { ru: "мл", en: "ml", vn: "ml" },
  l: { ru: "л", en: "l", vn: "l" },
  pcs: { ru: "шт", en: "pcs", vn: "cái" },
  egg: { ru: "шт", en: "pcs", vn: "quả" },
};

const FACT_ICONS: Record<RecipeFactIcon, string> = {
  weight: "⚖️",
  length: "📏",
  storage: "🌡️",
  time: "⏱️",
  temperature: "🔥",
};

const STORAGE_ICONS: Record<RecipeStorageIcon, string> = {
  freezer: "❄️",
  fridge: "🧊",
  thaw: "🌡️",
  "no-refreeze": "🚫",
};

function formatAmount(value: number, lang: RecipeLang): string {
  return new Intl.NumberFormat(NUMBER_LOCALE[lang], { maximumFractionDigits: 1 }).format(
    Math.round(value * 10) / 10,
  );
}

export function unitLabel(unit: string, lang: RecipeLang): string {
  return UNIT_LABELS[unit]?.[lang] ?? unit;
}

/** kg + g for weights, l + ml for volumes, a single field for pieces. */
function scaleUnits(unit: string): { big: string; small: string } | null {
  if (unit === "g" || unit === "kg") return { big: "kg", small: "g" };
  if (unit === "ml" || unit === "l") return { big: "l", small: "ml" };
  return null;
}

/** Main products the card is scaled by; only those measured like the first one are summed. */
function mainProducts(recipe: Recipe) {
  const all = mainIngredientIndexes(recipe).map((index) => recipe.ingredients[index]);
  const first = all[0];
  if (!first) return null;
  const family = (unit: string) => scaleUnits(unit)?.big ?? unit;
  const mains = all.filter((ingredient) => family(ingredient.unit) === family(first.unit));
  const units = scaleUnits(first.unit);
  const base = mains.reduce((sum, ingredient) => sum + baseUnitAmount(ingredient.amount, ingredient.unit), 0);
  return { mains, units, base, baseUnit: units ? units.small : first.unit };
}

/** "1 000 g — Fillet 70% + Fillet 30%": the main products amount the card is calculated for. */
function mainIngredientLine(recipe: Recipe, lang: RecipeLang): string {
  const main = mainProducts(recipe);
  if (!main) return "";
  const names = main.mains.map((ingredient) => ingredient.name[lang]).join(" + ");
  return `${formatAmount(main.base, lang)} ${unitLabel(main.baseUnit, lang)} — ${names}`;
}

/** Second language printed under names, so mixed RU/VN staff can read the same card. */
function secondaryLang(lang: RecipeLang): RecipeLang {
  return lang === "vn" ? "en" : "vn";
}

function readRecipeFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("r");
}

function writeRecipeToUrl(id: string | null) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("r", id);
  else url.searchParams.delete("r");
  window.history.replaceState(null, "", url);
}

export function CardsApp() {
  const { lang } = useTranslation();
  const recipeLang = toStaffAppLang(lang);
  const t = useCallback((key: string) => translate(recipeLang, key), [recipeLang]);
  const [kind, setKind] = useState<RecipeKind>("dish");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [overrides, setOverrides] = useState<RecipeOverrides | null>(null);
  const [stored, setStored] = useState<StoredRecipes | null>(null);

  useEffect(() => {
    setOpenId(readRecipeFromUrl());
    const fallback = window.setTimeout(() => setHydrated(true), 4000);

    fetch("/api/recipes/overrides", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { overrides?: RecipeOverrides; stored?: StoredRecipes | null } | null) => {
        if (data?.overrides) setOverrides(data.overrides);
        if (data?.stored) setStored(data.stored);
      })
      .catch(() => {})
      .finally(() => {
        window.clearTimeout(fallback);
        setHydrated(true);
      });
  }, []);

  const recipes = useMemo(
    () =>
      mergeRecipes(stored)
        .filter((recipe) => !recipe.hidden)
        .map((recipe) => applyRecipeOverrides(recipe, overrides)),
    [stored, overrides],
  );

  const openedKind = recipes.find((recipe) => recipe.id === openId)?.kind;
  useEffect(() => {
    if (openedKind) setKind(openedKind);
  }, [openedKind]);

  const visible = useMemo(() => {
    const query = search.toLowerCase().trim();
    return recipes.filter(
      (recipe) =>
        recipe.kind === kind &&
        (!query ||
          Object.values(recipe.name).some((name) => name.toLowerCase().includes(query))),
    );
  }, [recipes, kind, search]);

  const openRecipe = (recipe: Recipe | null) => {
    setOpenId(recipe?.id ?? null);
    writeRecipeToUrl(recipe?.id ?? null);
    window.scrollTo({ top: 0 });
  };

  const opened = recipes.find((recipe) => recipe.id === openId) ?? null;

  if (!hydrated) {
    return <CardsLoading text={t("staff_loading")} />;
  }

  return (
    <CardsChrome badge="RECIPES" adminHref="/recipes/admin" adminLabel={t("recipes_admin_entry")}>
      {opened ? (
        <RecipeDetail key={opened.id} recipe={opened} lang={recipeLang} t={t} onBack={() => openRecipe(null)} />
      ) : (
        <>
          <div className="sectionPicker" role="tablist">
            {(["dish", "prep"] as const).map((option) => (
              <button
                key={option}
                type="button"
                role="tab"
                aria-selected={kind === option}
                className={`sectionBtn ${kind === option ? "active" : ""}`}
                onClick={() => setKind(option)}
              >
                {t(option === "dish" ? "recipes_tab_dish" : "recipes_tab_prep")}
              </button>
            ))}
          </div>

          <input
            className="search"
            placeholder={t("recipes_search")}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />

          {!visible.length ? (
            <div className="empty">{t("recipes_empty")}</div>
          ) : (
            <div className="recipeList">
              {visible.map((recipe) => (
                <button key={recipe.id} type="button" className="recipeItem" onClick={() => openRecipe(recipe)}>
                  {recipe.photo ? (
                    <img src={getAssetUrl(recipe.photo)} alt="" className="recipeThumb" />
                  ) : (
                    <span className="recipeThumb placeholder">🍳</span>
                  )}
                  <span className="recipeItemText">
                    <b>{recipe.name[recipeLang]}</b>
                    <span>{mainIngredientLine(recipe, recipeLang)}</span>
                    {recipe.example ? <span className="exampleBadge">{t("recipes_example_short")}</span> : null}
                  </span>
                  <span className="recipeArrow">›</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </CardsChrome>
  );
}

type DetailProps = {
  recipe: Recipe;
  lang: RecipeLang;
  t: (key: string) => string;
  onBack: () => void;
};

function parseInput(value: string): number {
  return Math.max(0, Number(value.replace(",", ".")) || 0);
}

function initialScaleInput(base: number, split: boolean) {
  if (!split) return { big: String(base), small: "" };
  return { big: String(Math.floor(base / 1000)), small: String(Math.round((base % 1000) * 10) / 10) };
}

function RecipeDetail({ recipe, lang, t, onBack }: DetailProps) {
  const second = secondaryLang(lang);
  const main = mainProducts(recipe);
  const units = main?.units ?? null;
  const base = main?.base ?? 1;
  const [input, setInput] = useState(() => initialScaleInput(base, !!units));
  const entered = units ? parseInput(input.big) * 1000 + parseInput(input.small) : parseInput(input.big);
  const factor = base > 0 ? entered / base : 1;
  const isBase = Math.abs(factor - 1) < 1e-9;
  const amount = (value: number, unit: string) => {
    const scaled = value * factor;
    const shown = !isBase && (unit === "egg" || unit === "pcs") ? Math.max(scaled > 0 ? 1 : 0, Math.round(scaled)) : scaled;
    return `${formatAmount(shown, lang)} ${unitLabel(unit, lang)}`;
  };
  const baseLabel = main ? `${formatAmount(main.base, lang)} ${unitLabel(main.baseUnit, lang)}` : "";
  const mainNames = (target: RecipeLang) => main?.mains.map((ingredient) => ingredient.name[target]).join(" + ") ?? "";

  return (
    <div className="recipeDetail">
      <button type="button" className="dark recipeBack" onClick={onBack}>
        {t("recipes_back")}
      </button>

      {recipe.example ? <div className="exampleNotice">{t("recipes_example_notice")}</div> : null}

      <div className="tcHeader">
        <div className="tcTitleRow">
          <div className="tcTitle">
            <h1>{recipe.name[lang]}</h1>
            <span>{recipe.name[second]}</span>
          </div>
          <div className="tcKind">
            {t(recipe.kind === "dish" ? "recipes_category_dish" : "recipes_category_prep")}
          </div>
        </div>
        {recipe.meta ? (
          <div className="tcMeta">
            <div>
              <small>{t("recipes_card_no")}</small>
              <b>{recipe.meta.cardNo}</b>
            </div>
            <div>
              <small>{t("recipes_date")}</small>
              <b>{recipe.meta.date}</b>
            </div>
            <div>
              <small>{t("recipes_revision")}</small>
              <b>{recipe.meta.revision}</b>
            </div>
          </div>
        ) : null}
      </div>

      {recipe.photo ? (
        <img src={getAssetUrl(recipe.photo)} alt={recipe.name[lang]} className="recipePhoto" />
      ) : null}

      {recipe.facts?.length ? (
        <div className="tcFacts">
          {recipe.facts.map((fact, index) => (
            <div key={index} className="tcFact">
              <span className="tcFactIcon">{FACT_ICONS[fact.icon]}</span>
              <span>
                <small>{fact.label[lang]}</small>
                <b>{fact.value[lang]}</b>
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {main ? (
        <div className="card recipeScale">
          <label htmlFor="recipe-scale-big">
            <small>
              {t(
                !units
                  ? "recipes_scale_main_count"
                  : main.mains.length > 1
                    ? "recipes_scale_main_total"
                    : "recipes_scale_main_weight",
              )}
            </small>
            <b>{mainNames(lang)}</b>
            <i>{mainNames(second)}</i>
          </label>
          <div className="scaleInputs">
            <span>
              <input
                id="recipe-scale-big"
                inputMode="decimal"
                value={input.big}
                onFocus={(event) => event.target.select()}
                onChange={(event) => setInput((prev) => ({ ...prev, big: event.target.value }))}
              />
              <small>{unitLabel(units?.big ?? main.baseUnit, lang)}</small>
            </span>
            {units ? (
              <span>
                <input
                  inputMode="decimal"
                  value={input.small}
                  onFocus={(event) => event.target.select()}
                  onChange={(event) => setInput((prev) => ({ ...prev, small: event.target.value }))}
                />
                <small>{unitLabel(units.small, lang)}</small>
              </span>
            ) : null}
          </div>
          {!isBase ? (
            <div className="scaleYield">
              <button type="button" className="scaleReset" onClick={() => setInput(initialScaleInput(base, !!units))}>
                {t("recipes_scale_reset")}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="tcSection">{t("recipes_ingredients")}</div>
      <div className="tcTableWrap">
        <table className="tcTable">
          <thead>
            <tr>
              <th>#</th>
              <th className="tcName">{t("recipes_col_name")}</th>
              <th>{t("recipes_col_net")}</th>
            </tr>
          </thead>
          <tbody>
            {recipe.ingredients.map((ingredient, index) => (
              <tr key={index} className={main?.mains.includes(ingredient) ? "tcMain" : undefined}>
                <td className="tcNum">{index + 1}</td>
                <td className="tcName">
                  <b>{ingredient.name[lang]}</b>
                  <i>{ingredient.name[second]}</i>
                  {ingredient.note ? <small>{ingredient.note[lang]}</small> : null}
                </td>
                <td className="tcQty net">{amount(ingredient.amount, ingredient.unit)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2}>{t("recipes_finished_weight")}</td>
              <td className="tcQty">{amount(recipe.yield.amount, recipe.yield.unit)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="tcSection">{t("recipes_steps")}</div>
      {!isBase && main ? (
        <div className="tcStepsNote">
          {t("recipes_steps_scale_note").replace("{base}", `${baseLabel} — ${mainNames(lang)}`)}
        </div>
      ) : null}
      <div className="tcSteps">
        {recipe.steps.map((stepItem, index) => (
          <section key={index} className="tcStep">
            <header>
              <span className="tcStepNum">{index + 1}</span>
              {stepItem.title ? (
                <span className="tcStepTitle">
                  <b>{stepItem.title[lang]}</b>
                  <i>{stepItem.title[second]}</i>
                </span>
              ) : null}
            </header>
            {stepItem.photo ? <img src={getAssetUrl(stepItem.photo)} alt="" className="tcStepPhoto" /> : null}
            <ul>
              {stepItem.items.map((item, itemIndex) => (
                <li key={itemIndex}>{item[lang]}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {recipe.storage?.length ? (
        <>
          <div className="tcSection">{t("recipes_storage")}</div>
          <div className="tcStorage">
            {recipe.storage.map((rule, index) => (
              <div key={index} className={`tcStorageRule ${rule.icon}`}>
                <span className="tcStorageIcon">{STORAGE_ICONS[rule.icon]}</span>
                <span>
                  <b>{rule.title[lang]}</b>
                  {rule.text ? <small>{rule.text[lang]}</small> : null}
                </span>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

