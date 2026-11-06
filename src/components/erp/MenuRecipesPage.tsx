"use client";

import { useMemo, useState } from "react";
import { costLine, productTitle } from "@/lib/erp/costing";
import type { ErpDish, ErpState } from "@/lib/erp/types";
import { CatalogTable, ExtraFilterStub, notImplemented, VenueFilter, WorkshopFilter, type CatalogColumn } from "./CatalogTable";
import { downloadDocumentExport } from "./docs";
import { useErp } from "./ErpShell";
import { MultiSelect } from "./filters";
import { netOf } from "./losses";
import { CompositionPanel, type CompositionLineView } from "./MenuComposition";
import {
  categoryLabel,
  costContextOf,
  dishEconomics,
  dishTitle,
  isPrepProduct,
  nameInitials,
  posterMarkupText,
  posterYieldKg,
} from "./menuFields";
import { MENU_HREFS } from "./menuNav";
import { dateTimeText, NavLink, qtyText, T, today, unitOf, vnd } from "./ui";

type Row = ErpDish & { categoryName: string; cost: number | null; yieldKg: number | null };

const RECIPE_TRASH = "/erp/menu/recipes/trash";

function dishYieldKg(state: ErpState, dish: ErpDish): number | null {
  const weights = dish.lines.map((line) => {
    const unit = unitOf(state, line.product_id);
    const net = netOf(state, line);
    if (net == null) return null;
    if (unit === "kg") return net;
    if (unit === "l") return net;
    return 0;
  });
  if (weights.some((value) => value == null) && !weights.some((value) => value && value > 0)) return null;
  const sum = weights.reduce<number>((acc, value) => acc + (value ?? 0), 0);
  return sum || null;
}

function compositionLines(state: ErpState, dish: ErpDish): CompositionLineView[] {
  const ctx = costContextOf(state);
  return dish.lines.map((line) => {
    const product = state.products.find((item) => item.id === line.product_id);
    const unit = unitOf(state, line.product_id);
    const net = netOf(state, line);
    const cost = costLine(ctx, line.product_id, line.qty).cost;
    return {
      name: product ? productTitle(product) : line.product_id,
      prep: isPrepProduct(product),
      gross: qtyText(line.qty, unit),
      net: net == null ? "—" : qtyText(net, unit),
      cost,
    };
  });
}

