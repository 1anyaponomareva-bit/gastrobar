"use client";

import { Suspense, useMemo } from "react";
import { plannedUnitCost, productTitle } from "@/lib/erp/costing";
import { withMenuListReturn } from "@/lib/erp/menuListQuery";
import type { ErpProduct } from "@/lib/erp/types";
import { CatalogTable, Caret, StubFilter, type CatalogColumn } from "./CatalogTable";
import { useErp } from "./ErpShell";
import { DropMenu } from "./filters";
import { costContextOf } from "./menuFields";
import { useMenuListQuery } from "./menuListState";
import { MENU_HREFS } from "./menuNav";
import { NavLink, qtyText, T, unitLabel, vnd } from "./ui";

type Row = ErpProduct & { yieldText: string; cost: number | null; recipeStatus: string };

export function MenuPrepsList() {
  return (
    <Suspense fallback={null}>
      <MenuPrepsTable />
    </Suspense>
  );
}

function MenuPrepsTable() {
  const { state, act } = useErp();
  const list = useMenuListQuery(MENU_HREFS.preps);
  const query = list.q;
  const archived = list.archived;
  const ctx = useMemo(() => (state ? costContextOf(state) : null), [state]);
  if (!state || !ctx) return null;

  const q = query.trim().toLowerCase();
  const pool = state.products.filter((p) => p.type === "semi_finished" && Boolean(p.archived_at) === archived);
  const rows: Row[] = pool
    .filter((p) => !q || `${p.name_en} ${p.name_vn}`.toLowerCase().includes(q))
    .map((p) => {
      const recipes = state.recipes.filter((r) => r.product_id === p.id);
      const active = recipes.find((r) => r.status === "active");
      const draft = recipes.find((r) => r.status === "draft");
      const yieldText = !active?.yield_qty
        ? "—"
        : active.yield_pieces && p.base_unit !== "pcs"
          ? `${qtyText(active.yield_qty, p.base_unit)} · ${active.yield_pieces} ${unitLabel("pcs")}`
          : qtyText(active.yield_qty, p.base_unit);
      return {
        ...p,
        yieldText,
        cost: active ? plannedUnitCost(ctx, p.id) : null,
        recipeStatus: !active ? (draft ? T("черновик", "draft", "nháp") : T("нет рецептуры", "no recipe", "chưa có công thức")) : "",
      };
    });

  const columns: CatalogColumn<Row>[] = [
    {
      id: "name",
      label: T("Название", "Name", "Tên"),
      locked: true,
      cell: (row) => (
        <>
          <NavLink href={withMenuListReturn(`/erp/preps/recipe/${row.id}`, list.href)} className="erpName">
            {productTitle(row)}
          </NavLink>
          {row.recipeStatus ? <span className="erpBadge warn">{row.recipeStatus}</span> : null}
        </>
      ),
      text: (row) => productTitle(row),
    },
    { id: "yield", label: T("Нормативный выход", "Standard yield", "Sản lượng chuẩn"), cell: (row) => row.yieldText, text: (row) => row.yieldText },
    {
      id: "cost",
      label: T("Себестоимость единицы", "Unit cost", "Giá vốn / đơn vị"),
      num: true,
      cell: (row) =>
        row.recipeStatus && !row.cost ? (
          "—"
        ) : row.cost === null ? (
          <span className="erpBadge warn">{T("не все цены известны", "some prices missing", "thiếu giá")}</span>
        ) : (
          `${vnd(row.cost)} / ${unitLabel(row.base_unit)}`
        ),
      text: (row) => (row.cost == null ? "" : String(Math.round(row.cost))),
    },
  ];

  return (
    <CatalogTable
      storeKey="gastrofood-erp-menu-preps"
      activeHref={MENU_HREFS.preps}
      title={T("Полуфабрикаты", "Semi-finished", "Bán thành phẩm")}
      sheetName="menu-preps"
      columns={columns}
      rows={rows}
      query={query}
      onQuery={(value) => list.set({ q: value })}
      listHref={list.href}
      urlSort={list.sort || undefined}
      urlDesc={list.desc}
      onSortChange={(sort, desc) => list.set({ sort, desc })}
      searchPlaceholder={T("Быстрый поиск", "Quick search", "Tìm nhanh")}
      catalogEmpty={!state.products.some((p) => p.type === "semi_finished")}
      emptyTitle={T("Пока нет полуфабрикатов", "No semi-finished products yet", "Chưa có bán thành phẩm")}
      emptyText={T("Создайте полуфабрикат с рецептурой. Изготовление партии — отдельный складской документ, остатки сами не меняются от карточки.", "Create a semi-finished product with a recipe. Making a batch is a stock document; editing the card does not move stock.", "Tạo bán thành phẩm với công thức. Sản xuất mẻ là chứng từ kho.")}
      addHref="/erp/preps/recipe/new"
      addLabel={T("Добавить", "Add", "Thêm")}
      extraActions={
        <NavLink href="/erp/menu/processing/new" className="erpBtn">
          {T("Переработка", "Processing", "Chế biến")}
        </NavLink>
      }
      rowHref={(row) => `/erp/preps/recipe/${row.id}`}
      onTrash={async (ids) => {
        for (const id of ids) await act({ action: "setArchived", entity: "product", id, archived: !archived }, false);
      }}
      filterBar={
        <>
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
        <>
          <NavLink href={withMenuListReturn(`/erp/preps/recipe/${row.id}`, list.href)} className="erpDropAction">
            {T("Открыть рецепт", "Open recipe", "Mở công thức")}
          </NavLink>
          <NavLink href="/erp/menu/processing" className="erpDropAction">
            {T("Переработки", "Processing", "Chế biến")}
          </NavLink>
        </>
      )}
    />
  );
}
