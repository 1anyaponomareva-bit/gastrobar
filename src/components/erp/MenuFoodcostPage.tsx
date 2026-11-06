"use client";

import { useMemo, useState } from "react";
import type { ErpDish } from "@/lib/erp/types";
import { CatalogTable, StubFilter, VenueStubFilter, type CatalogColumn } from "./CatalogTable";
import { useErp } from "./ErpShell";
import { MultiSelect } from "./filters";
import { categoryLabel, costContextOf, dishEconomics, dishTitle } from "./menuFields";
import { MENU_HREFS } from "./menuNav";
import { NavLink, pct, T, vnd } from "./ui";

type Row = ErpDish & { categoryName: string; cost: number | null; foodCost: number | null; foodOnPrice: number | null; margin: number | null; markup: number | null };

export function MenuFoodcostPage() {
  const { state } = useErp();
  const [query, setQuery] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const ctx = useMemo(() => (state ? costContextOf(state) : null), [state]);
  if (!state || !ctx) return null;

  const catMap = new Map(state.categories.map((c) => [c.id, c]));
  const q = query.trim().toLowerCase();
  const catSet = new Set(categories);
  const pool = state.dishes.filter((d) => !d.archived_at);
  const rows: Row[] = pool
    .filter((d) => {
      if (catSet.size && !catSet.has(d.category_id ?? "none")) return false;
      return !q || `${d.name_en} ${d.name_vn}`.toLowerCase().includes(q);
    })
    .map((d) => {
      const eco = dishEconomics(state, ctx, d);
      return {
        ...d,
        categoryName: categoryLabel(d.category_id ? catMap.get(d.category_id) : undefined),
        cost: eco.cost,
        foodCost: eco.foodCostPct,
        foodOnPrice: eco.foodOnPrice,
        margin: eco.margin,
        markup: eco.markup,
      };
    });

  const columns: CatalogColumn<Row>[] = [
    {
      id: "name",
      label: T("Название", "Name", "Tên"),
      cell: (row) => (
        <NavLink href={`/erp/menu/${row.id}`} className="erpName">
          {dishTitle(row)}
        </NavLink>
      ),
      text: (row) => dishTitle(row),
    },
    { id: "category", label: T("Категория", "Category", "Nhóm"), cell: (row) => row.categoryName, text: (row) => row.categoryName },
    {
      id: "price",
      label: T("Цена", "Price", "Giá"),
      num: true,
      cell: (row) => vnd(row.sale_price),
      text: (row) => (row.sale_price == null ? "" : String(Math.round(row.sale_price))),
    },
    {
      id: "cost",
      label: T("Себестоимость", "Cost", "Giá vốn"),
      num: true,
      cell: (row) => (row.cost === null ? "—" : vnd(row.cost)),
      text: (row) => (row.cost == null ? "" : String(Math.round(row.cost))),
    },
    { id: "foodcost", label: "Food Cost", num: true, cell: (row) => pct(row.foodOnPrice ?? row.foodCost), text: (row) => (row.foodOnPrice == null ? "" : String(row.foodOnPrice)) },
    { id: "markup", label: T("Наценка", "Markup", "Phụ thu"), num: true, cell: (row) => pct(row.markup), text: (row) => (row.markup == null ? "" : String(row.markup)) },
    { id: "margin", label: T("Маржа", "Margin", "Biên LN"), num: true, cell: (row) => pct(row.margin), text: (row) => (row.margin == null ? "" : String(row.margin)) },
  ];

  return (
    <CatalogTable
      storeKey="gastrofood-erp-menu-foodcost"
      activeHref={MENU_HREFS.foodcost}
      title={T("Контроль фудкоста", "Food cost", "Kiểm soát food cost")}
      sheetName="menu-foodcost"
      columns={columns}
      rows={rows}
      query={query}
      onQuery={setQuery}
      searchPlaceholder={T("Быстрый поиск", "Quick search", "Tìm nhanh")}
      catalogEmpty={!state.dishes.length}
      emptyTitle={T("Нет блюд для расчёта", "No dishes to calculate", "Chưa có món để tính")}
      emptyText={T("Фудкост считается по плановой себестоимости и цене блюда. Фактический расход по продажам — после спецификации.", "Food cost uses planned recipe cost and the dish price. Actual usage from sales waits on the spec.", "Food cost theo giá vốn định mức và giá món. Thực tế theo bán chờ spec.")}
      addHref="/erp/menu/new"
      addLabel={T("Добавить", "Add", "Thêm")}
      rowHref={(row) => `/erp/menu/${row.id}`}
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
          <StubFilter label={T("Период", "Period", "Kỳ")} />
          <VenueStubFilter />
        </>
      }
      rowMenu={(row) => (
        <NavLink href={`/erp/menu/${row.id}`} className="erpDropAction">
          {T("Открыть блюдо", "Open item", "Mở món")}
        </NavLink>
      )}
      note={T(
        "Food Cost (Poster) = себестоимость продуктов / цена × 100%. Наценка = (цена без НДС − себестоимость) / себестоимость. Период продаж и факт vs план — не реализовано.",
        "Poster food cost = food cost / price × 100%. Markup = (price excl. VAT − cost) / cost. Sales period and actual vs plan are not implemented.",
        "Food cost Poster = giá vốn / giá × 100%. Phụ thu = (giá chưa VAT − giá vốn) / giá vốn. Kỳ bán chưa làm.",
      )}
    />
  );
}
