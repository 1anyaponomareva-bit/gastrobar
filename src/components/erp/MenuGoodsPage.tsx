"use client";

import { useMemo, useState } from "react";
import { CatalogTable, Caret, StubFilter, VenueStubFilter, type CatalogColumn } from "./CatalogTable";
import { useErp } from "./ErpShell";
import { DropMenu, MultiSelect } from "./filters";
import { categoryLabel, costContextOf, dishEconomics, dishTitle } from "./menuFields";
import { MENU_HREFS } from "./menuNav";
import { NavLink, pct, T, vnd } from "./ui";
import type { ErpDish } from "@/lib/erp/types";

type Row = ErpDish & { categoryName: string; cost: number | null; markup: number | null };

export function MenuGoodsPage() {
  const { state, act } = useErp();
  const [query, setQuery] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [archived, setArchived] = useState(false);
  const ctx = useMemo(() => (state ? costContextOf(state) : null), [state]);
  if (!state || !ctx) return null;

  const catMap = new Map(state.categories.map((c) => [c.id, c]));
  const q = query.trim().toLowerCase();
  const catSet = new Set(categories);
  const pool = state.dishes.filter((d) => Boolean(d.archived_at) === archived);
  const rows: Row[] = pool
    .filter((d) => {
      if (catSet.size && !catSet.has(d.category_id ?? "none")) return false;
      return !q || `${d.name_en} ${d.name_vn} ${d.code}`.toLowerCase().includes(q);
    })
    .map((d) => {
      const eco = dishEconomics(state, ctx, d);
      return {
        ...d,
        categoryName: categoryLabel(d.category_id ? catMap.get(d.category_id) : undefined),
        cost: eco.cost,
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
      id: "cost",
      label: T("Себестоимость без НДС", "Cost excl. VAT", "Giá vốn chưa VAT"),
      num: true,
      cell: (row) => (row.cost === null ? <span className="erpBadge warn">{T("неполная", "incomplete", "chưa đủ")}</span> : vnd(row.cost)),
      text: (row) => (row.cost === null ? "" : String(Math.round(row.cost))),
    },
    {
      id: "price",
      label: T("Цена", "Price", "Giá"),
      num: true,
      cell: (row) => vnd(row.sale_price),
      text: (row) => (row.sale_price == null ? "" : String(Math.round(row.sale_price))),
    },
    {
      id: "markup",
      label: T("Наценка", "Markup", "Phụ thu"),
      num: true,
      cell: (row) => pct(row.markup),
      text: (row) => (row.markup == null ? "" : String(row.markup)),
    },
  ];

  return (
    <CatalogTable
      storeKey="gastrofood-erp-menu-goods"
      activeHref={MENU_HREFS.goods}
      title={T("Товары", "Products", "Món")}
      sheetName="menu-goods"
      columns={columns}
      rows={rows}
      query={query}
      onQuery={setQuery}
      searchPlaceholder={T("Быстрый поиск", "Quick search", "Tìm nhanh")}
      catalogEmpty={!state.dishes.length}
      emptyTitle={T("Блюд пока нет", "No items yet", "Chưa có món")}
      emptyText={T("Добавьте блюдо и состав на порцию — себестоимость и наценка посчитаются по тех. карте.", "Add an item and its portion recipe — cost and markup come from the tech card.", "Thêm món và công thức — giá vốn và phụ thu tính từ thẻ kỹ thuật.")}
      addHref="/erp/menu/new"
      addLabel={T("Добавить", "Add", "Thêm")}
      rowHref={(row) => `/erp/menu/${row.id}`}
      onTrash={async (ids) => {
        for (const id of ids) {
          await act({ action: "setArchived", entity: "dish", id, archived: !archived }, false);
        }
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
          <StubFilter label={T("Цех", "Workshop", "Phân xưởng")} />
          <VenueStubFilter />
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
        <>
          <NavLink href={`/erp/menu/${row.id}`} className="erpDropAction">
            {T("Открыть", "Open", "Mở")}
          </NavLink>
        </>
      )}
      note={T(
        "Себестоимость — плановая по составу (неизвестная цена остаётся пустой). Наценка = (цена без НДС − себестоимость) / себестоимость. Цех и заведение в API ещё нет — выбор не фильтрует список.",
        "Cost is planned from the recipe (unknown prices stay empty). Markup = (price excl. VAT − cost) / cost. Workshop and venue are not in the API yet — choosing them does not filter.",
        "Giá vốn theo công thức (giá chưa biết để trống). Phụ thu = (giá chưa VAT − giá vốn) / giá vốn. Phân xưởng và cơ sở chưa có API.",
      )}
    />
  );
}
