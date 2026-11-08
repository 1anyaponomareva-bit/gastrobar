"use client";

import { Suspense, useMemo, useState } from "react";
import { costLine, productTitle } from "@/lib/erp/costing";
import { withMenuListReturn } from "@/lib/erp/menuListQuery";
import type { ErpDish, ErpState } from "@/lib/erp/types";
import { Caret, CatalogTable, notImplemented, VenueStubFilter, WorkshopStubFilter, type CatalogColumn } from "./CatalogTable";
import { useErp } from "./ErpShell";
import { DropMenu, MultiSelect } from "./filters";
import { netOf, netWeight } from "./losses";
import {
  categoryLabel,
  costContextOf,
  dishEconomics,
  dishInitials,
  dishTitle,
  posterDishMarkup,
  posterStockQty,
  visibleCategories,
} from "./menuFields";
import { useMenuListQuery } from "./menuListState";
import { MENU_HREFS } from "./menuNav";
import { NavLink, qtyText, T, unitOf, vnd } from "./ui";

type Row = ErpDish & {
  categoryName: string;
  yieldKg: number;
  cost: number | null;
  price: number | null;
  markup: string;
};

function DishCover({ name }: { name: string }) {
  return (
    <span className="erpDishCover" aria-hidden>
      {dishInitials(name)}
    </span>
  );
}

