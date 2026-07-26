import type { FoodMenuCategoryId } from "./categoryMap";
import { barMenuImage, foodMenuImage } from "./foodMenuImage";

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
    image: foodMenuImage("Original Wings+ .png"),
  },
  {
    id: "mozzarella-sticks",
    name: "Сырные палочки",
    description:
      "Обжаренные до золотистой корочки палочки из моцареллы с томатным соусом.",
    price: 100000,
    category: "appetizers",
    image: foodMenuImage("cheese-sticks.png"),
  },
  {
    id: "chicken-nuggets",
    name: "Наггетсы",
    description: "Хрустящие наггетсы из куриного бедра.",
    price: 80000,
    grammage: "200 г",
    category: "appetizers",
    badge: "hit",
    image: foodMenuImage("NUGGETS.png"),
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
    image: foodMenuImage("FISH-BITES.png"),
  },
  {
    id: "french-fries",
    name: "Картофель фри",
    description: "Хрустящий картофель фри.",
    price: 40000,
    grammage: "120 г",
    category: "appetizers",
    image: foodMenuImage("FRENCH-FRIES.png"),
  },
  {
    id: "creamy-chicken-soup",
    name: "Куриный суп",
    description:
      "Нежный куриный суп с вермишелью и бархатистым бульоном на основе йогурта.",
    price: 60000,
    grammage: "350 г",
    category: "appetizers",
    image: foodMenuImage("Creamy Chicken Soup.png?v=20260722-02"),
  },
  {
    id: "chicken-jerky",
    name: "Джерки куриные",
    description: "Пряные вяленые куриные джерки. Идеально к пиву.",
    price: 95000,
    category: "snacks",
    image: barMenuImage("/menu/food-chicken-jerky-horizontal-hero.png"),
  },
  {
    id: "beef-jerky",
    name: "Джерки говядина",
    description: "Вяленая говядина с пряностями. Насыщенный вкус к пиву.",
    price: 115000,
    category: "snacks",
    image: barMenuImage("/menu/food-beef-jerky-horizontal-hero.png"),
  },
  {
    id: "pistachios",
    name: "Фисташки",
    description: "Обжаренные солёные фисташки к пиву и коктейлям.",
    price: 55000,
    category: "snacks",
    image: barMenuImage("/menu/food-pistachios-horizontal-hero.png"),
  },
  {
    id: "peanuts",
    name: "Арахис",
    description: "Хрустящий солёный арахис. Классический барный снэк.",
    price: 45000,
    category: "snacks",
    image: barMenuImage("/menu/food-peanuts-horizontal-hero.png"),
  },
  {
    id: "simple-hot-dog",
    name: "Собери свой Hot Dog",
    description: "Выберите сосиску, добавки и соусы по своему вкусу.",
    price: 60000,
    category: "hot-dogs",
    image: foodMenuImage("KIDS-HOT-DOG.png"),
  },
  {
    id: "classic-hot-dog",
    name: "Датский",
    description:
      "Жареный лук, маринованный огурец, майонез, кетчуп, горчица и сушёный лук.",
    priceMin: 90000,
    priceMax: 120000,
    category: "hot-dogs",
    badge: "hit",
    image: foodMenuImage("CLASSIC-HOT-DOG.png"),
  },
  {
    id: "cheddar-bacon-dog",
    name: "Чеддер Бекон",
    description:
      "Жареный лук, маринованные огурцы, сырный соус, кетчуп, горчица, бекон и сушёный лук.",
    priceMin: 90000,
    priceMax: 120000,
    category: "hot-dogs",
    badge: "hit",
    image: foodMenuImage("HOT-DOG_becon.png"),
  },
  {
    id: "jalapeno-cheddar-dog",
    name: "Халапеньо Чеддер",
    description:
      "Жареный лук, сырный соус, кетчуп, халапеньо и сушёный лук.",
    priceMin: 90000,
    priceMax: 120000,
    category: "hot-dogs",
    badge: "hit",
    image: foodMenuImage("HOT-DOG_halapen.png"),
  },
  {
    id: "bavarian-dog",
    name: "Квашенная капуста горчица",
    description: "Квашенная капуста, майонез, горчица и сушёный лук.",
    priceMin: 90000,
    priceMax: 120000,
    category: "hot-dogs",
    image: foodMenuImage("HOT-DOG_bov.png"),
  },
  {
    id: "bbq-bacon-dog",
    name: "BBQ Бекон",
    description:
      "Жареный лук, маринованный огурец, майонез, соус BBQ, горчица, бекон и сушёный лук.",
    priceMin: 90000,
    priceMax: 120000,
    category: "hot-dogs",
    image: foodMenuImage("HOT-DOG_bbq.png"),
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
    image: foodMenuImage("phillycheesesteak.png"),
  },
  {
    id: "classic-burger",
    name: "Бургер из сочной говядины",
    description:
      "Соус для бургеров, салат, помидор, котлета, маринованные огурцы, маринованный лук и соус для бургеров.",
    price: 160000,
    grammage: "300 г",
    category: "burgers",
    badge: "hit",
    image: foodMenuImage("burger-classic.png?v=20250618-01"),
  },
  {
    id: "cheeseburger",
    name: "Чизбургер",
    description:
      "Соус для бургеров, салат, помидор, котлета, сырный соус, маринованные огурцы, маринованный лук и соус для бургеров.",
    price: 180000,
    grammage: "310 г",
    category: "burgers",
    badge: "hit",
    image: foodMenuImage("CHEESEBURGER.png?v=20250618-02"),
  },
  {
    id: "signature-burger",
    name: "GASTROBURGER",
    description:
      "Соус BBQ, маринованные огурцы слайсы, котлета, сырный соус, хрустящий бекон, жареный лук, жареные грибы, соус BBQ. Подаётся с влажной салфеткой и одноразовыми перчатками.",
    price: 200000,
    grammage: "370 г",
    category: "burgers",
    badge: "hit",
    image: foodMenuImage("GASTROBURGER.jpg?v=20260722-02"),
  },
  {
    id: "fish-burger",
    name: "Фишбургер",
    description:
      "Соус тартар, маринованные огурцы, котлета, квашенная капуста, жареный лук и соус тартар.",
    price: 140000,
    grammage: "320 г",
    category: "burgers",
    image: foodMenuImage("fishburger.png?v=20250618-01"),
  },
  {
    id: "burger-combo",
    name: "Бургер Комбо",
    description: "Классический бургер, картофель фри и напиток.",
    price: null,
    category: "combos",
    badge: "hit",
    image: foodMenuImage("combo_burger.png"),
  },
  {
    id: "hot-dog-combo",
    name: "Hot Dog Combo",
    description: "Датский Hot Dog, картофель фри и напиток.",
    price: null,
    category: "combos",
    badge: "hit",
    image: foodMenuImage("hot-dog_combo.png"),
  },
  {
    id: "wings-combo",
    name: "Комбо с крыльями",
    description: "Куриные крылья, картофель фри и напиток.",
    price: null,
    category: "combos",
    badge: "hit",
    image: foodMenuImage("wings_combo.png"),
  },
  {
    id: "kids-nuggets-combo",
    name: "Детский комбо с наггетсами",
    description:
      "Наггетсы, картофель фри, сок или напиток и игрушка-сюрприз.",
    price: 140000,
    category: "kids",
    badge: "hit",
    image: foodMenuImage("KIDS-COMBO-NUGGETS+.png?v=20260726-01"),
  },
  {
    id: "kids-hot-dog-combo",
    name: "Детский комбо с Hot Dog",
    description: "Классический Hot Dog, картофель фри и игрушка-сюрприз.",
    price: 140000,
    category: "kids",
    badge: "hit",
    image: foodMenuImage("KIDS-COMBO-SAUSAGE.png?v=20260726-01"),
  },
  {
    id: "chicken-kebab",
    name: "Бокс с куриным шашлыком",
    description: "Бокс с маринованным куриным шашлыком на гриле с томатным соусом.",
    price: 130000,
    category: "grill",
    image: foodMenuImage("KUR_KEBAB_1.jpg?v=20260726-01"),
  },
  {
    id: "pork-kebab",
    name: "Бокс со свиным шашлыком",
    description: "Бокс с сочным маринованным шашлыком из свинины с томатным соусом.",
    price: 120000,
    category: "grill",
    image: foodMenuImage("PORK_KEBAB_1.jpg?v=20260726-01"),
  },
  {
    id: "pork-kebab-pita",
    name: "Пита со свиным шашлыком",
    description: "Пита со свиным шашлыком на гриле, свежими овощами и соусом.",
    price: 110000,
    category: "grill",
    image: foodMenuImage("PORK_PITA.jpg?v=20260726-01"),
  },
  {
    id: "chicken-kebab-pita",
    name: "Пита с куриным шашлыком",
    description: "Пита с куриным шашлыком на гриле, свежими овощами и соусом.",
    price: 120000,
    category: "grill",
    image: foodMenuImage("CHICK_PITA.jpg?v=20260726-01"),
  },
  {
    id: "bavarian-sausage",
    name: "Бокс со свиными сосисками",
    description: "Бокс со свиными сосисками на гриле.",
    price: 140000,
    category: "grill",
    image: foodMenuImage("SOS_PORK.jpg?v=20260726-01"),
  },
  {
    id: "cheddar-jalapeno-sausage",
    name: "Бокс со свиными сосисками с сыром",
    description: "Бокс со свиными сосисками с сыром на гриле.",
    price: 140000,
    category: "grill",
    image: foodMenuImage("SOS_CHALAP.jpg?v=20260726-01"),
  },
  {
    id: "grilled-chicken-sausage",
    name: "Бокс с куриными сосисками",
    description: "Бокс с куриными сосисками на гриле.",
    price: 140000,
    category: "grill",
    image: foodMenuImage("SOS_KUR.jpg?v=20260726-01"),
  },
];
