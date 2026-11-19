import type { ErpProduct, ErpRecipe, ErpState } from "./types";
import { erpLocalMode } from "./localDb";
import { readStoredRecipes, writeStoredRecipes } from "@/lib/recipes-admin/storage";
import { prepPublishFromSaved, staffRecipeFromPrep, upsertStaffRecipe } from "./prepStaffRecipe";

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
  const mapped = staffRecipeFromPrep(prepPublishFromSaved(product, recipe, products));
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
  const recipe = latestPrepRecipe(state.recipes, productId);
  if (!recipe) return null;
  return publishSavedPrepToStaff(recipe, state.products);
}
