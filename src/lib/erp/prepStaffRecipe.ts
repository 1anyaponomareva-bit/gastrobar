import { RECIPES, type LocalizedText, type Recipe, type RecipeIngredient, type RecipeStep, type StoredRecipes } from "@/data/recipes";
import { CANONICAL_ERP_ORIGIN } from "./publicPath";
import { staffRecipePath } from "@/lib/recipes/cardUrl";
import { parseRecipeInstructions, type RecipeStepDraft } from "./recipeCard";
import { formatVietnamDate } from "@/lib/orders/datetime";
import { roundQty, usableWeight, type ErpUnit, type LossMethod, type LossPcts } from "./costing";
import type { ErpProduct, ErpRecipe } from "./types";

export type PrepPublishProduct = {
  id: string;
  name_en: string;
  name_vn?: string | null;
  names?: Record<string, string> | null;
  base_unit: ErpUnit | null;
  unit_weight_kg?: number | null;
} & Partial<LossPcts>;

export type PrepPublishLine = {
  product_id: string | null;
  qty: number | null;
  net_qty?: number | null;
  methods?: LossMethod[];
  parts?: { name: string; grams: number | null }[];
  is_main?: boolean;
  raw_name?: { en?: string; vn?: string; ru?: string } | null;
  cost?: number | null;
};

export type PrepPublishInput = {
  product: PrepPublishProduct;
  kind: "sauce" | "prep";
  cardNo: string;
  cardDate: string;
  cardRevision?: string;
  photo: string;
  yieldQty: number | null;
  yieldPieces: number | null;
  shelfLifeDays: number | null;
  storageConditions: string;
  version?: number;
  lines: PrepPublishLine[];
  catalog: PrepPublishProduct[];
  steps: RecipeStepDraft[];
  batchCost?: number | null;
};

const METHOD_LABEL: Record<LossMethod, LocalizedText> = {
  defrost: { ru: "Разморозка", en: "Defrost", vn: "Rã đông" },
  clean: { ru: "Очистка", en: "Cleaning", vn: "Sơ chế" },
  boil: { ru: "Варка", en: "Boiling", vn: "Luộc" },
  fry: { ru: "Жарка", en: "Frying", vn: "Chiên" },
  stew: { ru: "Тушение", en: "Stewing", vn: "Hầm" },
  bake: { ru: "Запекание", en: "Baking", vn: "Nướng" },
};

const BUILT_IN_IDS = () => new Set(RECIPES.map((recipe) => recipe.id));

export function staffRecipeId(productId: string): string {
  return `erp-${productId}`;
}

/** Always gastrofood.vn — staff app, not gastrotruck.org/recipes. */
export function staffRecipeCardUrl(productId: string): string {
  return `${CANONICAL_ERP_ORIGIN}${staffRecipePath(staffRecipeId(productId))}`;
}

