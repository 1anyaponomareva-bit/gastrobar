import type { FoodMenuCategoryId } from "./categoryMap";

/** Локальное gastrofood-меню (как на /food) — только для poster-test. */
export type LocalFoodCatalogItem = {
  id: string;
  name: string;
  description: string;
  image: string;
  category: FoodMenuCategoryId;
  grammage?: string;
  badge?: "hit";
  price?: number | null;
  priceMin?: number | null;
  priceMax?: number | null;
};

export const FOOD_MENU_CATALOG: LocalFoodCatalogItem[] = [
  {
    id: "chicken-wings",
    name: "Куриные крылья",
    description:
      "Куриные крылья, маринованные в пиве и обжаренные до золотистой корочки.",
    price: 110000,
    grammage: "200 г",
    category: "appetizers",
    image: "/food/menu/Original Wings+ .png",
  },
  {
    id: "mozzarella-sticks",
    name: "Сырные палочки",
    description:
      "Обжаренные до золотистой корочки палочки из моцареллы с томатным соусом.",
    price: 120000,
    category: "appetizers",
    image: "/food/menu/cheese-sticks.png",
  },
  {
    id: "chicken-nuggets",
    name: "Наггетсы",
    description: "Хрустящие наггетсы из куриного бедра.",
    price: 80000,
    grammage: "200 г",
    category: "appetizers",
    badge: "hit",
    image: "/food/menu/NUGGETS.png",
  },
  {
    id: "crispy-fish-bites",
    name: "Хрустящие рыбные кусочки",
    description:
      "Хрустящие кусочки рыбы Баса в панировке, подаются с соусом тартар.",
    price: 100000,
    grammage: "190 г",
    category: "appetizers",
    badge: "hit",
    image: "/food/menu/FISH-BITES.png",
  },
  {
    id: "french-fries",
    name: "Картофель фри",
    description: "Хрустящий картофель фри.",
    price: 40000,
    grammage: "120 г",
    category: "appetizers",
    image: "/food/menu/FRENCH-FRIES.png",
  },
  {
    id: "creamy-chicken-soup",
    name: "Куриный суп",
    description:
      "Нежный куриный суп с вермишелью и бархатистым бульоном на основе йогурта.",
    price: 90000,
    grammage: "350 г",
    category: "appetizers",
    image: "/food/menu/Creamy Chicken Soup.png",
  },
  {
    id: "chicken-jerky",
    name: "Джерки куриные",
    description: "Пряные вяленые куриные джерки. Идеально к пиву.",
    price: 95000,
    category: "snacks",
    image: "/menu/food-chicken-jerky-horizontal-hero.png",
  },
  {
    id: "beef-jerky",
    name: "Джерки говядина",
    description: "Вяленая говядина с пряностями. Насыщенный вкус к пиву.",
    price: 115000,
    category: "snacks",
    image: "/menu/food-beef-jerky-horizontal-hero.png",
  },
  {
    id: "pistachios",
    name: "Фисташки",
    description: "Обжаренные солёные фисташки к пиву и коктейлям.",
    price: 55000,
    category: "snacks",
    image: "/menu/food-pistachios-horizontal-hero.png",
  },
  {
    id: "peanuts",
    name: "Арахис",
    description: "Хрустящий солёный арахис. Классический барный снэк.",
    price: 45000,
    category: "snacks",
    image: "/menu/food-peanuts-horizontal-hero.png",
  },
  {
    id: "simple-hot-dog",
    name: "Классический",
    description: "Сосиска, булка, кетчуп.",
    price: 60000,
    category: "hot-dogs",
    image: "/food/menu/KIDS-HOT-DOG.png",
  },
  {
    id: "classic-hot-dog",
    name: "Датский",
    description:
      "Жареный лук, маринованный огурец, майонез, кетчуп, горчица и сушёный лук.",
    priceMin: 80000,
    priceMax: 120000,
    category: "hot-dogs",
    badge: "hit",
    image: "/food/menu/CLASSIC-HOT-DOG.png",
  },
  {
    id: "cheddar-bacon-dog",
    name: "Чеддер Бекон",
    description:
      "Жареный лук, маринованные огурцы, сырный соус, кетчуп, горчица, бекон и сушёный лук.",
    priceMin: 90000,
    priceMax: 130000,
    category: "hot-dogs",
    badge: "hit",
    image: "/food/menu/HOT-DOG_becon.png",
  },
  {
    id: "jalapeno-cheddar-dog",
    name: "Халапеньо Чеддер",
    description:
      "Жареный лук, сырный соус, кетчуп, халапеньо и сушёный лук.",
    priceMin: 90000,
    priceMax: 130000,
    category: "hot-dogs",
    badge: "hit",
    image: "/food/menu/HOT-DOG_halapen.png",
  },
  {
    id: "bavarian-dog",
    name: "Квашенная капуста горчица",
    description: "Квашенная капуста, майонез, горчица и сушёный лук.",
    priceMin: 90000,
    priceMax: 130000,
    category: "hot-dogs",
    image: "/food/menu/HOT-DOG_bov.png",
  },
  {
    id: "bbq-bacon-dog",
    name: "BBQ Бекон",
    description:
      "Жареный лук, маринованный огурец, майонез, соус BBQ, горчица, бекон и сушёный лук.",
    priceMin: 90000,
    priceMax: 130000,
    category: "hot-dogs",
    image: "/food/menu/HOT-DOG_bbq.png",
  },
  {
    id: "philly-cheesesteak",
    name: "Чизстейк Дог",
    description:
      "Тонко нарезанный говяжий стейк, расплавленный сыр, жареный лук и болгарский перец.",
    price: 150000,
    grammage: "280 г",
    category: "hot-dogs",
    badge: "hit",
    image: "/food/menu/phillycheesesteak.png",
  },
  {
    id: "classic-burger",
    name: "Классик Бургер",
    description:
      "Соус для бургеров, салат, помидор, котлета, маринованные огурцы, маринованный лук и соус для бургеров.",
    price: 200000,
    grammage: "300 г",
    category: "burgers",
    badge: "hit",
    image: "/food/menu/burger-classic.png",
  },
  {
    id: "cheeseburger",
    name: "Чизбургер",
    description:
      "Соус для бургеров, салат, помидор, котлета, сырный соус, маринованные огурцы, маринованный лук и соус для бургеров.",
    price: 220000,
    grammage: "310 г",
    category: "burgers",
    badge: "hit",
    image: "/food/menu/CHEESEBURGER.png",
  },
  {
    id: "signature-burger",
    name: "GASTROBURGER",
    description:
      "Соус BBQ, маринованные огурцы слайсы, котлета, сырный соус, хрустящий бекон, жареный лук, жареные грибы, соус BBQ. Подаётся с влажной салфеткой и одноразовыми перчатками.",
    price: 240000,
    grammage: "370 г",
    category: "burgers",
    badge: "hit",
    image: "/food/menu/GASTROBURGER.jpg",
  },
  {
    id: "fish-burger",
    name: "Фишбургер",
    description:
      "Соус тартар, маринованные огурцы, котлета, квашенная капуста, жареный лук и соус тартар.",
    price: 160000,
    grammage: "320 г",
    category: "burgers",
    image: "/food/menu/fishburger.png",
  },
  {
    id: "burger-combo",
    name: "Бургер Комбо",
    description: "Классический бургер, картофель фри и напиток.",
    price: null,
    category: "combos",
    badge: "hit",
    image: "/food/menu/combo_burger.png",
  },
  {
    id: "hot-dog-combo",
    name: "Hot Dog Combo",
    description: "Датский Hot Dog, картофель фри и напиток.",
    price: null,
    category: "combos",
    badge: "hit",
    image: "/food/menu/hot-dog_combo.png",
  },
  {
    id: "wings-combo",
    name: "Комбо с крыльями",
    description: "Куриные крылья, картофель фри и напиток.",
    price: null,
    category: "combos",
    badge: "hit",
    image: "/food/menu/wings_combo.png",
  },
  {
    id: "kids-nuggets-combo",
    name: "Детский комбо с наггетсами",
    description:
      "Наггетсы, картофель фри, сок или напиток и игрушка-сюрприз.",
    price: null,
    category: "kids",
    badge: "hit",
    image: "/food/menu/KIDS-COMBO-NUGGETS.png",
  },
  {
    id: "kids-hot-dog-combo",
    name: "Детский комбо с Hot Dog",
    description: "Классический Hot Dog, картофель фри и игрушка-сюрприз.",
    price: null,
    category: "kids",
    badge: "hit",
    image: "/food/menu/KIDS-COMBO-SAUSAGE.png",
  },
  {
    id: "kids-soup-combo",
    name: "Детский комбо с супом",
    description: "Куриный суп, картофель фри и игрушка-сюрприз.",
    price: null,
    category: "kids",
    badge: "hit",
    image: "/food/menu/KIDS-COMBO-SOUP.png",
  },
  {
    id: "chicken-kebab",
    name: "Куриный шашлык",
    description: "Маринованный куриный шашлык на гриле с томатным соусом.",
    price: 110000,
    grammage: "120 г",
    category: "grill",
    image: "/food/menu/KUR_kebab_bread.png",
  },
  {
    id: "pork-kebab",
    name: "Свиной шашлык",
    description: "Сочный маринованный шашлык из свинины с томатным соусом.",
    price: 120000,
    grammage: "120 г",
    category: "grill",
    image: "/food/menu/pork_kebab_bread.png",
  },
  {
    id: "bavarian-sausage",
    name: "Баварская колбаска",
    description:
      "Свиная колбаска на гриле с картофелем фри, тушеной квашеной капустой и томатным соусом.",
    price: null,
    grammage: "370 г",
    category: "grill",
    image: "/food/menu/Bavarian Sausage.png",
  },
  {
    id: "cheddar-jalapeno-sausage",
    name: "Колбаска Чеддер и Халапеньо",
    description:
      "Свиная колбаска с сыром чеддер и халапеньо, подается с картофелем фри, тушеной квашеной капустой и томатным соусом.",
    price: null,
    grammage: "370 г",
    category: "grill",
    image: "/food/menu/Cheddar Jalapeño Sausage.png",
  },
  {
    id: "grilled-chicken-sausage",
    name: "Куриная гриль-колбаска",
    description:
      "Куриная колбаска на гриле с картофелем фри, тушёной квашеной капустой и томатным соусом.",
    price: null,
    grammage: "370 г",
    category: "grill",
    image: "/food/menu/Grilled Chicken Sausage.png",
  },
];
