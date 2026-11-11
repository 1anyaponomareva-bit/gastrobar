"use client";

import { useErpRouter } from "./erpHref";
import { useEffect, useMemo, useState } from "react";
import { Pager, usePageSize } from "./Pager";
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
import { compatiblePacks, packDisplayName } from "@/lib/erp/packs";
import { ORDERS_ADMIN_PATH, productEditorReturnHref, withMenuListReturn } from "@/lib/erp/menuListQuery";
import type { ErpCategory, ErpProduct, ErpState } from "@/lib/erp/types";
import { notImplemented } from "./CatalogTable";
import { useErp } from "./ErpShell";
import { DropMenu } from "./filters";
import { methodLabel } from "./losses";
import { categoryLabel, POSTER_WORKSHOPS, productBrandFieldLabel, productCodeFieldLabel } from "./menuFields";
import { MENU_HREFS } from "./menuNav";
import { RefList } from "./RefList";
import {
  costSourceLabel,
  dateText,
  confirmLeave,
  Empty,
  Field,
  NavLink,
  noSearchResults,
  NumberInput,
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

const categoryName = (category: ErpCategory | undefined) => categoryLabel(category);

function productSuppliers(state: ErpState, product: ErpProduct): string[] {
  const ids = new Set(state.productPacks.filter((link) => link.product_id === product.id && link.supplier_id).map((link) => link.supplier_id!));
  if (product.staff_supplier_id) ids.add(product.staff_supplier_id);
  return [...ids];
}

export function ProductsPage() {
  const { state } = useErp();
  const router = useErpRouter();
  const [query, setQuery] = useState("");
  const [type, setType] = useState<ErpProductType | "">("");
  const [category, setCategory] = useState("");
  const [supplier, setSupplier] = useState("");
  const [archived, setArchived] = useState(false);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = usePageSize();
  const ctx = useMemo(() => (state ? buildCostContext(state.products, state.recipes) : null), [state]);
  useEffect(() => setPage(0), [query, type, category, supplier, archived, pageSize]);
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
  const pages = Math.max(1, Math.ceil(list.length / pageSize));
  const current = Math.min(page, pages - 1);
  const pageRows = list.slice(current * pageSize, current * pageSize + pageSize);
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
                .filter((c) => !c.archived_at && !c.deleted_at)
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
                    {pageRows.map((p) => {
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
              {list.length ? (
                <Pager total={list.length} page={current} pages={pages} pageSize={pageSize} onPage={setPage} onPageSize={setPageSize} />
              ) : null}
            </>
          )}
        </>
      )}
    </>
  );
}

type PackDraft = { id?: string; pack_id?: string; label: string; qty_base: number; is_default: boolean; supplier_id: string | null; code: string };

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

export function ProductCard({
  id,
  presetType,
  from,
  onClose,
}: {
  id: string;
  presetType?: string;
  from?: string;
  onClose?: () => void;
}) {
  const { state } = useErp();
  const type = PRODUCT_TYPES.includes(presetType as ErpProductType) ? (presetType as ErpProductType) : undefined;
  if (!state) return null;
  if (id === "new") {
    return <ProductEditor key={`new-${type ?? "default"}`} state={state} product={null} presetType={type} from={from} onClose={onClose} />;
  }
  const product = state.products.find((p) => p.id === id);
  if (!product) {
    const goods = type === "finished";
    const backHref = productEditorReturnHref(from, goods ? MENU_HREFS.goods : MENU_HREFS.ingredients);
    const backLabel = goods
      ? T("К списку товаров", "Back to products", "Về danh sách hàng")
      : T("К списку ингредиентов", "Back to ingredients", "Về danh sách");
    return (
      <Empty
        kind="error"
        title={T("Продукт не найден", "Product not found", "Không tìm thấy sản phẩm")}
        text={T("Возможно, его удалили или ссылка устарела.", "It may have been removed or the link is outdated.", "Có thể đã bị xóa hoặc liên kết cũ.")}
        action={
          onClose ? (
            <button type="button" className="erpBtn" onClick={onClose}>
              {backLabel}
            </button>
          ) : (
            <NavLink href={backHref} className="erpBtn">
              {backLabel}
            </NavLink>
          )
        }
      />
    );
  }
  return <ProductEditor key={product.id} state={state} product={product} from={from} onClose={onClose} />;
}

