"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { buildCostContext, costLine, plannedUnitCost, productLabel, type ErpUnit } from "@/lib/erp/costing";
import type { ErpProduct, ErpRecipe, ErpRecipeLine, ErpRecipeStep, ErpState } from "@/lib/erp/types";
import { DocTable, useDocuments } from "./docs";
import { useErp } from "./ErpShell";
import {
  Empty,
  Field,
  NavLink,
  noSearchResults,
  NumberInput,
  PageHead,
  ProductPicker,
  qtyText,
  QtyInput,
  savingText,
  statusLabel,
  SubTabs,
  T,
  toBase,
  unitLabel,
  unitOf,
  useDirtyGuard,
  vnd,
} from "./ui";

const prepTabs = () => [
  { href: "/erp/preps", label: T("Рецептуры", "Recipes", "Công thức") },
  { href: "/erp/preps/batches", label: T("Изготовленные партии", "Produced batches", "Mẻ đã sản xuất") },
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
  const ctx = useMemo(() => (state ? buildCostContext(state.products, state.recipes) : null), [state]);
  if (!state || !ctx) return null;

  const all = state.products
    .filter((p) => !p.archived_at && (p.type === "semi_finished" || p.type === "finished"))
    .sort((a, b) => a.name_en.localeCompare(b.name_en));
  const q = query.trim().toLowerCase();
  const list = all.filter((p) => !q || `${p.name_en} ${p.name_vn}`.toLowerCase().includes(q));

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
            <NavLink href="/erp/preps/batch/new" className="erpBtn primary">
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
                  {list.map((p) => {
                    const recipes = state.recipes.filter((r) => r.product_id === p.id);
                    const active = recipes.find((r) => r.status === "active");
                    const draft = recipes.find((r) => r.status === "draft");
                    const cost = active ? plannedUnitCost(ctx, p.id) : null;
                    return (
                      <tr key={p.id}>
                        <td className="main">
                          <span className="erpName">{productLabel(p)}</span>
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
                              <NavLink href={`/erp/preps/batch/new?recipe=${active.id}`} className="erpBtn small primary">
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
          <NavLink href="/erp/preps/batch/new" className="erpBtn primary">
            {T("Изготовить партию", "Make a batch", "Sản xuất mẻ")}
          </NavLink>
        }
      />
      <SubTabs tabs={prepTabs()} active="/erp/preps/batches" />
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
              <NavLink href="/erp/preps/batch/new" className="erpBtn primary">
                {T("Изготовить партию", "Make a batch", "Sản xuất mẻ")}
              </NavLink>
            }
          />
        }
      />
    </>
  );
}

export function RecipePage({ id }: { id: string }) {
  const { state } = useErp();
  if (!state) return null;
  if (id === "new") return <NewPrep />;
  const product = state.products.find((p) => p.id === id);
  if (!product) {
    return (
      <Empty
        kind="error"
        title={T("Полуфабрикат не найден", "Product not found", "Không tìm thấy")}
        action={
          <NavLink href="/erp/preps" className="erpBtn">
            {T("К списку полуфабрикатов", "Back to the list", "Về danh sách")}
          </NavLink>
        }
      />
    );
  }
  return <RecipeEditor key={product.id} state={state} product={product} />;
}

const BackLink = () => (
  <NavLink href="/erp/preps" className="erpBack">
    ← {T("Полуфабрикаты", "Semi-finished", "Bán thành phẩm")}
  </NavLink>
);

