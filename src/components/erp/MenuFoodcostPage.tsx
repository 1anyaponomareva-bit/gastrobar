"use client";

import { useMemo, useState } from "react";
import { DEFAULT_MENU_PRICE_SOURCE, type MenuPriceSource } from "@/lib/erp/costing";
import type { ErpDish } from "@/lib/erp/types";
import { CatalogTable, StubFilter, VenueStubFilter, type CatalogColumn } from "./CatalogTable";
import { useErp } from "./ErpShell";
import { MultiSelect } from "./filters";
import { categoryLabel, costContextOf, dishEconomics, dishTitle } from "./menuFields";
import { MENU_HREFS } from "./menuNav";
import { NavLink, pct, T, vnd } from "./ui";

type Row = ErpDish & {
  categoryName: string;
  cost: number | null;
  foodCost: number | null;
  foodOnPrice: number | null;
  margin: number | null;
  markup: number | null;
};

export function MenuFoodcostPage() {
  const { state } = useErp();
  const [query, setQuery] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [priceSource, setPriceSource] = useState<MenuPriceSource>(DEFAULT_MENU_PRICE_SOURCE);
  const ctx = useMemo(() => (state ? costContextOf(state, priceSource) : null), [state, priceSource]);
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
      locked: true,
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
    {
      id: "foodOnPrice",
      label: T("Food cost / цена", "Food cost / price", "Food cost / giá"),
      num: true,
      cell: (row) => pct(row.foodOnPrice),
      text: (row) => (row.foodOnPrice == null ? "" : String(row.foodOnPrice)),
    },
    {
      id: "foodCost",
      label: T("Food cost / выручка", "Food cost / net", "Food cost / DT"),
      num: true,
      defaultHidden: true,
      cell: (row) => pct(row.foodCost),
      text: (row) => (row.foodCost == null ? "" : String(row.foodCost)),
    },
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
      emptyTitle={T("Нет блюд для расчёта", "No dishes to calculate", "Chưa có món để tính")}
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
          <label className="erpFilterBtn on">
            <span>{T("Цена техкарты", "Tech-card price", "Giá thẻ KT")}</span>
            <select value={priceSource} onChange={(e) => setPriceSource(e.target.value as MenuPriceSource)}>
              <option value="reference">{T("плановая (карточка)", "reference (card)", "tham chiếu")}</option>
              <option value="last_lot">{T("последняя партия", "last lot", "lô gần nhất")}</option>
              <option value="fifo_remaining">{T("остаток FIFO", "FIFO remaining", "tồn FIFO")}</option>
            </select>
          </label>
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
        "Food cost / цена — формула Poster (себестоимость / цена × 100). Food cost / выручка — уже существующий расчёт ERP от цены без НДС. last_lot и FIFO remaining пустые, пока нет costSources. Период продаж не реализован. Списание склада не меняется.",
        "Food cost / price is Poster's formula (cost / price × 100). Food cost / net is the existing ERP figure on revenue excl. VAT. last_lot and FIFO remaining stay empty until costSources load. Sales period is not implemented. Warehouse posting is unchanged.",
        "Food cost / giá = Poster. Food cost / DT = ERP (chưa VAT). last_lot / FIFO trống nếu chưa có costSources. Kỳ bán chưa làm.",
      )}
    />
  );
}
