import type { ErpDish, ErpDocument, ErpRecipe, ErpRecipeLine, ErpState } from "./types";
import { check, erpDb } from "./server";

/** Parts of the ERP screen data that can be loaded on their own. */
export type StatePart = keyof ErpState;

export const ALL_PARTS: StatePart[] = ["settings", "categories", "suppliers", "warehouses", "channels", "products", "packs", "productPacks", "stock", "recipes", "dishes", "writeoffReasons"];

async function loadPart(part: StatePart): Promise<unknown> {
  const db = erpDb();
  switch (part) {
    case "settings":
      return check(await db.from("erp_settings").select("*").eq("id", 1).single());
    case "categories":
      return check(await db.from("erp_categories").select("*").order("sort"));
    case "suppliers":
      return check(await db.from("erp_suppliers").select("*").order("sort"));
    case "warehouses":
      return check(await db.from("erp_warehouses").select("*").order("sort"));
    case "channels":
      return check(await db.from("erp_sales_channels").select("*").order("sort"));
    case "products":
      return check(await db.from("erp_products").select("*").order("name_en").limit(5000));
    case "packs":
      return check(await db.from("erp_packs").select("*").is("archived_at", null).limit(10000));
    case "productPacks":
      return check(await db.from("erp_product_packs").select("*").is("archived_at", null).limit(10000));
    case "stock":
      return check(await db.from("erp_stock").select("*").limit(20000));
    case "writeoffReasons":
      return check(await db.from("erp_writeoff_reasons").select("*").order("sort"));
    case "recipes": {
      const [recipes, lines] = await Promise.all([
        db.from("erp_recipes").select("*").order("version"),
        db.from("erp_recipe_lines").select("*").order("line_no").limit(20000),
      ]);
      const byRecipe = new Map<string, ErpRecipeLine[]>();
      for (const line of check(lines) as ErpRecipeLine[]) {
        const list = byRecipe.get(line.recipe_id);
        if (list) list.push(line);
        else byRecipe.set(line.recipe_id, [line]);
      }
      return (check(recipes) as Omit<ErpRecipe, "lines">[]).map((recipe) => ({ ...recipe, lines: byRecipe.get(recipe.id) ?? [] }));
    }
    case "dishes": {
      const [dishes, lines, prices] = await Promise.all([
        db.from("erp_dishes").select("*").order("name_en"),
        db.from("erp_dish_lines").select("*").order("line_no").limit(20000),
        db.from("erp_dish_channel_prices").select("*"),
      ]);
      const linesByDish = new Map<string, ErpDish["lines"]>();
      for (const line of check(lines) as (ErpDish["lines"][number] & { dish_id: string })[]) {
        const list = linesByDish.get(line.dish_id);
        if (list) list.push(line);
        else linesByDish.set(line.dish_id, [line]);
      }
      const pricesByDish = new Map<string, ErpDish["channel_prices"]>();
      for (const price of check(prices) as (ErpDish["channel_prices"][number] & { dish_id: string })[]) {
        const list = pricesByDish.get(price.dish_id);
        if (list) list.push(price);
        else pricesByDish.set(price.dish_id, [price]);
      }
      return (check(dishes) as Omit<ErpDish, "lines" | "channel_prices">[]).map((dish) => ({
        ...dish,
        lines: linesByDish.get(dish.id) ?? [],
        channel_prices: pricesByDish.get(dish.id) ?? [],
      }));
    }
  }
}

/** One document with its lines, or null. */
export async function loadDocument(id: string): Promise<ErpDocument | null> {
  const db = erpDb();
  const [document, lines] = await Promise.all([
    db.from("erp_documents").select("*").eq("id", id).maybeSingle(),
    db.from("erp_document_lines").select("*").eq("document_id", id).order("line_no"),
  ]);
  const doc = check(document) as Omit<ErpDocument, "lines"> | null;
  return doc ? { ...doc, lines: check(lines) } : null;
}

/** Loads the given parts in parallel (one database round trip). */
export async function loadState(parts: StatePart[] = ALL_PARTS): Promise<Partial<ErpState>> {
  const values = await Promise.all(parts.map(loadPart));
  return Object.fromEntries(parts.map((part, index) => [part, values[index]])) as Partial<ErpState>;
}
