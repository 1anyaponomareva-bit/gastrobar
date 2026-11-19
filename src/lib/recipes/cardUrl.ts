import type { Recipe } from "@/data/recipes";

/** Path of a staff tech card, e.g. `/recipes/erp-…`. */
export function staffRecipePath(card: string): string {
  const id = card.trim();
  return id ? `/recipes/${encodeURIComponent(id)}` : "/recipes";
}

export function recipeCardFromPathname(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "recipes" || parts.length !== 2) return null;
  let card = parts[1] ?? "";
  try {
    card = decodeURIComponent(card);
  } catch {
    return null;
  }
  if (!card || card === "admin") return null;
  return card;
}

/** Card id from `/recipes/{card}` or legacy `?r=`. */
export function recipeCardFromLocation(href?: string): string | null {
  const raw = href ?? (typeof window !== "undefined" ? window.location.href : "");
  if (!raw) return null;
  try {
    const url = new URL(raw, "https://gastrofood.vn");
    return recipeCardFromPathname(url.pathname) ?? url.searchParams.get("r");
  } catch {
    return null;
  }
}

export function writeRecipeCardToUrl(card: string | null) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.delete("r");
  url.pathname = staffRecipePath(card ?? "");
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

/** Resolve a path/`?r=` value to a stored recipe: id, ERP product id, or card number. */
export function findRecipeByCard(recipes: readonly Recipe[], card: string): Recipe | undefined {
  const key = card.trim();
  if (!key) return undefined;
  const lower = key.toLowerCase();
  const byId = recipes.find((recipe) => recipe.id === key) ?? recipes.find((recipe) => recipe.id.toLowerCase() === lower);
  if (byId) return byId;
  const byProduct =
    recipes.find((recipe) => recipe.erpProductId === key) ??
    recipes.find((recipe) => recipe.erpProductId && `erp-${recipe.erpProductId}` === key);
  if (byProduct) return byProduct;
  return recipes.find((recipe) => recipe.meta?.cardNo === key) ?? recipes.find((recipe) => recipe.meta?.cardNo.toLowerCase() === lower);
}
