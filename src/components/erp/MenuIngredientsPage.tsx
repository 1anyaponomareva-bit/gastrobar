"use client";

import { useMemo, useState } from "react";
import { costLine, productTitle } from "@/lib/erp/costing";
import { packSupplierIds, packSupplierLabel } from "@/lib/erp/supplierCategories";
import type { ErpProduct } from "@/lib/erp/types";
import { CatalogTable, Caret, StubFilter, type CatalogColumn } from "./CatalogTable";
import { useErp } from "./ErpShell";
import { DropMenu, MultiSelect } from "./filters";
import { categoryLabel, costContextOf, INGREDIENT_TYPES, visibleCategories } from "./menuFields";
import { MENU_HREFS } from "./menuNav";
import { costSourceLabel, NavLink, T, unitLabel, vnd } from "./ui";

type Row = ErpProduct & { categoryName: string; supplierName: string; supplierIds: string[]; cost: number | null };

export function MenuIngredientsPage() {
  const { state, act } = useErp();
  const [query, setQuery] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [suppliers, setSuppliers] = useState<string[]>([]);
  const [archived, setArchived] = useState(false);
  const ctx = useMemo(() => (state ? costContextOf(state) : null), [state]);
  if (!state || !ctx) return null;

  const catMap = new Map(state.categories.map((c) => [c.id, c]));
  const q = query.trim().toLowerCase();
  const catSet = new Set(categories);
  const supplierSet = new Set(suppliers);
  const allowed = new Set<string>(INGREDIENT_TYPES);
  const packs = state.productPacks;
  const pool = state.products.filter((p) => allowed.has(p.type) && Boolean(p.archived_at) === archived);
  const rows: Row[] = pool
    .filter((p) => {
      if (catSet.size && !catSet.has(p.category_id ?? "none")) return false;
      const ids = packSupplierIds(p.id, packs);
      if (supplierSet.size) {
        if (!ids.length) return supplierSet.has("none");
        if (!ids.some((id) => supplierSet.has(id))) return false;
      }
      return !q || `${p.name_en} ${p.name_vn} ${p.brand ?? ""} ${p.code}`.toLowerCase().includes(q);
    })
    .map((p) => ({
      ...p,
      categoryName: categoryLabel(p.category_id ? catMap.get(p.category_id) : undefined),
      supplierIds: packSupplierIds(p.id, packs),
      supplierName: packSupplierLabel(p.id, packs, state.suppliers),
      cost: p.base_unit ? costLine(ctx, p.id, 1).cost : null,
    }));
  const usedSupplierIds = new Set(pool.flatMap((p) => packSupplierIds(p.id, packs)));
  const supplierOptions = state.suppliers
    .filter((s) => !s.archived_at && usedSupplierIds.has(s.id))
    .map((s) => ({ id: s.id, label: s.name }));
  if (pool.some((p) => packSupplierIds(p.id, packs).length === 0)) {
    supplierOptions.unshift({ id: "none", label: T("Без поставщика", "No supplier", "Chưa có NCC") });
  }

  const columns: CatalogColumn<Row>[] = [
    {
      id: "name",
      label: T("Название", "Name", "Tên"),
      locked: true,
      cell: (row) => (
        <NavLink href={`/erp/products/${row.id}`} className="erpName">
          {productTitle(row)}
        </NavLink>
      ),
      text: (row) => productTitle(row),
    },
    { id: "category", label: T("Категория", "Category", "Nhóm"), cell: (row) => row.categoryName, text: (row) => row.categoryName },
    {
      id: "supplier",
      label: T("Поставщик", "Supplier", "Nhà cung cấp"),
      cell: (row) => row.supplierName || "—",
      text: (row) => row.supplierName,
    },
    {
      id: "unit",
      label: T("Единица", "Unit", "Đơn vị"),
      cell: (row) => (row.base_unit ? unitLabel(row.base_unit) : <span className="erpBadge warn">{T("выберите единицу", "choose a unit", "chọn đơn vị")}</span>),
      text: (row) => row.base_unit ?? "",
    },
    {
      id: "cost",
      label: T("Себестоимость", "Cost", "Giá vốn"),
      num: true,
      cell: (row) =>
        !row.base_unit ? (
          "—"
        ) : row.cost === null ? (
          <span className="erpBadge warn">{T("цена неизвестна", "no price yet", "chưa có giá")}</span>
        ) : (
          <>
            {vnd(row.cost)} / {unitLabel(row.base_unit)}
            <span className="erpCellSub">{costSourceLabel(row.est_cost_source)}</span>
          </>
        ),
      text: (row) => (row.cost == null ? "" : String(Math.round(row.cost))),
    },
  ];

  return (
    <CatalogTable
      storeKey="gastrofood-erp-menu-ingredients"
      activeHref={MENU_HREFS.ingredients}
      title={T("Ингредиенты", "Ingredients", "Nguyên liệu")}
      sheetName="menu-ingredients"
      columns={columns}
      rows={rows}
      query={query}
      onQuery={setQuery}
      searchPlaceholder={T("Быстрый поиск", "Quick search", "Tìm nhanh")}
      catalogEmpty={!state.products.some((p) => allowed.has(p.type))}
      emptyTitle={T("Ингредиентов пока нет", "No ingredients yet", "Chưa có nguyên liệu")}
      emptyText={T("Это тот же справочник erp_products, классификация — категория, не тип.", "This is the same erp_products catalog, classified by category, not type.", "Cùng danh mục erp_products, phân theo nhóm chứ không theo loại.")}
      addHref="/erp/products/new"
      addLabel={T("Добавить", "Add", "Thêm")}
      rowHref={(row) => `/erp/products/${row.id}`}
      onTrash={async (ids) => {
        for (const id of ids) await act({ action: "setArchived", entity: "product", id, archived: !archived }, false);
      }}
      filterBar={
        <>
          <MultiSelect
            label={T("Категория", "Category", "Nhóm")}
            options={[
              ...visibleCategories(state.categories).map((c) => ({ id: c.id, label: categoryLabel(c) })),
              { id: "none", label: T("Без категории", "No category", "Chưa phân nhóm") },
            ]}
            value={categories}
            onChange={setCategories}
            searchable
          />
          <MultiSelect
            label={T("Поставщик", "Supplier", "Nhà cung cấp")}
            options={supplierOptions}
            value={suppliers}
            onChange={setSuppliers}
            searchable
          />
          <StubFilter label={T("Цех", "Workshop", "Phân xưởng")} />
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
                  <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
                  <span>{T("Архив", "Archived", "Lưu trữ")}</span>
                </label>
              </div>
            )}
          </DropMenu>
        </>
      }
      rowMenu={(row) => (
        <NavLink href={`/erp/products/${row.id}`} className="erpDropAction">
          {T("Открыть", "Open", "Mở")}
        </NavLink>
      )}
    />
  );
}