function loc(en: string, vn = "", extra: Record<string, string> = {}): LocalizedText {
  const english = en.trim();
  const vietnamese = vn.trim();
  const russian = (extra.ru ?? "").trim();
  const other =
    Object.entries(extra)
      .filter(([code]) => code !== "ru")
      .map(([, text]) => text.trim())
      .find(Boolean) ?? "";
  const fallback = english || russian || vietnamese || other;
  return { ru: russian || fallback, en: english || fallback, vn: vietnamese || fallback };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function toStaffAmount(qty: number, unit: ErpUnit | null): { amount: number; unit: string } {
  if (unit === "kg") return { amount: round2(qty * 1000), unit: "g" };
  if (unit === "l") return { amount: round2(qty * 1000), unit: "ml" };
  if (unit === "pcs") return { amount: round2(qty), unit: "pcs" };
  return { amount: round2(qty), unit: "g" };
}

export function sheetQty(value: number | null | undefined, unit: ErpUnit | null): string {
  if (value == null) return "—";
  if ((unit === "kg" || unit === "l") && value !== 0 && Math.abs(value) < 1) {
    return `${trimNum(value * 1000)} ${unit === "kg" ? "g" : "ml"}`;
  }
  const suffix = unit === "kg" ? "kg" : unit === "l" ? "l" : unit === "pcs" ? "pcs" : "";
  return `${trimNum(value)}${suffix ? ` ${suffix}` : ""}`;
}

function trimNum(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return String(rounded);
}

export function lineNetQty(line: PrepPublishLine, product: PrepPublishProduct | undefined): number | null {
  if (line.net_qty != null) return line.net_qty;
  if (line.qty == null) return null;
  if (!line.methods?.length) return line.qty;
  return roundQty(usableWeight(line.qty, product, line.methods));
}

function staffPhoto(url: string | null | undefined): string | undefined {
  const value = (url ?? "").trim();
  if (!value) return undefined;
  if (value.startsWith("data:image/")) return value;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  if (value.startsWith("https://") || value.startsWith("http://")) return value;
  return undefined;
}

type CoverFields = { photo?: string | null; image?: string | null };

/** Cover URL from the recipe, then legacy `image`, then a product photo if the form never stored one. */
export function prepCoverUrl(recipe?: CoverFields | null, product?: object | null): string {
  const extra = (product ?? {}) as CoverFields;
  return (recipe?.photo || recipe?.image || extra.photo || extra.image || "").trim();
}

function recipeCoverUrl(recipe: ErpRecipe, product?: object | null): string {
  return prepCoverUrl(recipe, product);
}

function catalogOf(catalog: PrepPublishProduct[], id: string | null): PrepPublishProduct | undefined {
  return id ? catalog.find((row) => row.id === id) : undefined;
}

function lineNames(line: PrepPublishLine, product: PrepPublishProduct | undefined): { en: string; vn: string; extra: Record<string, string> } {
  const en = (product?.name_en || line.raw_name?.en || line.raw_name?.ru || "").trim();
  const vn = (product?.name_vn || line.raw_name?.vn || "").trim();
  return { en: en || "Ingredient", vn, extra: product?.names ?? {} };
}

function cutsNote(line: PrepPublishLine): LocalizedText | undefined {
  const parts = (line.parts ?? []).filter((part) => part.name.trim() && part.grams != null);
  if (!parts.length) return undefined;
  const text = parts.map((part) => `${part.name.trim()} ${trimNum(part.grams ?? 0)} g`).join("; ");
  return loc(text, text);
}

function methodsNote(methods: LossMethod[] | undefined): LocalizedText | undefined {
  if (!methods?.length) return undefined;
  return {
    ru: methods.map((method) => METHOD_LABEL[method].ru).join(", "),
    en: methods.map((method) => METHOD_LABEL[method].en).join(", "),
    vn: methods.map((method) => METHOD_LABEL[method].vn).join(", "),
  };
}

function joinNotes(notes: (LocalizedText | undefined)[]): LocalizedText | undefined {
  const present = notes.filter((note): note is LocalizedText => Boolean(note));
  if (!present.length) return undefined;
  return {
    ru: present.map((note) => note.ru).filter(Boolean).join(" · "),
    en: present.map((note) => note.en).filter(Boolean).join(" · "),
    vn: present.map((note) => note.vn).filter(Boolean).join(" · "),
  };
}

function revisionOf(input: PrepPublishInput): string {
  const explicit = (input.cardRevision ?? "").trim();
  if (explicit) return explicit;
  if (input.version && input.version > 0) return String(input.version).padStart(2, "0");
  return "01";
}

function staffSteps(steps: RecipeStepDraft[]): RecipeStep[] {
  return steps.flatMap((step) => {
    const titleEn = step.titleEn.trim();
    const titleVn = step.titleVn.trim();
    const extraTitles: Record<string, string> = {};
    const extraItems: Record<string, string[]> = {};
    for (const [code, row] of Object.entries(step.extra ?? {})) {
      extraTitles[code] = row.title.trim();
      extraItems[code] = row.items.split(/\r?\n/).map((line) => line.trim());
    }
    const itemsEn = step.itemsEn.split(/\r?\n/).map((line) => line.trim());
    const itemsVn = step.itemsVn.split(/\r?\n/).map((line) => line.trim());
    const length = Math.max(itemsEn.length, itemsVn.length, ...Object.values(extraItems).map((row) => row.length));
    const items: LocalizedText[] = [];
    for (let i = 0; i < length; i += 1) {
      const en = itemsEn[i] ?? "";
      const vn = itemsVn[i] ?? "";
      const extra: Record<string, string> = {};
      for (const [code, row] of Object.entries(extraItems)) extra[code] = row[i] ?? "";
      if (en || vn || Object.values(extra).some((text) => text.trim())) items.push(loc(en, vn, extra));
    }
    const photo = staffPhoto(step.photo);
    const titleExtra = Object.values(extraTitles).some(Boolean);
    if (!titleEn && !titleVn && !titleExtra && !items.length && !photo) return [];
    return [
      {
        ...(titleEn || titleVn || titleExtra ? { title: loc(titleEn, titleVn, extraTitles) } : {}),
        ...(photo ? { photo } : {}),
        items,
      },
    ];
  });
}

/** Maps one ERP prep (not the existing staff catalog) onto a Recipes JSON card. */
export function staffRecipeFromPrep(input: PrepPublishInput): Recipe {
  const productId = input.product.id;
  const yieldUnit = input.product.base_unit;
  const yieldQty = input.yieldQty ?? 0;
  const staffYield = toStaffAmount(yieldQty, yieldUnit);
  const pieces = input.yieldPieces;
  const ingredients: RecipeIngredient[] = input.lines.flatMap((line) => {
    const product = catalogOf(input.catalog, line.product_id);
    const net = lineNetQty(line, product);
    if (net == null && !line.raw_name && !line.product_id) return [];
    const names = lineNames(line, product);
    const unit = product?.base_unit ?? null;
    const amount = net == null ? 0 : toStaffAmount(net, unit).amount;
    const staffUnit = net == null ? "g" : toStaffAmount(net, unit).unit;
    const grossNote =
      line.qty != null && net != null && line.qty !== net
        ? loc(`gross ${sheetQty(line.qty, unit)}`, `brutto ${sheetQty(line.qty, unit)}`)
        : undefined;
    const note = joinNotes([methodsNote(line.methods), cutsNote(line), grossNote]);
    return [
      {
        name: loc(names.en, names.vn, names.extra),
        amount,
        unit: staffUnit,
        ...(line.is_main ? { main: true as const } : {}),
        ...(note ? { note } : {}),
      },
    ];
  });

  const facts: Recipe["facts"] = [];
  const pieceG = input.product.unit_weight_kg;
  if (pieceG && pieceG > 0) {
    const grams = trimNum(pieceG * 1000);
    facts.push({
      icon: "weight",
      label: loc("Portion weight", "Trọng lượng 1 cái"),
      value: loc(`${grams} g`, `${grams} g`),
    });
  }
  if (input.shelfLifeDays && input.shelfLifeDays > 0) {
    facts.push({
      icon: "storage",
      label: loc("Storage", "Bảo quản"),
      value: loc(`${input.shelfLifeDays} days`, `${input.shelfLifeDays} ngày`),
    });
  }

  const storage: Recipe["storage"] = [];
  const storageText = input.storageConditions.trim();
  if (storageText || (input.shelfLifeDays && input.shelfLifeDays > 0)) {
    storage.push({
      icon: "fridge",
      title: loc(storageText || "Storage", storageText || "Bảo quản"),
      ...(input.shelfLifeDays && input.shelfLifeDays > 0
        ? { text: loc(`${input.shelfLifeDays} days`, `${input.shelfLifeDays} ngày`) }
        : {}),
    });
  }

  const photo = staffPhoto(input.photo);
  const date = formatVietnamDate(input.cardDate) || input.cardDate.trim();
  const cardNo = input.cardNo.trim();

  return {
    id: staffRecipeId(productId),
    erpProductId: productId,
    kind: "prep",
    name: loc(input.product.name_en, input.product.name_vn ?? "", input.product.names ?? {}),
    ...(cardNo || date
      ? { meta: { cardNo, date, revision: revisionOf(input) } }
      : {}),
    ...(photo ? { photo } : {}),
    yield: {
      amount: staffYield.amount,
      unit: staffYield.unit,
      ...(pieces && yieldUnit !== "pcs"
        ? { label: loc(`1 batch · ${pieces} pcs`, `1 mẻ · ${pieces} cái`) }
        : {}),
    },
    ...(facts.length ? { facts } : {}),
    ingredients,
    steps: staffSteps(input.steps),
    ...(storage.length ? { storage } : {}),
  };
}

/** Active tech card for kitchen, else the newest version. Drafts are not preferred. */
export function publishedPrepRecipe(recipes: ErpRecipe[] | undefined, productId: string): ErpRecipe | null {
  const list = (recipes ?? []).filter((recipe) => recipe.product_id === productId);
  if (!list.length) return null;
  return list.find((recipe) => recipe.status === "active") ?? [...list].sort((a, b) => b.version - a.version)[0];
}

function emptyRecipeForProduct(product: ErpProduct): ErpRecipe {
  return {
    id: product.id,
    product_id: product.id,
    version: 0,
    status: "draft",
    yield_qty: 1,
    yield_pieces: null,
    instructions: [],
    shelf_life_days: product.shelf_life_days,
    storage_conditions: product.storage_conditions,
    note: null,
    photo: product.photo ?? null,
    kind: "prep",
    legacy_recipe_id: null,
    created_at: "",
    created_by: null,
    activated_at: null,
    lines: [],
  };
}

/** One Recipes card for an ERP semi-finished product, even when the tech card is still empty. */
export function staffRecipeForErpProduct(
  product: ErpProduct,
  recipes: ErpRecipe[],
  catalog: ErpProduct[],
): Recipe {
  const recipe = publishedPrepRecipe(recipes, product.id) ?? emptyRecipeForProduct(product);
  return staffRecipeFromPrep(prepPublishFromSaved(product, recipe, catalog));
}

export function staffCardsFromErpPreps(products: ErpProduct[], recipes: ErpRecipe[]): Recipe[] {
  return products
    .filter((product) => !product.archived_at && product.type === "semi_finished")
    .map((product) => staffRecipeForErpProduct(product, recipes, products));
}

/** Insert/update ERP prep cards in the staff JSON. Built-in recipes stay as they are. */
export function mergeErpPrepsIntoStored(stored: StoredRecipes, cards: Recipe[]): StoredRecipes {
  const live = new Set(cards.map((card) => card.erpProductId).filter((id): id is string => Boolean(id)));
  let next: StoredRecipes = {
    recipes: stored.recipes.map((recipe) =>
      recipe.erpProductId && !live.has(recipe.erpProductId) ? { ...recipe, hidden: true } : recipe,
    ),
    deleted: stored.deleted.filter((id) => !cards.some((card) => card.id === id)),
  };
  for (const card of cards) {
    next = upsertStaffRecipe(next, { ...card, hidden: false }).stored;
  }
  return next;
}

/**
 * Insert or replace the ERP-linked card only. Built-in / admin recipes without
 * this erpProductId are left untouched — never reverse-imported into ERP.
 */
export function upsertStaffRecipe(
  stored: StoredRecipes,
  incoming: Recipe,
  builtInIds: ReadonlySet<string> = BUILT_IN_IDS(),
): { stored: StoredRecipes; id: string; replaced: boolean } {
  const erpProductId = incoming.erpProductId;
  if (!erpProductId) {
    return { stored, id: incoming.id, replaced: false };
  }
  const linked = stored.recipes.find((recipe) => recipe.erpProductId === erpProductId);
  const card: Recipe = { ...incoming, erpProductId };
  if (linked) {
    return {
      stored: {
        recipes: stored.recipes.map((recipe) => (recipe.id === linked.id ? { ...card, id: linked.id } : recipe)),
        deleted: stored.deleted.filter((id) => id !== linked.id),
      },
      id: linked.id,
      replaced: true,
    };
  }
  const taken = builtInIds.has(card.id) || stored.recipes.some((recipe) => recipe.id === card.id);
  const id = taken ? staffRecipeId(erpProductId) : card.id;
  return {
    stored: {
      recipes: [...stored.recipes, { ...card, id }],
      deleted: stored.deleted.filter((item) => item !== id),
    },
    id,
    replaced: false,
  };
}

export function prepPublishFromSaved(
  product: ErpProduct,
  recipe: ErpRecipe,
  catalog: ErpProduct[],
): PrepPublishInput {
  return {
    product,
    kind: recipe.kind === "sauce" ? "sauce" : "prep",
    cardNo: recipe.card_no ?? "",
    cardDate: (recipe.card_date ?? "").slice(0, 10),
    cardRevision: recipe.card_revision ?? undefined,
    photo: recipeCoverUrl(recipe, product),
    yieldQty: recipe.yield_qty,
    yieldPieces: recipe.yield_pieces,
    shelfLifeDays: recipe.shelf_life_days,
    storageConditions: recipe.storage_conditions ?? "",
    version: recipe.version,
    lines: recipe.lines.map((line) => ({
      product_id: line.product_id,
      qty: line.qty,
      net_qty: line.net_qty ?? null,
      methods: line.methods ?? [],
      parts: (line.parts ?? []).map((part) => ({ name: part.name, grams: part.grams })),
      is_main: Boolean(line.is_main),
      raw_name: line.raw_name,
    })),
    catalog,
    steps: parseRecipeInstructions(recipeInstructionSource(recipe)),
  };
}

function hasInstructionContent(value: unknown): boolean {
  if (value == null || value === "") return false;
  if (typeof value === "string") return Boolean(value.trim());
  if (Array.isArray(value)) return value.length > 0;
  return typeof value === "object";
}

/** Cooking text on the ERP row: `instructions`, else `steps` / `method` / `cooking`. */
export function recipeInstructionSource(recipe: ErpRecipe): unknown {
  const extra = recipe as ErpRecipe & { steps?: unknown; method?: unknown; cooking?: unknown; technology?: unknown };
  for (const candidate of [recipe.instructions, extra.steps, extra.method, extra.cooking, extra.technology]) {
    if (hasInstructionContent(candidate)) return candidate;
  }
  return recipe.instructions;
}

export function prepSheetFileName(input: PrepPublishInput): string {
  const raw = (input.cardNo.trim() || input.product.name_en || "prep").replace(/[^\w\-]+/g, "_").replace(/^_+|_+$/g, "");
  return `Tech_card_${(raw || "prep").slice(0, 60)}.pdf`;
}

export function prepKindTitle(kind: "sauce" | "prep"): { ru: string; en: string; vn: string } {
  return kind === "sauce"
    ? { ru: "Соусы", en: "Sauces", vn: "Sốt" }
    : { ru: "Полуфабрикаты", en: "Semi-finished", vn: "Bán thành phẩm" };
}

export { METHOD_LABEL };
