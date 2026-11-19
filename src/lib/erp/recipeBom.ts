/** Direct BOM helpers: one recipe level is a warehouse take, not an explosion. */

export type BomRecipe = {
  product_id: string;
  status?: string | null;
  lines: readonly { product_id: string | null | undefined }[];
};

/**
 * True when `componentId` is `outputId` or a descendant through non-archived recipes.
 * Matches `erp_recipe_has_cycle(output, component)` in Postgres.
 */
export function wouldRecipeCycle(recipes: readonly BomRecipe[], outputId: string, componentId: string): boolean {
  if (!outputId || !componentId) return false;
  const byProduct = new Map<string, BomRecipe[]>();
  for (const recipe of recipes) {
    if (recipe.status === "archived") continue;
    const list = byProduct.get(recipe.product_id) ?? [];
    list.push(recipe);
    byProduct.set(recipe.product_id, list);
  }
  const seen = new Set<string>();
  const queue = [componentId];
  let depth = 0;
  while (queue.length && depth < 50) {
    const next: string[] = [];
    for (const id of queue) {
      if (id === outputId) return true;
      if (seen.has(id)) continue;
      seen.add(id);
      for (const recipe of byProduct.get(id) ?? []) {
        for (const line of recipe.lines) {
          if (line.product_id) next.push(line.product_id);
        }
      }
    }
    queue.length = 0;
    queue.push(...next);
    depth += 1;
  }
  return false;
}

/** Products that cannot be added to this card without creating a cycle (includes the card itself). */
export function cyclicComponentIds(recipes: readonly BomRecipe[], outputId: string, productIds: readonly string[]): string[] {
  return productIds.filter((id) => wouldRecipeCycle(recipes, outputId, id));
}
