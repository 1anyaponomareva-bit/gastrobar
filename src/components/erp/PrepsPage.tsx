"use client";

import { useErpRouter } from "./erpHref";
import { Fragment, useEffect, useMemo, useState } from "react";
import { Pager, usePageSize } from "./Pager";
import { compositionChipLabel, moveListItem, moveOpenIndexes, withMainFlags } from "@/lib/erp/compositionLines";
import { buildCostContext, compositionYieldCost, costLine, liveCatalogName, plannedUnitCost, productTitle, type ErpUnit } from "@/lib/erp/costing";
import { menuListBackHref, withMenuListReturn } from "@/lib/erp/menuListQuery";
import type { ErpProduct, ErpRecipe, ErpRecipeLine, ErpState } from "@/lib/erp/types";
import { parseRecipeInstructions, serializeRecipeInstructions, type RecipeStepDraft } from "@/lib/erp/recipeCard";
import { useDragReorder } from "@/lib/useDragReorder";
import { ComposeDragHandle, MainIngredientChips } from "./CompositionMains";
import { DocTable, useDocuments } from "./docs";
import { useErp } from "./ErpShell";
import { IngredientPicker } from "./IngredientPicker";
import { compositionPartsMessage, LinePartsButton, LinePartsPlaque } from "./LineParts";
import { MenuMobileNav, MENU_HREFS } from "./menuNav";
import { filledParts, netToSmallUnit, parseLineParts, shiftOpenCuts, toggleCutsState } from "@/lib/erp/lineParts";
import { grossPatch, lossHint, MethodPicker, NetCell, netOf, netWeight, netWeightText } from "./losses";
import { PrepCardHeader, PrepStepsEditor } from "./PrepCardFields";
import { YieldCostFooter, yieldDisplayText, yieldPerUnitText } from "./YieldComposition";
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
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = usePageSize();
  const ctx = useMemo(() => (state ? buildCostContext(state.products, state.recipes) : null), [state]);
  useEffect(() => setPage(0), [query, pageSize]);
  if (!state || !ctx) return null;

  const all = state.products
    .filter((p) => !p.archived_at && (p.type === "semi_finished" || p.type === "finished"))
    .sort((a, b) => a.name_en.localeCompare(b.name_en));
  const q = query.trim().toLowerCase();
  const list = all.filter((p) => !q || `${p.name_en} ${p.name_vn}`.toLowerCase().includes(q));
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
            "Создайте полуфабрикат с рецептурой или загрузите рецептуры из приложения Recipes.",
            "Create a semi-finished product with a recipe or import recipes from the Recipes app.",
            "Tạo bán thành phẩm với công thức hoặc nhập công thức từ ứng dụng Recipes.",
          )}
          action={
            <>
              <NavLink href="/erp/preps/recipe/new" className="erpBtn primary">
                {T("Создать полуфабрикат", "Create semi-finished", "Tạo bán thành phẩm")}
              </NavLink>
              <NavLink href="/erp/service/import" className="erpBtn">
                {T("Загрузить рецептуры", "Import recipes", "Nhập công thức")}
              </NavLink>
            </>
          }
        />
      ) : (
        <>
          {all.length > 6 ? (
            <div className="erpToolbar">
              <input
                type="search"
                placeholder={T("Найти полуфабрикат…", "Find…", "Tìm…")}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
          ) : null}
          {!list.length ? (
            noSearchResults(() => setQuery(""))
          ) : (
            <div className="erpTableWrap">
              <table className="erpTable stack">
                <thead>
                  <tr>
                    <th>{T("Название", "Name", "Tên")}</th>
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
                    const cost = active ? plannedUnitCost(ctx, p.id) : null;
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
                        <td data-label={T("Нормативный выход", "Standard yield", "Sản lượng chuẩn")}>{yieldText(active, p.base_unit)}</td>
                        <td className="num" data-label={T("Себестоимость единицы", "Unit cost", "Giá vốn / đơn vị")}>
                          {!active ? (
                            "—"
                          ) : cost === null ? (
                            <span className="erpBadge warn">{T("не все цены известны", "some prices missing", "thiếu giá")}</span>
                          ) : (
                            `${vnd(cost)} / ${unitLabel(p.base_unit)}`
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
  const [unit, setUnit] = useState<ErpUnit | "">("");
  useDirtyGuard(Boolean(nameEn || nameVn));
  return (
    <>
      <BackLink from={from} />
      <PageHead title={T("Новый полуфабрикат", "New semi-finished product", "Bán thành phẩm mới")} />
      <div className="erpCard">
        <div className="erpGrid">
          <Field label={T("Название (English) *", "Name (English) *", "Tên (English) *")}>
            <input
              value={nameEn}
              onChange={(event) => setNameEn(event.target.value)}
              placeholder="Beef patty"
              maxLength={200}
              data-testid="prep-name"
            />
          </Field>
          <Field label={T("Название (Tiếng Việt)", "Name (Tiếng Việt)", "Tên (Tiếng Việt)")}>
            <input
              value={nameVn}
              onChange={(event) => setNameVn(event.target.value)}
              placeholder="Chả bò"
              maxLength={200}
              data-testid="prep-name-vn"
            />
          </Field>
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
                { action: "saveProduct", product: { type: "semi_finished", name_en: nameEn, name_vn: nameVn, base_unit: unit } },
                T("Полуфабрикат создан — добавьте состав", "Created — now add the ingredients", "Đã tạo — thêm nguyên liệu"),
              );
              if (result) {
                setNameEn("");
                setNameVn("");
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
  card_no: string;
  card_date: string;
  card_revision: string;
  photo: string;
  yield_qty: number | null;
  yield_pieces: number | null;
  shelf_life_days: number | null;
  storage_conditions: string;
  note: string;
  steps: RecipeStepDraft[];
  lines: LineDraft[];
};

/** Identity fields for a name-only save. Omits packs/cost/losses so those stay as stored. */
function prepNamePayload(product: ErpProduct, nameEn: string, nameVn: string) {
  return {
    id: product.id,
    type: product.type,
    name_en: nameEn.trim(),
    name_vn: nameVn.trim(),
    base_unit: product.base_unit,
    category_id: product.category_id,
    unit_weight_kg: product.unit_weight_kg,
    brand: product.brand ?? "",
    shelf_life_days: product.shelf_life_days,
    storage_conditions: product.storage_conditions ?? "",
  };
}

function formFrom(recipe: ErpRecipe | null, product: ErpProduct): RecipeForm {
  return {
    card_no: recipe?.card_no ?? "",
    card_date: (recipe?.card_date ?? "").slice(0, 10) || (recipe ? "" : today()),
    card_revision: recipe?.card_revision ?? "",
    photo: recipe?.photo ?? "",
    yield_qty: recipe?.yield_qty ?? null,
    yield_pieces: recipe?.yield_pieces ?? null,
    shelf_life_days: recipe?.shelf_life_days ?? product.shelf_life_days ?? null,
    storage_conditions: recipe?.storage_conditions ?? product.storage_conditions ?? "",
    note: recipe?.note ?? "",
    steps: parseRecipeInstructions(recipe?.instructions),
    lines: (recipe?.lines ?? []).map((line) => ({
      product_id: line.product_id,
      qty: line.qty,
      note: line.note,
      raw_name: line.raw_name,
      raw_amount: line.raw_amount,
      raw_unit: line.raw_unit,
      methods: line.methods ?? [],
      net_qty: line.net_qty ?? null,
      parts: parseLineParts(line.parts),
      is_main: Boolean(line.is_main),
    })),
  };
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
  const [baseline, setBaseline] = useState(() => JSON.stringify(formFrom(viewed, product)));
  const [nameEn, setNameEn] = useState(product.name_en);
  const [nameVn, setNameVn] = useState(product.name_vn ?? "");
  const [composeOpen, setComposeOpen] = useState(true);
  const [cutsOpen, setCutsOpen] = useState<Set<number>>(new Set());
  const ctx = useMemo(() => buildCostContext(state.products, state.recipes), [state]);
  const unit = product.base_unit;
  const dirty = editing && JSON.stringify(form) !== baseline;
  const namesDirty = nameEn.trim() !== product.name_en.trim() || nameVn.trim() !== (product.name_vn ?? "").trim();
  useDirtyGuard(dirty || namesDirty);

  const open = (recipe: ErpRecipe) => {
    if ((dirty || namesDirty) && !window.confirm(T("Есть несохранённые изменения. Открыть другую версию?", "Unsaved changes. Open another version?", "Có thay đổi chưa lưu. Mở phiên bản khác?"))) return;
    const next = formFrom(recipe, product);
    setViewId(recipe.id);
    setEditing(recipe.status === "draft");
    setForm(next);
    setBaseline(JSON.stringify(next));
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

  const saveNames = async (quiet = false) => {
    const nextEn = nameEn.trim();
    const nextVn = nameVn.trim();
    if (!nextEn) return false;
    const result = await act<{ id: string }>(
      { action: "saveProduct", product: prepNamePayload(product, nextEn, nextVn) },
      quiet ? false : T("Название сохранено", "Name saved", "Đã lưu tên"),
    );
    if (!result) return false;
    setNameEn(nextEn);
    setNameVn(nextVn);
    return true;
  };

  const save = async () => {
    if (namesDirty && !dirty) {
      await saveNames();
      return;
    }
    if (namesDirty && !(await saveNames(true))) return;
    const partsError = form.lines.map((line) => compositionPartsMessage(state, line)).find(Boolean);
    if (partsError) {
      window.alert(partsError);
      return;
    }
    const payload: Record<string, unknown> = {
      id: viewed?.id,
      product_id: product.id,
      card_no: form.card_no.trim(),
      card_date: form.card_date,
      card_revision: form.card_revision.trim(),
      photo: form.photo,
      yield_qty: form.yield_qty,
      yield_pieces: unit === "pcs" ? form.yield_qty : form.yield_pieces,
      shelf_life_days: form.shelf_life_days,
      storage_conditions: form.storage_conditions,
      note: form.note,
      instructions: serializeRecipeInstructions(form.steps),
      lines: form.lines.map((line) => ({
        ...line,
        parts: filledParts(line.parts).map((part) => ({ name: part.name.trim(), grams: part.grams })),
      })),
    };
    const result = await act<{ id: string }>(
      { action: "saveRecipe", recipe: payload },
      T("Черновик рецептуры сохранён", "Recipe draft saved", "Đã lưu bản nháp"),
    );
    if (result) {
      setViewId(result.id);
      setEditing(true);
      setBaseline(JSON.stringify(form));
    }
  };

  const activate = async () => {
    if (!viewed || viewed.status !== "draft") return;
    if (dirty || namesDirty) {
      window.alert(T("Сначала сохраните изменения.", "Save your changes first.", "Hãy lưu thay đổi trước."));
      return;
    }
    if (await act({ action: "activateRecipe", id: viewed.id }, T("Рецептура действует", "Recipe is now active", "Công thức đã được áp dụng")))
      setEditing(false);
  };

  const costs = form.lines.map((line) => (line.product_id && line.qty ? costLine(ctx, line.product_id, line.qty) : null));
  const batchCost = compositionYieldCost(ctx, form.lines);
  const unlinked = form.lines.filter((line) => !line.product_id).length;
  const readOnly = !editing;
  const net = netWeight(state, form.lines);
  const netYield = unit === "kg" || unit === "l" ? net.kg : null;

  return (
    <>
      <BackLink from={from} />
      <PageHead
        title={productTitle({ ...product, name_en: nameEn, name_vn: nameVn })}
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
        nameEn={nameEn}
        nameVn={nameVn}
        cardNo={form.card_no}
        cardDate={form.card_date}
        cardRevision={form.card_revision}
        photo={form.photo}
        yieldQty={form.yield_qty}
        unit={unit}
        readOnly={readOnly}
        onNameEn={setNameEn}
        onNameVn={setNameVn}
        onCardNo={(value) => set("card_no", value)}
        onCardDate={(value) => set("card_date", value)}
        onCardRevision={(value) => set("card_revision", value)}
        onPhoto={(value) => set("photo", value)}
        onYieldQty={(value) => set("yield_qty", value)}
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
        <div className="erpGrid">
          {unit && unit !== "pcs" ? (
            <Field
              label={T("Штук в партии", "Pieces per batch", "Số cái mỗi mẻ")}
              hint={T("Если полуфабрикат делится на порции", "If the product is portioned", "Nếu chia phần")}
            >
              <NumberInput value={form.yield_pieces} disabled={readOnly} onChange={(v) => set("yield_pieces", v === null ? null : Math.round(v))} />
            </Field>
          ) : null}
          <Field label={T("Срок годности, дней", "Shelf life, days", "Hạn dùng, ngày")}>
            <NumberInput value={form.shelf_life_days} disabled={readOnly} onChange={(v) => set("shelf_life_days", v === null ? null : Math.round(v))} />
          </Field>
          <Field label={T("Условия хранения", "Storage", "Bảo quản")}>
            <input value={form.storage_conditions} disabled={readOnly} placeholder="0…4 °C" onChange={(event) => set("storage_conditions", event.target.value)} />
          </Field>
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
          <div className="erpTableWrap erpYieldWrap">
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
                        <td className={readOnly || !line.methods?.length ? "" : "edit"} data-label={T("Нетто", "Net", "Netto")}>
                          <NetCell state={state} line={line} disabled={readOnly} onChange={(patch) => setLine(index, patch)} />
                        </td>
                        <td className="num" data-label={T("Стоимость", "Cost", "Chi phí")}>
                          {!cost ? "—" : cost.cost === null ? <span className="erpBadge warn">{T("нет цены", "no price", "chưa có giá")}</span> : vnd(cost.cost)}
                        </td>
                        <td className="num erpComposeActs">
                          <LinePartsButton parts={line.parts} unit={lineUnit} open={cuts} disabled={readOnly} onToggle={() => toggleCuts(index)} />
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
                      <LinePartsPlaque
                        colSpan={6}
                        open={cuts}
                        parts={line.parts}
                        parentSmall={netToSmallUnit(netOf(state, line))}
                        unit={lineUnit}
                        disabled={readOnly}
                        onChange={(parts) => setLineParts(index, parts)}
                      />
                    </Fragment>
                  );
                })}
              </tbody>
              <YieldCostFooter
                colSpan={6}
                yieldText={yieldDisplayText(form.yield_qty, unit, form.yield_pieces)}
                cost={batchCost}
                perUnit={yieldPerUnitText(batchCost, form.yield_qty, unit, form.yield_pieces)}
              />
            </table>
          </div>
        ) : (
          <Empty
            title={T("Состав пока пуст", "No ingredients yet", "Chưa có nguyên liệu")}
            text={T("Добавьте продукты, из которых готовится полуфабрикат.", "Add the products this is made from.", "Thêm sản phẩm dùng để làm.")}
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
        {form.lines.length ? <p className="erpHint">{lossHint()}</p> : null}
        {netYield ? (
          <div className="erpNotice">
            {T("Сумма нетто по составу", "Total net weight of the ingredients", "Tổng netto của thành phần")}: <strong>{netWeightText(net)}</strong>
            {!readOnly && form.yield_qty !== netYield ? (
              <>
                {" "}
                <button type="button" className="erpLink" onClick={() => set("yield_qty", netYield)}>
                  {T("Подставить в нормативный выход", "Use as standard yield", "Dùng làm sản lượng chuẩn")}
                </button>
              </>
            ) : null}
          </div>
        ) : null}

        </details>
      </div>

      <PrepStepsEditor steps={form.steps} readOnly={readOnly} onChange={(steps) => set("steps", steps)} />

      <div className="erpActions">
        {!readOnly || namesDirty ? (
          <button
            type="button"
            className="erpBtn primary"
            disabled={busy || !nameEn.trim() || (!namesDirty && !dirty && viewed?.status === "draft")}
            onClick={() => void save()}
            data-testid="prep-save"
          >
            {busy
              ? savingText()
              : namesDirty && !dirty
                ? T("Сохранить название", "Save name", "Lưu tên")
                : viewed && viewed.status !== "draft"
                  ? T("Сохранить как новую версию", "Save as new version", "Lưu phiên bản mới")
                  : T("Сохранить черновик", "Save draft", "Lưu nháp")}
          </button>
        ) : null}
        {viewed?.status === "draft" ? (
          <button type="button" className="erpBtn" disabled={busy || unlinked > 0 || !form.lines.length || !form.yield_qty} onClick={activate}>
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
              setBaseline(JSON.stringify(next));
              setEditing(false);
            }}
          >
            {T("Отменить изменения", "Discard changes", "Hủy thay đổi")}
          </button>
        ) : null}
      </div>
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
