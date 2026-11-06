"use client";

import { useMemo, useState } from "react";
import { costLine, productTitle } from "@/lib/erp/costing";
import type { ErpProduct } from "@/lib/erp/types";
import { CatalogTable, notImplemented, VenueStubFilter, WorkshopStubFilter, type CatalogColumn } from "./CatalogTable";
import { useErp } from "./ErpShell";
import { MultiSelect } from "./filters";
import { categoryLabel, costContextOf } from "./menuFields";
import { MENU_HREFS } from "./menuNav";
import { NavLink, T, typeLabel, unitLabel, vnd } from "./ui";

type Row = ErpProduct & { categoryName: string; cost: number | null };

const dash = "—";

function GoodsFilters({
  categories,
  setCategories,
  options,
}: {
  categories: string[];
  setCategories: (value: string[]) => void;
  options: { id: string; label: string }[];
}) {
  const { notify } = useErp();
  return (
    <>
      <MultiSelect label={T("Категория", "Category", "Nhóm")} options={options} value={categories} onChange={setCategories} searchable />
      <WorkshopStubFilter />
      <VenueStubFilter />
      <button type="button" className="erpFilterBtn" onClick={() => notify({ ok: false, text: notImplemented(T("Фильтр", "Filter", "Bộ lọc")) })}>
        <span>+ {T("Фильтр", "Filter", "Bộ lọc")}</span>
      </button>
    </>
  );
}