function ProductEditor({
  state,
  product,
  presetType,
  from,
  onClose,
}: {
  state: ErpState;
  product: ErpProduct | null;
  presetType?: ErpProductType;
  from?: string;
  onClose?: () => void;
}) {
  const { act, busy, notify } = useErp();
  const router = useErpRouter();
  const initialPacks = (): PackDraft[] =>
    state.productPacks
      .filter((link) => link.product_id === product?.id)
      .map((link) => {
        const catalog = state.packs.find((p) => p.id === link.pack_id);
        return {
          id: link.id,
          pack_id: link.pack_id,
          label: catalog?.name ?? link.label,
          qty_base: catalog?.qty_base ?? link.qty_base,
          is_default: link.is_default,
          supplier_id: link.supplier_id,
          code: link.code ?? "",
        };
      });
  const [form, setForm] = useState<ProductForm>(() => formOf(product, presetType ? { type: presetType } : undefined));
  const [packs, setPacks] = useState<PackDraft[]>(initialPacks);
  const [baseline, setBaseline] = useState(() => JSON.stringify([formOf(product, presetType ? { type: presetType } : undefined), initialPacks()]));
  const dirty = JSON.stringify([form, packs]) !== baseline;
  useDirtyGuard(dirty);
  const set = <K extends keyof ProductForm>(key: K, value: ProductForm[K]) => setForm((prev) => ({ ...prev, [key]: value }));
  const unit = form.base_unit || null;
  const isNew = !product;
  const goodsMode = form.type === "finished";
  const ingredientCard = !goodsMode;
  const defaultPackSupplier = () => {
    const preferred = packs.find((pack) => pack.is_default) ?? packs[0];
    return preferred?.supplier_id ?? "";
  };
  const setPackSupplier = (supplierId: string | null) => {
    setPacks((prev) => {
      if (!prev.length) return prev;
      const idx = prev.findIndex((pack) => pack.is_default);
      const at = idx >= 0 ? idx : 0;
      return prev.map((pack, i) => (i === at ? { ...pack, supplier_id: supplierId } : pack));
    });
  };
  const recipe = product ? state.recipes.find((r) => r.product_id === product.id && r.status !== "archived") : undefined;
  const stock = product ? state.stock.filter((row) => row.product_id === product.id && row.qty !== 0) : [];
  const validPacks = packs.every((pack) => pack.label.trim() && pack.qty_base > 0);
  const validLosses = LOSS_METHODS.every((m) => {
    const v = form[`loss_${m}_pct`];
    return v === null || v === undefined || (v >= 0 && v < 100);
  });
  const showLosses = (unit === "kg" || unit === "l") && !isPackaging(form.type);
  const canSave = form.name_en.trim() !== "" && (!isNew || unit !== null) && validPacks && validLosses && (dirty || isNew);

  const save = async (createAnother = false) => {
    const result = await act<{ id: string }>(
      {
        action: "saveProduct",
        product: {
          ...form,
          id: product?.id,
          base_unit: form.base_unit || null,
          category_id: form.category_id || null,
          packs,
        },
      },
      isNew ? T("Продукт создан", "Product created", "Đã tạo sản phẩm") : T("Изменения сохранены", "Changes saved", "Đã lưu thay đổi"),
    );
    if (!result) return;
    if (isNew && createAnother) {
      const next = formOf(null, { type: form.type });
      setForm(next);
      setPacks([]);
      setBaseline(JSON.stringify([next, []]));
      return;
    }
    setBaseline(JSON.stringify([form, packs]));
    if (onClose) {
      onClose();
      return;
    }
    if (isNew) router.replace(withMenuListReturn(`/erp/products/${result.id}`, from ?? ""));
  };

  const archive = async (archived: boolean) => {
    if (!product) return;
    const result = await act(
      { action: "setArchived", entity: "product", id: product.id, archived },
      archived ? T("Продукт перенесён в архив", "Product archived", "Đã lưu trữ") : T("Продукт восстановлен", "Product restored", "Đã khôi phục"),
    );
    if (result && onClose) onClose();
  };

  const basics = (
    <div className="erpGrid two">
      <Field label={T("Название (English) *", "Name (English) *", "Tên (English) *")}>
        <input value={form.name_en} onChange={(e) => set("name_en", e.target.value)} autoFocus={isNew} />
      </Field>
      <Field label={T("Название (Tiếng Việt)", "Name (Tiếng Việt)", "Tên (Tiếng Việt)")}>
        <input value={form.name_vn} onChange={(e) => set("name_vn", e.target.value)} />
      </Field>
      {ingredientCard ? (
        <Field
          label={T("Поставщик", "Supplier", "Nhà cung cấp")}
          hint={T("Из фасовки продукта (erp_product_packs.supplier_id). Не отдельный справочник.", "From the product pack (erp_product_packs.supplier_id). Not a second catalog.", "Từ quy cách sản phẩm, không phải danh mục riêng.")}
        >
          <select
            value={defaultPackSupplier()}
            onChange={(e) => setPackSupplier(e.target.value || null)}
            disabled={!packs.length}
          >
            <option value="">{T("— нет —", "— none —", "— không —")}</option>
            {state.suppliers
              .filter((s) => !s.archived_at || s.id === defaultPackSupplier())
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
          {!packs.length ? (
            <p className="erpHint">{T("Сначала добавьте фасовку — поставщик хранится на ней.", "Add a pack first — the supplier is stored on the pack.", "Hãy thêm quy cách — nhà cung cấp lưu trên quy cách.")}</p>
          ) : null}
        </Field>
      ) : (
        <Field label={T("Тип *", "Type *", "Loại *")}>
          <select value={form.type} onChange={(e) => set("type", e.target.value as ErpProductType)}>
            {PRODUCT_TYPES.map((key) => (
              <option key={key} value={key}>
                {typeLabel(key)}
              </option>
            ))}
          </select>
        </Field>
      )}
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
            .filter((c) => (!c.archived_at && !c.deleted_at) || c.id === form.category_id)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {categoryName(c)}
              </option>
            ))}
        </select>
      </Field>
      <Field label={productBrandFieldLabel(form.type)}>
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
      <h3>{T("Фасовки для закупки", "Purchase packs", "Quy cách mua")}</h3>
      <p className="erpHint">
        {T(
          "Коробка, пачка, канистра — как товар покупают. Если фасовок несколько, отметьте какая подставляется в заказе.",
          "Box, pack, can — how the goods are bought. If there are several, mark which one is pre-filled on the order.",
          "Thùng, gói, can — cách mua hàng. Nếu có nhiều quy cách, chọn quy cách mặc định trên đơn.",
        )}
      </p>
      {packs.length ? (
        <div className="erpTableWrap scroll">
          <table className="erpTable stack">
            <thead>
              <tr>
                <th>{T("Фасовка", "Pack", "Quy cách")}</th>
                <th>{T("Количество", "Quantity", "Số lượng")}</th>
                <th>{T("Поставщик", "Supplier", "Nhà cung cấp")}</th>
                <th>{productCodeFieldLabel()}</th>
                {packs.length > 1 ? <th>{T("В заказе по умолчанию", "Default on order", "Mặc định trên đơn")}</th> : null}
                <th />
              </tr>
            </thead>
            <tbody>
              {packs.map((pack, index) => {
                const update = (patch: Partial<PackDraft>) => setPacks((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
                const chosen = state.packs.find((p) => p.id === pack.pack_id);
                const options = compatiblePacks(state.packs, unit).filter((p) => p.id === pack.pack_id || !packs.some((row) => row.pack_id === p.id));
                return (
                  <tr key={pack.id ?? `new-${index}`}>
                    <td className="main erpPackPick">
                      {pack.pack_id ? (
                        <select
                          value={pack.pack_id}
                          onChange={(e) => {
                            const next = state.packs.find((p) => p.id === e.target.value);
                            update({ pack_id: e.target.value, label: next?.name ?? pack.label, qty_base: next?.qty_base ?? pack.qty_base });
                          }}
                        >
                          {options.map((p) => (
                            <option key={p.id} value={p.id}>
                              {packDisplayName(p)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input value={pack.label} placeholder={T("Название фасовки", "Pack name", "Tên quy cách")} onChange={(e) => update({ label: e.target.value, pack_id: undefined })} />
                      )}
                    </td>
                    <td className="edit" data-label={T("Количество", "Quantity", "Số lượng")}>
                      {pack.pack_id ? (
                        qtyText(chosen?.qty_base ?? pack.qty_base, unit)
                      ) : (
                        <QtyInput base={unit} value={pack.qty_base || null} onChange={(v) => update({ qty_base: v ?? 0 })} />
                      )}
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
                    <td className="edit erpPackCode" data-label={productCodeFieldLabel()}>
                      <input
                        value={pack.code}
                        onChange={(e) => update({ code: e.target.value })}
                        autoComplete="off"
                        spellCheck={false}
                        aria-label={productCodeFieldLabel()}
                        data-testid="pack-code"
                      />
                    </td>
                    {packs.length > 1 ? (
                      <td data-label={T("В заказе по умолчанию", "Default on order", "Mặc định trên đơn")}>
                        <input
                          type="radio"
                          name="defaultPack"
                          checked={pack.is_default}
                          onChange={() => setPacks((prev) => prev.map((p, i) => ({ ...p, is_default: i === index })))}
                          aria-label={T("Подставлять эту фасовку в заказе", "Pre-fill this pack on the order", "Điền sẵn quy cách này trên đơn")}
                        />
                      </td>
                    ) : null}
                    <td className="erpPackRowDel">
                      <DropMenu
                        align="right"
                        fixed
                        trigger={({ open, toggle }) => (
                          <button
                            type="button"
                            className="erpPackDots"
                            aria-label={T("Действия", "Actions", "Thao tác")}
                            aria-expanded={open}
                            onClick={toggle}
                            data-testid="product-pack-row-menu"
                          >
                            ⋮
                          </button>
                        )}
                      >
                        {(close) => (
                          <div className="erpDropList">
                            <button
                              type="button"
                              className="erpDropAction erpDanger"
                              data-testid="product-pack-delete"
                              onClick={() => {
                                close();
                                const label = pack.label.trim() || T("эту фасовку", "this pack", "quy cách này");
                                if (
                                  pack.id &&
                                  !window.confirm(
                                    T(
                                      `Удалить фасовку «${label}»? После сохранения она исчезнет из заказов. Старые поставки сохранятся.`,
                                      `Delete pack “${label}”? After you save, it leaves new orders. Old deliveries keep it.`,
                                      `Xóa quy cách “${label}”? Sau khi lưu sẽ không còn trên đơn mới. Phiếu cũ giữ nguyên.`,
                                    ),
                                  )
                                )
                                  return;
                                setPacks((prev) => {
                                  const next = prev.filter((_, i) => i !== index);
                                  if (next.length && !next.some((row) => row.is_default)) {
                                    return next.map((row, i) => ({ ...row, is_default: i === 0 }));
                                  }
                                  return next;
                                });
                              }}
                            >
                              {T("Удалить", "Delete", "Xóa")}
                            </button>
                          </div>
                        )}
                      </DropMenu>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="erpHint">{T("Фасовок пока нет. Добавьте коробку, пачку или канистру.", "No packs yet. Add a box, pack or can.", "Chưa có quy cách. Thêm thùng, gói hoặc can.")}</p>
      )}
      <div className="erpActions">
        <button
          type="button"
          className="erpBtn"
          disabled={!unit}
          onClick={() => setPacks((prev) => [...prev, { label: "", qty_base: 0, is_default: !prev.length, supplier_id: product?.staff_supplier_id ?? null, code: "" }])}
        >
          + {T("Новая фасовка", "New pack", "Quy cách mới")}
        </button>
        <button
          type="button"
          className="erpBtn"
          disabled={!unit || !compatiblePacks(state.packs, unit).some((p) => !packs.some((row) => row.pack_id === p.id))}
          onClick={() => {
            const next = compatiblePacks(state.packs, unit).find((p) => !packs.some((row) => row.pack_id === p.id));
            if (!next) return;
            setPacks((prev) => [...prev, { pack_id: next.id, label: next.name, qty_base: next.qty_base, is_default: !prev.length, supplier_id: product?.staff_supplier_id ?? null, code: "" }]);
          }}
        >
          + {T("Из справочника", "From catalog", "Từ danh mục")}
        </button>
        <NavLink href="/erp/stock/packs/new" className="erpBtn ghost">
          {T("Открыть справочник", "Open catalog", "Mở danh mục")}
        </NavLink>
      </div>
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

  const stub = (label: string) => notify({ ok: false, text: notImplemented(label) });

  const backHref = productEditorReturnHref(from, goodsMode ? MENU_HREFS.goods : MENU_HREFS.ingredients);
  const backLabel =
    from === ORDERS_ADMIN_PATH
      ? T("Позиции заказов", "Order items", "Mặt hàng đặt")
      : goodsMode
        ? T("Товары", "Products", "Hàng hóa")
        : T("Ингредиенты", "Ingredients", "Nguyên liệu");
  const goBack = () => {
    if (!confirmLeave()) return;
    onClose?.();
  };

  return (
    <>
      {onClose ? (
        <button type="button" className="erpBack" onClick={goBack}>
          ← {backLabel}
        </button>
      ) : (
        <NavLink href={backHref} className="erpBack">
          ← {backLabel}
        </NavLink>
      )}
      <PageHead
        title={
          <>
            {product ? productTitle(product) : goodsMode ? T("Добавление товара", "Add product", "Thêm hàng hóa") : T("Новый продукт", "New product", "Sản phẩm mới")}
            {product?.archived_at ? <span className="erpBadge">{T("в архиве", "archived", "lưu trữ")}</span> : null}
          </>
        }
        sub={
          goodsMode
            ? product
              ? typeLabel(product.type)
              : T("Достаточно названия, типа и единицы — остальное можно заполнить позже.", "Name, type and unit are enough — the rest can be filled in later.", "Chỉ cần tên, loại và đơn vị — phần còn lại điền sau.")
            : product
              ? categoryName(product.category_id ? state.categories.find((c) => c.id === product.category_id) : undefined)
              : T("Достаточно названия, категории и единицы — остальное можно заполнить позже.", "Name, category and unit are enough — the rest can be filled in later.", "Chỉ cần tên, nhóm và đơn vị — phần còn lại điền sau.")
        }
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

      {goodsMode ? (
        <section className="erpCard">
          <h2>{T("Поля Poster без API", "Poster fields without an API", "Trường Poster chưa có API")}</h2>
          <p className="erpHint">
            {T(
              "Цех, налог, обложка, опции, штрихкод и цена продажи в ERP ещё нет. Кнопки не сохраняют эти поля.",
              "Workshop, tax, cover, options, barcode and sale price are not in the ERP yet. These controls do not save.",
              "Phân xưởng, thuế, ảnh, tùy chọn, mã vạch và giá bán chưa có trong ERP. Không lưu các trường này.",
            )}
          </p>
          <div className="erpGrid two">
            <Field label={T("Цех приготовления", "Prep workshop", "Phân xưởng")}>
              <select value={POSTER_WORKSHOPS[0]} onChange={() => stub(T("Цех приготовления", "Prep workshop", "Phân xưởng"))}>
                {POSTER_WORKSHOPS.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={T("Налог", "Tax", "Thuế")}>
              <select value="inherit" onChange={() => stub(T("Налог", "Tax", "Thuế"))}>
                <option value="inherit">{T("Налог родительской категории (Налог не указан)", "Parent category tax (none)", "Thuế nhóm cha (chưa chọn)")}</option>
              </select>
            </Field>
            <Field label={T("Обложка", "Cover", "Ảnh bìa")}>
              <button type="button" className="erpBtn" onClick={() => stub(T("Обложка", "Cover", "Ảnh bìa"))}>
                {T("Ред.", "Edit", "Sửa")}
              </button>
            </Field>
            <Field label={T("Штрихкод", "Barcode", "Mã vạch")}>
              <input readOnly value="" placeholder={T("нет в API", "not in API", "chưa có API")} onFocus={() => stub(T("Штрихкод", "Barcode", "Mã vạch"))} />
            </Field>
            <Field label={T("Итого (цена продажи)", "Total (sale price)", "Tổng (giá bán)")}>
              <input readOnly value="" placeholder="—" onFocus={() => stub(T("Цена продажи", "Sale price", "Giá bán"))} />
            </Field>
          </div>
          <label className="erpCheck">
            <input type="checkbox" checked={false} onChange={() => stub(T("Весовой товар", "Weighable", "Bán theo cân"))} />
            {T("Весовой товар", "Weighable", "Bán theo cân")}
          </label>
          <label className="erpCheck">
            <input type="checkbox" checked={false} onChange={() => stub(T("Разные цены в заведениях", "Different venue prices", "Giá khác theo cơ sở"))} />
            {T("Разные цены в заведениях и источниках заказов", "Different prices in venues and order sources", "Giá khác theo cơ sở và nguồn đơn")}
          </label>
          <label className="erpCheck">
            <input type="checkbox" checked={false} onChange={() => stub(T("Не участвует в скидках", "Excluded from discounts", "Không áp dụng giảm giá"))} />
            {T("Не участвует в скидках", "Excluded from discounts", "Không áp dụng giảm giá")}
          </label>
        </section>
      ) : null}

      {goodsMode && isNew ? (
        <details className="erpMore erpCard">
          <summary>{T("Закупка и хранение (необязательно)", "Purchasing and storage (optional)", "Mua hàng và bảo quản (không bắt buộc)")}</summary>
          <h2>{T("Закупка и упаковки", "Purchasing & packs", "Mua hàng và quy cách")}</h2>
          {purchasing}
          <h2>{T("Хранение", "Storage", "Bảo quản")}</h2>
          {storage}
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
        {isNew && goodsMode ? (
          <button type="button" className="erpBtn" disabled={busy || !canSave} onClick={() => void save(true)}>
            {T("Сохранить и создать ещё", "Save and add another", "Lưu và tạo tiếp")}
          </button>
        ) : null}
        <button type="button" className="erpBtn primary" disabled={busy || !canSave} onClick={() => void save(false)}>
          {busy
            ? savingText()
            : isNew && goodsMode
              ? T("Сохранить", "Save", "Lưu")
              : isNew
                ? T("Создать продукт", "Create product", "Tạo sản phẩm")
                : T("Сохранить изменения", "Save changes", "Lưu thay đổi")}
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