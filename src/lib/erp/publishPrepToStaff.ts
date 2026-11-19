import type { StoredRecipes } from "@/data/recipes";
import type { ErpProduct, ErpRecipe, ErpState } from "./types";
import { erpLocalMode } from "./localDb";
import { readStoredRecipes, writeStoredRecipes } from "@/lib/recipes-admin/storage";
import {
  mergeErpPrepsIntoStored,
  prepPublishFromSaved,
  publishedPrepRecipe,
  staffCardsFromErpPreps,
  staffRecipeForErpProduct,
  staffRecipeFromPrep,
  upsertStaffRecipe,
} from "./prepStaffRecipe";

export function recipeById(recipes: ErpRecipe[] | undefined, id: string): ErpRecipe | null {
  return recipes?.find((recipe) => recipe.id === id) ?? null;
}

/** Draft in progress, else the active card, else the newest version. */
export function latestPrepRecipe(recipes: ErpRecipe[] | undefined, productId: string): ErpRecipe | null {
  const list = (recipes ?? []).filter((recipe) => recipe.product_id === productId);
  if (!list.length) return null;
  return list.find((recipe) => recipe.status === "draft") ?? list.find((recipe) => recipe.status === "active") ?? [...list].sort((a, b) => b.version - a.version)[0];
}

export async function publishSavedPrepToStaff(recipe: ErpRecipe, products: ErpProduct[]): Promise<string | null> {
  const product = products.find((row) => row.id === recipe.product_id);
  if (!product) return null;
  return writeStaffRecipe(staffRecipeFromPrep(prepPublishFromSaved(product, recipe, products)));
}

export async function publishPrepStateToStaff(
  recipeId: string,
  state: Pick<ErpState, "recipes" | "products">,
): Promise<string | null> {
  const recipe = recipeById(state.recipes, recipeId);
  if (!recipe) return null;
  return publishSavedPrepToStaff(recipe, state.products);
}

export async function publishProductPrepToStaff(
  productId: string,
  state: Pick<ErpState, "recipes" | "products">,
): Promise<string | null> {
  const product = state.products.find((row) => row.id === productId);
  if (!product) return null;
  const recipe = publishedPrepRecipe(state.recipes, productId) ?? latestPrepRecipe(state.recipes, productId);
  if (recipe) return publishSavedPrepToStaff(recipe, state.products);
  return writeStaffRecipe(staffRecipeForErpProduct(product, state.recipes, state.products));
}

async function writeStaffRecipe(mapped: ReturnType<typeof staffRecipeFromPrep>): Promise<string | null> {
  if (erpLocalMode()) return mapped.id;
  try {
    const stored = await readStoredRecipes();
    const next = upsertStaffRecipe(stored, mapped);
    await writeStoredRecipes(next.stored);
    return next.id;
  } catch (error) {
    console.error("[erp] staff recipes upsert", error);
    return null;
  }
}

function erpLinkedSlice(stored: StoredRecipes) {
  return stored.recipes
    .filter((recipe) => recipe.erpProductId)
    .map((recipe) => ({
      id: recipe.id,
      name: recipe.name,
      photo: recipe.photo,
      hidden: recipe.hidden,
      ingredients: recipe.ingredients,
      steps: recipe.steps,
    }));
}

/** Merge every live ERP prep into the Recipes JSON so kitchen sees cards without GET IN APP. */
export async function applyErpPrepsToStoredRecipes(
  stored: StoredRecipes,
  products: ErpProduct[],
  recipes: ErpRecipe[],
): Promise<StoredRecipes> {
  const next = mergeErpPrepsIntoStored(stored, staffCardsFromErpPreps(products, recipes));
  if (erpLocalMode()) return next;
  try {
    if (JSON.stringify(erpLinkedSlice(stored)) !== JSON.stringify(erpLinkedSlice(next))) {
      await writeStoredRecipes(next);
    }
  } catch (error) {
    console.error("[erp] staff recipes sync", error);
  }
  return next;
}
