import type { BarSubcategory } from "@/data/menu";

export type FoodMenuCategoryId =
  | "hot-dogs"
  | "burgers"
  | "grill"
  | "appetizers"
  | "snacks"
  | "combos"
  | "kids";

const POSTER_BAR_CATEGORY_NAMES = new Set([
  "INFUSED VODKA",
  "COCKTAILS",
  "WINE",
  "DRINKS",
  "SHOTS",
  "BEER",
  "TOBACCO",
  "SNACKS",
]);

const POSTER_FOOD_CATEGORY_NAMES = new Set([
  "GRILL",
  "BURGERS",
  "HOT DOGS",
  "COMBO MEAL",
  "SAUCES",
  "APPETIZERS",
]);

const POSTER_CATEGORY_TO_BAR: Record<string, BarSubcategory> = {
  "INFUSED VODKA": "tincture",
  COCKTAILS: "cocktail",
  WINE: "wine",
  DRINKS: "soft",
  SHOTS: "spirits",
  BEER: "beer",
  TOBACCO: "cocktail",
  SNACKS: "spirits",
};

const POSTER_CATEGORY_TO_FOOD: Record<string, FoodMenuCategoryId> = {
  GRILL: "grill",
  BURGERS: "burgers",
  "HOT DOGS": "hot-dogs",
  "COMBO MEAL": "combos",
  SAUCES: "appetizers",
  APPETIZERS: "appetizers",
};

const BAR_CATEGORY_RULES: Array<{ pattern: RegExp; subcategory: BarSubcategory }> = [
  { pattern: /коктейл|cocktail|spritz|sour|negroni|cola|tonic|long island|boulevard/i, subcategory: "cocktail" },
  { pattern: /вино|wine|cabernet|sauvignon|chateau|passion wine/i, subcategory: "wine" },
  { pattern: /пиво|beer|lager|ipa|sapporo|fuzzy/i, subcategory: "beer" },
  { pattern: /настой|tincture|limoncello|малина|манго|маракуй|грейпфрут|клюкв|кофе|шоколад|черник|вишн|клубник|яблоч|апельсин|ананас|имбир/i, subcategory: "tincture" },
  { pattern: /шот|b-52|b52|kahlua|sambuca|baileys|jager|whisky|whiskey|vodka|gin|rum|tequila|коньяк|hennessy|jameson|jim beam|jack daniel|absolut|bombay|harpoon|rhum|jose cuervo/i, subcategory: "spirits" },
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

function normalizePosterCategoryName(categoryName: string): string {
  return categoryName.trim().toUpperCase();
}

export function isPosterBarCategory(categoryName: string): boolean {
  return POSTER_BAR_CATEGORY_NAMES.has(normalizePosterCategoryName(categoryName));
}

export function isPosterFoodCategory(categoryName: string): boolean {
  return POSTER_FOOD_CATEGORY_NAMES.has(normalizePosterCategoryName(categoryName));
}

export function mapPosterCategoryToBar(
  categoryName: string,
  productName: string,
): BarSubcategory {
  const posterCategory = normalizePosterCategoryName(categoryName);
  if (POSTER_CATEGORY_TO_BAR[posterCategory]) {
    return POSTER_CATEGORY_TO_BAR[posterCategory];
  }

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
  const posterCategory = normalizePosterCategoryName(categoryName);
  if (POSTER_CATEGORY_TO_FOOD[posterCategory]) {
    if (posterCategory === "COMBO MEAL" && /kids|детск/i.test(productName)) {
      return "kids";
    }
    return POSTER_CATEGORY_TO_FOOD[posterCategory];
  }

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
  if (isPosterFoodCategory(categoryName)) return false;
  if (isPosterBarCategory(categoryName)) return true;

  const haystack = `${categoryName} ${productName}`;
  if (/pistach|peanut|фисташ|арахис/i.test(haystack)) return true;
  if (FOOD_VENUE_HINT.test(haystack) && !BAR_VENUE_HINT.test(haystack)) return false;
  return BAR_VENUE_HINT.test(haystack) || BAR_CATEGORY_RULES.some((r) => r.pattern.test(haystack));
}

export function isLikelyFoodProduct(categoryName: string, productName: string): boolean {
  if (isPosterBarCategory(categoryName)) return false;
  if (isPosterFoodCategory(categoryName)) return true;

  const haystack = `${categoryName} ${productName}`;
  if (BAR_VENUE_HINT.test(haystack) && !FOOD_VENUE_HINT.test(haystack)) return false;
  if (FOOD_CATEGORY_RULES.some((r) => r.pattern.test(haystack))) return true;
  if (FOOD_VENUE_HINT.test(haystack)) return true;
  return !BAR_CATEGORY_RULES.some((r) => r.pattern.test(haystack));
}
