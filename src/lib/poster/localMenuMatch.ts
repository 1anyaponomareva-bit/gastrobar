import { MENU_ITEMS, type MenuItem } from "@/data/menu";
import { FOOD_MENU_CATALOG, type LocalFoodCatalogItem } from "./foodMenuCatalog";

export function normalizePosterLookupKey(value: string): string {
  return value
    .replace(/^\+/, "")
    .toLowerCase()
    .replace(/hot\s*dog/g, "hotdog")
    .replace(/ё/g, "е")
    .replace(/[^a-z0-9а-я]/g, "");
}

const LOCAL_BAR_ITEMS: MenuItem[] = MENU_ITEMS.filter((item) => item.category !== "hookah");

const BAR_BY_ID = new Map(LOCAL_BAR_ITEMS.map((item) => [item.id, item]));
const FOOD_BY_ID = new Map(FOOD_MENU_CATALOG.map((item) => [item.id, item]));

const POSTER_ALIAS_TO_LOCAL_ID = new Map<string, string>();

function registerAlias(alias: string, localId: string) {
  const key = normalizePosterLookupKey(alias);
  if (key) POSTER_ALIAS_TO_LOCAL_ID.set(key, localId);
}

function registerLocalItemAliases(localId: string, aliases: string[]) {
  for (const alias of aliases) {
    registerAlias(alias, localId);
  }
}

for (const item of LOCAL_BAR_ITEMS) {
  registerAlias(item.id, item.id);
  registerAlias(item.id.replace(/-/g, " "), item.id);
  registerAlias(item.name, item.id);
}

for (const item of FOOD_MENU_CATALOG) {
  registerAlias(item.id, item.id);
  registerAlias(item.id.replace(/-/g, " "), item.id);
  registerAlias(item.name, item.id);
}

