"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { StaffLanguageFlags } from "@/components/staff/StaffLanguageFlags";
import {
  RECIPES,
  type Recipe,
  type RecipeFactIcon,
  type RecipeKind,
  type RecipeLang,
  type RecipeStorageIcon,
} from "@/data/recipes";
import { getAssetUrl } from "@/lib/appVersion";
import { translate } from "@/lib/i18n";
import { toStaffAppLang } from "@/lib/staffInventoryI18n";
import { useTranslation } from "@/lib/useTranslation";
import "@/components/staff/staff-inventory.css";
import "./recipes.css";

const NUMBER_LOCALE: Record<RecipeLang, string> = { ru: "ru-RU", en: "en-US", vn: "vi-VN" };

const UNIT_LABELS: Record<string, Record<RecipeLang, string>> = {
  g: { ru: "г", en: "g", vn: "g" },
  kg: { ru: "кг", en: "kg", vn: "kg" },
  ml: { ru: "мл", en: "ml", vn: "ml" },
  l: { ru: "л", en: "l", vn: "l" },
  pcs: { ru: "шт", en: "pcs", vn: "cái" },
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

function unitLabel(unit: string, lang: RecipeLang): string {
  return UNIT_LABELS[unit]?.[lang] ?? unit;
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

export function RecipesApp() {
  const { lang } = useTranslation();
  const recipeLang = toStaffAppLang(lang);
  const t = useCallback((key: string) => translate(recipeLang, key), [recipeLang]);
  const [kind, setKind] = useState<RecipeKind>("dish");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [multiplier, setMultiplier] = useState("1");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const id = readRecipeFromUrl();
    const recipe = RECIPES.find((item) => item.id === id);
    if (recipe) {
      setKind(recipe.kind);
      setOpenId(recipe.id);
    }
    setHydrated(true);
  }, []);

  const visible = useMemo(() => {
    const query = search.toLowerCase().trim();
    return RECIPES.filter(
      (recipe) =>
        recipe.kind === kind &&
        (!query ||
          Object.values(recipe.name).some((name) => name.toLowerCase().includes(query))),
    );
  }, [kind, search]);

  const openRecipe = (recipe: Recipe | null) => {
    setOpenId(recipe?.id ?? null);
    setMultiplier("1");
    writeRecipeToUrl(recipe?.id ?? null);
    window.scrollTo({ top: 0 });
  };

  const opened = RECIPES.find((recipe) => recipe.id === openId) ?? null;

  if (!hydrated) {
    return (
      <div className="staff-inventory flex min-h-[100dvh] items-center justify-center text-[#777]">
        {t("staff_loading")}
      </div>
    );
  }

  return (
    <div className="staff-inventory staff-inventory-page recipes-app">
      <div className="app">
        <div className="top">
          <div className="langRow">
            <StaffLanguageFlags />
          </div>
          <div className="venueLogo">
            <img src={getAssetUrl("/food/menu/GASTROFOOD-line.png")} alt="GASTROFOOD" />
          </div>
          <div className="recipesTitle">{t("recipes_title")}</div>
        </div>

        <div className="main">
          {opened ? (
            <RecipeDetail
              recipe={opened}
              lang={recipeLang}
              t={t}
              multiplier={multiplier}
              onMultiplierChange={setMultiplier}
              onBack={() => openRecipe(null)}
            />
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
                    <button
                      key={recipe.id}
                      type="button"
                      className="recipeItem"
                      onClick={() => openRecipe(recipe)}
                    >
                      {recipe.photo ? (
                        <img src={getAssetUrl(recipe.photo)} alt="" className="recipeThumb" />
                      ) : (
                        <span className="recipeThumb placeholder">🍳</span>
                      )}
                      <span className="recipeItemText">
                        <b>{recipe.name[recipeLang]}</b>
                        <span>{recipe.yield.label?.[recipeLang]}</span>
                        {recipe.example ? (
                          <span className="exampleBadge">{t("recipes_example_short")}</span>
                        ) : null}
                      </span>
                      <span className="recipeArrow">›</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

type DetailProps = {
  recipe: Recipe;
  lang: RecipeLang;
  t: (key: string) => string;
  multiplier: string;
  onMultiplierChange: (value: string) => void;
  onBack: () => void;
};

function RecipeDetail({ recipe, lang, t, multiplier, onMultiplierChange, onBack }: DetailProps) {
  const factor = Math.max(0, Number(multiplier.replace(",", ".")) || 0);
  const second = secondaryLang(lang);
  const step = (delta: number) => {
    const next = Math.max(1, Math.round(factor) + delta);
    onMultiplierChange(String(next));
  };
  const amount = (value: number, unit: string) =>
    `${formatAmount(value * factor, lang)} ${unitLabel(unit, lang)}`;

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

      <div className="card recipeScale">
        <label htmlFor="recipe-multiplier">
          {t(recipe.kind === "dish" ? "recipes_scale_dish" : "recipes_scale_prep")}
        </label>
        <div className="scaleControls">
          <button type="button" className="white" onClick={() => step(-1)}>
            −
          </button>
          <input
            id="recipe-multiplier"
            inputMode="decimal"
            value={multiplier}
            onChange={(event) => onMultiplierChange(event.target.value)}
          />
          <button type="button" className="white" onClick={() => step(1)}>
            +
          </button>
        </div>
        {recipe.yield.label ? (
          <div className="scaleYield">
            {t("recipes_yield")}: {recipe.yield.label[lang]}
          </div>
        ) : null}
      </div>

      <div className="tcSection">{t("recipes_ingredients")}</div>
      <div className="tcTableWrap">
        <table className="tcTable">
          <thead>
            <tr>
              <th>#</th>
              <th className="tcName">{t("recipes_col_name")}</th>
              <th>{t("recipes_col_gross")}</th>
              <th>{t("recipes_col_net")}</th>
            </tr>
          </thead>
          <tbody>
            {recipe.ingredients.map((ingredient, index) => (
              <tr key={index}>
                <td className="tcNum">{index + 1}</td>
                <td className="tcName">
                  <b>{ingredient.name[lang]}</b>
                  <i>{ingredient.name[second]}</i>
                  {ingredient.note ? <small>{ingredient.note[lang]}</small> : null}
                </td>
                <td className="tcQty">{amount(ingredient.gross ?? ingredient.amount, ingredient.unit)}</td>
                <td className="tcQty net">{amount(ingredient.amount, ingredient.unit)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3}>{t("recipes_finished_weight")}</td>
              <td className="tcQty">{amount(recipe.yield.amount, recipe.yield.unit)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="tcSection">{t("recipes_steps")}</div>
      {factor !== 1 ? <div className="tcStepsNote">{t("recipes_steps_scale_note")}</div> : null}
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

