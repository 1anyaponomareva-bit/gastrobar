import { PROCESSING_LIST_PATH, processingDocPath } from "./publicPath";
import type { ErpDish, ErpDocumentLine, ErpRecipe, ErpRecipeLine } from "./types";

export { PROCESSING_LIST_PATH, processingDocPath };
export const PROCESSING_NEW_HREF = `${PROCESSING_LIST_PATH}/new`;

const round6 = (value: number) => Math.round(value * 1e6) / 1e6;

type QtyLine = { product_id: string | null; qty: number | null };

export type ProcessingComposition = {
  recipeId: string | null;
  source: "recipe" | "dish" | null;
  yieldQty: number | null;
  lines: ErpDocumentLine[];
};

export type ProcessingRecipe = Pick<ErpRecipe, "id" | "product_id" | "status" | "yield_qty" | "lines">;
export type ProcessingDish = Pick<ErpDish, "id" | "lines">;

export function activeRecipeForProduct(recipes: readonly ProcessingRecipe[], productId: string | null | undefined): ProcessingRecipe | null {
  if (!productId) return null;
  return recipes.find((recipe) => recipe.product_id === productId && recipe.status === "active") ?? null;
}

function scaleLines(lines: readonly QtyLine[], yieldQty: number | null, outputQty: number | null): ErpDocumentLine[] {
  const factor = outputQty && yieldQty ? outputQty / yieldQty : 1;
  return lines
    .filter((line): line is QtyLine & { product_id: string; qty: number } => Boolean(line.product_id && line.qty && line.qty > 0))
    .map((line) => {
      const planned = round6(line.qty * factor);
      return { product_id: line.product_id, planned_qty: planned, qty: planned };
    });
}

function recipeQtyLines(recipe: ProcessingRecipe): QtyLine[] {
  return recipe.lines.map((line: ErpRecipeLine) => ({ product_id: line.product_id, qty: line.qty }));
}

/**
 * Current tech-card composition for a processing document: active prep recipe, else dish
 * lines. Names are not stored — the UI reads live catalog names by product id.
 */
export function processingComposition(input: {
  recipes: readonly ProcessingRecipe[];
  dishes?: readonly ProcessingDish[];
  outputId: string | null | undefined;
  outputQty: number | null | undefined;
}): ProcessingComposition {
  const empty: ProcessingComposition = { recipeId: null, source: null, yieldQty: null, lines: [] };
  if (!input.outputId) return empty;
  const recipe = activeRecipeForProduct(input.recipes, input.outputId);
  if (recipe) {
    return {
      recipeId: recipe.id,
      source: "recipe",
      yieldQty: recipe.yield_qty,
      lines: scaleLines(recipeQtyLines(recipe), recipe.yield_qty, input.outputQty ?? recipe.yield_qty),
    };
  }
  const dish = input.dishes?.find((item) => item.id === input.outputId);
  if (dish) {
    const yieldQty = 1;
    return {
      recipeId: null,
      source: "dish",
      yieldQty,
      lines: scaleLines(
        dish.lines.map((line) => ({ product_id: line.product_id, qty: line.qty })),
        yieldQty,
        input.outputQty ?? yieldQty,
      ),
    };
  }
  return empty;
}
