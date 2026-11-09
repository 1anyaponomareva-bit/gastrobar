import { CardsApp } from "@/components/cards/CardsApp";
import { RecipesApp } from "@/components/recipes/RecipesApp";
import { isGastrofoodRecipesHost } from "@/lib/recipes/vnHost";

export default async function RecipesPage() {
  if (await isGastrofoodRecipesHost()) return <CardsApp />;
  return <RecipesApp />;
}
