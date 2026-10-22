import type { StaffInventoryVenue } from "@/data/staffInventoryItems";
import type { StaffAppLang } from "@/lib/staffInventoryI18n";

export type StaffStockItem = {
  id: string;
  name: Record<StaffAppLang, string>;
};

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
      en: "Classic Sausage",
      ru: "Классическая сосиска",
      vn: "Xúc xích cổ điển",
    },
  },
  {
    id: "french-fries",
    name: { en: "French Fries", ru: "Картофель фри", vn: "Khoai tây chiên" },
  },
  {
    id: "fish-bites",
    name: { en: "Fish Bites", ru: "Рыбные кусочки", vn: "Cá viên" },
  },
  {
    id: "fish-patties",
    name: { en: "Fish Patties", ru: "Рыбные котлеты", vn: "Chả cá" },
  },
  {
    id: "mozzarella-sticks",
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
