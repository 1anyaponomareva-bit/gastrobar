import { NextResponse } from "next/server";
import { check, erpDb, errorResponse, requireAdmin } from "@/lib/erp/server";
import type { ErpDish, ErpRecipe, ErpRecipeLine, ErpState } from "@/lib/erp/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Everything the ERP screens need except documents (reference data is small). */
export async function GET() {
  try {
    await requireAdmin();
    const db = erpDb();
    const [settings, categories, suppliers, warehouses, channels, products, packs, stock, recipes, recipeLines, dishes, dishLines, prices] =
      await Promise.all([
        db.from("erp_settings").select("*").eq("id", 1).single(),
        db.from("erp_categories").select("*").order("sort"),
        db.from("erp_suppliers").select("*").order("sort"),
        db.from("erp_warehouses").select("*").order("sort"),
        db.from("erp_sales_channels").select("*").order("sort"),
        db.from("erp_products").select("*").order("name_en").limit(5000),
        db.from("erp_product_packs").select("*").is("archived_at", null).limit(10000),
        db.from("erp_stock").select("*").limit(20000),
        db.from("erp_recipes").select("*").order("version"),
        db.from("erp_recipe_lines").select("*").order("line_no").limit(20000),
        db.from("erp_dishes").select("*").order("name_en"),
        db.from("erp_dish_lines").select("*").order("line_no").limit(20000),
        db.from("erp_dish_channel_prices").select("*"),
      ]);

    const linesByRecipe = new Map<string, ErpRecipeLine[]>();
    for (const line of check(recipeLines) as ErpRecipeLine[]) {
      linesByRecipe.set(line.recipe_id, [...(linesByRecipe.get(line.recipe_id) ?? []), line]);
    }
    const dishLineRows = check(dishLines) as ErpDish["lines"];
    const priceRows = check(prices) as (ErpDish["channel_prices"][number] & { dish_id: string })[];

    const state: ErpState = {
      settings: check(settings),
      categories: check(categories),
      suppliers: check(suppliers),
      warehouses: check(warehouses),
      channels: check(channels),
      products: check(products),
      packs: check(packs),
      stock: check(stock),
      recipes: (check(recipes) as Omit<ErpRecipe, "lines">[]).map((recipe) => ({
        ...recipe,
        lines: linesByRecipe.get(recipe.id) ?? [],
      })),
      dishes: (check(dishes) as Omit<ErpDish, "lines" | "channel_prices">[]).map((dish) => ({
        ...dish,
        lines: dishLineRows.filter((line) => line.dish_id === dish.id),
        channel_prices: priceRows.filter((price) => price.dish_id === dish.id),
      })),
    };
    return NextResponse.json(state, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
