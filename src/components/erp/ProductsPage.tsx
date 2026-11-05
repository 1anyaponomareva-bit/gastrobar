"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  buildCostContext,
  costLine,
  isPackaging,
  LOSS_METHODS,
  productTitle,
  type ErpProductType,
  type ErpUnit,
  type LossPcts,
} from "@/lib/erp/costing";
import type { ErpCategory, ErpPack, ErpProduct, ErpState } from "@/lib/erp/types";
import { useErp } from "./ErpShell";
import { methodLabel } from "./losses";
import { RefList } from "./RefList";
import {
  costSourceLabel,
  dateText,
  Empty,
  Field,
  NavLink,
  noSearchResults,
  NumberInput,
  packText,
  PageHead,
  PRODUCT_TYPES,
  qtyText,
  QtyInput,
  savingText,
  SubTabs,
  T,
  typeLabel,
  unitLabel,
  useDirtyGuard,
  vnd,
} from "./ui";

const productTabs = () => [
  { href: "/erp/products", label: T("Продукты", "Products", "Sản phẩm") },
  { href: "/erp/products/categories", label: T("Категории", "Categories", "Nhóm hàng") },
];

const productsSub = () =>
  T(
    "Всё, что вы покупаете или готовите: сырьё, упаковка, полуфабрикаты.",
    "Everything you buy or make: ingredients, packaging, semi-finished products.",
    "Mọi thứ bạn mua hoặc làm: nguyên liệu, bao bì, bán thành phẩm.",
  );

const UNITS: ErpUnit[] = ["kg", "l", "pcs"];

const lossTitle = () => T("Потери при обработке", "Processing losses", "Hao hụt khi sơ chế");

const categoryName = (category: ErpCategory | undefined) =>
  category ? `${category.name_en}${category.name_vn && category.name_vn !== category.name_en ? ` / ${category.name_vn}` : ""}` : "—";

function productSuppliers(state: ErpState, product: ErpProduct): string[] {
  const ids = new Set(state.packs.filter((pack) => pack.product_id === product.id && pack.supplier_id).map((pack) => pack.supplier_id!));
  if (product.staff_supplier_id) ids.add(product.staff_supplier_id);
  return [...ids];
}

