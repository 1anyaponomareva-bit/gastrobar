"use client";

import { useErpRouter } from "./erpHref";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Pager, usePageSize } from "./Pager";
import { compositionChipLabel, moveListItem, moveOpenIndexes, withMainFlags } from "@/lib/erp/compositionLines";
import {
  compositionLineQty,
  compositionYieldCost,
  compositionYieldCostEstimate,
  costLine,
  liveCatalogName,
  prepCompositionCostContext,
  productTitle,
  recipeYieldUnitCostEstimate,
  type ErpUnit,
} from "@/lib/erp/costing";
import { isCompositionPrepType } from "@/lib/erp/ingredientSearch";
import { cyclicComponentIds } from "@/lib/erp/recipeBom";
import { extraNamesOnly, namesEqual, namesHaystack } from "@/lib/erp/contentLang";
import { menuListBackHref, withMenuListReturn } from "@/lib/erp/menuListQuery";
import type { ErpProduct, ErpRecipe, ErpRecipeLine, ErpState } from "@/lib/erp/types";
import { downloadPdfFile } from "@/lib/deliverPdfFile";
import { parseRecipeInstructions, serializeRecipeInstructions, type RecipeStepDraft } from "@/lib/erp/recipeCard";
import { makePrepSheetPdf } from "@/lib/erp/prepSheetPdf";
import {
  prepCoverUrl,
  prepSheetFileName,
  recipeInstructionSource,
  staffRecipeCardUrl,
  type PrepPublishInput,
} from "@/lib/erp/prepStaffRecipe";
import { useDragReorder } from "@/lib/useDragReorder";
import { ComposeDragHandle, MainIngredientChips } from "./CompositionMains";
import { DocTable, useDocuments } from "./docs";
import { useErp } from "./ErpShell";
import { IngredientPicker } from "./IngredientPicker";
import { compositionPartsMessage, LinePartsButton, LinePartsPlaque } from "./LineParts";
import { MenuMobileNav, MENU_HREFS } from "./menuNav";
import { filledParts, netToSmallUnit, parseLineParts, shiftOpenCuts, toggleCutsState } from "@/lib/erp/lineParts";
import { grossPatch, lossHint, MethodPicker, NetCell, netOf, netWeight, netWeightText } from "./losses";
import { ExtraNameFields } from "./ExtraNameFields";
import { PrepCardHeader, PrepCoverField, PrepStepsEditor, type PrepCardKind } from "./PrepCardFields";
import { StorageOptionsEditor } from "./StorageOptionsEditor";
import { YieldCostFooter, yieldDisplayText, yieldPerUnitText } from "./YieldComposition";
import { parseStorageOptions, serializeStorageOptions, type StorageOption } from "@/lib/erp/storageOptions";
import {
  Empty,
  Field,
  NavLink,
  noSearchResults,
  NumberInput,
  PageHead,
  qtyText,
  QtyInput,
  savingText,
  statusLabel,
  SubTabs,
  T,
  toBase,
  today,
  unitLabel,
  unitOf,
  useDirtyGuard,
  vnd,
} from "./ui";

const prepTabs = () => [
  { href: "/erp/menu/preps", label: T("Рецептуры", "Recipes", "Công thức") },
  { href: "/erp/menu/processing", label: T("Переработки", "Processing", "Chế biến") },
];

const prepsSub = () =>
  T(
    "Рецептура описывает состав. Изготовление партии списывает сырьё и добавляет полуфабрикат на склад.",
    "A recipe describes the composition. Making a batch uses up ingredients and adds the product to stock.",
    "Công thức mô tả thành phần. Sản xuất mẻ sẽ trừ nguyên liệu và nhập bán thành phẩm vào kho.",
  );

const yieldText = (recipe: ErpRecipe | undefined, unit: ErpUnit | null) => {
  if (!recipe?.yield_qty) return "—";
  const main = qtyText(recipe.yield_qty, unit);
  return recipe.yield_pieces && unit !== "pcs" ? `${main} · ${recipe.yield_pieces} ${unitLabel("pcs")}` : main;
};

