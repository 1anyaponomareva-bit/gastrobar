import { NextResponse } from "next/server";
import { RECIPES, mergeRecipes, type Recipe } from "@/data/recipes";
import { getSessionEmail } from "@/lib/recipes-admin/auth";
import { translateEditedTexts } from "@/lib/recipes-admin/autoTranslate";
import { sanitizeRecipe } from "@/lib/recipes-admin/recipeInput";
import {
  readOverrides,
  readStoredRecipes,
  writeOverrides,
  writeStoredRecipes,
} from "@/lib/recipes-admin/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function dropOverrides(id: string) {
  const overrides = await readOverrides();
  if (!overrides[id]) return;
  delete overrides[id];
  await writeOverrides(overrides);
}

/** Creates or replaces a whole recipe. Body: { recipe }. */
export async function POST(request: Request) {
  try {
    if (!(await getSessionEmail())) return NextResponse.json({ error: "auth" }, { status: 401 });
    const body = (await request.json().catch(() => ({}))) as { recipe?: unknown };
    const stored = await readStoredRecipes();
    const id = (body.recipe as { id?: unknown } | undefined)?.id;
    const published = mergeRecipes(stored).find((item) => item.id === id);
    try {
      await translateEditedTexts(body.recipe, published);
    } catch (error) {
      console.error("[recipes-admin] auto-translate", error);
    }
    const recipe = sanitizeRecipe(body.recipe);
    if (!recipe) return NextResponse.json({ error: "invalid" }, { status: 400 });

    stored.recipes = [...stored.recipes.filter((item) => item.id !== recipe.id), recipe];
    stored.deleted = stored.deleted.filter((id) => id !== recipe.id);
    await writeStoredRecipes(stored);
    await dropOverrides(recipe.id);
    return NextResponse.json({ stored, overrides: await readOverrides() });
  } catch (error) {
    console.error("[recipes-admin] save recipe", error);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}

/** Shows or hides a recipe for staff. Body: { id, hidden }. */
export async function PATCH(request: Request) {
  try {
    if (!(await getSessionEmail())) return NextResponse.json({ error: "auth" }, { status: 401 });
    const body = (await request.json().catch(() => ({}))) as { id?: unknown; hidden?: unknown };
    const stored = await readStoredRecipes();
    const recipe = mergeRecipes(stored).find((item) => item.id === body.id);
    if (!recipe) return NextResponse.json({ error: "recipe" }, { status: 400 });

    const { hidden: _wasHidden, ...visible } = recipe;
    const updated: Recipe = body.hidden === true ? { ...visible, hidden: true } : visible;
    stored.recipes = [...stored.recipes.filter((item) => item.id !== recipe.id), updated];
    await writeStoredRecipes(stored);
    return NextResponse.json({ stored });
  } catch (error) {
    console.error("[recipes-admin] hide recipe", error);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}

/** Deletes a recipe. Body: { id }. Built-in recipes are remembered as deleted. */
export async function DELETE(request: Request) {
  try {
    if (!(await getSessionEmail())) return NextResponse.json({ error: "auth" }, { status: 401 });
    const body = (await request.json().catch(() => ({}))) as { id?: unknown };
    const id = typeof body.id === "string" ? body.id : "";
    const stored = await readStoredRecipes();
    if (!mergeRecipes(stored).some((item) => item.id === id)) {
      return NextResponse.json({ error: "recipe" }, { status: 400 });
    }

    stored.recipes = stored.recipes.filter((item) => item.id !== id);
    if (RECIPES.some((item) => item.id === id) && !stored.deleted.includes(id)) stored.deleted.push(id);
    await writeStoredRecipes(stored);
    await dropOverrides(id);
    return NextResponse.json({ stored, overrides: await readOverrides() });
  } catch (error) {
    console.error("[recipes-admin] delete recipe", error);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}
