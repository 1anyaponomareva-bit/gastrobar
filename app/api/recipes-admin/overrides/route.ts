import { NextResponse } from "next/server";
import { RECIPES, ingredientKey, type IngredientOverride } from "@/data/recipes";
import { getSessionEmail } from "@/lib/recipes-admin/auth";
import { readOverrides, writeOverrides } from "@/lib/recipes-admin/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_AMOUNT = 100_000;

function parseAmount(value: unknown): number | undefined | null {
  if (value === undefined || value === null || value === "") return undefined;
  const number = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  if (!Number.isFinite(number) || number < 0 || number > MAX_AMOUNT) return null;
  return Math.round(number * 100) / 100;
}

/** Body: { recipeId, edits: { [ingredientKey]: { amount?, gross? } } }; empty edits reset the recipe. */
export async function PUT(request: Request) {
  try {
    if (!(await getSessionEmail())) {
      return NextResponse.json({ error: "auth" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      recipeId?: unknown;
      edits?: Record<string, { amount?: unknown; gross?: unknown }>;
    };
    const recipe = RECIPES.find((item) => item.id === body.recipeId);
    if (!recipe) return NextResponse.json({ error: "recipe" }, { status: 400 });

    const clean: Record<string, IngredientOverride> = {};
    for (const ingredient of recipe.ingredients) {
      const key = ingredientKey(ingredient);
      const edit = body.edits?.[key];
      if (!edit) continue;
      const amount = parseAmount(edit.amount);
      const gross = parseAmount(edit.gross);
      if (amount === null || gross === null) {
        return NextResponse.json({ error: "number", key }, { status: 400 });
      }
      const next: IngredientOverride = {};
      if (amount !== undefined && amount !== ingredient.amount) next.amount = amount;
      const effectiveAmount = next.amount ?? ingredient.amount;
      const baseGross = next.amount !== undefined ? effectiveAmount : (ingredient.gross ?? ingredient.amount);
      if (gross !== undefined && gross !== baseGross) next.gross = gross;
      if (Object.keys(next).length) clean[key] = next;
    }

    const overrides = await readOverrides();
    if (Object.keys(clean).length) overrides[recipe.id] = clean;
    else delete overrides[recipe.id];
    await writeOverrides(overrides);

    return NextResponse.json({ overrides });
  } catch (error) {
    console.error("[recipes-admin] overrides", error);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}
