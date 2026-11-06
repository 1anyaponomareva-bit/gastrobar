"use client";

import { Suspense, useMemo, useState } from "react";
import { productTitle } from "@/lib/erp/costing";
import { withMenuListReturn } from "@/lib/erp/menuListQuery";
import { costInfo, costNumber, stockByProduct, stockOf, stockValue } from "@/lib/erp/stockView";
import { packSupplierIds, packSupplierLabel } from "@/lib/erp/supplierCategories";
import type { ErpProduct, ErpState } from "@/lib/erp/types";
import { Caret, CatalogTable, type CatalogColumn } from "./CatalogTable";
import { useErp } from "./ErpShell";
import { DropMenu, MultiSelect } from "./filters";
import { netOf } from "./losses";
import {
  categoryLabel,
  dishTitle,
  INGREDIENT_TYPES,
  lossPercentsText,
  posterStockQty,
  prepsUsingProduct,
  productCodeFieldLabel,
  visibleCategories,
} from "./menuFields";
import { useMenuListQuery } from "./menuListState";
import { MENU_HREFS } from "./menuNav";
import { NavLink, qtyText, T, unitLabel, unitOf, vnd } from "./ui";

type Row = ErpProduct & {
  categoryName: string;
  supplierName: string;
  supplierIds: string[];
  unitCost: number | null;
  stockQty: number;
  stockSum: number | null;
};

type UsageRow = { href: string; name: string; gross: string; net: string; price?: number | null };

function dishUsage(state: ErpState, productId: string): UsageRow[] {
  const rows: UsageRow[] = [];
  for (const dish of state.dishes) {
    if (dish.archived_at) continue;
    for (const line of dish.lines) {
      if (line.product_id !== productId) continue;
      const unit = unitOf(state, line.product_id);
      const net = netOf(state, line);
      rows.push({
        href: `/erp/menu/${dish.id}`,
        name: dishTitle(dish),
        gross: qtyText(line.qty, unit),
        net: net == null ? "—" : qtyText(net, unit),
        price: dish.sale_price,
      });
    }
  }
  return rows;
}

function prepUsage(state: ErpState, productId: string): UsageRow[] {
  const rows: UsageRow[] = [];
  for (const prep of prepsUsingProduct(state, productId)) {
    const recipe = state.recipes.find((item) => item.product_id === prep.id && item.status === "active");
    for (const line of recipe?.lines ?? []) {
      if (line.product_id !== productId) continue;
      const unit = unitOf(state, line.product_id);
      const net = netOf(state, line);
      rows.push({
        href: `/erp/preps/recipe/${prep.id}`,
        name: productTitle(prep),
        gross: qtyText(line.qty, unit),
        net: net == null ? "—" : qtyText(net, unit),
      });
    }
  }
  return rows;
}

function IngredientUsage({ dishes, preps }: { dishes: UsageRow[]; preps: UsageRow[] }) {
  return (
    <div className="erpMenuUsageBlock">
      <h3>{T("Используется в тех. картах:", "Used in recipes:", "Dùng trong công thức:")}</h3>
      {dishes.length ? (
        <UsageMiniTable rows={dishes} price />
      ) : (
        <p className="erpHint">{T("Не используется в тех. картах", "Not used in recipes", "Không dùng trong công thức")}</p>
      )}
      {preps.length ? (
        <>
          <h3>{T("Используется в полуфабрикатах:", "Used in preps:", "Dùng trong bán thành phẩm:")}</h3>
          <UsageMiniTable rows={preps} />
        </>
      ) : null}
    </div>
  );
}

