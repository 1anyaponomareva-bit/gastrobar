import type { StaffInventoryVenue } from "@/data/staffInventoryItems";
import type { StaffAppLang } from "@/lib/staffInventoryI18n";

export type StaffStockItem = {
  id: string;
  name: Record<StaffAppLang, string>;
  /**
   * Free-text info shown to the right of the name (not a language translation).
   * Same for all UI languages.
   */
  note?: string;
  noWarehouse?: boolean;
  /** Still being produced in-house, so never flagged red. */
  noAlerts?: boolean;
  unit?: StaffStockUnit;
  /**
   * Pieces in one pack/bag (per item). From ERP order_pack_content_qty.
   * Prep Stock stores qty in pieces.
   */
  packSize?: number;
  /** ERP order_pack_type (bag / pack / túi…). Shown as «1 bag = 20 pcs». */
  packType?: string;
  /**
   * Weight of 1 piece in grams. Later from ERP product; Prep Stock TOTAL shows
   * unitWeightGrams × total pieces. Stub 0 until ERP weight is wired.
   */
  unitWeightGrams?: number;
  /** In-house amount at or below this value is flagged as PREP ORDER. */
  prepOrderAtOrBelow?: number;
  /** Warehouse amount at or below this value is flagged as FOOD ORDER (default 0). */
  warehouseOrderAtOrBelow?: number;
};

/** Single display name for the active UI language — never mixes EN+VN. */
export function staffStockLabel(
  item: { id: string; name: Partial<Record<StaffAppLang, string>> },
  lang: StaffAppLang,
): string {
  const picked = String(item.name[lang] || "").trim();
  if (picked) return picked;
  const en = String(item.name.en || "").trim();
  if (en) return en;
  const ru = String(item.name.ru || "").trim();
  if (ru) return ru;
  const vn = String(item.name.vn || "").trim();
  return vn || item.id;
}

/** Optional note to the right of the name (admin free text). */
export function staffStockNote(item: { note?: string | null }): string {
  return String(item.note || "").trim();
}

export type StaffStockUnit = "bags" | "pcs" | "btl";

/**
 * Temporary default until ERP supplies per-product pcs-per-pack.
 * UI must not hardcode this — always use staffStockPackSize(item).
 */
export const PREP_STOCK_DEFAULT_PACK_SIZE = 20;

function packed(
  partial: Omit<StaffStockItem, "packSize"> & { packSize?: number },
): StaffStockItem {
  return { packSize: PREP_STOCK_DEFAULT_PACK_SIZE, ...partial };
}

function sauce(id: string, en: string, ru: string, vn: string): StaffStockItem {
  return {
    id,
    noWarehouse: true,
    unit: "btl",
    prepOrderAtOrBelow: 1,
    name: { en, ru, vn },
  };
}

export function staffStockUnit(item: StaffStockItem): StaffStockUnit {
  return item.unit ?? "bags";
}

export function staffStockPackSize(item: StaffStockItem): number | null {
  const size = item.packSize;
  return typeof size === "number" && size > 1 ? size : null;
}

/** ERP packing container word (bag / pack / …). */
export function staffStockPackType(item: { packType?: string | null }): string {
  const raw = String(item.packType || "").trim();
  return raw || "pack";
}

export function splitPackQty(
  totalPieces: number,
  packSize: number,
): { packs: number; pcs: number; total: number } {
  const total = Math.max(0, Math.round(Number(totalPieces) || 0));
  const packs = Math.floor(total / packSize);
  return { packs, pcs: total - packs * packSize, total };
}

export function combinePackQty(packs: number, pcs: number, packSize: number): number {
  const p = Math.max(0, Math.round(Number(packs) || 0));
  const loose = Math.max(0, Math.round(Number(pcs) || 0));
  return p * packSize + loose;
}

export function formatPackQty(totalPieces: number, packSize: number, packType = "pack"): string {
  const word = String(packType || "pack").trim() || "pack";
  const { packs, pcs } = splitPackQty(totalPieces, packSize);
  if (packs <= 0 && pcs <= 0) return "0";
  if (packs <= 0) return `${pcs} pcs`;
  if (pcs <= 0) return `${packs} ${word}`;
  return `${packs} ${word} + ${pcs} pcs`;
}

/** «1 bag = 20 pcs» from ERP packing fields. */
export function formatPackRule(packSize: number, packType = "pack", unit = "pcs"): string {
  const word = String(packType || "pack").trim() || "pack";
  const u = String(unit || "pcs").trim() || "pcs";
  return `1 ${word} = ${packSize} ${u}`;
}

/** Grams for one piece — ERP later; currently 0 stub. */
export function staffStockUnitWeightGrams(item: StaffStockItem): number {
  const g = item.unitWeightGrams;
  return typeof g === "number" && Number.isFinite(g) && g > 0 ? g : 0;
}

export function staffStockTotalWeightGrams(item: StaffStockItem, totalPieces: number): number {
  const pcs = Math.max(0, Math.round(Number(totalPieces) || 0));
  return staffStockUnitWeightGrams(item) * pcs;
}

export type StaffStockTask = "FOOD ORDER" | "PREP ORDER";

/** Items without a warehouse and without a prep threshold are reordered at this level. */
const NO_WAREHOUSE_ORDER_AT_OR_BELOW = 1;