function NewPrep() {
  const { act, busy } = useErp();
  const router = useRouter();
  const [nameEn, setNameEn] = useState("");
  const [nameVn, setNameVn] = useState("");
  const [unit, setUnit] = useState<ErpUnit | "">("");
  useDirtyGuard(Boolean(nameEn || nameVn));
  return (
    <>
      <BackLink />
      <PageHead title={T("Новый полуфабрикат", "New semi-finished product", "Bán thành phẩm mới")} />
      <div className="erpCard">
        <div className="erpGrid">
          <Field label={T("Название (English) *", "Name (English) *", "Tên (English) *")}>
            <input value={nameEn} onChange={(event) => setNameEn(event.target.value)} placeholder="Beef patty" />
          </Field>
          <Field label={T("Название (Tiếng Việt)", "Name (Tiếng Việt)", "Tên (Tiếng Việt)")}>
            <input value={nameVn} onChange={(event) => setNameVn(event.target.value)} placeholder="Chả bò" />
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
                router.replace(`/erp/preps/recipe/${result.id}`);
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

type LineDraft = Pick<ErpRecipeLine, "product_id" | "qty" | "note" | "raw_name" | "raw_amount" | "raw_unit">;

type RecipeForm = {
  yield_qty: number | null;
  yield_pieces: number | null;
  shelf_life_days: number | null;
  storage_conditions: string;
  note: string;
  instructionsText: string;
  instructionsOriginal: string;
  lines: LineDraft[];
};

function stepsToText(instructions: ErpRecipe["instructions"]): string {
  if (typeof instructions === "string") return instructions;
  return (instructions as ErpRecipeStep[])
    .map((step, index) => {
      const title = step.title?.en ? `${index + 1}. ${step.title.en}${step.title.vn ? ` / ${step.title.vn}` : ""}` : `${index + 1}.`;
      const items = (step.items ?? []).map((item) => `- ${item.en ?? ""}${item.vn ? ` / ${item.vn}` : ""}`);
      return [title, ...items].join("\n");
    })
    .join("\n\n");
}

function formFrom(recipe: ErpRecipe | null, product: ErpProduct): RecipeForm {
  const text = recipe ? stepsToText(recipe.instructions) : "";
  return {
    yield_qty: recipe?.yield_qty ?? null,
    yield_pieces: recipe?.yield_pieces ?? null,
    shelf_life_days: recipe?.shelf_life_days ?? product.shelf_life_days ?? null,
    storage_conditions: recipe?.storage_conditions ?? product.storage_conditions ?? "",
    note: recipe?.note ?? "",
    instructionsText: text,
    instructionsOriginal: text,
    lines: (recipe?.lines ?? []).map((line) => ({
      product_id: line.product_id,
      qty: line.qty,
      note: line.note,
      raw_name: line.raw_name,
      raw_amount: line.raw_amount,
      raw_unit: line.raw_unit,
    })),
  };
}

function RecipeEditor({ state, product }: { state: ErpState; product: ErpProduct }) {
  const { act, busy } = useErp();
  const recipes = state.recipes.filter((r) => r.product_id === product.id).sort((a, b) => b.version - a.version);
  const active = recipes.find((r) => r.status === "active");
  const initial = recipes.find((r) => r.status === "draft") ?? active ?? recipes[0] ?? null;
  const [viewId, setViewId] = useState<string | null>(initial?.id ?? null);
  const viewed = recipes.find((r) => r.id === viewId) ?? null;
  const [editing, setEditing] = useState<boolean>(!viewed || viewed.status === "draft");
  const [form, setForm] = useState(() => formFrom(viewed, product));
  const [baseline, setBaseline] = useState(() => JSON.stringify(formFrom(viewed, product)));
  const ctx = useMemo(() => buildCostContext(state.products, state.recipes), [state]);
  const unit = product.base_unit;
  const dirty = editing && JSON.stringify(form) !== baseline;
  useDirtyGuard(dirty);

  const open = (recipe: ErpRecipe) => {
    if (dirty && !window.confirm(T("Есть несохранённые изменения. Открыть другую версию?", "Unsaved changes. Open another version?", "Có thay đổi chưa lưu. Mở phiên bản khác?"))) return;
    const next = formFrom(recipe, product);
    setViewId(recipe.id);
    setEditing(recipe.status === "draft");
    setForm(next);
    setBaseline(JSON.stringify(next));
  };

  const set = <K extends keyof RecipeForm>(key: K, value: RecipeForm[K]) => setForm((prev) => ({ ...prev, [key]: value }));
  const setLine = (index: number, patch: Partial<LineDraft>) =>
    setForm((prev) => ({ ...prev, lines: prev.lines.map((line, i) => (i === index ? { ...line, ...patch } : line)) }));

  const save = async () => {
    const payload: Record<string, unknown> = {
      id: viewed?.id,
      product_id: product.id,
      yield_qty: form.yield_qty,
      yield_pieces: unit === "pcs" ? form.yield_qty : form.yield_pieces,
      shelf_life_days: form.shelf_life_days,
      storage_conditions: form.storage_conditions,
      note: form.note,
      lines: form.lines,
    };
    if (form.instructionsText !== form.instructionsOriginal) payload.instructions = form.instructionsText;
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
    if (dirty) {
      window.alert(T("Сначала сохраните изменения.", "Save your changes first.", "Hãy lưu thay đổi trước."));
      return;
    }
    if (await act({ action: "activateRecipe", id: viewed.id }, T("Рецептура действует", "Recipe is now active", "Công thức đã được áp dụng")))
      setEditing(false);
  };

  const costs = form.lines.map((line) => (line.product_id && line.qty ? costLine(ctx, line.product_id, line.qty) : null));
  const known = form.lines.length > 0 && costs.every((line) => line && line.cost !== null);
  const batchCost = known ? costs.reduce((sum, line) => sum + (line?.cost ?? 0), 0) : null;
  const unlinked = form.lines.filter((line) => !line.product_id).length;
  const readOnly = !editing;

  return (
    <>
      <BackLink />
      <PageHead
        title={productLabel(product)}
        sub={
          active
            ? `${T("Действующая версия", "Active version", "Phiên bản đang dùng")} v${active.version} · ${T("выход", "yield", "sản lượng")} ${yieldText(active, unit)}`
            : T("Нет действующей рецептуры", "No active recipe yet", "Chưa có công thức đang dùng")
        }
        actions={
          active ? (
            <NavLink href={`/erp/preps/batch/new?recipe=${active.id}`} className="erpBtn primary">
              {T("Изготовить партию", "Make a batch", "Sản xuất mẻ")}
            </NavLink>
          ) : null
        }
      />

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
        <h2>{T("Выход и хранение", "Yield and storage", "Sản lượng và bảo quản")}</h2>
        <div className="erpGrid">
          <Field
            label={T("Нормативный выход *", "Standard yield *", "Sản lượng chuẩn *")}
            hint={T("Сколько получается из состава ниже", "How much the ingredients below make", "Lượng thu được từ thành phần")}
          >
            <QtyInput base={unit} value={form.yield_qty} disabled={readOnly} onChange={(v) => set("yield_qty", v)} />
          </Field>
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
        <h2>{T("Состав на нормативный выход", "Ingredients for the standard yield", "Thành phần cho sản lượng chuẩn")}</h2>
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
          <div className="erpTableWrap">
            <table className="erpTable stack">
              <thead>
                <tr>
                  <th>{T("Продукт", "Product", "Sản phẩm")}</th>
                  <th>{T("Количество", "Quantity", "Số lượng")}</th>
                  <th className="num">{T("Стоимость", "Cost", "Chi phí")}</th>
                  {!readOnly ? <th /> : null}
                </tr>
              </thead>
              <tbody>
                {form.lines.map((line, index) => {
                  const lineUnit = unitOf(state, line.product_id);
                  const cost = costs[index];
                  return (
                    <tr key={index}>
                      <td className="main" style={{ minWidth: 240 }}>
                        {line.raw_name && !line.product_id ? (
                          <div className="erpHint">
                            <span className="erpBadge warn">{T("нужно выбрать продукт", "choose a product", "chọn sản phẩm")}</span> {line.raw_name.en} ·{" "}
                            {line.raw_amount} {line.raw_unit}
                          </div>
                        ) : null}
                        {readOnly ? (
                          <span className="erpName">{line.product_id ? productLabel(state.products.find((p) => p.id === line.product_id) ?? { name_en: "?", name_vn: "" }) : "—"}</span>
                        ) : (
                          <ProductPicker
                            state={state}
                            value={line.product_id}
                            onChange={(productId) => {
                              const base = unitOf(state, productId);
                              setLine(index, { product_id: productId || null, qty: toBase(line.raw_amount, line.raw_unit, base) ?? line.qty });
                            }}
                          />
                        )}
                      </td>
                      <td className={readOnly ? "" : "edit"} data-label={T("Количество", "Quantity", "Số lượng")}>
                        {readOnly ? (
                          qtyText(line.qty, lineUnit)
                        ) : line.product_id ? (
                          <QtyInput base={lineUnit} value={line.qty} defaultSmall={lineUnit !== "pcs"} onChange={(v) => setLine(index, { qty: v })} />
                        ) : (
                          <span className="erpMuted">{T("сначала выберите продукт", "choose a product first", "chọn sản phẩm trước")}</span>
                        )}
                      </td>
                      <td className="num" data-label={T("Стоимость", "Cost", "Chi phí")}>
                        {!cost ? "—" : cost.cost === null ? <span className="erpBadge warn">{T("нет цены", "no price", "chưa có giá")}</span> : vnd(cost.cost)}
                      </td>
                      {!readOnly ? (
                        <td className="num">
                          <button
                            type="button"
                            className="erpIconBtn"
                            aria-label={T("Удалить строку", "Remove line", "Xóa dòng")}
                            onClick={() => set("lines", form.lines.filter((_, i) => i !== index))}
                          >
                            ×
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
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
              onClick={() => set("lines", [...form.lines, { product_id: null, qty: null, note: null, raw_name: null, raw_amount: null, raw_unit: null }])}
            >
              + {T("Добавить ингредиент", "Add ingredient", "Thêm nguyên liệu")}
            </button>
          </div>
        ) : null}

        <div className="erpKpis">
          <div className="erpKpi">
            <span>{T("Себестоимость выхода", "Cost of the yield", "Giá vốn sản lượng")}</span>
            <strong>{batchCost === null ? T("неполная", "incomplete", "chưa đủ") : vnd(batchCost)}</strong>
          </div>
          <div className="erpKpi">
            <span>
              {T("За 1", "Per 1", "Mỗi 1")} {unitLabel(unit)}
            </span>
            <strong>{vnd(batchCost !== null && form.yield_qty ? batchCost / form.yield_qty : null)}</strong>
          </div>
          {form.yield_pieces && unit !== "pcs" ? (
            <div className="erpKpi">
              <span>{T("За 1 шт", "Per piece", "Mỗi cái")}</span>
              <strong>{vnd(batchCost !== null ? batchCost / form.yield_pieces : null)}</strong>
            </div>
          ) : null}
        </div>

        <details className="erpMore">
          <summary>{T("Технология приготовления", "Method", "Cách làm")}</summary>
          <div>
            <textarea rows={8} value={form.instructionsText} disabled={readOnly} onChange={(event) => set("instructionsText", event.target.value)} />
          </div>
        </details>
      </div>

      <div className="erpActions">
        {!readOnly ? (
          <button type="button" className="erpBtn primary" disabled={busy || (!dirty && viewed?.status === "draft")} onClick={save}>
            {busy
              ? savingText()
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
