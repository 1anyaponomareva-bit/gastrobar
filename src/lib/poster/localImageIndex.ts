import { MENU_ITEMS } from "@/data/menu";
import {
  POSTER_PLACEHOLDER_IMAGE_BAR,
  POSTER_PLACEHOLDER_IMAGE_FOOD,
} from "./constants";

/** Нормализованное имя → путь к локальной картинке. */
const BAR_IMAGE_BY_NAME = new Map<string, string>();
const FOOD_IMAGE_BY_NAME = new Map<string, string>();

export function normalizePosterLookupKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/hot\s*dog/g, "hotdog")
    .replace(/ё/g, "е")
    .replace(/[^a-z0-9а-я]/g, "");
}

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
  { name: "Куриный суп", image: "/food/menu/Creamy Chicken Soup.png" },
  { name: "CREAMY CHICKEN SOUP", image: "/food/menu/Creamy Chicken Soup.png" },
  { name: "Джерки куриные", image: "/menu/food-chicken-jerky-horizontal-hero.png" },
  { name: "Джерки говядина", image: "/menu/food-beef-jerky-horizontal-hero.png" },
  { name: "Фисташки", image: "/menu/food-pistachios-horizontal-hero.png" },
  { name: "Арахис", image: "/menu/food-peanuts-horizontal-hero.png" },
  { name: "Классический Hot Dog", image: "/food/menu/KIDS-HOT-DOG.png" },
  { name: "CLASSIC HOT DOG", image: "/food/menu/CLASSIC-HOT-DOG.png" },
  { name: "Датский Hot Dog", image: "/food/menu/CLASSIC-HOT-DOG.png" },
  { name: "DANISH HOT DOG", image: "/food/menu/CLASSIC-HOT-DOG.png" },
  { name: "Чеддер Бекон", image: "/food/menu/HOT-DOG_becon.png" },
  { name: "Халапеньо Чеддер", image: "/food/menu/HOT-DOG_halapen.png" },
  { name: "Квашенная капуста горчица", image: "/food/menu/HOT-DOG_bov.png" },
  { name: "BBQ Бекон", image: "/food/menu/HOT-DOG_bbq.png" },
  { name: "Чизстейк Дог", image: "/food/menu/phillycheesesteak.png" },
  { name: "Классик Бургер", image: "/food/menu/burger-classic.png" },
  { name: "CLASSIC BURGER", image: "/food/menu/burger-classic.png" },
  { name: "Чизбургер", image: "/food/menu/CHEESEBURGER.png" },
  { name: "CHEESEBURGER", image: "/food/menu/CHEESEBURGER.png" },
  { name: "GASTROBURGER", image: "/food/menu/GASTROBURGER.jpg" },
  { name: "Фишбургер", image: "/food/menu/fishburger.png" },
  { name: "FISH BURGER", image: "/food/menu/fishburger.png" },
  { name: "Бургер Комбо", image: "/food/menu/combo_burger.png" },
  { name: "Hot Dog Combo", image: "/food/menu/hot-dog_combo.png" },
  { name: "Комбо с крыльями", image: "/food/menu/wings_combo.png" },
  { name: "Куриный шашлык", image: "/food/menu/KUR_kebab_bread.png" },
  { name: "CHICKEN KEBAB", image: "/food/menu/KUR_kebab_bread.png" },
  { name: "Свиной шашлык", image: "/food/menu/pork_kebab_bread.png" },
  { name: "PORK KEBAB", image: "/food/menu/pork_kebab_bread.png" },
  { name: "Баварская колбаска", image: "/food/menu/Bavarian Sausage.png" },
  { name: "Колбаска Чеддер и Халапеньо", image: "/food/menu/Cheddar Jalapeño Sausage.png" },
  { name: "Куриная гриль-колбаска", image: "/food/menu/Grilled Chicken Sausage.png" },
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
