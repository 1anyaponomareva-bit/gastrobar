"use client";

import { Suspense, useMemo } from "react";
import { withMenuListReturn } from "@/lib/erp/menuListQuery";
import { CatalogTable, Caret, StubFilter, type CatalogColumn } from "./CatalogTable";
import { useErp } from "./ErpShell";
import { DropMenu, MultiSelect } from "./filters";
import { categoryLabel, costContextOf, dishEconomics, dishTitle, visibleCategories } from "./menuFields";
import { useMenuListQuery } from "./menuListState";
import { MENU_HREFS } from "./menuNav";
import { NavLink, T, vnd } from "./ui";
import type { ErpDish } from "@/lib/erp/types";

type Row = ErpDish & { categoryName: string; cost: number | null; lineCount: number };

export function MenuRecipesPage() {
  return (
    <Suspense fallback={null}>
      <MenuRecipesList />
    </Suspense>
  );
}

function MenuRecipesList() {
  const { state, act } = useErp();
  const list = useMenuListQuery(MENU_HREFS.recipes);
  const query = list.q;
  const categories = list.category;
  const archived = list.archived;
  const ctx = useMemo(() => (state ? costContextOf(state) : null), [state]);
  if (!state || !ctx) return null;

  const catMap = new Map(state.categories.map((c) => [c.id, c]));
  const q = query.trim().toLowerCase();
  const catSet = new Set(categories);
  const pool = state.dishes.filter((d) => Boolean(d.archived_at) === archived);
  const rows: Row[] = pool
    .filter((d) => {
      if (catSet.size && !catSet.has(d.category_id ?? "none")) return false;
      return !q || `${d.name_en} ${d.name_vn}`.toLowerCase().includes(q);
    })
    .map((d) => ({
      ...d,
      categoryName: categoryLabel(d.category_id ? catMap.get(d.category_id) : undefined),
      cost: dishEconomics(state, ctx, d).cost,
      lineCount: d.lines.length,
    }));

  const columns: CatalogColumn<Row>[] = [
    {
      id: "name",
      label: T("Название", "Name", "Tên"),
      locked: true,
      cell: (row) => (
        <NavLink href={withMenuListReturn(`/erp/menu/${row.id}`, list.href)} className="erpName">
          {dishTitle(row)}
          {!row.lineCount ? <span className="erpBadge warn">{T("нет состава", "no composition", "chưa có thành phần")}</span> : null}
        </NavLink>
      ),
      text: (row) => dishTitle(row),
    },
    { id: "category", label: T("Категория", "Category", "Nhóm"), cell: (row) => row.categoryName, text: (row) => row.categoryName },
    {
      id: "lines",
      label: T("Ингредиенты", "Ingredients", "Nguyên liệu"),
      num: true,
      cell: (row) => String(row.lineCount),
      text: (row) => String(row.lineCount),
    },
    {
      id: "cost",
      label: T("Себестоимость", "Cost", "Giá vốn"),
      num: true,
      cell: (row) => (row.cost === null ? <span className="erpBadge warn">{T("неполная", "incomplete", "chưa đủ")}</span> : vnd(row.cost)),
      text: (row) => (row.cost === null ? "" : String(Math.round(row.cost))),
    },
  ];

  return (
    <CatalogTable
      storeKey="gastrofood-erp-menu-recipes"
      activeHref={MENU_HREFS.recipes}
      title={T("Тех. карты", "Recipes", "Công thức")}
      sheetName="menu-recipes"
      columns={columns}
      rows={rows}
      query={query}
      onQuery={(value) => list.set({ q: value })}
      listHref={list.href}
      urlSort={list.sort || undefined}
      urlDesc={list.desc}
      onSortChange={(sort, desc) => list.set({ sort, desc })}
      searchPlaceholder={T("Быстрый поиск", "Quick search", "Tìm nhanh")}
      emptyTitle={T("Тех. карт пока нет", "No recipes yet", "Chưa có công thức")}
      addHref="/erp/menu/new"
      addLabel={T("Добавить", "Add", "Thêm")}
      rowHref={(row) => `/erp/menu/${row.id}`}
      onTrash={async (ids) => {
        for (const id of ids) await act({ action: "setArchived", entity: "dish", id, archived: !archived }, false);
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
            onChange={(value) => list.set({ category: value })}
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
                  <input type="checkbox" checked={archived} onChange={(e) => list.set({ archived: e.target.checked })} />
                  <span>{T("Архив", "Archived", "Lưu trữ")}</span>
                </label>
              </div>
            )}
          </DropMenu>
        </>
      }
      rowMenu={(row) => (
        <NavLink href={withMenuListReturn(`/erp/menu/${row.id}`, list.href)} className="erpDropAction">
          {T("Открыть состав", "Open composition", "Mở thành phần")}
        </NavLink>
      )}
    />
  );
}
