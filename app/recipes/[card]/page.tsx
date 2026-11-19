import { CardsApp } from "@/components/cards/CardsApp";
import { RecipesApp } from "@/components/recipes/RecipesApp";
import { isGastrofoodRecipesHost } from "@/lib/recipes/vnHost";

export default async function RecipeCardPage({ params }: { params: Promise<{ card: string }> }) {
  const { card } = await params;
  let decoded = card;
  try {
    decoded = decodeURIComponent(card);
  } catch {
    decoded = card;
  }
  if (await isGastrofoodRecipesHost()) return <CardsApp initialCard={decoded} />;
  return <RecipesApp initialCard={decoded} />;
}