const BAR_POSTER_ALIASES: Array<[string, string]> = [
  ["БУЛЬВАРДЬЕ", "boulevardier"],
  ["WHISKEY SOUR", "whisky-sour"],
  ["WHISKY SOUR", "whisky-sour"],
  ["NEGRONI", "negroni"],
  ["LONG ISLAND ICED TEA", "long-island"],
  ["WHISKEY COLA", "whisky-cola"],
  ["GIN TONIC", "gin-tonic"],
  ["APEROL SPRITZ", "aperol"],
  ["БЕЛОЕ ВИНО Passion White Wine Sauvignon Blanc", "passion-white-wine-sauvignon-blanc"],
  ["КРАСНОЕ ВИНО Passion Cabernet Sauvignon", "passion-cabernet-sauvignon"],
  ["КРАСНОЕ ВИНО Passion Classic", "passion-classic-red-wine"],
  ["КРАСНОЕ ВИНО Passion Sweet wine", "passion-sweet-wine"],
  ["ШАМПАНСКОЕ Chateau Dalat Sparkling White Wine", "chateau-dalat-sparkling-white"],
  ["SAPPORO LAGER", "beer-light"],
  ["SAPPORO BLACK", "beer-dark"],
  ["BIERE BLANCHE - WHEAT BEER", "fuzzy-wheat-beer"],
  ["WHEAT BEER", "fuzzy-wheat-beer"],
  ["LEMON CIDER - FUZZY", "fuzzy-lemon-cider"],
  ["LEMON CIDER", "fuzzy-lemon-cider"],
  ["FUZZY LAGER", "fuzzy-lager"],
  ["LIMONCELLO", "limoncello"],
  ["PINEAPPLE GINGER HONEY", "pineapple-ginger-honey"],
  ["PINEAPPLE VANILLA", "pineapple-vanilla"],
  ["ORANGE CINNAMON", "orange-cinnamon"],
  ["GRAPEFRUIT ROSEMARY", "grapefruit-rosemary"],
  ["CRANBERRY", "cranberry"],
  ["COFFEE CHOCOLATE", "coffee-chocolate"],
  ["RASPBERRY ROSES", "raspberry-rose"],
  ["MANGO PASSIONFRUIT", "mango-passionfruit"],
  ["PASSION FRUIT", "passionfruit"],
  ["APPLE STRUDEL", "apple-strudel"],
  ["BLUEBERRY", "blueberry"],
  ["CHERRY CHOCOLATE", "cherry-chocolate"],
  ["STRAWBERRY CREAM", "strawberry-cream"],
  ["B52", "b52"],
  ["B-52", "b52"],
  ["COFFEE LIQUEUR KAHLUA", "kahlua"],
  ["+SAMBUCA VACCARI", "sambuca-vaccari"],
  ["SAMBUCA VACCARI", "sambuca-vaccari"],
  ["RHUM CHAUVET", "rhum-chauvet"],
  ["RUM - BACARDI", "bacardi-rum"],
  ["RUM BACARDI", "bacardi-rum"],
  ["BACARDI", "bacardi-rum"],
  ["JAMESON", "jameson"],
  ["VODKA ABSOLUT", "absolut-vodka"],
  ["BAILEYS", "baileys"],
  ["TEQUILA JOSE CUERVO", "jose-cuervo-tequila"],
  ["TEQUILA - OLMECA SILVER", "olmeca-blanco-tequila"],
  ["TEQUILA OLMECA SILVER", "olmeca-blanco-tequila"],
  ["OLMECA BLANCO", "olmeca-blanco-tequila"],
  ["TEQUILA - OLMECA ALTOS PLATA", "olmeca-gold-tequila"],
  ["TEQUILA OLMECA ALTOS PLATA", "olmeca-gold-tequila"],
  ["OLMECA GOLD", "olmeca-gold-tequila"],
  ["JAGERMAISTER", "jagermeister"],
  ["JAGERMEISTER", "jagermeister"],
  ["GIN BOMBAY SAPPHIRE", "bombay-sapphire-gin"],
  ["GIN - GORDONS", "gordons-gin"],
  ["GIN GORDONS", "gordons-gin"],
  ["GORDONS", "gordons-gin"],
  ["GIN HARPOON", "gin-harpoon"],
  ["+HENNESSY VERY SPECIAL", "hennessy-vs"],
  ["HENNESSY VERY SPECIAL", "hennessy-vs"],
  ["JIM BEAM APPLE", "jim-beam-apple"],
  ["JIM BEAM", "jim-beam"],
  ["JACK DANIELS", "jack-daniels"],
  ["COCA-COLA ZERO", "coca-cola-zero"],
  ["COCA-COLA", "coca-cola-can"],
  ["SPRITE", "sprite-can"],
  ["FANTA", "fanta-can"],
  ["MIRINDA", "mirinda-can"],
  ["SCHWEPPES GINGER ALE", "schweppes-red"],
  ["SCHWEPPES TONIС", "schweppes-tonic-yellow"],
  ["SCHWEPPES TONIC", "schweppes-tonic-yellow"],
  ["SCHWEPPES SODA", "schweppes-soda-grey"],
  ["MELON PAPAYA", "lemonade-melon-papaya"],
  ["MELONPAPAYA", "lemonade-melon-papaya"],
  ["LEMONADE MELON PAPAYA", "lemonade-melon-papaya"],
  ["BLUBERRY", "lemonade-blueberry"],
  ["BLUEBERRY LEMONADE", "lemonade-blueberry"],
  ["LEMONADE BLUEBERRY", "lemonade-blueberry"],
  ["MANGOLEMONADE", "lemonade-mango-passionfruit"],
  ["MANGO LEMONADE", "lemonade-mango-passionfruit"],
  ["LEMONADE MANGO PASSION", "lemonade-mango-passionfruit"],
  ["MINT", "lemonade-passionfruit-mint"],
  ["PASSION MINT", "lemonade-passionfruit-mint"],
  ["LEMONADE PASSION MINT", "lemonade-passionfruit-mint"],
  ["ВОДА LA VIE", "water-350"],
];