export function evaluateStaffStock(
  item: StaffStockItem,
  restaurant: number | null,
  warehouse: number | null,
): { lowInHouse: boolean; lowWarehouse: boolean; task: StaffStockTask | null } {
  if (item.noAlerts) {
    return { lowInHouse: false, lowWarehouse: false, task: null };
  }
  if (item.prepOrderAtOrBelow !== undefined) {
    const lowInHouse = restaurant !== null && restaurant <= item.prepOrderAtOrBelow;
    return { lowInHouse, lowWarehouse: false, task: lowInHouse ? "PREP ORDER" : null };
  }
  if (item.noWarehouse) {
    const lowInHouse =
      restaurant !== null && restaurant <= NO_WAREHOUSE_ORDER_AT_OR_BELOW;
    return { lowInHouse, lowWarehouse: false, task: lowInHouse ? "FOOD ORDER" : null };
  }
  const lowWarehouse = (warehouse ?? 0) <= (item.warehouseOrderAtOrBelow ?? 0);
  return { lowInHouse: false, lowWarehouse, task: lowWarehouse ? "FOOD ORDER" : null };
}

const GASTROFOOD_STOCK_ITEMS: StaffStockItem[] = [
  packed({ id: "bacon", name: { en: "Bacon", ru: "Бекон", vn: "Thịt xông khói" } }),
  packed({
    id: "beef-patty-200",
    warehouseOrderAtOrBelow: 1,
    name: {
      en: "Beef Patty (200g)",
      ru: "Говяжья котлета (200 г)",
      vn: "Bánh bò (200g)",
    },
  }),
  packed({
    id: "beef-patty-120",
    noAlerts: true,
    name: {
      en: "Beef Patty (120g)",
      ru: "Говяжья котлета (120 г)",
      vn: "Bánh bò (120g)",
    },
  }),
  packed({
    id: "beef-steak",
    name: { en: "Beef Steak", ru: "Говяжий стейк", vn: "Bít tết bò" },
  }),
  packed({
    id: "chicken-thighs",
    name: { en: "Chicken Thighs", ru: "Куриные бёдра", vn: "Đùi gà" },
  }),
  packed({
    id: "chicken-nuggets",
    noWarehouse: true,
    name: { en: "Chicken Nuggets", ru: "Куриные наггетсы", vn: "Gà viên chiên" },
  }),
  packed({
    id: "chicken-sausages",
    name: { en: "Chicken Sausages", ru: "Куриные сосиски", vn: "Xúc xích gà" },
  }),
  packed({
    id: "chicken-patty",
    noAlerts: true,
    name: { en: "Chicken Patty", ru: "Куриная котлета", vn: "Bánh gà" },
  }),
  packed({
    id: "chicken-wings",
    noWarehouse: true,
    name: { en: "Chicken Wings", ru: "Куриные крылья", vn: "Cánh gà" },
  }),
  packed({
    id: "classic-sausage",
    name: {
      en: "Hot Dog Sausage",
      ru: "Сосиска для хот-дога",
      vn: "Xúc xích hot dog",
    },
  }),
  packed({
    id: "french-fries",
    noWarehouse: true,
    name: { en: "French Fries", ru: "Картофель фри", vn: "Khoai tây chiên" },
  }),
  packed({
    id: "fish-bites",
    noWarehouse: true,
    name: { en: "Fish Bites", ru: "Рыбные кусочки", vn: "Cá viên" },
  }),
  packed({
    id: "fish-patties",
    noWarehouse: true,
    name: { en: "Fish Patties", ru: "Рыбные котлеты", vn: "Chả cá" },
  }),
  packed({
    id: "mozzarella-sticks",
    noWarehouse: true,
    name: {
      en: "Mozzarella Sticks",
      ru: "Палочки моцареллы",
      vn: "Phô mai mozzarella que",
    },
  }),
  packed({
    id: "pork-collar",
    name: { en: "Pork Collar", ru: "Свиная шея", vn: "Nạc vai heo" },
  }),
  packed({
    id: "pork-patty",
    noAlerts: true,
    name: { en: "Pork Patty", ru: "Свиная котлета", vn: "Bánh heo" },
  }),
  packed({
    id: "pork-sausage",
    name: { en: "Pork Sausage", ru: "Свиная сосиска", vn: "Xúc xích heo" },
  }),
  {
    id: "pita-bread",
    noWarehouse: true,
    unit: "pcs",
    prepOrderAtOrBelow: 19,
    name: { en: "Pita Bread", ru: "Пита", vn: "Bánh mì pita" },
  },
  {
    id: "tortilla",
    noWarehouse: true,
    unit: "pcs",
    prepOrderAtOrBelow: 19,
    name: { en: "Tortilla", ru: "Тортилья", vn: "Bánh tortilla" },
  },
  {
    ...sauce("sauce-cheese", "Sauce - Cheese (350g)", "Соус сырный (350 г)", "Sốt phô mai (350g)"),
    unit: "bags",
    prepOrderAtOrBelow: 5,
  },
  sauce("sauce-burger", "Sauce - Burger (2L)", "Соус бургерный (2 л)", "Sốt burger (2L)"),
  sauce("sauce-greek", "Sauce - Greek (2L)", "Соус греческий (2 л)", "Sốt Hy Lạp (2L)"),
  {
    ...sauce(
      "sauce-tomato-herbs",
      "Sauce - Tomato&Herbs (1kg)",
      "Соус томатный с травами (1 кг)",
      "Sốt cà chua & thảo mộc (1kg)",
    ),
    unit: "bags",
    prepOrderAtOrBelow: 3,
  },
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