export function PrepsPage() {
  const { state } = useErp();
  const [query, setQuery] = useState("");
  const [accountableFilter, setAccountableFilter] = useState<"all" | "yes" | "no">("all");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = usePageSize();
  const ctx = useMemo(
    () => (state ? prepCompositionCostContext(state.products, state.recipes, state.costSources) : null),
    [state],
  );
  useEffect(() => setPage(0), [query, pageSize, accountableFilter]);
  if (!state || !ctx) return null;

  const all = state.products
    .filter((p) => !p.archived_at && (p.type === "semi_finished" || p.type === "finished"))
    .sort((a, b) => a.name_en.localeCompare(b.name_en));
  const q = query.trim().toLowerCase();
  const list = all.filter((p) => {
    if (accountableFilter === "yes" && !p.staff_listed) return false;
    if (accountableFilter === "no" && p.staff_listed) return false;
    return !q || namesHaystack(p).toLowerCase().includes(q);
  });
  const pages = Math.max(1, Math.ceil(list.length / pageSize));
  const current = Math.min(page, pages - 1);
  const pageRows = list.slice(current * pageSize, current * pageSize + pageSize);

  return (
    <>
      <PageHead
        title={T("Полуфабрикаты", "Semi-finished", "Bán thành phẩm")}
        sub={prepsSub()}
        actions={
          <>
            <NavLink href="/erp/preps/recipe/new" className="erpBtn">
              + {T("Новый полуфабрикат", "New semi-finished", "Bán thành phẩm mới")}
            </NavLink>
            <NavLink href="/erp/menu/processing/new" className="erpBtn primary">
              {T("Изготовить партию", "Make a batch", "Sản xuất mẻ")}
            </NavLink>
          </>
        }
      />
      <SubTabs tabs={prepTabs()} active="/erp/preps" />

      {!all.length ? (
        <Empty
          title={T("Пока нет полуфабрикатов", "No semi-finished products yet", "Chưa có bán thành phẩm")}
            text={T(
            "Создайте полуфабрикат с рецептурой — при сохранении карточка появится в Recipes для сотрудников.",
            "Create a semi-finished product with a recipe. Saving the card publishes it to Recipes for staff.",
            "Tạo bán thành phẩm với công thức — khi lưu, thẻ sẽ hiện trên Recipes cho nhân viên.",
          )}
          action={
            <NavLink href="/erp/preps/recipe/new" className="erpBtn primary">
              {T("Создать полуфабрикат", "Create semi-finished", "Tạo bán thành phẩm")}
            </NavLink>
          }
        />
      ) : (
        <>
          <div className="erpToolbar">
            <input
              type="search"
              placeholder={T("Найти полуфабрикат…", "Find…", "Tìm…")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <select
              value={accountableFilter}
              onChange={(e) => setAccountableFilter(e.target.value as "all" | "yes" | "no")}
              aria-label={T("Показывать в Prep Stock", "Show in Prep Stock", "Hiện trong Prep Stock")}
            >
              <option value="all">{T("Все товары", "All items", "Tất cả")}</option>
              <option value="yes">{T("В Prep Stock", "In Prep Stock", "Trong Prep Stock")}</option>
              <option value="no">{T("Не в Prep Stock", "Not in Prep Stock", "Không trong Prep Stock")}</option>
            </select>
          </div>
          {!list.length ? (
            noSearchResults(() => setQuery(""))
          ) : (
            <div className="erpTableWrap">
              <table className="erpTable stack">
                <thead>
                  <tr>
                    <th>{T("Название", "Name", "Tên")}</th>
                    <th>{T("Prep Stock", "Prep Stock", "Prep Stock")}</th>
                    <th>{T("Нормативный выход", "Standard yield", "Sản lượng chuẩn")}</th>
                    <th className="num">{T("Себестоимость единицы", "Unit cost", "Giá vốn / đơn vị")}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((p) => {
                    const recipes = state.recipes.filter((r) => r.product_id === p.id);
                    const active = recipes.find((r) => r.status === "active");
                    const draft = recipes.find((r) => r.status === "draft");
                    const costRecipe = active ?? draft;
                    const estimate = costRecipe ? recipeYieldUnitCostEstimate(ctx, costRecipe) : { amount: null, complete: true };
                    return (
                      <tr key={p.id}>
                        <td className="main">
                          <span className="erpName">{productTitle(p)}</span>
                          {!active ? (
                            <span className="erpBadge warn">
                              {draft
                                ? T("рецептура в черновике", "recipe is a draft", "công thức đang nháp")
                                : T("нет рецептуры", "no recipe", "chưa có công thức")}
                            </span>
                          ) : draft ? (
                            <span className="erpCellSub">{T("есть новый черновик", "a new draft exists", "có bản nháp mới")}</span>
                          ) : null}
                        </td>
                        <td data-label={T("Prep Stock", "Prep Stock", "Prep Stock")}>
                          {p.staff_listed ? T("Да", "Yes", "Có") : T("Нет", "No", "Không")}
                        </td>
                        <td data-label={T("Нормативный выход", "Standard yield", "Sản lượng chuẩn")}>{yieldText(costRecipe, p.base_unit)}</td>
                        <td className="num" data-label={T("Себестоимость единицы", "Unit cost", "Giá vốn / đơn vị")}>
                          {estimate.amount == null ? (
                            "—"
                          ) : (
                            <span
                              className={estimate.complete ? undefined : "erpCostApprox"}
                              title={
                                estimate.complete
                                  ? undefined
                                  : T(
                                      "Приблизительно: не у всех ингредиентов есть цена",
                                      "Approximate: some ingredients have no price",
                                      "Tạm tính: một số nguyên liệu chưa có giá",
                                    )
                              }
                            >
                              {vnd(estimate.amount)} / {unitLabel(p.base_unit)}
                            </span>
                          )}
                        </td>
                        <td className="num">
                          <div className="erpRow end">
                            <NavLink href={`/erp/preps/recipe/${p.id}`} className="erpBtn small">
                              {T("Открыть рецепт", "Open recipe", "Mở công thức")}
                            </NavLink>
                            {active ? (
                              <NavLink href={`/erp/menu/processing/new?recipe=${active.id}`} className="erpBtn small primary">
                                {T("Изготовить", "Make", "Sản xuất")}
                              </NavLink>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {list.length ? (
            <Pager total={list.length} page={current} pages={pages} pageSize={pageSize} onPage={setPage} onPageSize={setPageSize} />
          ) : null}
        </>
      )}
    </>
  );
}

export function BatchesPage() {
  const { state } = useErp();
  const docs = useDocuments(["production"]);
  if (!state) return null;
  return (
    <>
      <PageHead
        title={T("Полуфабрикаты", "Semi-finished", "Bán thành phẩm")}
        sub={prepsSub()}
        actions={
          <NavLink href="/erp/menu/processing/new" className="erpBtn primary">
            {T("Изготовить партию", "Make a batch", "Sản xuất mẻ")}
          </NavLink>
        }
      />
      <MenuMobileNav active={MENU_HREFS.preps} />
      <SubTabs tabs={prepTabs()} active="/erp/menu/processing" />
      <DocTable
        state={state}
        {...docs}
        empty={
          <Empty
            title={T("Партий ещё не было", "No batches yet", "Chưa có mẻ nào")}
            text={T(
              "Здесь появятся изготовленные партии и черновики производства.",
              "Produced batches and production drafts will appear here.",
              "Các mẻ đã sản xuất và bản nháp sẽ hiện ở đây.",
            )}
            action={
              <NavLink href="/erp/menu/processing/new" className="erpBtn primary">
                {T("Изготовить партию", "Make a batch", "Sản xuất mẻ")}
              </NavLink>
            }
          />
        }
      />
    </>
  );
}

export function RecipePage({ id, from }: { id: string; from?: string }) {
  const { state } = useErp();
  if (!state) return null;
  if (id === "new") return <NewPrep from={from} />;
  const product = state.products.find((p) => p.id === id);
  if (!product) {
    return (
      <Empty
        kind="error"
        title={T("Полуфабрикат не найден", "Product not found", "Không tìm thấy")}
        action={
          <NavLink href={menuListBackHref(from, "/erp/menu/preps")} className="erpBtn">
            {T("К списку полуфабрикатов", "Back to the list", "Về danh sách")}
          </NavLink>
        }
      />
    );
  }
  return <RecipeEditor key={product.id} state={state} product={product} from={from} />;
}

const BackLink = ({ from }: { from?: string }) => (
  <NavLink href={menuListBackHref(from, "/erp/menu/preps")} className="erpBack">
    ← {T("Полуфабрикаты", "Semi-finished", "Bán thành phẩm")}
  </NavLink>
);

function NewPrep({ from }: { from?: string }) {
  const { act, busy } = useErp();
  const router = useErpRouter();
  const [nameEn, setNameEn] = useState("");
  const [nameVn, setNameVn] = useState("");
  const [names, setNames] = useState<Record<string, string>>({});
  const [unit, setUnit] = useState<ErpUnit | "">("");
  const [photo, setPhoto] = useState("");
  useDirtyGuard(Boolean(nameEn || nameVn || Object.keys(names).length || photo));
  return (
    <>
      <BackLink from={from} />
      <PageHead title={T("Новый полуфабрикат", "New semi-finished product", "Bán thành phẩm mới")} />
      <div className="erpCard">
        <PrepCoverField url={photo} onChange={setPhoto} />
        <div className="erpGrid">
          <ExtraNameFields
            en={nameEn}
            vn={nameVn}
            names={names}
            onEn={setNameEn}
            onVn={setNameVn}
            onNames={setNames}
            autoFocus
            enTestId="prep-name"
            vnTestId="prep-name-vn"
          />
          <Field
            label={T("Единица учёта *", "Unit *", "Đơn vị *")}
            hint={T("В чём считаете готовый полуфабрикат", "How the finished product is counted", "Đơn vị đếm thành phẩm")}
          >
            <select value={unit} onChange={(event) => setUnit(event.target.value as ErpUnit | "")}>
              <option value="">{T("— выберите —", "— choose —", "— chọn —")}</option>
              <option value="kg">{T("килограммы (кг)", "kilograms (kg)", "kilôgam (kg)")}</option>
              <option value="l">{T("литры (л)", "litres (l)", "lít (l)")}</option>
              <option value="pcs">{T("штуки (шт)", "pieces (pcs)", "cái")}</option>
            </select>
          </Field>
        </div>
        <div className="erpActions">
          <button
            type="button"
            className="erpBtn primary"
            disabled={busy || !nameEn.trim() || !unit}
            onClick={async () => {
              const result = await act<{ id: string }>(
                {
                  action: "saveProduct",
                  product: { type: "semi_finished", name_en: nameEn, name_vn: nameVn, names, base_unit: unit },
                },
                T("Полуфабрикат создан — добавьте состав", "Created — now add the ingredients", "Đã tạo — thêm nguyên liệu"),
              );
              if (result) {
                if (photo) {
                  await act(
                    { action: "saveRecipe", recipe: { product_id: result.id, kind: "prep", photo, lines: [] } },
                    false,
                  );
                }
                setNameEn("");
                setNameVn("");
                setNames({});
                setPhoto("");
                router.replace(withMenuListReturn(`/erp/preps/recipe/${result.id}`, from ?? ""));
              }
            }}
          >
            {busy ? savingText() : T("Создать и перейти к составу", "Create and add ingredients", "Tạo và thêm nguyên liệu")}
          </button>
        </div>
      </div>
    </>
  );
}

type LineDraft = Pick<ErpRecipeLine, "product_id" | "qty" | "note" | "raw_name" | "raw_amount" | "raw_unit" | "methods" | "net_qty"> & {
  parts: ReturnType<typeof parseLineParts>;
  is_main: boolean;
};

type RecipeForm = {
  kind: PrepCardKind;
  card_no: string;
  card_date: string;
  photo: string;
  yield_qty: number | null;
  yield_pieces: number | null;
  storageOptions: StorageOption[];
  note: string;
  steps: RecipeStepDraft[];
  lines: LineDraft[];
};

const recipeKind = (value: string | null | undefined): PrepCardKind =>
  value === "sauce" || value === "dish" ? "sauce" : "prep";

function recipeLineHasContent(line: LineDraft): boolean {
  const raw =
    line.raw_name && typeof line.raw_name === "object" && !Array.isArray(line.raw_name)
      ? String((line.raw_name as { en?: unknown }).en ?? "")
      : "";
  return Boolean(line.product_id || line.qty != null || line.net_qty != null || line.raw_amount != null || raw.trim());
}

/** Identity fields for a name-only save. Omits packs/cost/losses so those stay as stored. */
function prepNamePayload(
  product: ErpProduct,
  nameEn: string,
  nameVn: string,
  names: Record<string, string>,
  pieceWeight = product.unit_weight_kg,
  extras?: {
    showInOrders?: boolean;
    orderPackType?: string;
    orderPackContentQty?: number | null;
    orderPackContentUnit?: string;
    staffStockAlertQty?: number | null;
  },
) {
  const showInOrders = extras?.showInOrders ?? Boolean(product.staff_listed);
  const alertQty =
    extras && Object.prototype.hasOwnProperty.call(extras, "staffStockAlertQty")
      ? extras.staffStockAlertQty
      : product.staff_stock_alert_qty ?? null;
  return {
    id: product.id,
    type: product.type,
    name_en: nameEn.trim(),
    name_vn: nameVn.trim(),
    names: extraNamesOnly(names),
    base_unit: product.base_unit,
    category_id: product.category_id,
    unit_weight_kg: pieceWeight,
    brand: product.brand ?? "",
    shelf_life_days: product.shelf_life_days,
    storage_conditions: product.storage_conditions ?? "",
    accountable: showInOrders,
    staff_listed: showInOrders,
    staff: {
      listed: showInOrders,
      unit: product.staff_unit || product.base_unit || null,
      pack: product.staff_pack ?? null,
      supplier_id: product.staff_supplier_id ?? null,
      item_no: product.staff_item_no ?? null,
      hidden: Boolean(product.staff_hidden),
    },
    order_pack_type: (extras?.orderPackType ?? product.order_pack_type ?? "").trim() || null,
    order_pack_content_qty:
      extras && Object.prototype.hasOwnProperty.call(extras, "orderPackContentQty")
        ? extras.orderPackContentQty
        : product.order_pack_content_qty ?? null,
    order_pack_content_unit:
      (extras?.orderPackContentUnit ?? product.order_pack_content_unit ?? "").trim() || null,
    staff_stock_alert_qty:
      alertQty != null && Number.isFinite(alertQty) && alertQty >= 0 ? alertQty : null,
  };
}

function formFrom(recipe: ErpRecipe | null, product: ErpProduct): RecipeForm {
  return {
    kind: recipeKind(recipe?.kind),
    card_no: recipe?.card_no ?? "",
    card_date: (recipe?.card_date ?? "").slice(0, 10) || (recipe ? "" : today()),
    photo: prepCoverUrl(recipe, product),
    yield_qty: recipe?.yield_qty ?? null,
    yield_pieces: recipe?.yield_pieces ?? null,
    storageOptions: parseStorageOptions(
      recipe?.storage_conditions ?? product.storage_conditions,
      recipe?.shelf_life_days ?? product.shelf_life_days,
    ),
    note: recipe?.note ?? "",
    steps: parseRecipeInstructions(recipe ? recipeInstructionSource(recipe) : undefined),
    lines: (recipe?.lines ?? []).map((line) => ({
      product_id: line.product_id,
      qty: line.qty,
      note: line.note ?? null,
      raw_name: line.raw_name ?? null,
      raw_amount: line.raw_amount ?? null,
      raw_unit: line.raw_unit ?? null,
      methods: line.methods ?? [],
      net_qty: line.net_qty ?? null,
      parts: parseLineParts(line.parts),
      is_main: Boolean(line.is_main),
    })),
  };
}

/** Stable snapshot for dirty checks — same shape after load and after save. */
function normalizePrepForm(form: RecipeForm): RecipeForm {
  const storage = serializeStorageOptions(form.storageOptions);
  return {
    ...form,
    card_no: form.card_no.trim(),
    photo: form.photo.trim(),
    note: form.note ?? "",
    storageOptions: parseStorageOptions(storage.storage_conditions, storage.shelf_life_days),
    lines: form.lines.filter(recipeLineHasContent).map((line) => ({
      product_id: line.product_id,
      qty: line.qty ?? null,
      note: line.note ?? null,
      raw_name: line.raw_name ?? null,
      raw_amount: line.raw_amount ?? null,
      raw_unit: line.raw_unit ?? null,
      methods: line.methods ?? [],
      net_qty: line.net_qty ?? null,
      parts: parseLineParts(line.parts),
      is_main: Boolean(line.is_main),
    })),
  };
}

function prepFormBaseline(form: RecipeForm): string {
  return JSON.stringify(normalizePrepForm(form));
}

function RecipeEditor({ state, product, from }: { state: ErpState; product: ErpProduct; from?: string }) {
  const { act, busy } = useErp();
  const recipes = state.recipes.filter((r) => r.product_id === product.id).sort((a, b) => b.version - a.version);
  const active = recipes.find((r) => r.status === "active");
  const initial = recipes.find((r) => r.status === "draft") ?? active ?? recipes[0] ?? null;
  const [viewId, setViewId] = useState<string | null>(initial?.id ?? null);
  const viewed = recipes.find((r) => r.id === viewId) ?? null;
  const [editing, setEditing] = useState<boolean>(!viewed || viewed.status === "draft");
  const [form, setForm] = useState(() => formFrom(viewed, product));
  const [baseline, setBaseline] = useState(() => prepFormBaseline(formFrom(viewed, product)));
  const [nameEn, setNameEn] = useState(product.name_en);
  const [nameVn, setNameVn] = useState(product.name_vn ?? "");
  const [names, setNames] = useState<Record<string, string>>(() => extraNamesOnly(product.names));
  const [pieceWeight, setPieceWeight] = useState<number | null>(product.unit_weight_kg);
  const [showInOrders, setShowInOrders] = useState(Boolean(product.staff_listed));
  const [orderPackType, setOrderPackType] = useState(product.order_pack_type ?? "");
  const [orderPackContentQty, setOrderPackContentQty] = useState<number | null>(
    product.order_pack_content_qty ?? null,
  );
  const [orderPackContentUnit, setOrderPackContentUnit] = useState(product.order_pack_content_unit ?? "");
  const [staffStockAlertQty, setStaffStockAlertQty] = useState<number | null>(
    product.staff_stock_alert_qty ?? null,
  );
  const [composeOpen, setComposeOpen] = useState(true);
  const [cutsOpen, setCutsOpen] = useState<Set<number>>(new Set());
  const [sheetBusy, setSheetBusy] = useState(false);
  const [appBusy, setAppBusy] = useState(false);
  /** After save, reload form from the patched recipe once so leave-guard clears. */
  const syncCleanAfterSave = useRef(false);
  const ctx = useMemo(
    () => prepCompositionCostContext(state.products, state.recipes, state.costSources),
    [state],
  );
  const blockedComponents = useMemo(
    () => cyclicComponentIds(state.recipes, product.id, state.products.map((item) => item.id)),
    [state.recipes, state.products, product.id],
  );
  const unit = product.base_unit;
  const dirty = editing && prepFormBaseline(form) !== baseline;
  const namesDirty =
    nameEn.trim() !== product.name_en.trim() ||
    nameVn.trim() !== (product.name_vn ?? "").trim() ||
    !namesEqual(names, product.names);
  const pieceDirty = (pieceWeight ?? null) !== (product.unit_weight_kg ?? null);
  const ordersDirty =
    showInOrders !== Boolean(product.staff_listed) ||
    orderPackType.trim() !== String(product.order_pack_type ?? "").trim() ||
    (orderPackContentQty ?? null) !== (product.order_pack_content_qty ?? null) ||
    orderPackContentUnit.trim() !== String(product.order_pack_content_unit ?? "").trim() ||
    (staffStockAlertQty ?? null) !== (product.staff_stock_alert_qty ?? null);
  const productDirty = namesDirty || pieceDirty || ordersDirty;
  useDirtyGuard(dirty || productDirty);

  useEffect(() => {
    if (!syncCleanAfterSave.current || !viewId) return;
    const recipe = recipes.find((row) => row.id === viewId);
    if (!recipe) return;
    syncCleanAfterSave.current = false;
    const next = formFrom(recipe, product);
    setForm(next);
    setBaseline(prepFormBaseline(next));
    setNameEn(product.name_en);
    setNameVn(product.name_vn ?? "");
    setNames(extraNamesOnly(product.names));
    setShowInOrders(Boolean(product.staff_listed));
    setOrderPackType(product.order_pack_type ?? "");
    setOrderPackContentQty(product.order_pack_content_qty ?? null);
    setOrderPackContentUnit(product.order_pack_content_unit ?? "");
    setStaffStockAlertQty(product.staff_stock_alert_qty ?? null);
    setPieceWeight(product.unit_weight_kg);
  }, [recipes, product, viewId]);

  const open = (recipe: ErpRecipe) => {
    if ((dirty || productDirty) && !window.confirm(T("Есть несохранённые изменения. Открыть другую версию?", "Unsaved changes. Open another version?", "Có thay đổi chưa lưu. Mở phiên bản khác?"))) return;
    const next = formFrom(recipe, product);
    setViewId(recipe.id);
    setEditing(recipe.status === "draft");
    setForm(next);
    setBaseline(prepFormBaseline(next));
    setCutsOpen(new Set());
  };

  const set = <K extends keyof RecipeForm>(key: K, value: RecipeForm[K]) => setForm((prev) => ({ ...prev, [key]: value }));
  const setLine = (index: number, patch: Partial<LineDraft>) =>
    setForm((prev) => ({ ...prev, lines: prev.lines.map((line, i) => (i === index ? { ...line, ...patch } : line)) }));
  const toggleCuts = (index: number) => {
    const next = toggleCutsState(cutsOpen, index, form.lines[index].parts);
    setCutsOpen(next.open);
    setLine(index, { parts: next.parts });
  };
  const setLineParts = (index: number, parts: LineDraft["parts"]) => {
    setLine(index, { parts });
    if (!parts.length) {
      setCutsOpen((prev) => {
        const next = new Set(prev);
        next.delete(index);
        return next;
      });
    }
  };
  const ingredientDrag = useDragReorder(
    (from, to) => {
      setForm((prev) => ({ ...prev, lines: moveListItem(prev.lines, from, to) }));
      setCutsOpen((prev) => moveOpenIndexes(prev, from, to));
    },
    { bottomEdge: 160 },
  );

  const costs = form.lines.map((line) => {
    const qty = compositionLineQty(line);
    return line.product_id && qty != null ? costLine(ctx, line.product_id, qty) : null;
  });
  const batchEstimate = compositionYieldCostEstimate(ctx, form.lines);
  const batchCost = compositionYieldCost(ctx, form.lines);

  const storagePayload = serializeStorageOptions(form.storageOptions);

  const publishInput = (): PrepPublishInput => ({
    product: { ...product, name_en: nameEn, name_vn: nameVn, names, unit_weight_kg: pieceWeight },
    kind: form.kind,
    cardNo: form.card_no,
    cardDate: form.card_date,
    photo: form.photo,
    yieldQty: form.yield_qty,
    yieldPieces: unit === "pcs" ? form.yield_qty : form.yield_pieces,
    shelfLifeDays: storagePayload.shelf_life_days,
    storageConditions: storagePayload.storage_conditions,
    version: viewed?.version,
    lines: form.lines.map((line, index) => ({
      product_id: line.product_id,
      qty: line.qty,
      net_qty: line.net_qty,
      methods: line.methods,
      parts: line.parts,
      is_main: line.is_main,
      raw_name: line.raw_name,
      cost: costs[index]?.cost ?? null,
    })),
    catalog: state.products,
    steps: form.steps,
    batchCost,
  });

  const saveNames = async (quiet = false) => {
    const nextEn = nameEn.trim();
    const nextVn = nameVn.trim();
    if (!nextEn) return false;
    const nextNames = extraNamesOnly(names);
    const result = await act<{ id: string }>(
      {
        action: "saveProduct",
        product: prepNamePayload(product, nextEn, nextVn, nextNames, pieceWeight, {
          showInOrders,
          orderPackType,
          orderPackContentQty,
          orderPackContentUnit,
          staffStockAlertQty,
        }),
      },
      quiet ? false : T("Карточка сохранена", "Card saved", "Đã lưu thẻ"),
    );
    if (!result) return false;
    setNameEn(nextEn);
    setNameVn(nextVn);
    setNames(nextNames);
    return true;
  };

  const save = async (overrides?: Partial<Pick<RecipeForm, "yield_qty" | "lines">>): Promise<string | false> => {
    if (productDirty && !dirty && !overrides) {
      return (await saveNames()) ? product.id : false;
    }
    if (productDirty && !(await saveNames(true))) return false;
    const nextLines = (overrides?.lines ?? form.lines).filter(recipeLineHasContent);
    const nextYield = overrides?.yield_qty !== undefined ? overrides.yield_qty : form.yield_qty;
    const partsError = nextLines.map((line) => compositionPartsMessage(state, line)).find(Boolean);
    if (partsError) {
      window.alert(partsError);
      return false;
    }
    const payload: Record<string, unknown> = {
      id: viewed?.id,
      product_id: product.id,
      kind: form.kind,
      card_no: form.card_no.trim(),
      card_date: form.card_date,
      photo: form.photo,
      yield_qty: nextYield,
      yield_pieces: unit === "pcs" ? nextYield : form.yield_pieces,
      shelf_life_days: storagePayload.shelf_life_days,
      storage_conditions: storagePayload.storage_conditions,
      note: form.note,
      instructions: serializeRecipeInstructions(form.steps),
      lines: nextLines.map((line) => ({
        ...line,
        parts: filledParts(line.parts).map((part) => ({ name: part.name.trim(), grams: part.grams })),
      })),
    };
    syncCleanAfterSave.current = true;
    const result = await act<{ id: string }>(
      { action: "saveRecipe", recipe: payload },
      T("Черновик рецептуры сохранён", "Recipe draft saved", "Đã lưu bản nháp"),
    );
    if (result) {
      setViewId(result.id);
      setEditing(true);
      const savedForm = normalizePrepForm({ ...form, yield_qty: nextYield, lines: nextLines });
      setForm(savedForm);
      setBaseline(prepFormBaseline(savedForm));
      return result.id;
    }
    syncCleanAfterSave.current = false;
    return false;
  };

  const savePdf = async () => {
    setSheetBusy(true);
    try {
      const input = publishInput();
      const blob = await makePrepSheetPdf(input);
      downloadPdfFile(blob, prepSheetFileName(input));
    } catch {
      window.alert(T("Не удалось сохранить PDF", "Could not save the PDF", "Không lưu được PDF"));
    } finally {
      setSheetBusy(false);
    }
  };

  const openInApp = async () => {
    const href = staffRecipeCardUrl(product.id);
    const needsSave = dirty || productDirty || viewed?.status === "draft" || !viewed;
    setAppBusy(true);
    try {
      if (needsSave) {
        if (!(await save())) return;
      } else {
        await act({ action: "publishPrepToStaff", productId: product.id }, false);
      }
      window.location.assign(href);
    } finally {
      setAppBusy(false);
    }
  };

  const unlinked = form.lines.filter(recipeLineHasContent).filter((line) => !line.product_id).length;
  const readOnly = !editing;
  const net = netWeight(state, form.lines);
  const netYield = unit === "kg" || unit === "l" ? net.kg : null;
  const suggestedPieces =
    unit === "pcs" && pieceWeight && pieceWeight > 0 && net.kg > 0
      ? Math.max(1, Math.round(net.kg / pieceWeight))
      : null;
  const activateYield = form.yield_qty ?? netYield ?? suggestedPieces;

  const activate = async () => {
    const lines = form.lines.filter(recipeLineHasContent);
    const unlinkedFilled = lines.filter((line) => !line.product_id);
    if (unlinkedFilled.length) {
      window.alert(
        T(
          "Сначала привяжите все ингредиенты к продуктам.",
          "Link every ingredient to a product first.",
          "Hãy gắn mọi nguyên liệu với sản phẩm trước.",
        ),
      );
      return;
    }
    if (!lines.length) {
      window.alert(T("Добавьте хотя бы один ингредиент.", "Add at least one ingredient.", "Thêm ít nhất một nguyên liệu."));
      return;
    }
    const yieldQty = activateYield;
    if (!yieldQty) {
      window.alert(
        unit === "pcs"
          ? T(
              "Укажите выход в штуках (и при желании вес 1 штуки), затем снова нажмите «Сделать действующей».",
              "Enter the finished yield in pieces (and optionally the weight of 1 piece), then press Make active again.",
              "Nhập sản lượng theo cái (và khối lượng 1 cái nếu cần), rồi bấm Áp dụng công thức.",
            )
          : T(
              "Укажите вес готового / выход, затем снова нажмите «Сделать действующей».",
              "Enter the finished yield, then press Make active again.",
              "Nhập sản lượng thành phẩm, rồi bấm Áp dụng công thức.",
            ),
      );
      return;
    }
    const id =
      viewed?.status === "draft" && !dirty && !productDirty && form.yield_qty
        ? viewed.id
        : await save({ yield_qty: yieldQty, lines });
    if (!id) return;
    if (await act({ action: "activateRecipe", id }, T("Рецептура действует", "Recipe is now active", "Công thức đã được áp dụng")))
      setEditing(false);
  };

  return (
    <>
      <BackLink from={from} />
      <PageHead
        title={productTitle({ ...product, name_en: nameEn, name_vn: nameVn, names })}
        sub={
          active
            ? `${T("Действующая версия", "Active version", "Phiên bản đang dùng")} v${active.version} · ${T("выход", "yield", "sản lượng")} ${yieldText(active, unit)}`
            : T("Нет действующей рецептуры", "No active recipe yet", "Chưa có công thức đang dùng")
        }
        actions={
          active ? (
            <NavLink href={`/erp/menu/processing/new?recipe=${active.id}`} className="erpBtn primary">
              {T("Изготовить партию", "Make a batch", "Sản xuất mẻ")}
            </NavLink>
          ) : null
        }
      />

      <PrepCardHeader
        kind={form.kind}
        nameEn={nameEn}
        nameVn={nameVn}
        names={names}
        cardNo={form.card_no}
        cardDate={form.card_date}
        photo={form.photo}
        readOnly={readOnly}
        onKind={(value) => set("kind", value)}
        onNameEn={setNameEn}
        onNameVn={setNameVn}
        onNames={setNames}
        onCardNo={(value) => set("card_no", value)}
        onCardDate={(value) => set("card_date", value)}
        onPhoto={(value) => {
          setEditing(true);
          set("photo", value);
        }}
      />
      <p className="erpHint">
        {T(
          "Название на карточке и в тех. картах одно и то же. Вьетнамское необязательно — в VN-интерфейсе подставится английское.",
          "This name is the card title and what tech cards show. Vietnamese is optional — the VN UI falls back to English.",
          "Tên này là tiêu đề thẻ và tên trên công thức. Tiếng Việt không bắt buộc — giao diện VN sẽ dùng tiếng Anh.",
        )}
      </p>

      {recipes.length > 1 ? (
        <div className="erpSubTabs">
          {recipes.map((r) => (
            <a
              key={r.id}
              href="#"
              className={r.id === viewId ? "active" : ""}
              onClick={(event) => {
                event.preventDefault();
                open(r);
              }}
            >
              v{r.version} · {statusLabel(r.status)}
            </a>
          ))}
        </div>
      ) : null}

      {viewed && viewed.status !== "draft" && !editing ? (
        <div className="erpNotice warn">
          {viewed.status === "active"
            ? T("Это действующая рецептура. Изменения сохранятся как новая версия.", "This is the active recipe. Changes are saved as a new version.", "Đây là công thức đang dùng. Thay đổi sẽ tạo phiên bản mới.")
            : T("Это архивная версия, она хранится для истории.", "This is an archived version kept for history.", "Đây là phiên bản lưu trữ.")}{" "}
          <button type="button" className="erpLink" onClick={() => setEditing(true)}>
            {T("Изменить", "Edit", "Sửa")}
          </button>
        </div>
      ) : null}

      <div className="erpCard">
        <h2>{T("Хранение", "Storage", "Bảo quản")}</h2>
        <label className="erpCheck" style={{ marginBottom: 12 }}>
          <input
            type="checkbox"
            checked={showInOrders}
            disabled={Boolean(busy)}
            onChange={async (e) => {
              const next = e.target.checked;
              setShowInOrders(next);
              const result = await act<{ id: string; staff_listed?: boolean }>(
                { action: "setPrepStockListed", id: product.id, listed: next },
                next
                  ? T("Добавлено в Prep Stock", "Added to Prep Stock", "Đã thêm vào Prep Stock")
                  : T("Убрано из Prep Stock", "Removed from Prep Stock", "Đã bỏ khỏi Prep Stock"),
              );
              if (!result) setShowInOrders(!next);
            }}
          />
          <span>
            {T("Показывать в Prep Stock", "Show in Prep Stock", "Hiện trong Prep Stock")}
            <span className="erpCellSub">
              {" "}
              —{" "}
              {T(
                "сохраняется сразу. Order List не зависит от этой галки. Поставщик не обязателен.",
                "saves immediately. Order List ignores this checkbox. Supplier is optional.",
                "lưu ngay. Order List không phụ thuộc. Nhà cung cấp không bắt buộc.",
              )}
            </span>
          </span>
        </label>
        <div className="erpGrid">
          <Field
            label={T("Вес 1 штуки", "Weight of 1 piece", "Khối lượng 1 cái")}
            hint={T("Сколько весит одна штука готового продукта", "How much one finished piece weighs", "Một cái thành phẩm nặng bao nhiêu")}
          >
            <QtyInput base="kg" value={pieceWeight} disabled={readOnly} defaultSmall onChange={setPieceWeight} />
          </Field>
          {unit && unit !== "pcs" ? (
            <Field
              label={T("Штук в партии", "Pieces per batch", "Số cái mỗi mẻ")}
              hint={T("Если полуфабрикат делится на порции", "If the product is portioned", "Nếu chia phần")}
            >
              <NumberInput value={form.yield_pieces} disabled={readOnly} onChange={(v) => set("yield_pieces", v === null ? null : Math.round(v))} />
            </Field>
          ) : null}
        </div>
        <div className="erpGrid two" style={{ marginTop: 12 }}>
          <Field
            label={T("Фасовка — тип упаковки", "Packing — package type", "Quy cách — loại bao bì")}
            hint={T(
              "Для Orders. Не путать с выходом производства и складской единицей.",
              "For Orders. Not production yield and not the stock unit.",
              "Cho Orders. Không phải năng suất SX và không phải đơn vị kho.",
            )}
          >
            <input
              value={orderPackType}
              disabled={readOnly}
              onChange={(e) => setOrderPackType(e.target.value)}
              placeholder={T("пакет / pack / túi", "pack / bag", "túi / pack")}
            />
          </Field>
          <Field label={T("Количество в упаковке", "Units per pack", "Số lượng trong bao")}>
            <NumberInput value={orderPackContentQty} disabled={readOnly} onChange={setOrderPackContentQty} />
          </Field>
          <Field label={T("Единица содержимого", "Content unit", "Đơn vị nội dung")}>
            <input
              value={orderPackContentUnit}
              disabled={readOnly}
              onChange={(e) => setOrderPackContentUnit(e.target.value)}
              placeholder={T("шт. / г", "pcs / g", "cái / g")}
            />
          </Field>
          <Field
            label={T("Контроль остатков", "Stock control", "Kiểm soát tồn")}
            hint={T(
              "Критическое значение в единице учёта. В Prep Stock при печати Share PDF строки с остатком ≤ этого числа подсвечиваются красным (произвести).",
              "Critical qty in stock unit. Prep Stock Share PDF highlights rows in red when qty ≤ this (produce).",
              "Ngưỡng theo đơn vị tồn. Prep Stock Share PDF tô đỏ dòng khi tồn ≤ mức này (sản xuất).",
            )}
          >
            <NumberInput
              value={staffStockAlertQty}
              disabled={readOnly}
              onChange={setStaffStockAlertQty}
              placeholder={unit ? String(unit) : "0"}
            />
          </Field>
        </div>
        <div className="erpStorageBlock">
          <h3 className="erpStorageTitle">{T("Сроки и условия хранения", "Shelf life and storage", "Hạn dùng và bảo quản")}</h3>
          <StorageOptionsEditor
            options={form.storageOptions}
            disabled={readOnly}
            onChange={(value) => set("storageOptions", value)}
          />
        </div>
      </div>

      <div className="erpCard">
        <details className="erpYieldCompose" open={composeOpen} onToggle={(event) => setComposeOpen(event.currentTarget.open)}>
          <summary>
            {T("Состав на нормативный выход", "Ingredients for the standard yield", "Thành phần cho sản lượng chuẩn")}
          </summary>
        {unlinked ? (
          <div className="erpNotice warn">
            {T(
              `Ингредиентов без привязки к продукту: ${unlinked}. Выберите продукт для каждой отмеченной строки.`,
              `${unlinked} ingredient(s) are not linked to a product. Choose a product for each marked line.`,
              `${unlinked} nguyên liệu chưa liên kết. Chọn sản phẩm cho từng dòng.`,
            )}
          </div>
        ) : null}
        <div className="erpGrid two" style={{ marginBottom: 12 }}>
          <Field
            label={
              unit === "pcs"
                ? T("Выход готового, шт", "Finished yield, pcs", "Sản lượng thành phẩm, cái")
                : T("Вес готового / выход", "Finished yield", "Thành phẩm / sản lượng")
            }
            hint={
              unit === "pcs"
                ? T(
                    "Сколько штук получается из этого состава. Для активации рецептуры поле обязательно.",
                    "How many pieces this composition makes. Required to make the recipe active.",
                    "Số cái từ thành phần này. Bắt buộc để áp dụng công thức.",
                  )
                : T(
                    "Нормативный выход этой карты. Можно подставить сумму нетто состава.",
                    "Standard yield of this card. You can use the total net of the ingredients.",
                    "Sản lượng chuẩn của thẻ. Có thể dùng tổng netto thành phần.",
                  )
            }
          >
            {unit === "pcs" ? (
              <NumberInput
                value={form.yield_qty}
                disabled={readOnly}
                onChange={(v) => set("yield_qty", v === null ? null : Math.max(0, Math.round(v)))}
              />
            ) : (
              <QtyInput base={unit} value={form.yield_qty} disabled={readOnly} defaultSmall onChange={(v) => set("yield_qty", v)} />
            )}
          </Field>
          {net.kg > 0 ? (
            <Field label={T("Сумма нетто состава", "Total net of composition", "Tổng netto thành phần")}>
              <strong className="erpNetSumValue">{netWeightText(net)}</strong>
              {!readOnly && unit !== "pcs" && form.yield_qty !== net.kg ? (
                <button type="button" className="erpLink" style={{ display: "block", marginTop: 6 }} onClick={() => set("yield_qty", net.kg)}>
                  {T("Подставить в вес готового", "Use as finished yield", "Dùng làm trọng lượng thành phẩm")}
                </button>
              ) : null}
              {!readOnly && unit === "pcs" && suggestedPieces && form.yield_qty !== suggestedPieces ? (
                <button
                  type="button"
                  className="erpLink"
                  style={{ display: "block", marginTop: 6 }}
                  onClick={() => set("yield_qty", suggestedPieces)}
                >
                  {T(
                    `Подставить ${suggestedPieces} шт по весу 1 штуки`,
                    `Use ${suggestedPieces} pcs from the piece weight`,
                    `Dùng ${suggestedPieces} cái theo khối lượng 1 cái`,
                  )}
                </button>
              ) : null}
            </Field>
          ) : null}
        </div>
        {form.lines.length ? (
          <MainIngredientChips
            labels={form.lines.map((line, index) =>
              compositionChipLabel(
                line.product_id ? liveCatalogName(state.products, line.product_id) : line.raw_name?.en || line.raw_name?.vn || line.raw_name?.ru,
                index,
              ),
            )}
            mains={form.lines.map((line) => Boolean(line.is_main))}
            disabled={readOnly}
            onToggle={(index) => set("lines", withMainFlags(form.lines, index))}
          />
        ) : null}
        {form.lines.length ? (
          <div className="erpTableWrap scroll erpYieldWrap">
            <table className="erpTable stack erpComposeTable">
              <thead>
                <tr>
                  <th>{T("Продукт", "Product", "Sản phẩm")}</th>
                  <th>{T("Обработка", "Processing", "Sơ chế")}</th>
                  <th>{T("Брутто", "Gross", "Brutto")}</th>
                  <th>{T("Нетто", "Net", "Netto")}</th>
                  <th className="num">{T("Стоимость", "Cost", "Chi phí")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {form.lines.map((line, index) => {
                  const lineUnit = unitOf(state, line.product_id);
                  const lineProduct = line.product_id ? state.products.find((item) => item.id === line.product_id) : undefined;
                  const prepComponent = isCompositionPrepType(lineProduct?.type);
                  const cost = costs[index];
                  const cuts = cutsOpen.has(index);
                  return (
                    <Fragment key={index}>
                      <tr
                        ref={(element) => {
                          ingredientDrag.rowRefs.current[index] = element;
                        }}
                        className={`erpComposeLine${ingredientDrag.dragIndex === index ? " dragging" : ""}`}
                      >
                        <td className="main">
                          <div className="erpComposeName">
                            {!readOnly ? <ComposeDragHandle index={index} handleProps={ingredientDrag.handleProps} /> : null}
                            {line.raw_name && !line.product_id ? (
                              <div className="erpHint">
                                <span className="erpBadge warn">{T("нужно выбрать продукт", "choose a product", "chọn sản phẩm")}</span> {line.raw_name.en} ·{" "}
                                {line.raw_amount} {line.raw_unit}
                              </div>
                            ) : null}
                            {readOnly ? (
                              <span className="erpName">{liveCatalogName(state.products, line.product_id)}</span>
                            ) : (
                              <IngredientPicker
                                state={state}
                                value={line.product_id}
                                excludeIds={blockedComponents}
                                onChange={(productId) => {
                                  const base = unitOf(state, productId);
                                  setLine(index, {
                                    product_id: productId || null,
                                    qty: toBase(line.raw_amount, line.raw_unit, base) ?? line.qty,
                                    methods: [],
                                    net_qty: null,
                                    parts: [],
                                  });
                                  setCutsOpen((prev) => {
                                    const next = new Set(prev);
                                    next.delete(index);
                                    return next;
                                  });
                                }}
                              />
                            )}
                          </div>
                        </td>
                        <td className={readOnly ? "" : "edit"} data-label={T("Обработка", "Processing", "Sơ chế")}>
                          <MethodPicker state={state} line={line} disabled={readOnly} onChange={(patch) => setLine(index, patch)} />
                        </td>
                        <td className={readOnly ? "" : "edit"} data-label={T("Брутто", "Gross", "Brutto")}>
                          {readOnly ? (
                            qtyText(line.qty, lineUnit)
                          ) : line.product_id ? (
                            <QtyInput
                              base={lineUnit}
                              value={line.qty}
                              defaultSmall={lineUnit !== "pcs"}
                              onChange={(v) => setLine(index, grossPatch(state, line, v))}
                            />
                          ) : (
                            <span className="erpMuted">{T("сначала выберите продукт", "choose a product first", "chọn sản phẩm trước")}</span>
                          )}
                        </td>
                        <td className={readOnly ? "" : "edit"} data-label={T("Нетто", "Net", "Netto")}>
                          <NetCell state={state} line={line} disabled={readOnly} onChange={(patch) => setLine(index, patch)} />
                        </td>
                        <td className="num" data-label={T("Стоимость", "Cost", "Chi phí")}>
                          {!line.product_id ? (
                            <span className="erpMuted">{T("нет связи", "not linked", "chưa liên kết")}</span>
                          ) : !cost ? (
                            "—"
                          ) : cost.cost === null ? (
                            <span className="erpBadge warn">
                              {cost.issue === "unresolved"
                                ? T("нет в каталоге", "not in catalog", "không có trong danh mục")
                                : T("нет цены", "no price", "chưa có giá")}
                            </span>
                          ) : (
                            <span
                              className={cost.issue ? "erpCostApprox" : undefined}
                              title={
                                cost.issue
                                  ? T(
                                      "Приблизительно: не у всех ингредиентов есть цена",
                                      "Approximate: some ingredients have no price",
                                      "Tạm tính: một số nguyên liệu chưa có giá",
                                    )
                                  : undefined
                              }
                            >
                              {vnd(cost.cost)}
                            </span>
                          )}
                        </td>
                        <td className="num erpComposeActs">
                          <LinePartsButton
                            parts={line.parts}
                            unit={lineUnit}
                            open={cuts}
                            disabled={readOnly}
                            productType={lineProduct?.type}
                            onToggle={() => toggleCuts(index)}
                          />
                          {!readOnly ? (
                            <button
                              type="button"
                              className="erpIconBtn"
                              aria-label={T("Удалить строку", "Remove line", "Xóa dòng")}
                              onClick={() => {
                                set("lines", form.lines.filter((_, i) => i !== index));
                                setCutsOpen((prev) => shiftOpenCuts(prev, index));
                              }}
                            >
                              ×
                            </button>
                          ) : null}
                        </td>
                      </tr>
                      {prepComponent ? null : (
                        <LinePartsPlaque
                          colSpan={6}
                          open={cuts}
                          parts={line.parts}
                          parentSmall={netToSmallUnit(netOf(state, line))}
                          unit={lineUnit}
                          disabled={readOnly}
                          onChange={(parts) => setLineParts(index, parts)}
                        />
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
              <YieldCostFooter
                colSpan={6}
                yieldText={yieldDisplayText(form.yield_qty, unit, form.yield_pieces)}
                cost={batchEstimate.amount}
                approximate={!batchEstimate.complete}
                perUnit={yieldPerUnitText(batchEstimate.amount, form.yield_qty, unit, form.yield_pieces)}
              />
            </table>
          </div>
        ) : (
          <Empty
            title={T("Состав пока пуст", "No ingredients yet", "Chưa có nguyên liệu")}
            text={T("Добавьте сырьё или другие полуфабрикаты, из которых готовится эта карта.", "Add ingredients or other preps this is made from.", "Thêm nguyên liệu hoặc bán thành phẩm dùng để làm.")}
          />
        )}
        {!readOnly ? (
          <div className="erpActions">
            <button
              type="button"
              className="erpBtn"
              onClick={() =>
                set("lines", [...form.lines, { product_id: null, qty: null, note: null, raw_name: null, raw_amount: null, raw_unit: null, methods: [], net_qty: null, parts: [], is_main: false }])
              }
            >
              + {T("Добавить ингредиент", "Add ingredient", "Thêm nguyên liệu")}
            </button>
          </div>
        ) : null}
        {form.lines.length ? (
          <p className="erpHint">
            {lossHint()}{" "}
            {T(
              "Брутто и нетто меняются отдельно, пока не выбрана обработка.",
              "Gross and net stay independent until processing is chosen.",
              "Brutto và netto độc lập cho đến khi chọn sơ chế.",
            )}
          </p>
        ) : null}

        </details>
      </div>

      <PrepStepsEditor steps={form.steps} readOnly={readOnly} onChange={(steps) => set("steps", steps)} />

      <div className="erpActions">
        {!readOnly || productDirty ? (
          <button
            type="button"
            className="erpBtn primary"
            disabled={busy || !nameEn.trim() || (!productDirty && !dirty && viewed?.status === "draft")}
            onClick={() => void save()}
            data-testid="prep-save"
          >
            {busy
              ? savingText()
              : productDirty && !dirty
                ? T("Сохранить карточку", "Save card", "Lưu thẻ")
                : viewed && viewed.status !== "draft"
                  ? T("Сохранить как новую версию", "Save as new version", "Lưu phiên bản mới")
                  : T("Сохранить черновик", "Save draft", "Lưu nháp")}
          </button>
        ) : null}
        {!viewed || viewed.status === "draft" ? (
          <button type="button" className="erpBtn" disabled={busy} onClick={() => void activate()}>
            {T("Сделать действующей", "Make active", "Áp dụng công thức")}
          </button>
        ) : null}
        {editing && viewed && viewed.status !== "draft" ? (
          <button
            type="button"
            className="erpBtn ghost"
            onClick={() => {
              const next = formFrom(viewed, product);
              setForm(next);
              setBaseline(prepFormBaseline(next));
              setEditing(false);
              setNameEn(product.name_en);
              setNameVn(product.name_vn ?? "");
              setNames(extraNamesOnly(product.names));
              setPieceWeight(product.unit_weight_kg);
            }}
          >
            {T("Отменить изменения", "Discard changes", "Hủy thay đổi")}
          </button>
        ) : null}
      </div>
      <div className="erpActions">
        <button
          type="button"
          className="erpBtn"
          disabled={sheetBusy || appBusy}
          onClick={() => void savePdf()}
          data-testid="prep-pdf"
        >
          {sheetBusy ? savingText() : T("Сохранить PDF", "Save PDF", "Lưu PDF")}
        </button>
        <button
          type="button"
          className="erpBtn primary"
          disabled={sheetBusy || appBusy || busy || !nameEn.trim()}
          onClick={() => void openInApp()}
          data-testid="prep-get-in-app"
        >
          {appBusy ? savingText() : "GET IN APP"}
        </button>
      </div>
      <p className="erpHint">
        {T(
          "PDF — оформленный лист техкарты. GET IN APP открывает эту карточку в приложении Recipes для сотрудников (https://gastrofood.vn/recipes/…).",
          "PDF is a formatted tech-card sheet. GET IN APP opens this card in the staff Recipes app (https://gastrofood.vn/recipes/…).",
          "PDF là phiếu kỹ thuật. GET IN APP mở thẻ này trong ứng dụng Recipes cho nhân viên (https://gastrofood.vn/recipes/…).",
        )}
      </p>
      {viewed?.status === "draft" ? (
        <p className="erpHint">
          {T(
            "Черновик не используется в расчётах. Сделайте рецептуру действующей, когда состав и выход заполнены.",
            "A draft is not used in calculations. Make it active once ingredients and yield are filled in.",
            "Bản nháp chưa được dùng để tính. Hãy áp dụng khi đã đủ thành phần và sản lượng.",
          )}
        </p>
      ) : null}
    </>
  );
}
