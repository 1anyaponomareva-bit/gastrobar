import type { ErpState } from "@/lib/erp/types";

export function unresolvedLines(state: ErpState) {
  return state.recipes
    .filter((recipe) => recipe.status === "draft")
    .flatMap((recipe) => recipe.lines.filter((line) => !line.product_id || line.qty === null).map((line) => ({ recipe, line })));
}

export function productsWithoutUnit(state: ErpState) {
  return state.products.filter((p) => !p.archived_at && !p.base_unit);
}

/** Staff items whose pack text could not be converted to base units. */
export function productsWithoutPack(state: ErpState) {
  const withPack = new Set(state.productPacks.map((link) => link.product_id));
  return state.products.filter((p) => !p.archived_at && p.staff_listed && p.base_unit && !withPack.has(p.id));
}

export function reviewCounts(state: ErpState) {
  return {
    lines: unresolvedLines(state).length,
    units: productsWithoutUnit(state).length,
    packs: productsWithoutPack(state).length,
  };
}
