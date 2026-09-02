import type { FoodMenuCategoryId } from "./categoryMap";
import { foodMenuImage } from "./foodMenuImage";

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
    image: foodMenuImage("grab/chicken-wings.jpg"),
  },
  {
    id: "mozzarella-sticks",
    name: "Сырные палочки",
    description:
      "Обжаренные до золотистой корочки палочки из моцареллы с томатным соусом.",
    price: 100000,
    category: "appetizers",
    image: foodMenuImage("grab/mozzarella-sticks.jpg"),
  },
  {
    id: "chicken-nuggets",
    name: "Наггетсы",
    description: "Хрустящие наггетсы из куриного бедра.",
    price: 80000,
    grammage: "200 г",
    category: "appetizers",
    badge: "hit",
    image: foodMenuImage("grab/chicken-nuggets.jpg"),
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
    image: foodMenuImage("grab/crispy-fish-bites.jpg"),
  },
  {
    id: "french-fries",
    name: "Картофель фри",
    description: "Хрустящий картофель фри.",
    price: 40000,
    grammage: "120 г",
    category: "appetizers",
    image: foodMenuImage("grab/french-fries.jpg"),
  },
  {
    id: "simple-hot-dog",
    name: "Собери свой Hot Dog",
    description: "Выберите сосиску, добавки и соусы по своему вкусу.",
    price: 60000,
    category: "hot-dogs",
    image: foodMenuImage("grab/simple-hot-dog.jpg"),
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
    image: foodMenuImage("grab/classic-hot-dog.jpg"),
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
    image: foodMenuImage("grab/cheddar-bacon-dog.png"),
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
    image: foodMenuImage("grab/jalapeno-cheddar-dog.jpg"),
  },
  {
    id: "bavarian-dog",
    name: "Квашенная капуста горчица",
    description: "Квашенная капуста, майонез, горчица и сушёный лук.",
    priceMin: 90000,
    priceMax: 120000,
    category: "hot-dogs",
    image: foodMenuImage("grab/bavarian-dog.jpg"),
  },
  {
    id: "bbq-bacon-dog",
    name: "BBQ Бекон",
    description:
      "Жареный лук, маринованный огурец, майонез, соус BBQ, горчица, бекон и сушёный лук.",
    priceMin: 90000,
    priceMax: 120000,
    category: "hot-dogs",
    image: foodMenuImage("grab/bbq-bacon-dog.jpg"),
  },
  {
    id: "philly-cheesesteak",
    name: "Чизстейк Дог",
    description:
      "Тонко нарезанный говяжий стейк, расплавленный сыр, жареный лук и болгарский перец.",
    price: 120000,
    grammage: "280 г",
    category: "hot-dogs",
    badge: "hit",
    image: foodMenuImage("grab/philly-cheesesteak.png"),
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
    image: foodMenuImage("grab/classic-burger.jpg"),
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
    image: foodMenuImage("grab/cheeseburger.jpg"),
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
    image: foodMenuImage("grab/signature-burger.png"),
  },
  {
    id: "fish-burger",
    name: "Фишбургер",
    description:
      "Соус тартар, маринованные огурцы, котлета, квашенная капуста, жареный лук и соус тартар.",
    price: 140000,
    grammage: "320 г",
    category: "burgers",
    image: foodMenuImage("grab/fish-burger.jpg"),
  },
  {
    id: "burger-combo",
    name: "Чизбургер Комбо",
    description: "Чизбургер, картофель фри и напиток.",
    price: 230000,
    category: "combos",
    badge: "hit",
    image: foodMenuImage("grab/burger-combo.jpg"),
  },
  {
    id: "hot-dog-combo",
    name: "Hot Dog Combo",
    description: "Любой классический Hot Dog, картофель фри и напиток.",
    price: 140000,
    category: "combos",
    badge: "hit",
    image: foodMenuImage("grab/hot-dog-combo.jpg"),
  },
  {
    id: "cheese-steak-dog-combo",
    name: "Cheese Steak Dog Combo",
    description: "Cheese Steak Dog, картофель фри и напиток.",
    price: 170000,
    category: "combos",
    badge: "hit",
    image: foodMenuImage("grab/cheese-steak-dog-combo.jpg"),
  },
  {
    id: "pita-kebab-combo",
    name: "Пита Кебаб Комбо",
    description:
      "Пита с кебабом на выбор — курица или свинина, картофель фри и напиток.",
    price: 170000,
    category: "combos",
    badge: "hit",
    image: foodMenuImage("grab/pita-kebab-combo.jpg"),
  },
  {
    id: "family-combo",
    name: "Семейное комбо",
    description:
      "На выбор классический бургер или чизбургер, плюс гарнир и напитки.",
    price: 550000,
    category: "combos",
    badge: "hit",
    image: foodMenuImage("grab/family-combo.jpg"),
  },
  {
    id: "kids-nuggets-combo",
    name: "Детский комбо с наггетсами",
    description:
      "Наггетсы, картофель фри, сок или напиток и игрушка-сюрприз.",
    price: 140000,
    category: "kids",
    badge: "hit",
    image: foodMenuImage("grab/kids-nuggets-combo.jpg"),
  },
  {
    id: "kids-hot-dog-combo",
    name: "Детский комбо с Hot Dog",
    description: "Классический Hot Dog, картофель фри и игрушка-сюрприз.",
    price: 140000,
    category: "kids",
    badge: "hit",
    image: foodMenuImage("grab/kids-hot-dog-combo.jpg"),
  },
  {
    id: "chicken-kebab",
    name: "Бокс с куриным шашлыком",
    description: "Бокс с маринованным куриным шашлыком на гриле с томатным соусом.",
    price: 130000,
    category: "grill",
    image: foodMenuImage("grab/chicken-kebab.png"),
  },
  {
    id: "pork-kebab",
    name: "Бокс со свиным шашлыком",
    description: "Бокс с сочным маринованным шашлыком из свинины с томатным соусом.",
    price: 120000,
    category: "grill",
    image: foodMenuImage("grab/pork-kebab.png"),
  },
  {
    id: "pork-kebab-pita",
    name: "Пита со свиным шашлыком",
    description: "Пита со свиным шашлыком на гриле, свежими овощами и соусом.",
    price: 110000,
    category: "grill",
    image: foodMenuImage("grab/pork-kebab-pita.png"),
  },
  {
    id: "chicken-kebab-pita",
    name: "Пита с куриным шашлыком",
    description: "Пита с куриным шашлыком на гриле, свежими овощами и соусом.",
    price: 120000,
    category: "grill",
    image: foodMenuImage("grab/chicken-kebab-pita.png"),
  },
  {
    id: "bavarian-sausage",
    name: "Бокс со свиными сосисками",
    description: "Бокс со свиными сосисками на гриле.",
    price: 140000,
    category: "grill",
    image: foodMenuImage("grab/bavarian-sausage.png"),
  },
  {
    id: "cheddar-jalapeno-sausage",
    name: "Бокс со свиными сосисками с сыром",
    description: "Бокс со свиными сосисками с сыром на гриле.",
    price: 140000,
    category: "grill",
    image: foodMenuImage("grab/cheddar-jalapeno-sausage.png"),
  },
  {
    id: "grilled-chicken-sausage",
    name: "Бокс с куриными сосисками",
    description: "Бокс с куриными сосисками на гриле.",
    price: 140000,
    category: "grill",
    image: foodMenuImage("grab/grilled-chicken-sausage.png"),
  },
];