const FOOD_POSTER_ALIASES: Array<[string, string]> = [
  ["CHICKEN WINGS", "chicken-wings"],
  ["MOZZARELLA STICKS", "mozzarella-sticks"],
  ["CHICKEN NUGGETS", "chicken-nuggets"],
  ["CRISPY FISH BITES", "crispy-fish-bites"],
  ["FISH BITES", "crispy-fish-bites"],
  ["FRENCH FRIES", "french-fries"],
  ["CREAMY CHICKEN SOUP", "creamy-chicken-soup"],
  ["CHICKEN JERKY", "chicken-jerky"],
  ["BEEF JERKY", "beef-jerky"],
  ["PISTACHIOS", "pistachios"],
  ["PEANUTS", "peanuts"],
  ["SIMPLE HOT DOG", "simple-hot-dog"],
  ["CLASSIC HOT DOG", "simple-hot-dog"],
  ["KIDS HOT DOG", "simple-hot-dog"],
  ["DANISH HOT DOG", "classic-hot-dog"],
  ["CLASSIC", "simple-hot-dog"],
  ["JALAPENO & CHEDDAR", "jalapeno-cheddar-dog"],
  ["SAUERKRAUT & MUSTARD", "bavarian-dog"],
  ["BBQ & BACON", "bbq-bacon-dog"],
  ["CHEDDAR BACON HOT DOG", "cheddar-bacon-dog"],
  ["CHEDDAR BACON", "cheddar-bacon-dog"],
  ["JALAPENO CHEDDAR HOT DOG", "jalapeno-cheddar-dog"],
  ["JALAPENO CHEDDAR", "jalapeno-cheddar-dog"],
  ["HALAPENO CHEDDAR", "jalapeno-cheddar-dog"],
  ["SAUERKRAUT MUSTARD HOT DOG", "bavarian-dog"],
  ["BAVARIAN HOT DOG", "bavarian-dog"],
  ["BBQ BACON HOT DOG", "bbq-bacon-dog"],
  ["BBQ BACON", "bbq-bacon-dog"],
  ["PHILLY CHEESESTEAK", "philly-cheesesteak"],
  ["CHEESESTEAK DOG", "philly-cheesesteak"],
  ["CLASSIC BURGER", "classic-burger"],
  ["CHEESEBURGER", "cheeseburger"],
  ["GASTROBURGER", "signature-burger"],
  ["FISH BURGER", "fish-burger"],
  ["BURGER COMBO", "burger-combo"],
  ["HOT DOG COMBO", "hot-dog-combo"],
  ["WINGS COMBO", "wings-combo"],
  ["CHICKEN WINGS COMBO", "wings-combo"],
  ["FAMILY COMBO", "family-combo"],
  ["FAMILY COMBO MEAL", "family-combo"],
  ["KIDS NUGGETS COMBO", "kids-nuggets-combo"],
  ["KIDS HOT DOG COMBO", "kids-hot-dog-combo"],
  ["CHICKEN KEBAB", "chicken-kebab"],
  ["PORK KEBAB", "pork-kebab"],
  ["BAVARIAN SAUSAGE", "bavarian-sausage"],
  ["PORK SAUSAGE BOX", "bavarian-sausage"],
  ["SOS PORK", "bavarian-sausage"],
  ["CHEDDAR JALAPENO SAUSAGE", "cheddar-jalapeno-sausage"],
  ["PORK CHEESE SAUSAGE BOX", "cheddar-jalapeno-sausage"],
  ["SOS CHALAP", "cheddar-jalapeno-sausage"],
  ["GRILLED CHICKEN SAUSAGE", "grilled-chicken-sausage"],
  ["CHICKEN SAUSAGE BOX", "grilled-chicken-sausage"],
  ["SOS KUR", "grilled-chicken-sausage"],
  ["BEEF BURGER", "classic-burger"],
  ["CHEDDER & BACON", "cheddar-bacon-dog"],
  ["CHEDDER AND BACON", "cheddar-bacon-dog"],
  ["CHEESE STEAKE DOG", "philly-cheesesteak"],
  ["CHEESESTEAK DOG", "philly-cheesesteak"],
  ["CHEESE SAUSAGES", "cheddar-jalapeno-sausage"],
  ["CHICKEN SAUSAGES", "grilled-chicken-sausage"],
  ["CHICKEN SHASHLIK", "chicken-kebab"],
  ["PORK SHASHLIK", "pork-kebab"],
  ["KIDS COMBO #1", "kids-nuggets-combo"],
  ["KIDS COMBO 1", "kids-nuggets-combo"],
  ["HOT DOG SIMPLE", "simple-hot-dog"],
  ["HOT DOG KIDS", "simple-hot-dog"],
  ["KIDS HOT DOG", "simple-hot-dog"],
  ["CHEDDAR AND BACON", "cheddar-bacon-dog"],
  ["CHEDDAR BACON DOG", "cheddar-bacon-dog"],
  ["SAUERKRAUT MUSTARD", "bavarian-dog"],
  ["BAVARIAN DOG", "bavarian-dog"],
  ["BURGER CLASSIC", "classic-burger"],
  ["COMBO BURGER", "burger-combo"],
  ["BURGER COMBO MEAL", "burger-combo"],
  ["COMBO HOT DOG", "hot-dog-combo"],
  ["HOT DOG COMBO MEAL", "hot-dog-combo"],
  ["COMBO WINGS", "wings-combo"],
  ["WINGS COMBO MEAL", "wings-combo"],
  ["COMBO FAMILY", "family-combo"],
  ["FAMILY SET", "family-combo"],
  ["KIDS COMBO NUGGETS", "kids-nuggets-combo"],
  ["KIDS NUGGETS COMBO", "kids-nuggets-combo"],
  ["KIDS COMBO HOT DOG", "kids-hot-dog-combo"],
  ["CHICKEN KEBAB WITH BREAD", "chicken-kebab"],
  ["PORK KEBAB WITH BREAD", "pork-kebab"],
  ["KEBAB CHICKEN", "chicken-kebab"],
  ["KEBAB PORK", "pork-kebab"],
  ["BAVARIAN GRILL SAUSAGE", "bavarian-sausage"],
  ["CHEDDAR JALAPENO GRILL SAUSAGE", "cheddar-jalapeno-sausage"],
  ["CHICKEN GRILL SAUSAGE", "grilled-chicken-sausage"],
  ["CHICKEN KEBAB BOX", "chicken-kebab"],
  ["KUR KEBAB", "chicken-kebab"],
  ["PORK KEBAB BOX", "pork-kebab"],
  ["PORK KEBAB PITA", "pork-kebab-pita"],
  ["PORK PITA", "pork-kebab-pita"],
  ["PITA PORK", "pork-kebab-pita"],
  ["PITA WITH PORK KEBAB", "pork-kebab-pita"],
  ["CHICKEN KEBAB PITA", "chicken-kebab-pita"],
  ["CHICKEN PITA", "chicken-kebab-pita"],
  ["CHICK PITA", "chicken-kebab-pita"],
  ["PITA CHICKEN", "chicken-kebab-pita"],
  ["PITA WITH CHICKEN KEBAB", "chicken-kebab-pita"],
];