export function ProductsPage() {
  const { state } = useErp();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [type, setType] = useState<ErpProductType | "">("");
  const [category, setCategory] = useState("");
  const [supplier, setSupplier] = useState("");
  const [archived, setArchived] = useState(false);
  const ctx = useMemo(() => (state ? buildCostContext(state.products, state.recipes) : null), [state]);
  if (!state || !ctx) return null;

  const categories = new Map(state.categories.map((c) => [c.id, c]));
  const q = query.trim().toLowerCase();
  const list = state.products
    .filter((p) => {
      if (Boolean(p.archived_at) !== archived) return false;
      if (type && p.type !== type) return false;
      if (category && p.category_id !== category) return false;
      if (supplier && !productSuppliers(state, p).includes(supplier)) return false;
      return !q || `${p.name_en} ${p.name_vn} ${p.brand ?? ""} ${p.code}`.toLowerCase().includes(q);
    })
    .sort((a, b) => a.name_en.localeCompare(b.name_en));
  const reset = () => {
    setQuery("");
    setType("");
    setCategory("");
    setSupplier("");
    setArchived(false);
  };

  const newButton = (
    <NavLink href="/erp/products/new" className="erpBtn primary">
      + {T("Новый продукт", "New product", "Sản phẩm mới")}
    </NavLink>
  );

  return (
    <>
      <PageHead title={T("Продукты", "Products", "Sản phẩm")} sub={productsSub()} actions={newButton} />
      <SubTabs tabs={productTabs()} active="/erp/products" />

      {!state.products.length ? (
        <Empty
          title={T("Каталог пока пуст", "The catalog is empty", "Danh mục còn trống")}
          text={T(
            "Загрузите продукты, которые уже есть в приложении заказов Staff, или создайте первый продукт вручную.",
            "Import the products you already have in the Staff ordering app, or create the first one by hand.",
            "Nhập sản phẩm có sẵn trong ứng dụng Staff hoặc tự tạo sản phẩm đầu tiên.",
          )}
          action={
            <>
              <NavLink href="/erp/service/import" className="erpBtn primary">
                {T("Загрузить продукты из Staff", "Import products from Staff", "Nhập sản phẩm từ Staff")}
              </NavLink>
              <NavLink href="/erp/products/new" className="erpBtn">
                {T("Создать вручную", "Create manually", "Tạo thủ công")}
              </NavLink>
            </>
          }
        />
      ) : (
        <>
          <div className="erpToolbar">
            <input type="search" placeholder={T("Найти по названию…", "Search by name…", "Tìm theo tên…")} value={query} onChange={(e) => setQuery(e.target.value)} />
            <select value={type} onChange={(e) => setType(e.target.value as ErpProductType | "")}>
              <option value="">{T("Все типы", "All types", "Tất cả loại")}</option>
              {PRODUCT_TYPES.map((key) => (
                <option key={key} value={key}>
                  {typeLabel(key)}
                </option>
              ))}
            </select>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">{T("Все категории", "All categories", "Tất cả nhóm")}</option>
              {state.categories
                .filter((c) => !c.archived_at)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {categoryName(c)}
                  </option>
                ))}
            </select>
            <select value={supplier} onChange={(e) => setSupplier(e.target.value)}>
              <option value="">{T("Все поставщики", "All suppliers", "Tất cả NCC")}</option>
              {state.suppliers
                .filter((s) => !s.archived_at)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
            <label className="erpCheck">
              <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
              {T("Архив", "Archived", "Lưu trữ")}
            </label>
          </div>

          {!list.length ? (
            noSearchResults(reset)
          ) : (
            <>
              <p className="erpHint">
                {T("Найдено", "Found", "Tìm thấy")}: {list.length}
              </p>
              <div className="erpTableWrap">
                <table className="erpTable stack">
                  <thead>
                    <tr>
                      <th>{T("Название", "Name", "Tên")}</th>
                      <th>{T("Тип", "Type", "Loại")}</th>
                      <th>{T("Категория", "Category", "Nhóm")}</th>
                      <th>{T("Единица", "Unit", "Đơn vị")}</th>
                      <th className="num">{T("Оценочная цена", "Estimated cost", "Giá ước tính")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((p) => {
                      const cost = p.base_unit ? costLine(ctx, p.id, 1) : null;
                      return (
                        <tr
                          key={p.id}
                          className="clickable"
                          onClick={(e) => {
                            if (!(e.target as HTMLElement).closest("a")) router.push(`/erp/products/${p.id}`);
                          }}
                        >
                          <td className="main">
                            <NavLink href={`/erp/products/${p.id}`} className="erpName">
                              {productTitle(p)}
                            </NavLink>
                            {p.brand ? <span className="erpCellSub">{p.brand}</span> : null}
                          </td>
                          <td data-label={T("Тип", "Type", "Loại")}>{typeLabel(p.type)}</td>
                          <td data-label={T("Категория", "Category", "Nhóm")}>{categoryName(p.category_id ? categories.get(p.category_id) : undefined)}</td>
                          <td data-label={T("Единица", "Unit", "Đơn vị")}>
                            {p.base_unit ? unitLabel(p.base_unit) : <span className="erpBadge warn">{T("выберите единицу", "choose a unit", "chọn đơn vị")}</span>}
                          </td>
                          <td className="num" data-label={T("Оценочная цена", "Estimated cost", "Giá ước tính")}>
                            {!p.base_unit ? (
                              "—"
                            ) : cost?.cost === null || cost?.cost === undefined ? (
                              <span className="erpBadge warn">{T("цена неизвестна", "no price yet", "chưa có giá")}</span>
                            ) : (
                              <>
                                {vnd(cost.cost)} / {unitLabel(p.base_unit)}
                                <span className="erpCellSub">{costSourceLabel(cost.source)}</span>
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}

type PackDraft = Pick<ErpPack, "label" | "qty_base" | "is_default" | "supplier_id"> & { id?: string };

type ProductForm = {
  name_en: string;
  name_vn: string;
  type: ErpProductType;
  category_id: string;
  base_unit: ErpUnit | "";
  unit_weight_kg: number | null;
  brand: string;
  est_unit_cost: number | null;
  shelf_life_days: number | null;
  storage_conditions: string;
} & LossPcts;

const formOf = (product: ErpProduct | null, preset?: Partial<ProductForm>): ProductForm => ({
  name_en: product?.name_en ?? "",
  name_vn: product?.name_vn ?? "",
  type: product?.type ?? "ingredient",
  category_id: product?.category_id ?? "",
  base_unit: product?.base_unit ?? "",
  unit_weight_kg: product?.unit_weight_kg ?? null,
  brand: product?.brand ?? "",
  est_unit_cost: product?.est_unit_cost ?? null,
  shelf_life_days: product?.shelf_life_days ?? null,
  storage_conditions: product?.storage_conditions ?? "",
  ...Object.fromEntries(LOSS_METHODS.map((m) => [`loss_${m}_pct`, product?.[`loss_${m}_pct`] ?? null])),
  ...preset,
});

export function ProductCard({ id }: { id: string }) {
  const { state } = useErp();
  if (!state) return null;
  if (id === "new") return <ProductEditor key="new" state={state} product={null} />;
  const product = state.products.find((p) => p.id === id);
  if (!product) {
    return (
      <Empty
        kind="error"
        title={T("Продукт не найден", "Product not found", "Không tìm thấy sản phẩm")}
        text={T("Возможно, его удалили или ссылка устарела.", "It may have been removed or the link is outdated.", "Có thể đã bị xóa hoặc liên kết cũ.")}
        action={
          <NavLink href="/erp/products" className="erpBtn">
            {T("К списку продуктов", "Back to products", "Về danh sách")}
          </NavLink>
        }
      />
    );
  }
  return <ProductEditor key={product.id} state={state} product={product} />;
}

function ProductEditor({ state, product }: { state: ErpState; product: ErpProduct | null }) {
  const { act, busy } = useErp();
  const router = useRouter();
  const initialPacks = (): PackDraft[] =>
    state.packs.filter((pack) => pack.product_id === product?.id).map(({ id, label, qty_base, is_default, supplier_id }) => ({ id, label, qty_base, is_default, supplier_id }));
  const [form, setForm] = useState<ProductForm>(() => formOf(product));
  const [packs, setPacks] = useState<PackDraft[]>(initialPacks);
  const [baseline, setBaseline] = useState(() => JSON.stringify([formOf(product), initialPacks()]));
  const dirty = JSON.stringify([form, packs]) !== baseline;
  useDirtyGuard(dirty);
  const set = <K extends keyof ProductForm>(key: K, value: ProductForm[K]) => setForm((prev) => ({ ...prev, [key]: value }));
  const unit = form.base_unit || null;
  const isNew = !product;
  const recipe = product ? state.recipes.find((r) => r.product_id === product.id && r.status !== "archived") : undefined;
  const stock = product ? state.stock.filter((row) => row.product_id === product.id && row.qty !== 0) : [];
  const validPacks = packs.every((pack) => pack.label.trim() && pack.qty_base > 0);
  const validLosses = LOSS_METHODS.every((m) => {
    const v = form[`loss_${m}_pct`];
    return v === null || v === undefined || (v >= 0 && v < 100);
  });
  const showLosses = (unit === "kg" || unit === "l") && !isPackaging(form.type);
  const canSave = form.name_en.trim() !== "" && (!isNew || unit !== null) && validPacks && validLosses && (dirty || isNew);

  const save = async () => {
    const result = await act<{ id: string }>(
      { action: "saveProduct", product: { ...form, id: product?.id, base_unit: form.base_unit || null, category_id: form.category_id || null, packs } },
      isNew ? T("Продукт создан", "Product created", "Đã tạo sản phẩm") : T("Изменения сохранены", "Changes saved", "Đã lưu thay đổi"),
    );
    if (!result) return;
    setBaseline(JSON.stringify([form, packs]));
    if (isNew) router.replace(`/erp/products/${result.id}`);
  };

  const archive = async (archived: boolean) => {
    if (!product) return;
    await act(
      { action: "setArchived", entity: "product", id: product.id, archived },
      archived ? T("Продукт перенесён в архив", "Product archived", "Đã lưu trữ") : T("Продукт восстановлен", "Product restored", "Đã khôi phục"),
    );
  };

  const basics = (
    <div className="erpGrid two">
      <Field label={T("Название (English) *", "Name (English) *", "Tên (English) *")}>
        <input value={form.name_en} onChange={(e) => set("name_en", e.target.value)} autoFocus={isNew} />
      </Field>
      <Field label={T("Название (Tiếng Việt)", "Name (Tiếng Việt)", "Tên (Tiếng Việt)")}>
        <input value={form.name_vn} onChange={(e) => set("name_vn", e.target.value)} />
      </Field>
      <Field label={T("Тип *", "Type *", "Loại *")}>
        <select value={form.type} onChange={(e) => set("type", e.target.value as ErpProductType)}>
          {PRODUCT_TYPES.map((key) => (
            <option key={key} value={key}>
              {typeLabel(key)}
            </option>
          ))}
        </select>
      </Field>
      <Field
        label={T("Единица учёта *", "Stock unit *", "Đơn vị *")}
        hint={T("В ней хранятся остатки и считается цена. Граммы и миллилитры можно вводить в документах.", "Stock and cost are kept in it. Grams and millilitres can be typed in documents.", "Tồn kho và giá tính theo đơn vị này.")}
      >
        <select value={form.base_unit} onChange={(e) => set("base_unit", e.target.value as ErpUnit | "")}>
          <option value="">{T("— выберите единицу —", "— choose a unit —", "— chọn đơn vị —")}</option>
          {UNITS.map((u) => (
            <option key={u} value={u}>
              {unitLabel(u)}
            </option>
          ))}
        </select>
      </Field>
      <Field label={T("Категория", "Category", "Nhóm hàng")}>
        <select value={form.category_id} onChange={(e) => set("category_id", e.target.value)}>
          <option value="">{T("— без категории —", "— none —", "— không —")}</option>
          {state.categories
            .filter((c) => !c.archived_at || c.id === form.category_id)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {categoryName(c)}
              </option>
            ))}
        </select>
      </Field>
      <Field label={T("Бренд", "Brand", "Thương hiệu")}>
        <input value={form.brand} onChange={(e) => set("brand", e.target.value)} />
      </Field>
      {unit === "pcs" ? (
        <Field label={T("Вес 1 шт, кг", "Weight of 1 pc, kg", "Khối lượng 1 cái, kg")} hint={T("Необязательно", "Optional", "Không bắt buộc")}>
          <NumberInput value={form.unit_weight_kg} onChange={(v) => set("unit_weight_kg", v)} />
        </Field>
      ) : null}
    </div>
  );

  const purchasing = (
    <>
      <div className="erpGrid two">
        <Field
          label={unit ? `${T("Оценочная цена за 1", "Estimated cost per 1", "Giá ước tính mỗi 1")} ${unitLabel(unit)}, ₫` : T("Оценочная цена, ₫", "Estimated cost, ₫", "Giá ước tính, ₫")}
          hint={
            product?.est_cost_source
              ? `${costSourceLabel(product.est_cost_source)}${product.est_cost_at ? ` · ${dateText(product.est_cost_at)}` : ""}`
              : T("Обновляется автоматически после каждой поставки", "Updated automatically after each delivery", "Tự cập nhật sau mỗi lần nhập")
          }
        >
          {unit ? <NumberInput value={form.est_unit_cost} onChange={(v) => set("est_unit_cost", v)} /> : <span className="erpNoUnit">{T("Сначала выберите единицу", "Choose a unit first", "Chọn đơn vị trước")}</span>}
        </Field>
      </div>
      <h3>{T("Упаковки для закупки", "Purchase packs", "Quy cách mua")}</h3>
      <p className="erpHint">
        {T(
          "Например, «Коробка» = 5 кг. При поставке можно вводить количество упаковками.",
          "For example, “Box” = 5 kg. Deliveries can then be entered in packs.",
          "Ví dụ “Thùng” = 5 kg. Khi nhập hàng có thể nhập theo quy cách.",
        )}
      </p>
      {packs.length ? (
        <div className="erpTableWrap">
          <table className="erpTable stack">
            <thead>
              <tr>
                <th>{T("Упаковка", "Pack", "Quy cách")}</th>
                <th>{T("Сколько в ней", "Contains", "Số lượng")}</th>
                <th>{T("Поставщик", "Supplier", "Nhà cung cấp")}</th>
                <th>{T("Основная", "Default", "Mặc định")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {packs.map((pack, index) => {
                const update = (patch: Partial<PackDraft>) => setPacks((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
                return (
                  <tr key={pack.id ?? `new-${index}`}>
                    <td className="main">
                      <input value={pack.label} placeholder={T("Коробка, мешок…", "Box, bag…", "Thùng, bao…")} onChange={(e) => update({ label: e.target.value })} />
                      {pack.label && packText(pack.label) !== pack.label ? <small className="erpCellSub">{packText(pack.label)}</small> : null}
                    </td>
                    <td className="edit" data-label={T("Сколько в ней", "Contains", "Số lượng")}>
                      <QtyInput base={unit} value={pack.qty_base || null} onChange={(v) => update({ qty_base: v ?? 0 })} />
                    </td>
                    <td className="edit" data-label={T("Поставщик", "Supplier", "Nhà cung cấp")}>
                      <select value={pack.supplier_id ?? ""} onChange={(e) => update({ supplier_id: e.target.value || null })}>
                        <option value="">—</option>
                        {state.suppliers
                          .filter((s) => !s.archived_at || s.id === pack.supplier_id)
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                      </select>
                    </td>
                    <td data-label={T("Основная", "Default", "Mặc định")}>
                      <input
                        type="radio"
                        name="defaultPack"
                        checked={pack.is_default}
                        onChange={() => setPacks((prev) => prev.map((p, i) => ({ ...p, is_default: i === index })))}
                      />
                    </td>
                    <td className="num">
                      <button type="button" className="erpIconBtn" aria-label={T("Убрать", "Remove", "Xóa")} onClick={() => setPacks((prev) => prev.filter((_, i) => i !== index))}>
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      <div className="erpActions">
        <button
          type="button"
          className="erpBtn"
          disabled={!unit}
          onClick={() => setPacks((prev) => [...prev, { label: "", qty_base: 0, is_default: !prev.length, supplier_id: product?.staff_supplier_id ?? null }])}
        >
          + {T("Добавить упаковку", "Add pack", "Thêm quy cách")}
        </button>
      </div>
      {product?.staff_listed ? (
        <p className="erpHint">
          {T("В приложении Staff заказывается как", "Ordered in the Staff app as", "Trong ứng dụng Staff:")} {product.staff_unit ?? ""} {product.staff_pack ?? ""}
        </p>
      ) : null}
    </>
  );

  const losses = (
    <>
      <p className="erpHint">
        {T(
          "Сколько процентов веса теряется при обработке. Например, очистка 26%: из 1 кг остаётся 740 г. В рецептах и блюдах по этим процентам считается нетто.",
          "How much weight is lost in processing. For example, cleaning 26%: 1 kg leaves 740 g. Recipes and dishes use these to work out net weight.",
          "Phần trăm khối lượng hao hụt khi sơ chế. Ví dụ sơ chế 26%: 1 kg còn 740 g. Công thức và món dùng để tính netto.",
        )}
      </p>
      <div className="erpGrid five">
        {LOSS_METHODS.map((m) => (
          <Field key={m} label={`${methodLabel(m)}, %`}>
            <NumberInput value={form[`loss_${m}_pct`]} placeholder="0" onChange={(v) => set(`loss_${m}_pct`, v)} />
          </Field>
        ))}
      </div>
      {!validLosses ? <div className="erpNotice warn">{T("Потери — от 0 до 99,99%.", "Losses must be from 0 to 99.99%.", "Hao hụt từ 0 đến 99,99%.")}</div> : null}
    </>
  );

  const storage = (
    <>
      <div className="erpGrid two">
        <Field label={T("Срок годности, дней", "Shelf life, days", "Hạn dùng, ngày")} hint={T("Используется для даты «годен до» в партиях", "Used for the use-by date of batches", "Dùng để tính hạn dùng của lô")}>
          <NumberInput value={form.shelf_life_days} onChange={(v) => set("shelf_life_days", v === null ? null : Math.round(v))} />
        </Field>
        <Field label={T("Условия хранения", "Storage conditions", "Điều kiện bảo quản")}>
          <input value={form.storage_conditions} placeholder={T("Например, 0…4 °C", "e.g. 0…4 °C", "VD: 0…4 °C")} onChange={(e) => set("storage_conditions", e.target.value)} />
        </Field>
      </div>
      {product ? (
        <>
          <h3>{T("Остатки", "In stock", "Tồn kho")}</h3>
          {stock.length ? (
            <ul className="erpList">
              {stock.map((row) => (
                <li key={row.warehouse_id}>
                  <span>{state.warehouses.find((w) => w.id === row.warehouse_id)?.name ?? "—"}</span>
                  <span>{qtyText(row.qty, product.base_unit)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="erpHint">{T("На складах этого продукта сейчас нет.", "None in stock right now.", "Hiện không có trong kho.")}</p>
          )}
        </>
      ) : null}
    </>
  );

  return (
    <>
      <NavLink href="/erp/products" className="erpBack">
        ← {T("Продукты", "Products", "Sản phẩm")}
      </NavLink>
      <PageHead
        title={
          <>
            {product ? productTitle(product) : T("Новый продукт", "New product", "Sản phẩm mới")}
            {product?.archived_at ? <span className="erpBadge">{T("в архиве", "archived", "lưu trữ")}</span> : null}
          </>
        }
        sub={product ? typeLabel(product.type) : T("Достаточно названия, типа и единицы — остальное можно заполнить позже.", "Name, type and unit are enough — the rest can be filled in later.", "Chỉ cần tên, loại và đơn vị — phần còn lại điền sau.")}
        actions={
          recipe ? (
            <NavLink href={`/erp/preps/recipe/${product!.id}`} className="erpBtn">
              {T("Открыть рецептуру", "Open recipe", "Mở công thức")}
            </NavLink>
          ) : null
        }
      />

      <section className="erpCard">
        <h2>{T("Основное", "Basics", "Cơ bản")}</h2>
        {basics}
      </section>

      {isNew ? (
        <details className="erpMore erpCard">
          <summary>{T("Закупка и хранение (необязательно)", "Purchasing and storage (optional)", "Mua hàng và bảo quản (không bắt buộc)")}</summary>
          <h2>{T("Закупка и упаковки", "Purchasing & packs", "Mua hàng và quy cách")}</h2>
          {purchasing}
          <h2>{T("Хранение", "Storage", "Bảo quản")}</h2>
          {storage}
          {showLosses ? (
            <>
              <h2>{lossTitle()}</h2>
              {losses}
            </>
          ) : null}
        </details>
      ) : (
        <>
          <section className="erpCard">
            <h2>{T("Закупка и упаковки", "Purchasing & packs", "Mua hàng và quy cách")}</h2>
            {purchasing}
          </section>
          {showLosses ? (
            <section className="erpCard">
              <h2>{lossTitle()}</h2>
              {losses}
            </section>
          ) : null}
          <section className="erpCard">
            <h2>{T("Хранение", "Storage", "Bảo quản")}</h2>
            {storage}
          </section>
        </>
      )}

      {!validPacks ? <div className="erpNotice warn">{T("У каждой упаковки должно быть название и количество.", "Each pack needs a name and a quantity.", "Mỗi quy cách cần tên và số lượng.")}</div> : null}
      {isNew && !unit ? <p className="erpHint">{T("Выберите единицу учёта, чтобы сохранить продукт.", "Choose a stock unit to save the product.", "Chọn đơn vị để lưu.")}</p> : null}

      <div className="erpActions split">
        <div className="erpRow">
          {product ? (
            <button type="button" className="erpBtn ghost" disabled={busy} onClick={() => archive(!product.archived_at)}>
              {product.archived_at ? T("Восстановить из архива", "Restore", "Khôi phục") : T("Перенести в архив", "Archive", "Lưu trữ")}
            </button>
          ) : null}
        </div>
        <button type="button" className="erpBtn primary" disabled={busy || !canSave} onClick={save}>
          {busy ? savingText() : isNew ? T("Создать продукт", "Create product", "Tạo sản phẩm") : T("Сохранить изменения", "Save changes", "Lưu thay đổi")}
        </button>
      </div>
    </>
  );
}

export function CategoriesPage() {
  const { state } = useErp();
  if (!state) return null;
  return (
    <>
      <PageHead title={T("Продукты", "Products", "Sản phẩm")} sub={productsSub()} />
      <SubTabs tabs={productTabs()} active="/erp/products/categories" />
      <RefList<ErpCategory>
        entity="category"
        rows={state.categories}
        columns={[
          { key: "name_en", label: T("Название (English)", "Name (English)", "Tên (English)") },
          { key: "name_vn", label: T("Название (Tiếng Việt)", "Name (Tiếng Việt)", "Tên (Tiếng Việt)") },
        ]}
        addLabel={T("Добавить категорию", "Add category", "Thêm nhóm")}
        emptyTitle={T("Категорий пока нет", "No categories yet", "Chưa có nhóm hàng")}
        emptyText={T("Категории помогают быстро фильтровать продукты: мясо, овощи, соусы…", "Categories help filter products: meat, vegetables, sauces…", "Nhóm hàng giúp lọc sản phẩm: thịt, rau, nước sốt…")}
      />
    </>
  );
}