"use client";

import { useMemo, useState } from "react";
import { costLine, productTitle } from "@/lib/erp/costing";
import type { ErpProduct } from "@/lib/erp/types";
import { CatalogTable, VenueStubFilter, WorkshopStubFilter, type CatalogColumn } from "./CatalogTable";
import { useErp } from "./ErpShell";
import { MultiSelect } from "./filters";
import { categoryLabel, costContextOf, visibleCategories } from "./menuFields";
import { MENU_HREFS } from "./menuNav";
import { dateTimeText, T, vnd } from "./ui";

type Row = ErpProduct & { categoryName: string; cost: number | null };

const dash = "—";

export function MenuTrashPage() {
  const { state, act } = useErp();
  const [query, setQuery] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const ctx = useMemo(() => (state ? costContextOf(state) : null), [state]);
  if (!state || !ctx) return null;

  const catMap = new Map(state.categories.map((c) => [c.id, c]));
  const q = query.trim().toLowerCase();
  const catSet = new Set(categories);
  const pool = state.products.filter((p) => p.type === "finished" && p.archived_at);
  const rows: Row[] = pool
    .filter((p) => {
      if (catSet.size && !catSet.has(p.category_id ?? "none")) return false;
      return !q || `${p.name_en} ${p.name_vn} ${p.code}`.toLowerCase().includes(q);
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
      locked: true,
      cell: (row) => productTitle(row),
      text: (row) => productTitle(row),
    },
    { id: "category", label: T("Категория", "Category", "Nhóm"), sort: false, cell: (row) => row.categoryName, text: (row) => row.categoryName },
    { id: "workshop", label: T("Цех", "Workshop", "Phân xưởng"), sort: false, cell: () => dash, text: () => "" },
    {
      id: "cost",
      label: T("Себестоимость без НДС", "Cost excl. VAT", "Giá vốn chưa VAT"),
      num: true,
      sort: false,
      cell: (row) => (row.cost == null ? dash : vnd(row.cost)),
      text: (row) => (row.cost == null ? "" : String(Math.round(row.cost))),
    },
    { id: "price", label: T("Цена", "Price", "Giá"), num: true, sort: false, cell: () => dash, text: () => "" },
    { id: "markup", label: T("Наценка", "Markup", "Phụ thu"), num: true, sort: false, cell: () => dash, text: () => "" },
    {
      id: "deletedAt",
      label: T("Дата удаления", "Deleted at", "Ngày xóa"),
      sort: false,
      cell: (row) => dateTimeText(row.archived_at),
      text: (row) => row.archived_at ?? "",
    },
  ];

  return (
    <CatalogTable
      storeKey="gastrofood-erp-menu-goods-trash"
      activeHref={MENU_HREFS.goods}
      title={T("Удалённые товары", "Deleted products", "Hàng đã xóa")}
      sheetName="menu-goods-trash"
      columns={columns}
      rows={rows}
      query={query}
      onQuery={setQuery}
      searchPlaceholder={T("Быстрый поиск", "Quick search", "Tìm nhanh")}
      emptyTitle={T("Корзина пуста", "Trash is empty", "Thùng rác trống")}
      emptyMessage={T(
        "По этим фильтрам нет удаленных товаров. Проверьте или измените фильтры.",
        "No deleted products match these filters. Check or change the filters.",
        "Không có hàng đã xóa khớp bộ lọc. Kiểm tra hoặc đổi bộ lọc.",
      )}
      hideTrash
      hideMore
      backHref={MENU_HREFS.goods}
      backLabel={T("К списку товаров", "Back to products", "Về danh sách hàng")}
      banner={T(
        "Товары хранятся в корзине в течение 30 дней после удаления",
        "Products stay in the trash for 30 days after deletion",
        "Hàng lưu trong thùng rác 30 ngày sau khi xóa",
      )}
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
          <WorkshopStubFilter />
          <VenueStubFilter />
        </>
      }
      rowMenu={(row, close) => (
        <button
          type="button"
          className="erpDropAction"
          onClick={() => {
            close();
            void act({ action: "setArchived", entity: "product", id: row.id, archived: false }, T("Товар восстановлен", "Product restored", "Đã khôi phục"));
          }}
        >
          {T("Восстановить", "Restore", "Khôi phục")}
        </button>
      )}
    />
  );
}