export function MenuRecipesPage({ trash = false }: { trash?: boolean }) {
  const { state, act, notify } = useErp();
  const [query, setQuery] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const ctx = useMemo(() => (state ? costContextOf(state) : null), [state]);
  if (!state || !ctx) return null;

  const catMap = new Map(state.categories.map((c) => [c.id, c]));
  const q = query.trim().toLowerCase();
  const catSet = new Set(categories);
  const pool = state.dishes.filter((d) => Boolean(d.archived_at) === trash);
  const rows: Row[] = pool
    .filter((d) => {
      if (catSet.size && !catSet.has(d.category_id ?? "none")) return false;
      return !q || `${d.name_en} ${d.name_vn}`.toLowerCase().includes(q);
    })
    .map((d) => ({
      ...d,
      categoryName: categoryLabel(d.category_id ? catMap.get(d.category_id) : undefined),
      cost: dishEconomics(state, ctx, d).cost,
      yieldKg: dishYieldKg(state, d),
    }));

  const openDish = openId ? rows.find((row) => row.id === openId) ?? pool.find((row) => row.id === openId) : null;

  const columns: CatalogColumn<Row>[] = [
    {
      id: "name",
      label: T("Название", "Name", "Tên"),
      locked: true,
      cell: (row) => (
        <span className="erpMenuName">
          <span className="erpMenuThumb" aria-hidden>
            {nameInitials(row.name_en)}
          </span>
          {trash ? (
            dishTitle(row)
          ) : (
            <NavLink href={`/erp/menu/${row.id}`} className="erpName">
              {dishTitle(row)}
            </NavLink>
          )}
        </span>
      ),
      text: (row) => dishTitle(row),
    },
    { id: "category", label: T("Категория", "Category", "Nhóm"), cell: (row) => row.categoryName || "—", text: (row) => row.categoryName },
    { id: "barcode", label: T("Штрихкод", "Barcode", "Mã vạch"), defaultHidden: true, sort: false, cell: () => "—", text: () => "" },
    { id: "workshop", label: T("Цех", "Workshop", "Phân xưởng"), defaultHidden: !trash, sort: false, cell: () => "—", text: () => "" },
    { id: "weighted", label: T("Весовая тех. карта", "Weighable recipe", "Công thức theo cân"), defaultHidden: true, sort: false, cell: () => "—", text: () => "" },
    {
      id: "yield",
      label: T("Выход", "Yield", "Định lượng"),
      cell: (row) => posterYieldKg(row.yieldKg),
      text: (row) => (row.yieldKg == null ? "" : String(row.yieldKg)),
    },
    {
      id: "cost",
      label: T("Себестоимость без НДС", "Cost excl. VAT", "Giá vốn chưa VAT"),
      num: true,
      defaultHidden: !trash,
      cell: (row) => (row.cost == null ? "—" : <span className={row.cost === 0 ? "erpCostZero" : undefined}>{vnd(row.cost)}</span>),
      text: (row) => (row.cost == null ? "" : String(Math.round(row.cost))),
    },
    { id: "costVat", label: T("Себестоимость с НДС", "Cost incl. VAT", "Giá vốn có VAT"), num: true, defaultHidden: true, sort: false, cell: () => "—", text: () => "" },
    {
      id: "price",
      label: T("Цена", "Price", "Giá"),
      num: true,
      cell: (row) => vnd(row.sale_price),
      text: (row) => (row.sale_price == null ? "" : String(Math.round(row.sale_price))),
    },
    { id: "profit", label: T("Прибыль", "Profit", "Lợi nhuận"), num: true, defaultHidden: true, sort: false, cell: () => "—", text: () => "" },
    {
      id: "markup",
      label: T("Наценка", "Markup", "Phụ thu"),
      num: true,
      cell: (row) => posterMarkupText(row.sale_price, row.cost),
      text: (row) => posterMarkupText(row.sale_price, row.cost),
    },
    ...(trash
      ? [
          {
            id: "deletedAt",
            label: T("Дата удаления", "Deleted at", "Ngày xóa"),
            cell: (row: Row) => dateTimeText(row.archived_at),
            text: (row: Row) => row.archived_at ?? "",
          } satisfies CatalogColumn<Row>,
        ]
      : []),
  ];

  const exportComposition = (list: Row[]) => {
    const header = [
      T("Тех. карта", "Recipe", "Công thức"),
      T("Ингредиент", "Ingredient", "Nguyên liệu"),
      T("Брутто", "Gross", "Brutto"),
      T("Нетто", "Net", "Netto"),
    ];
    const body: string[][] = [];
    for (const dish of list) {
      const lines = compositionLines(state, dish);
      if (!lines.length) body.push([dishTitle(dish), "", "", ""]);
      else for (const line of lines) body.push([dishTitle(dish), `${line.name}${line.prep ? " (п/ф)" : ""}`, line.gross, line.net]);
    }
    downloadDocumentExport(`menu-recipes-composition_${today()}`, "menu-recipes-composition", header, body);
  };

  return (
    <>
      <CatalogTable
        storeKey={trash ? "gastrofood-erp-menu-recipes-trash" : "gastrofood-erp-menu-recipes-v2"}
        activeHref={MENU_HREFS.recipes}
        title={trash ? T("Удалённые тех. карты", "Deleted recipes", "Công thức đã xóa") : T("Тех. карты", "Recipes", "Công thức")}
        sheetName={trash ? "menu-recipes-trash" : "menu-recipes"}
        columns={columns}
        rows={rows}
        query={query}
        onQuery={setQuery}
        searchPlaceholder={T("Быстрый поиск", "Quick search", "Tìm nhanh")}
        addHref={trash ? undefined : "/erp/menu/new"}
        addLabel={T("Добавить", "Add", "Thêm")}
        rowHref={trash ? undefined : (row) => `/erp/menu/${row.id}`}
        trashHref={trash ? undefined : RECIPE_TRASH}
        hideTrash={trash}
        hideMore
        showImport={!trash}
        exportKind="menu"
        onExportComposition={exportComposition}
        backHref={trash ? MENU_HREFS.recipes : undefined}
        banner={
          trash
            ? T(
                "Тех. карты хранятся в корзине в течение 30 дней после удаления",
                "Recipes stay in the trash for 30 days after deletion",
                "Công thức lưu trong thùng rác 30 ngày sau khi xóa",
              )
            : undefined
        }
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
            <WorkshopFilter />
            <VenueFilter />
            <ExtraFilterStub />
          </>
        }
        rowLinks={(row) => (
          <>
            <button type="button" className="erpLink" onClick={() => setOpenId(row.id)}>
              {T("Состав", "Composition", "Thành phần")}
            </button>
            {trash ? (
              <button
                type="button"
                className="erpLink"
                onClick={() => void act({ action: "setArchived", entity: "dish", id: row.id, archived: false }, T("Тех. карта восстановлена", "Recipe restored", "Đã khôi phục"))}
              >
                {T("Восстановить", "Restore", "Khôi phục")}
              </button>
            ) : (
              <NavLink href={`/erp/menu/${row.id}`} className="erpLink">
                {T("Ред.", "Edit", "Sửa")}
              </NavLink>
            )}
          </>
        )}
        rowMenu={
          trash
            ? undefined
            : (row, close) => (
                <>
                  <button
                    type="button"
                    className="erpDropAction"
                    onClick={() => {
                      close();
                      notify({ ok: false, text: notImplemented(T("Редактировать задним числом", "Edit retroactively", "Sửa hồi tố")) });
                    }}
                  >
                    {T("Редактировать задним числом", "Edit retroactively", "Sửa hồi tố")}
                  </button>
                  <button
                    type="button"
                    className="erpDropAction"
                    onClick={() => {
                      close();
                      notify({ ok: false, text: notImplemented(T("Копировать", "Copy", "Sao chép")) });
                    }}
                  >
                    {T("Копировать", "Copy", "Sao chép")}
                  </button>
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
                      if (!window.confirm(T(`Удалить «${dishTitle(row)}» в корзину?`, `Move “${dishTitle(row)}” to trash?`, `Chuyển “${dishTitle(row)}” vào thùng rác?`))) return;
                      void act({ action: "setArchived", entity: "dish", id: row.id, archived: true }, T("Тех. карта в корзине", "Recipe moved to trash", "Đã chuyển vào thùng rác"));
                    }}
                  >
                    {T("Удалить", "Delete", "Xóa")}
                  </button>
                </>
              )
        }
        note={T(
          "Выход в списке — кг (на форме граммы). Наценка — формула Poster (цена / себестоимость − 1). Неизвестная себестоимость не подменяется нулём. Цех и заведение в API нет — фильтры не скрывают строки. Импорт — не реализован.",
          "List yield is kg (the form uses grams). Markup is Poster's (price / cost − 1). Unknown cost stays empty. Workshop and venue have no API yet — filters do not hide rows. Import is not implemented.",
          "Định lượng trên danh sách là kg. Phụ thu = Poster (giá / giá vốn − 1). Giá vốn chưa biết để trống. Phân xưởng và cơ sở chưa có API. Nhập chưa làm.",
        )}
      />
      {openDish ? (
        <CompositionPanel
          title={T("Состав и история редактирования", "Composition and edit history", "Thành phần và lịch sử")}
          lines={compositionLines(state, openDish)}
          historyEntity="dish"
          historyId={openDish.id}
          onClose={() => setOpenId(null)}
        />
      ) : null}
    </>
  );
}