function UsageMiniTable({ rows, price }: { rows: UsageRow[]; price?: boolean }) {
  return (
    <div className="erpTableWrap">
      <table className="erpTable erpMenuTable">
        <thead>
          <tr>
            <th>{T("Название", "Name", "Tên")}</th>
            <th className="num">{T("Брутто", "Gross", "Brutto")}</th>
            <th className="num">{T("Нетто", "Net", "Netto")}</th>
            {price ? <th className="num">{T("Цена, ₫", "Price, ₫", "Giá, ₫")}</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.href}-${index}`}>
              <td>
                <NavLink href={row.href} className="erpName">
                  {row.name}
                </NavLink>
              </td>
              <td className="num">{row.gross}</td>
              <td className="num">{row.net}</td>
              {price ? <td className="num">{vnd(row.price ?? null)}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MenuIngredientsPage() {
  return (
    <Suspense fallback={null}>
      <MenuIngredientsList />
    </Suspense>
  );
}

function MenuIngredientsList() {
  const { state, act } = useErp();
  const list = useMenuListQuery(MENU_HREFS.ingredients);
  const query = list.q;
  const categories = list.category;
  const units = list.unit;
  const suppliers = list.supplier;
  const archived = list.archived;
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const stockMap = useMemo(() => (state ? stockByProduct(state.stock, null) : new Map()), [state]);
  if (!state) return null;

  const catMap = new Map(state.categories.map((c) => [c.id, c]));
  const q = query.trim().toLowerCase();
  const catSet = new Set(categories);
  const unitSet = new Set(units);
  const supplierSet = new Set(suppliers);
  const allowed = new Set<string>(INGREDIENT_TYPES);
  const packs = state.productPacks;
  const pool = state.products.filter((p) => allowed.has(p.type) && Boolean(p.archived_at) === archived);
  const rows: Row[] = pool
    .filter((p) => {
      if (catSet.size && !catSet.has(p.category_id ?? "none")) return false;
      if (unitSet.size && !unitSet.has(p.base_unit ?? "none")) return false;
      const ids = packSupplierIds(p.id, packs);
      if (supplierSet.size) {
        if (!ids.length) return supplierSet.has("none");
        if (!ids.some((id) => supplierSet.has(id))) return false;
      }
      const packCodes = packs
        .filter((link) => link.product_id === p.id)
        .map((link) => link.code ?? "")
        .join(" ");
      return !q || `${p.name_en} ${p.name_vn} ${p.brand ?? ""} ${p.code} ${p.product_code ?? ""} ${packCodes}`.toLowerCase().includes(q);
    })
    .map((p) => {
      const stock = stockOf(stockMap, p.id);
      return {
        ...p,
        categoryName: categoryLabel(p.category_id ? catMap.get(p.category_id) : undefined),
        supplierIds: packSupplierIds(p.id, packs),
        supplierName: packSupplierLabel(p.id, packs, state.suppliers),
        unitCost: costNumber(costInfo(stock, p)),
        stockQty: stock.qty,
        stockSum: stockValue(stock),
      };
    });
  const usedSupplierIds = new Set(pool.flatMap((p) => packSupplierIds(p.id, packs)));
  const supplierOptions = state.suppliers
    .filter((s) => !s.archived_at && usedSupplierIds.has(s.id))
    .map((s) => ({ id: s.id, label: s.name }));
  if (pool.some((p) => packSupplierIds(p.id, packs).length === 0)) {
    supplierOptions.unshift({ id: "none", label: T("Без поставщика", "No supplier", "Chưa có NCC") });
  }
  const unitOptions = [
    { id: "pcs", label: T("шт.", "pcs", "cái") },
    { id: "kg", label: T("кг", "kg", "kg") },
    { id: "l", label: T("л", "l", "l") },
  ];
  if (pool.some((p) => !p.base_unit)) unitOptions.push({ id: "none", label: T("Без единицы", "No unit", "Chưa có đơn vị") });

  const columns: CatalogColumn<Row>[] = [
    {
      id: "name",
      label: T("Название", "Name", "Tên"),
      cell: (row) => (
        <NavLink href={withMenuListReturn(`/erp/products/${row.id}`, list.href)} className="erpName">
          {productTitle(row)}
        </NavLink>
      ),
      text: (row) => productTitle(row),
    },
    { id: "barcode", label: T("Штрихкод", "Barcode", "Mã vạch"), defaultHidden: true, sort: false, cell: () => "—", text: () => "" },
    { id: "category", label: T("Категория", "Category", "Nhóm"), cell: (row) => row.categoryName, text: (row) => row.categoryName },
    {
      id: "supplier",
      label: T("Поставщик", "Supplier", "Nhà cung cấp"),
      cell: (row) => row.supplierName || "—",
      text: (row) => row.supplierName,
    },
    {
      id: "productCode",
      label: productCodeFieldLabel(),
      defaultHidden: true,
      sort: false,
      cell: (row) => row.product_code?.trim() || "—",
      text: (row) => row.product_code ?? "",
    },
    {
      id: "unit",
      label: T("Ед. измерения", "Unit", "Đơn vị"),
      cell: (row) => (row.base_unit ? unitLabel(row.base_unit) : "—"),
      text: (row) => row.base_unit ?? "",
    },
    {
      id: "pieceWeight",
      label: T("Вес штучного ингредиента", "Piece weight", "Khối lượng 1 cái"),
      defaultHidden: true,
      num: true,
      cell: (row) => (row.unit_weight_kg == null ? "—" : posterStockQty(row.unit_weight_kg, "kg")),
      text: (row) => (row.unit_weight_kg == null ? "—" : String(row.unit_weight_kg)),
    },
    {
      id: "loss",
      label: T("Потери", "Losses", "Hao hụt"),
      sort: false,
      cell: (row) => lossPercentsText(row),
      text: (row) => lossPercentsText(row),
    },
    {
      id: "stock",
      label: T("Остатки на складах", "Stock on hand", "Tồn kho"),
      num: true,
      cell: (row) => posterStockQty(row.stockQty, row.base_unit),
      text: (row) => String(row.stockQty),
    },
    {
      id: "cost",
      label: T("Себестоимость", "Cost", "Giá vốn"),
      num: true,
      cell: (row) => (row.unitCost == null ? "—" : vnd(row.unitCost)),
      text: (row) => (row.unitCost == null ? "—" : String(row.unitCost)),
    },
    {
      id: "stockValue",
      label: T("Сумма остатков", "Stock value", "Giá trị tồn"),
      num: true,
      cell: (row) => (row.stockSum == null ? "—" : vnd(row.stockSum)),
      text: (row) => (row.stockSum == null ? "—" : String(row.stockSum)),
    },
  ];

  return (
    <CatalogTable
      storeKey="gastrofood-erp-menu-ingredients-v2"
      activeHref={MENU_HREFS.ingredients}
      title={T("Ингредиенты", "Ingredients", "Nguyên liệu")}
      sheetName="menu-ingredients"
      columns={columns}
      rows={rows}
      query={query}
      onQuery={(value) => list.set({ q: value })}
      listHref={list.href}
      urlSort={list.sort || undefined}
      urlDesc={list.desc}
      onSortChange={(sort, desc) => list.set({ sort, desc })}
      searchPlaceholder={T("Быстрый поиск", "Quick search", "Tìm nhanh")}
      catalogEmpty={!state.products.some((p) => allowed.has(p.type))}
      emptyTitle={T("Ингредиентов пока нет", "No ingredients yet", "Chưa có nguyên liệu")}
      emptyText={T(
        "Это тот же справочник erp_products (сырьё, упаковка, расходники), не второй каталог.",
        "This is the same erp_products catalog (ingredients, packaging, consumables), not a second list.",
        "Cùng danh mục erp_products, không phải danh mục thứ hai.",
      )}
      addHref="/erp/products/new"
      addLabel={T("Добавить", "Add", "Thêm")}
      rowHref={(row) => `/erp/products/${row.id}`}
      hideTrash
      hideMore
      hideCheck
      showImport
      expandedId={detailsId}
      rowExpand={(row) => <IngredientUsage dishes={dishUsage(state, row.id)} preps={prepUsage(state, row.id)} />}
      filterBar={
        <>
          <MultiSelect
            label={T("Категория", "Category", "Nhóm")}
            options={[
              ...visibleCategories(state.categories).map((c) => ({ id: c.id, label: categoryLabel(c) })),
              { id: "none", label: T("Без категории", "No category", "Chưa phân nhóm") },
            ]}
            value={categories}
            onChange={(value) => list.set({ category: value })}
            searchable
          />
          <MultiSelect label={T("Ед. измерения", "Unit", "Đơn vị")} options={unitOptions} value={units} onChange={(value) => list.set({ unit: value })} />
          <MultiSelect
            label={T("Поставщик", "Supplier", "Nhà cung cấp")}
            options={supplierOptions}
            value={suppliers}
            onChange={(value) => list.set({ supplier: value })}
            searchable
          />
          <DropMenu
            trigger={({ open, toggle }) => (
              <button type="button" className={`erpFilterBtn ${archived ? "on" : ""}`} aria-expanded={open} onClick={toggle}>
                <span>+ {T("Фильтр", "Filter", "Bộ lọc")}</span>
                <Caret />
              </button>
            )}
          >
            {() => (
              <div className="erpDropList">
                <label className="erpDropItem">
                  <input type="checkbox" checked={archived} onChange={(e) => list.set({ archived: e.target.checked })} />
                  <span>{T("Архив", "Archived", "Lưu trữ")}</span>
                </label>
              </div>
            )}
          </DropMenu>
        </>
      }
      rowEnd={(row) => (
        <>
          <button type="button" className="erpLink" onClick={() => setDetailsId(row.id === detailsId ? null : row.id)}>
            {T("Детали", "Details", "Chi tiết")}
          </button>
          <NavLink href={withMenuListReturn(`/erp/products/${row.id}`, list.href)} className="erpLink">
            {T("Ред.", "Edit", "Sửa")}
          </NavLink>
        </>
      )}
      rowMenu={(row, close) => (
        <button
          type="button"
          className={archived ? "erpDropAction" : "erpDropAction erpDanger"}
          onClick={() => {
            close();
            const ok = window.confirm(
              archived
                ? T(
                    `Вернуть «${productTitle(row)}» из архива?`,
                    `Restore “${productTitle(row)}” from archive?`,
                    `Khôi phục “${productTitle(row)}” khỏi lưu trữ?`,
                  )
                : T(
                    `Убрать «${productTitle(row)}» в архив справочника? Это не списание со склада.`,
                    `Archive “${productTitle(row)}”? This does not take stock.`,
                    `Lưu trữ “${productTitle(row)}”? Không trừ kho.`,
                  ),
            );
            if (!ok) return;
            void act(
              { action: "setArchived", entity: "product", id: row.id, archived: !archived },
              archived ? T("Восстановлено", "Restored", "Đã khôi phục") : T("В архиве", "Archived", "Đã lưu trữ"),
            );
          }}
        >
          {archived ? T("Восстановить", "Restore", "Khôi phục") : T("Удалить", "Delete", "Xóa")}
        </button>
      )}
      note={T(
        "Колонки как в Poster плюс Поставщик. Неизвестная себестоимость — «—», не 0. Импорт Poster не подключён. Сохранение карточки склад не двигает.",
        "Poster columns plus Supplier. Unknown cost is —, not 0. Poster import is not wired. Saving a card does not move stock.",
        "Cột Poster kèm Nhà cung cấp. Giá vốn chưa biết là —. Không nhập Poster. Lưu thẻ không trừ kho.",
      )}
    />
  );
}
