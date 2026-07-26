import { MENU_ITEMS } from "@/data/menu";
import {
  POSTER_PLACEHOLDER_IMAGE_BAR,
  POSTER_PLACEHOLDER_IMAGE_FOOD,
} from "./constants";
import { normalizePosterLookupKey } from "./localMenuMatch";

export { normalizePosterLookupKey };

const BAR_IMAGE_BY_NAME = new Map<string, string>();
const FOOD_IMAGE_BY_NAME = new Map<string, string>();

function addImageEntry(map: Map<string, string>, name: string, image: string) {
  const key = normalizePosterLookupKey(name);
  if (key) map.set(key, image);
}

for (const item of MENU_ITEMS) {
  addImageEntry(BAR_IMAGE_BY_NAME, item.name, item.imageList ?? item.image);
}

/** Gastrofood: имена и картинки из текущего локального меню (+ имена из Poster POS). */
const FOOD_LOCAL_ENTRIES: Array<{ name: string; image: string }> = [
  { name: "Куриные крылья", image: "/food/menu/Original Wings+ .png" },
  { name: "CHICKEN WINGS", image: "/food/menu/Original Wings+ .png" },
  { name: "Сырные палочки", image: "/food/menu/cheese-sticks.png" },
  { name: "MOZZARELLA STICKS", image: "/food/menu/cheese-sticks.png" },
  { name: "Наггетсы", image: "/food/menu/NUGGETS.png" },
  { name: "CHICKEN NUGGETS", image: "/food/menu/NUGGETS.png" },
  { name: "Хрустящие рыбные кусочки", image: "/food/menu/FISH-BITES.png" },
  { name: "CRISPY FISH BITES", image: "/food/menu/FISH-BITES.png" },
  { name: "Картофель фри", image: "/food/menu/FRENCH-FRIES.png" },
  { name: "FRENCH FRIES", image: "/food/menu/FRENCH-FRIES.png" },
  { name: "Куриный суп", image: "/food/menu/Creamy%20Chicken%20Soup.png?v=20260722-02" },
  { name: "CREAMY CHICKEN SOUP", image: "/food/menu/Creamy%20Chicken%20Soup.png?v=20260722-02" },
  { name: "Джерки куриные", image: "/menu/food-chicken-jerky-horizontal-hero.png" },
  { name: "Джерки говядина", image: "/menu/food-beef-jerky-horizontal-hero.png" },
  { name: "Фисташки", image: "/menu/food-pistachios-horizontal-hero.png" },
  { name: "Арахис", image: "/menu/food-peanuts-horizontal-hero.png" },
  { name: "Собери свой Hot Dog", image: "/food/menu/KIDS-HOT-DOG.png" },
  { name: "CLASSIC HOT DOG", image: "/food/menu/CLASSIC-HOT-DOG.png" },
  { name: "Датский Hot Dog", image: "/food/menu/CLASSIC-HOT-DOG.png" },
  { name: "DANISH HOT DOG", image: "/food/menu/CLASSIC-HOT-DOG.png" },
  { name: "Чеддер Бекон", image: "/food/menu/HOT-DOG_becon.png" },
  { name: "Халапеньо Чеддер", image: "/food/menu/HOT-DOG_halapen.png" },
  { name: "Квашенная капуста горчица", image: "/food/menu/HOT-DOG_bov.png" },
  { name: "BBQ Бекон", image: "/food/menu/HOT-DOG_bbq.png" },
  { name: "Чизстейк Дог", image: "/food/menu/phillycheesesteak.png" },
  { name: "Классик Бургер", image: "/food/menu/burger-classic.png" },
  { name: "Бургер из сочной говядины", image: "/food/menu/burger-classic.png" },
  { name: "CLASSIC BURGER", image: "/food/menu/burger-classic.png" },
  { name: "Чизбургер", image: "/food/menu/CHEESEBURGER.png" },
  { name: "CHEESEBURGER", image: "/food/menu/CHEESEBURGER.png" },
  { name: "GASTROBURGER", image: "/food/menu/GASTROBURGER.jpg?v=20260722-02" },
  { name: "Фишбургер", image: "/food/menu/fishburger.png" },
  { name: "FISH BURGER", image: "/food/menu/fishburger.png" },
  { name: "Бургер Комбо", image: "/food/menu/combo_burger.png?v=20260726-01" },
  { name: "Hot Dog Combo", image: "/food/menu/COMBO_hotdog.png?v=20260726-01" },
  { name: "Комбо с крыльями", image: "/food/menu/wings_combo.png" },
  { name: "Семейное комбо", image: "/food/menu/family_combo.png?v=20260726-01" },
  { name: "FAMILY COMBO", image: "/food/menu/family_combo.png?v=20260726-01" },
  { name: "Куриный шашлык", image: "/food/menu/KUR_KEBAB_1.jpg?v=20260726-01" },
  { name: "Бокс с куриным шашлыком", image: "/food/menu/KUR_KEBAB_1.jpg?v=20260726-01" },
  { name: "CHICKEN KEBAB", image: "/food/menu/KUR_KEBAB_1.jpg?v=20260726-01" },
  { name: "Свиной шашлык", image: "/food/menu/PORK_KEBAB_1.jpg?v=20260726-01" },
  { name: "Бокс со свиным шашлыком", image: "/food/menu/PORK_KEBAB_1.jpg?v=20260726-01" },
  { name: "PORK KEBAB", image: "/food/menu/PORK_KEBAB_1.jpg?v=20260726-01" },
  { name: "Пита со свиным шашлыком", image: "/food/menu/PORK_PITA.jpg?v=20260726-01" },
  { name: "PORK PITA", image: "/food/menu/PORK_PITA.jpg?v=20260726-01" },
  { name: "Пита с куриным шашлыком", image: "/food/menu/CHICK_PITA.jpg?v=20260726-01" },
  { name: "CHICKEN PITA", image: "/food/menu/CHICK_PITA.jpg?v=20260726-01" },
  { name: "Бокс со свиными сосисками", image: "/food/menu/SOS_PORK.jpg?v=20260726-01" },
  { name: "Бокс со свиными сосисками с сыром", image: "/food/menu/SOS_CHALAP.jpg?v=20260726-01" },
  { name: "Бокс с куриными сосисками", image: "/food/menu/SOS_KUR.jpg?v=20260726-01" },
  { name: "Баварская колбаска", image: "/food/menu/SOS_PORK.jpg?v=20260726-01" },
  { name: "Колбаска Чеддер и Халапеньо", image: "/food/menu/SOS_CHALAP.jpg?v=20260726-01" },
  { name: "Куриная гриль-колбаска", image: "/food/menu/SOS_KUR.jpg?v=20260726-01" },
  { name: "BAVARIAN SAUSAGE", image: "/food/menu/SOS_PORK.jpg?v=20260726-01" },
  { name: "CHEDDAR JALAPENO SAUSAGE", image: "/food/menu/SOS_CHALAP.jpg?v=20260726-01" },
  { name: "GRILLED CHICKEN SAUSAGE", image: "/food/menu/SOS_KUR.jpg?v=20260726-01" },
];

for (const entry of FOOD_LOCAL_ENTRIES) {
  addImageEntry(FOOD_IMAGE_BY_NAME, entry.name, entry.image);
}

function findInMap(map: Map<string, string>, productName: string): string | null {
  const key = normalizePosterLookupKey(productName);
  if (!key) return null;

  const exact = map.get(key);
  if (exact) return exact;

  for (const [localKey, image] of map.entries()) {
    if (key.includes(localKey) || localKey.includes(key)) {
      return image;
    }
  }

  return null;
}

export function resolveLocalBarImage(productName: string): string {
  return findInMap(BAR_IMAGE_BY_NAME, productName) ?? POSTER_PLACEHOLDER_IMAGE_BAR;
}

export function resolveLocalFoodImage(productName: string): string {
  return findInMap(FOOD_IMAGE_BY_NAME, productName) ?? POSTER_PLACEHOLDER_IMAGE_FOOD;
}
