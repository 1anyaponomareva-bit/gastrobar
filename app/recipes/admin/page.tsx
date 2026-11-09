import { CardsAdminApp } from "@/components/cards/CardsAdminApp";
import { RecipesAdminApp } from "@/components/recipes/RecipesAdminApp";
import { isGastrofoodRecipesHost } from "@/lib/recipes/vnHost";

export default async function RecipesAdminPage() {
  if (await isGastrofoodRecipesHost()) return <CardsAdminApp />;
  return <RecipesAdminApp />;
}