function DishComposition({ state, dish }: { state: ErpState; dish: ErpDish }) {
  const ctx = costContextOf(state);
  if (!dish.lines.length) {
    return <p className="erpHint">{T("Состав ещё не заполнен", "Composition is empty", "Chưa có thành phần")}</p>;
  }
  return (
    <div className="erpMenuUsageBlock">
      <h3>{T("Состав и история редактирования", "Composition and edit history", "Thành phần và lịch sử sửa")}</h3>
      <div className="erpTableWrap">
        <table className="erpTable erpMenuTable">
          <thead>
            <tr>
              <th>{T("Ингредиент", "Ingredient", "Nguyên liệu")}</th>
              <th className="num">{T("Брутто", "Gross", "Brutto")}</th>
              <th className="num">{T("Нетто", "Net", "Netto")}</th>
              <th className="num">{T("Себестоимость", "Cost", "Giá vốn")}</th>
            </tr>
          </thead>
          <tbody>
            {dish.lines.map((line) => {
              const product = state.products.find((item) => item.id === line.product_id);
              const unit = unitOf(state, line.product_id);
              const net = netOf(state, line);
              const cost = costLine(ctx, line.product_id, line.qty).cost;
              const prep = product?.type === "semi_finished";
              return (
                <tr key={line.id}>
                  <td>
                    {product ? productTitle(product) : line.product_id}
                    {prep ? <span className="erpMuted"> {T("(п/ф)", "(prep)", "(bán TP)")}</span> : null}
                  </td>
                  <td className="num">{qtyText(line.qty, unit)}</td>
                  <td className="num">{net == null || (unit === "pcs" && net === 0) ? "—" : qtyText(net, unit)}</td>
                  <td className="num">{cost == null ? "—" : vnd(cost)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function MenuRecipesPage() {
  return (
    <Suspense fallback={null}>
      <MenuRecipesList />
    </Suspense>
  );
}

function MenuRecipesList() {
  const { state, act, notify } = useErp();
  const list = useMenuListQuery(MENU_HREFS.recipes);
  const query = list.q;
  const categories = list.category;
  const archived = list.archived;
  const [detailsId, setDetailsId] = useState<string | null>(null);
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
    .map((d) => {
      const economics = dishEconomics(state, ctx, d);
      return {
        ...d,
        categoryName: categoryLabel(d.category_id ? catMap.get(d.category_id) : undefined),
        yieldKg: netWeight(state, d.lines).kg,
        cost: economics.cost,
        price: d.sale_price,
        markup: posterDishMarkup(economics.cost, economics.markup, d.sale_price),
      };
    });

  const columns: CatalogColumn<Row>[] = [
    {
      id: "name",
      label: T("Название", "Name", "Tên"),
      locked: true,
      cell: (row) => (
        <NavLink href={withMenuListReturn(`/erp/menu/${row.id}`, list.href)} className="erpName erpDishName">
          <DishCover name={row.name_en || row.name_vn} />
          <span>
            {dishTitle(row)}
            {!row.lines.length ? <span className="erpBadge warn">{T("нет состава", "no composition", "chưa có thành phần")}</span> : null}
          </span>
        </NavLink>
      ),
      text: (row) => dishTitle(row),
    },
    { id: "category", label: T("Категория", "Category", "Nhóm"), cell: (row) => row.categoryName, text: (row) => row.categoryName },
    {
      id: "barcode",
      label: T("Штрихкод", "Barcode", "Mã vạch"),
      defaultHidden: true,
      sort: false,
      cell: () => "—",
      text: () => "",
    },
    {
      id: "workshop",
      label: T("Цех", "Workshop", "Phân xưởng"),
      defaultHidden: true,
      sort: false,
      cell: () => "—",
      text: () => "",
    },
    {
      id: "weighted",
      label: T("Весовая тех. карта", "Weighted recipe", "Công thức theo kg"),
      defaultHidden: true,
      sort: false,
      cell: () => T("нет", "no", "không"),
      text: () => "",
    },
    {
      id: "yield",
      label: T("Выход", "Yield", "Khối lượng"),
      num: true,
      cell: (row) => posterStockQty(row.yieldKg, "kg"),
      text: (row) => String(row.yieldKg),
    },
    {
      id: "costExVat",
      label: T("Себестоимость без НДС", "Cost excl. VAT", "Giá vốn chưa VAT"),
      defaultHidden: true,
      num: true,
      cell: (row) => (row.cost == null ? "—" : vnd(row.cost)),
      text: (row) => (row.cost == null ? "" : String(Math.round(row.cost))),
    },
    {
      id: "costIncVat",
      label: T("Себестоимость с НДС", "Cost incl. VAT", "Giá vốn gồm VAT"),
      defaultHidden: true,
      num: true,
      sort: false,
      cell: () => "—",
      text: () => "",
    },
    {
      id: "price",
      label: T("Цена", "Price", "Giá"),
      num: true,
      cell: (row) => vnd(row.price),
      text: (row) => (row.price == null ? "" : String(Math.round(row.price))),
    },
    {
      id: "profit",
      label: T("Прибыль", "Profit", "Lợi nhuận"),
      defaultHidden: true,
      num: true,
      cell: (row) => {
        if (row.cost == null || row.price == null) return "—";
        return vnd(row.price - row.cost);
      },
      text: (row) => (row.cost == null || row.price == null ? "" : String(Math.round(row.price - row.cost))),
    },
    {
      id: "markup",
      label: T("Наценка", "Markup", "Phụ thu"),
      num: true,
      cell: (row) => row.markup,
      text: (row) => row.markup,
    },
  ];

  return (
    <CatalogTable
      storeKey="gastrofood-erp-menu-recipes-v2"
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
      catalogEmpty={!state.dishes.length}
      emptyTitle={T("Тех. карт пока нет", "No recipes yet", "Chưa có công thức")}
      addHref="/erp/menu/new"
      addLabel={T("Добавить", "Add", "Thêm")}
      rowHref={(row) => `/erp/menu/${row.id}`}
      hideTrash
      hideMore
      hideCheck
      showImport
      expandedId={detailsId}
      rowExpand={(row) => <DishComposition state={state} dish={row} />}
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
          <WorkshopStubFilter />
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
            {T("Состав", "Composition", "Thành phần")}
          </button>
          {archived ? null : (
            <NavLink href={withMenuListReturn(`/erp/menu/${row.id}`, list.href)} className="erpLink">
              {T("Ред.", "Edit", "Sửa")}
            </NavLink>
          )}
        </>
      )}
      rowMenu={(row, close) => (
        <>
          {archived ? null : (
            <>
              <button
                type="button"
                className="erpDropAction"
                onClick={() => {
                  close();
                  notify({ ok: false, text: notImplemented(T("Редактировать задним числом", "Edit as of a past date", "Sửa lùi ngày")) });
                }}
              >
                {T("Редактировать задним числом", "Edit as of a past date", "Sửa lùi ngày")}
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
            </>
          )}
          <button
            type="button"
            className={archived ? "erpDropAction" : "erpDropAction erpDanger"}
            onClick={() => {
              close();
              const ok = window.confirm(
                archived
                  ? T(
                      `Вернуть «${dishTitle(row)}» из архива?`,
                      `Restore “${dishTitle(row)}” from archive?`,
                      `Khôi phục “${dishTitle(row)}” khỏi lưu trữ?`,
                    )
                  : T(
                      `Убрать «${dishTitle(row)}» в архив? Склад не меняется.`,
                      `Archive “${dishTitle(row)}”? Stock does not change.`,
                      `Lưu trữ “${dishTitle(row)}”? Kho không đổi.`,
                    ),
              );
              if (!ok) return;
              void act(
                { action: "setArchived", entity: "dish", id: row.id, archived: !archived },
                archived ? T("Восстановлено", "Restored", "Đã khôi phục") : T("В архиве", "Archived", "Đã lưu trữ"),
              );
            }}
          >
            {archived ? T("Восстановить", "Restore", "Khôi phục") : T("Удалить", "Delete", "Xóa")}
          </button>
        </>
      )}
      note={T(
        "Колонки как в Poster: Выход, Цена, Наценка. Себестоимость без поставок — «—», не 0. Импорт Poster не подключён.",
        "Poster columns: Yield, Price, Markup. Cost without receipts is —, not 0. Poster import is not wired.",
        "Cột Poster: Khối lượng, Giá, Phụ thu. Chưa có nhập hàng thì giá vốn là —. Không nhập Poster.",
      )}
    />
  );
}