for (const [alias, id] of BAR_POSTER_ALIASES) {
  registerLocalItemAliases(id, [alias]);
}
for (const [alias, id] of FOOD_POSTER_ALIASES) {
  registerLocalItemAliases(id, [alias]);
}

function lookupLocalId(posterName: string): string | null {
  const key = normalizePosterLookupKey(posterName);
  if (!key) return null;

  const exact = POSTER_ALIAS_TO_LOCAL_ID.get(key);
  if (exact) return exact;

  let bestId: string | null = null;
  let bestLen = 0;
  for (const [alias, id] of POSTER_ALIAS_TO_LOCAL_ID) {
    if (alias.length < 5) continue;
    if (!key.includes(alias) && !alias.includes(key)) continue;
    if (alias.length > bestLen) {
      bestLen = alias.length;
      bestId = id;
    }
  }
  return bestId;
}

export function isExcludedPosterProduct(categoryName: string, productName: string): boolean {
  const haystack = `${categoryName} ${productName}`.toLowerCase();
  if (/кальян|hookah|shisha/i.test(haystack)) return true;
  if (categoryName.trim().toUpperCase() === "SAUCES") return true;
  return false;
}

export function matchLocalBarItem(posterName: string): MenuItem | null {
  const localId = lookupLocalId(posterName);
  if (!localId) return null;
  return BAR_BY_ID.get(localId) ?? null;
}

export function matchLocalFoodItem(
  posterName: string,
  categoryName = "",
): LocalFoodCatalogItem | null {
  const category = categoryName.trim().toUpperCase();
  const key = normalizePosterLookupKey(posterName);

  if (category === "HOT DOGS" && key === "classic") {
    return FOOD_BY_ID.get("simple-hot-dog") ?? null;
  }

  const localId = lookupLocalId(posterName);
  if (!localId) return null;
  return FOOD_BY_ID.get(localId) ?? null;
}

export function getLocalBarCatalogOrder(): string[] {
  return LOCAL_BAR_ITEMS.map((item) => item.id);
}

export function getLocalFoodCatalogOrder(): string[] {
  return FOOD_MENU_CATALOG.map((item) => item.id);
}

export function getLocalBarCatalog(): MenuItem[] {
  return LOCAL_BAR_ITEMS;
}

export function getLocalFoodCatalog(): LocalFoodCatalogItem[] {
  return FOOD_MENU_CATALOG;
}
