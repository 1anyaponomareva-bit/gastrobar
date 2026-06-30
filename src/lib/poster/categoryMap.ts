import type { BarSubcategory } from "@/data/menu";

export type FoodMenuCategoryId =
  | "hot-dogs"
  | "burgers"
  | "grill"
  | "appetizers"
  | "snacks"
  | "combos"
  | "kids";

const BAR_CATEGORY_RULES: Array<{ pattern: RegExp; subcategory: BarSubcategory }> = [
  { pattern: /коктейл|cocktail|spritz|sour|negroni|cola|tonic|long island|boulevard/i, subcategory: "cocktail" },
  { pattern: /вино|wine|cabernet|sauvignon|chateau|passion wine/i, subcategory: "wine" },
  { pattern: /пиво|beer|lager|ipa|sapporo|fuzzy/i, subcategory: "beer" },
  { pattern: /настой|tincture|limoncello|малина|манго|маракуй|грейпфрут|клюкв|кофе|шоколад|черник|вишн|клубник|яблоч|апельсин|ананас|имбир/i, subcategory: "tincture" },
  { pattern: /шот|b-52|b52|kahlua|sambuca|baileys|jagermeister|whisky|whiskey|vodka|gin|rum|tequila|коньяк|hennessy|jameson|jim beam|jack daniel|absolut|bombay|harpoon|rhum|jose cuervo/i, subcategory: "spirits" },
  { pattern: /coca|sprite|fanta|schweppes|вода|water|безалкогол|soft/i, subcategory: "soft" },
  { pattern: /кальян|hookah|shisha|табак/i, subcategory: "cocktail" },
];

const FOOD_CATEGORY_RULES: Array<{ pattern: RegExp; category: FoodMenuCategoryId }> = [
  { pattern: /hot\s*dog|хот[\s-]?дог|hotdog/i, category: "hot-dogs" },
  { pattern: /бургер|burger|gastroburger|чизбургер|fishburger|фишбургер/i, category: "burgers" },
  { pattern: /комбо.*дет|kids|детск/i, category: "kids" },
  { pattern: /комбо|combo/i, category: "combos" },
  { pattern: /шашлык|kebab|колбаск|sausage|гриль|grill|крыл/i, category: "grill" },
  { pattern: /снек|jerky|джерки|фисташ|арахис|peanut|pistachio|nuts/i, category: "snacks" },
  { pattern: /закуск|appetizer|наггетс|nugget|суп|soup|фри|fries|fish bite|рыбн|сырн|paloch|sticks|wings|крыл/i, category: "appetizers" },
];

const BAR_VENUE_HINT = /бар|bar|коктейл|cocktail|вино|wine|пиво|beer|настой|шот|spirit|drink|напит|кальян|hookah|soft|безалкогол/i;
const FOOD_VENUE_HINT = /еда|food|hot\s*dog|хот|бургер|burger|гриль|grill|шашлык|закуск|комбо|combo|kids|снек|snack/i;

export function mapPosterCategoryToBar(
  categoryName: string,
  productName: string,
): BarSubcategory {
  const haystack = `${categoryName} ${productName}`;
  for (const rule of BAR_CATEGORY_RULES) {
    if (rule.pattern.test(haystack)) return rule.subcategory;
  }
  return "cocktail";
}

export function mapPosterCategoryToFood(
  categoryName: string,
  productName: string,
): FoodMenuCategoryId {
  const haystack = `${categoryName} ${productName}`;
  for (const rule of FOOD_CATEGORY_RULES) {
    if (rule.pattern.test(haystack)) return rule.category;
  }
  if (BAR_VENUE_HINT.test(haystack) && !FOOD_VENUE_HINT.test(haystack)) {
    return "snacks";
  }
  return "appetizers";
}

export function isLikelyBarProduct(categoryName: string, productName: string): boolean {
  const haystack = `${categoryName} ${productName}`;
  if (FOOD_VENUE_HINT.test(haystack) && !BAR_VENUE_HINT.test(haystack)) return false;
  return BAR_VENUE_HINT.test(haystack) || BAR_CATEGORY_RULES.some((r) => r.pattern.test(haystack));
}

export function isLikelyFoodProduct(categoryName: string, productName: string): boolean {
  const haystack = `${categoryName} ${productName}`;
  if (BAR_VENUE_HINT.test(haystack) && !FOOD_VENUE_HINT.test(haystack)) return false;
  if (FOOD_CATEGORY_RULES.some((r) => r.pattern.test(haystack))) return true;
  if (FOOD_VENUE_HINT.test(haystack)) return true;
  return !BAR_CATEGORY_RULES.some((r) => r.pattern.test(haystack));
}