export function MenuGoodsPage() {
  const { state, act, notify } = useErp();
  const [query, setQuery] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const ctx = useMemo(() => (state ? costContextOf(state) : null), [state]);
  if (!state || !ctx) return null;

  const catMap = new Map(state.categories.map((c) => [c.id, c]));
  const q = query.trim().toLowerCase();
  const catSet = new Set(categories);
  const pool = state.products.filter((p) => p.type === "finished" && !p.archived_at);
  const rows: Row[] = pool
    .filter((p) => {
      if (catSet.size && !catSet.has(p.category_id ?? "none")) return false;
      return !q || `${p.name_en} ${p.name_vn} ${p.code} ${p.brand ?? ""}`.toLowerCase().includes(q);
    })
    .map((p) => ({
      ...p,
      categoryName: categoryLabel(p.category_id ? catMap.get(p.category_id) : undefined),
      cost: p.base_unit ? costLine(ctx, p.id, 1).cost : null,
    }));

  const costCell = (row: Row) =>
    !row.base_unit || row.cost === null ? <span className="erpBadge warn">{T("неполная", "incomplete", "chưa đủ")}</span> : vnd(row.cost);

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
    { id: "category", label: T("Категория", "Category", "Nhóm"), sort: false, cell: (row) => row.categoryName, text: (row) => row.categoryName },
    { id: "barcode", label: T("Штрихкод", "Barcode", "Mã vạch"), defaultHidden: true, sort: false, cell: () => dash, text: () => "" },
    { id: "sku", label: "SKU", defaultHidden: true, sort: false, cell: (row) => row.code || dash, text: (row) => row.code ?? "" },
    { id: "workshop", label: T("Цех", "Workshop", "Phân xưởng"), defaultHidden: true, sort: false, cell: () => dash, text: () => "" },
    { id: "type", label: T("Тип", "Type", "Loại"), defaultHidden: true, sort: false, cell: (row) => typeLabel(row.type), text: (row) => typeLabel(row.type) },
    { id: "weighable", label: T("Весовой товар", "Weighable", "Bán theo cân"), defaultHidden: true, sort: false, cell: () => dash, text: () => "" },
    {
      id: "unit",
      label: T("Ед. измерения", "Unit", "Đơn vị"),
      defaultHidden: true,
      sort: false,
      cell: (row) => (row.base_unit ? unitLabel(row.base_unit) : dash),
      text: (row) => row.base_unit ?? "",
    },
    {
      id: "cost",
      label: T("Себестоимость без НДС", "Cost excl. VAT", "Giá vốn chưa VAT"),
      num: true,
      sort: false,
      cell: costCell,
      text: (row) => (row.cost == null ? "" : String(Math.round(row.cost))),
    },
    { id: "costVat", label: T("Себестоимость с НДС", "Cost incl. VAT", "Giá vốn có VAT"), num: true, defaultHidden: true, sort: false, cell: () => dash, text: () => "" },
    { id: "price", label: T("Цена", "Price", "Giá"), num: true, sort: false, cell: () => dash, text: () => "" },
    { id: "profit", label: T("Прибыль", "Profit", "Lợi nhuận"), num: true, defaultHidden: true, sort: false, cell: () => dash, text: () => "" },
    { id: "markup", label: T("Наценка", "Markup", "Phụ thu"), num: true, sort: false, cell: () => dash, text: () => "" },
  ];

  const categoryOptions = [
    ...state.categories.filter((c) => !c.archived_at).map((c) => ({ id: c.id, label: categoryLabel(c) })),
    { id: "none", label: T("Без категории", "No category", "Chưa phân nhóm") },
  ];
  const editHref = (row: Row) => `/erp/products/${row.id}`;

  return (
    <CatalogTable
      storeKey="gastrofood-erp-menu-goods-v2"
      activeHref={MENU_HREFS.goods}
      title={T("Товары", "Products", "Hàng hóa")}
      sheetName="menu-goods"
      columns={columns}
      rows={rows}
      query={query}
      onQuery={setQuery}
      searchPlaceholder={T("Быстрый поиск", "Quick search", "Tìm nhanh")}
      emptyTitle={T("Товаров пока нет", "No products yet", "Chưa có hàng hóa")}
      addHref="/erp/products/new?type=finished"
      addLabel={T("Добавить", "Add", "Thêm")}
      rowHref={editHref}
      trashHref={MENU_HREFS.trash}
      filterBar={<GoodsFilters categories={categories} setCategories={setCategories} options={categoryOptions} />}
      rowMenu={(row, close) => (
        <>
          <NavLink href={editHref(row)} className="erpDropAction" onClick={close}>
            {T("Ред.", "Edit", "Sửa")}
          </NavLink>
          <button
            type="button"
            className="erpDropAction"
            onClick={() => {
              close();
              notify({ ok: false, text: notImplemented(T("Скрыть во всех заведениях", "Hide in all venues", "Ẩn mọi cơ sở")) });
            }}
          >
            {T("Скрыть во всех заведениях", "Hide in all venues", "Ẩn mọi cơ sở")}
          </button>
          <button
            type="button"
            className="erpDropAction erpDanger"
            onClick={() => {
              close();
              if (!window.confirm(T(`Удалить «${productTitle(row)}» в корзину?`, `Move “${productTitle(row)}” to trash?`, `Chuyển “${productTitle(row)}” vào thùng rác?`))) return;
              void act({ action: "setArchived", entity: "product", id: row.id, archived: true }, T("Товар в корзине", "Product moved to trash", "Đã chuyển vào thùng rác"));
            }}
          >
            {T("Удалить", "Delete", "Xóa")}
          </button>
        </>
      )}
      note={T(
        "Poster «Товары» — готовая перепродажа (erp_products type=finished), не блюда. Цена, наценка, штрихкод, цех и налог в API ещё нет — в таблице «—». Себестоимость — оценка из карточки/поставки; неизвестная цена не подменяется нулём. Корзина открывает архив, не массовое удаление.",
        "Poster Products are buy-ready resale (erp_products type=finished), not dishes. Price, markup, barcode, workshop and tax are not in the API yet — the table shows —. Cost is the card/delivery estimate; unknown stays empty, not zero. Trash opens the archive; it does not bulk-delete.",
        "Poster Hàng hóa là bán sẵn (erp_products type=finished), không phải món. Giá, phụ thu, mã vạch, phân xưởng và thuế chưa có API — bảng hiện —. Giá vốn theo thẻ/nhập; giá chưa biết để trống. Thùng rác mở lưu trữ, không xóa hàng loạt.",
      )}
    />
  );
}
