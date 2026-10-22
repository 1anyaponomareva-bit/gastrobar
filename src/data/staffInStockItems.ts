import type { StaffInventoryVenue } from "@/data/staffInventoryItems";
import type { StaffAppLang } from "@/lib/staffInventoryI18n";

export type StaffStockItem = {
  id: string;
  name: Record<StaffAppLang, string>;
  noWarehouse?: boolean;
  unit?: StaffStockUnit;
  /** In-house amount below this value is flagged as PREP ORDER. */
  prepOrderBelow?: number;
};

export type StaffStockUnit = "bags" | "pcs" | "btl";

function sauce(id: string, en: string, ru: string, vn: string): StaffStockItem {
  return {
    id,
    noWarehouse: true,
    unit: "btl",
    prepOrderBelow: 1,
    name: { en, ru, vn },
  };
}

export function staffStockUnit(item: StaffStockItem): StaffStockUnit {
  return item.unit ?? "bags";
}

const GASTROFOOD_STOCK_ITEMS: StaffStockItem[] = [
  { id: "bacon", name: { en: "Bacon", ru: "Бекон", vn: "Thịt xông khói" } },
  {
    id: "beef-patty-200",
    name: {
      en: "Beef Patty (200g)",
      ru: "Говяжья котлета (200 г)",
      vn: "Bánh bò (200g)",
    },
  },
  {
    id: "beef-patty-120",
    name: {
      en: "Beef Patty (120g)",
      ru: "Говяжья котлета (120 г)",
      vn: "Bánh bò (120g)",
    },
  },
  {
    id: "beef-steak",
    name: { en: "Beef Steak", ru: "Говяжий стейк", vn: "Bít tết bò" },
  },
  {
    id: "chicken-thighs",
    name: { en: "Chicken Thighs", ru: "Куриные бёдра", vn: "Đùi gà" },
  },
  {
    id: "chicken-nuggets",
    noWarehouse: true,
    name: { en: "Chicken Nuggets", ru: "Куриные наггетсы", vn: "Gà viên chiên" },
  },
  {
    id: "chicken-sausages",
    name: { en: "Chicken Sausages", ru: "Куриные сосиски", vn: "Xúc xích gà" },
  },
  {
    id: "chicken-patty",
    name: { en: "Chicken Patty", ru: "Куриная котлета", vn: "Bánh gà" },
  },
  {
    id: "chicken-wings",
    name: { en: "Chicken Wings", ru: "Куриные крылья", vn: "Cánh gà" },
  },
  {
    id: "classic-sausage",
    name: {
      en: "Hot Dog Sausage",
      ru: "Сосиска для хот-дога",
      vn: "Xúc xích hot dog",
    },
  },
  {
    id: "french-fries",
    noWarehouse: true,
    name: { en: "French Fries", ru: "Картофель фри", vn: "Khoai tây chiên" },
  },
  {
    id: "fish-bites",
    noWarehouse: true,
    name: { en: "Fish Bites", ru: "Рыбные кусочки", vn: "Cá viên" },
  },
  {
    id: "fish-patties",
    noWarehouse: true,
    name: { en: "Fish Patties", ru: "Рыбные котлеты", vn: "Chả cá" },
  },
  {
    id: "mozzarella-sticks",
    noWarehouse: true,
    name: {
      en: "Mozzarella Sticks",
      ru: "Палочки моцареллы",
      vn: "Phô mai mozzarella que",
    },
  },
  {
    id: "pork-collar",
    name: { en: "Pork Collar", ru: "Свиная шея", vn: "Nạc vai heo" },
  },
  {
    id: "pork-patty",
    name: { en: "Pork Patty", ru: "Свиная котлета", vn: "Bánh heo" },
  },
  {
    id: "pork-sausage",
    name: { en: "Pork Sausage", ru: "Свиная сосиска", vn: "Xúc xích heo" },
  },
  {
    id: "pita-bread",
    noWarehouse: true,
    unit: "pcs",
    prepOrderBelow: 20,
    name: { en: "Pita Bread", ru: "Пита", vn: "Bánh mì pita" },
  },
  {
    id: "tortilla",
    noWarehouse: true,
    unit: "pcs",
    prepOrderBelow: 20,
    name: { en: "Tortilla", ru: "Тортилья", vn: "Bánh tortilla" },
  },
  sauce("sauce-cheese", "Sauce - Cheese (2L)", "Соус сырный (2 л)", "Sốt phô mai (2L)"),
  sauce("sauce-burger", "Sauce - Burger (2L)", "Соус бургерный (2 л)", "Sốt burger (2L)"),
  sauce("sauce-greek", "Sauce - Greek (2L)", "Соус греческий (2 л)", "Sốt Hy Lạp (2L)"),
  sauce(
    "sauce-tomato-herbs",
    "Sauce - Tomato&Herbs (2L)",
    "Соус томатный с травами (2 л)",
    "Sốt cà chua & thảo mộc (2L)",
  ),
  sauce("sauce-tartar", "Sauce - Tartar (2L)", "Соус тартар (2 л)", "Sốt tartar (2L)"),
  sauce(
    "sauce-honey-mustard",
    "Sauce - Honey Mustard (2L)",
    "Соус медово-горчичный (2 л)",
    "Sốt mù tạt mật ong (2L)",
  ),
  sauce(
    "sauce-onion-spread",
    "Sauce - Onion Spread (2L)",
    "Луковый спред (2 л)",
    "Sốt hành (2L)",
  ),
  sauce("salad-dressing", "Salad Dressing (2L)", "Заправка для салата (2 л)", "Sốt trộn salad (2L)"),
];

export const STAFF_STOCK_ITEMS_BY_VENUE: Record<
  StaffInventoryVenue,
  StaffStockItem[]
> = {
  gastrofood: GASTROFOOD_STOCK_ITEMS,
  gastrobar: [],
};

export function getStaffStockItems(venue: StaffInventoryVenue): StaffStockItem[] {
  return STAFF_STOCK_ITEMS_BY_VENUE[venue];
}
