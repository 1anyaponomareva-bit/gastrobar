"use client";

import { useMemo, useState } from "react";
import { costLine, productTitle, type ErpProductType } from "@/lib/erp/costing";
import type { ErpProduct } from "@/lib/erp/types";
import { CatalogTable, Caret, StubFilter, type CatalogColumn } from "./CatalogTable";
import { useErp } from "./ErpShell";
import { DropMenu, MultiSelect } from "./filters";
import { categoryLabel, costContextOf, INGREDIENT_TYPES } from "./menuFields";
import { MENU_HREFS } from "./menuNav";
import { costSourceLabel, NavLink, PRODUCT_TYPES, T, typeLabel, unitLabel, vnd } from "./ui";

type Row = ErpProduct & { categoryName: string; cost: number | null };

export function MenuIngredientsPage() {
  const { state, act } = useErp();
  const [query, setQuery] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [archived, setArchived] = useState(false);
  const ctx = useMemo(() => (state ? costContextOf(state) : null), [state]);
  if (!state || !ctx) return null;

  const catMap = new Map(state.categories.map((c) => [c.id, c]));
  const q = query.trim().toLowerCase();
  const catSet = new Set(categories);
  const typeSet = new Set(types);
  const allowed = new Set<string>(INGREDIENT_TYPES);
  const pool = state.products.filter((p) => allowed.has(p.type) && Boolean(p.archived_at) === archived);
  const rows: Row[] = pool
    .filter((p) => {
      if (typeSet.size && !typeSet.has(p.type)) return false;
      if (catSet.size && !catSet.has(p.category_id ?? "none")) return false;
      return !q || `${p.name_en} ${p.name_vn} ${p.brand ?? ""} ${p.code}`.toLowerCase().includes(q);
    })
    .map((p) => ({
      ...p,
      categoryName: categoryLabel(p.category_id ? catMap.get(p.category_id) : undefined),
      cost: p.base_unit ? costLine(ctx, p.id, 1).cost : null,
    }));

  const columns: CatalogColumn<Row>[] = [
    {
      id: "name",
      label: T("Название", "Name", "Tên"),
      cell: (row) => (
        <NavLink href={`/erp/products/${row.id}`} className="erpName">
          {productTitle(row)}
        </NavLink>
      ),
      text: (row) => productTitle(row),
    },
    { id: "type", label: T("Тип", "Type", "Loại"), cell: (row) => typeLabel(row.type), text: (row) => typeLabel(row.type) },
    { id: "category", label: T("Категория", "Category", "Nhóm"), cell: (row) => row.categoryName, text: (row) => row.categoryName },
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
      emptyText={T("Это тот же справочник erp_products (сырьё, упаковка, расходники), не второй каталог.", "This is the same erp_products catalog (ingredients, packaging, consumables), not a second list.", "Cùng danh mục erp_products, không phải danh mục thứ hai.")}
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
              ...state.categories.filter((c) => !c.archived_at).map((c) => ({ id: c.id, label: categoryLabel(c) })),
              { id: "none", label: T("Без категории", "No category", "Chưa phân nhóm") },
            ]}
            value={categories}
            onChange={setCategories}
            searchable
          />
          <MultiSelect
            label={T("Тип", "Type", "Loại")}
            options={PRODUCT_TYPES.filter((t) => allowed.has(t)).map((t) => ({ id: t, label: typeLabel(t as ErpProductType) }))}
            value={types}
            onChange={setTypes}
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
