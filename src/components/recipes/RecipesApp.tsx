"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { StaffLanguageFlags } from "@/components/staff/StaffLanguageFlags";
import { RECIPES, type Recipe, type RecipeKind } from "@/data/recipes";
import { getAssetUrl } from "@/lib/appVersion";
import { translate } from "@/lib/i18n";
import { toStaffAppLang } from "@/lib/staffInventoryI18n";
import { useTranslation } from "@/lib/useTranslation";
import "@/components/staff/staff-inventory.css";
import "./recipes.css";

function formatAmount(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
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
  lang: "ru" | "en" | "vn";
  t: (key: string) => string;
  multiplier: string;
  onMultiplierChange: (value: string) => void;
  onBack: () => void;
};

function RecipeDetail({ recipe, lang, t, multiplier, onMultiplierChange, onBack }: DetailProps) {
  const factor = Math.max(0, Number(multiplier.replace(",", ".")) || 0);
  const step = (delta: number) => {
    const next = Math.max(1, Math.round(factor) + delta);
    onMultiplierChange(String(next));
  };

  return (
    <div className="recipeDetail">
      <button type="button" className="dark recipeBack" onClick={onBack}>
        {t("recipes_back")}
      </button>

      {recipe.example ? <div className="exampleNotice">{t("recipes_example_notice")}</div> : null}

      {recipe.photo ? (
        <img src={getAssetUrl(recipe.photo)} alt={recipe.name[lang]} className="recipePhoto" />
      ) : null}

      <h1 className="recipeName">{recipe.name[lang]}</h1>
      {recipe.yield.label ? (
        <div className="recipeYield">
          {t("recipes_yield")}: {recipe.yield.label[lang]}
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
        {factor !== 1 ? (
          <div className="scaleTotal">
            {t("recipes_total")}: {formatAmount(recipe.yield.amount * factor)} {recipe.yield.unit}
          </div>
        ) : null}
      </div>

      <div className="category">{t("recipes_ingredients")}</div>
      <div className="card ingredientTable">
        {recipe.ingredients.map((ingredient, index) => (
          <div key={index} className="ingredientRow">
            <span>
              {ingredient.name[lang]}
              {ingredient.note ? <small> — {ingredient.note[lang]}</small> : null}
            </span>
            <b>
              {formatAmount(ingredient.amount * factor)} {ingredient.unit}
            </b>
          </div>
        ))}
      </div>

      <div className="category">{t("recipes_steps")}</div>
      <ol className="card recipeSteps">
        {recipe.steps.map((stepText, index) => (
          <li key={index}>{stepText[lang]}</li>
        ))}
      </ol>

      {recipe.storage ? (
        <>
          <div className="category">{t("recipes_storage")}</div>
          <div className="card recipeStorage">{recipe.storage[lang]}</div>
        </>
      ) : null}
    </div>
  );
}
