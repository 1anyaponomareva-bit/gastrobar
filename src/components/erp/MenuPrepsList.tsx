"use client";

import { useMemo, useState } from "react";
import { costLine, plannedUnitCost, productTitle } from "@/lib/erp/costing";
import type { ErpProduct } from "@/lib/erp/types";
import { CatalogTable, ExtraFilterStub, notImplemented, type CatalogColumn } from "./CatalogTable";
import { downloadDocumentExport } from "./docs";
import { useErp } from "./ErpShell";
import { netOf } from "./losses";
import { CompositionPanel, type CompositionLineView, type UsageLink } from "./MenuComposition";
import { costContextOf, dishesUsingProduct, isPrepProduct, posterYieldKg } from "./menuFields";
import { MENU_HREFS } from "./menuNav";
import { NavLink, qtyText, T, today, unitOf, vnd } from "./ui";

type Row = ErpProduct & { yieldKg: number | null; cost: number | null; recipeId: string | null };

export function MenuPrepsList() {
  const { state, notify } = useErp();
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [usageId, setUsageId] = useState<string | null>(null);
  const ctx = useMemo(() => (state ? costContextOf(state) : null), [state]);
  if (!state || !ctx) return null;

  const q = query.trim().toLowerCase();
  const pool = state.products.filter((p) => p.type === "semi_finished" && !p.archived_at);
  const rows: Row[] = pool
    .filter((p) => !q || `${p.name_en} ${p.name_vn}`.toLowerCase().includes(q))
    .map((p) => {
      const active = state.recipes.find((r) => r.product_id === p.id && r.status === "active");
      return {
        ...p,
        yieldKg: active?.yield_qty ?? null,
        cost: active ? plannedUnitCost(ctx, p.id) : null,
        recipeId: active?.id ?? null,
      };
    });

  const openRow = openId ? rows.find((row) => row.id === openId) : null;
  const usageRow = usageId ? rows.find((row) => row.id === usageId) : null;
  const usageLinks: UsageLink[] = usageRow
    ? dishesUsingProduct(state, usageRow.id).map((dish) => ({ href: `/erp/menu/${dish.id}`, name: dish.name_en }))
    : [];

  const compositionOf = (row: Row): CompositionLineView[] => {
    const recipe = state.recipes.find((item) => item.id === row.recipeId);
    if (!recipe) return [];
    return recipe.lines.map((line) => {
      const product = line.product_id ? state.products.find((item) => item.id === line.product_id) : undefined;
      const unit = unitOf(state, line.product_id);
      const net = netOf(state, line);
      const cost = line.product_id && line.qty ? costLine(ctx, line.product_id, line.qty).cost : null;
      return {
        name: product ? productTitle(product) : (line.raw_name?.en ?? line.raw_name?.ru ?? "—"),
        prep: isPrepProduct(product),
        gross: qtyText(line.qty, unit),
        net: net == null ? "—" : qtyText(net, unit),
        cost,
      };
    });
  };

  const columns: CatalogColumn<Row>[] = [
    {
      id: "name",
      label: T("Название", "Name", "Tên"),
      locked: true,
      cell: (row) => (
        <button type="button" className="erpName" onClick={() => setUsageId(row.id === usageId ? null : row.id)}>
          {productTitle(row)}
        </button>
      ),
      text: (row) => productTitle(row),
    },
    {
      id: "yield",
      label: T("Выход", "Yield", "Định lượng"),
      cell: (row) => posterYieldKg(row.yieldKg),
      text: (row) => (row.yieldKg == null ? "" : String(row.yieldKg)),
    },
    {
      id: "cost",
      label: T("Себестоимость", "Cost", "Giá vốn"),
      num: true,
      cell: (row) =>
        row.cost == null ? (
          "—"
        ) : (
          <span className={row.cost === 0 ? "erpCostZero" : undefined}>{vnd(row.cost)}</span>
        ),
      text: (row) => (row.cost == null ? "" : String(Math.round(row.cost))),
    },
  ];

  return (
    <>
      <CatalogTable
        storeKey="gastrofood-erp-menu-preps-v2"
        activeHref={MENU_HREFS.preps}
        title={T("Полуфабрикаты", "Semi-finished", "Bán thành phẩm")}
        sheetName="menu-preps"
        columns={columns}
        rows={rows}
        query={query}
        onQuery={setQuery}
        searchPlaceholder={T("Быстрый поиск", "Quick search", "Tìm nhanh")}
        addHref="/erp/preps/recipe/new"
        addLabel={T("Добавить", "Add", "Thêm")}
        hideTrash
        hideMore
        exportKind="menu"
        onExportComposition={(list) => {
          const header = [
            T("Полуфабрикат", "Prep", "Bán thành phẩm"),
            T("Ингредиент", "Ingredient", "Nguyên liệu"),
            T("Брутто", "Gross", "Brutto"),
            T("Нетто", "Net", "Netto"),
          ];
          const body: string[][] = [];
          for (const row of list) {
            const lines = compositionOf(row);
            if (!lines.length) body.push([productTitle(row), "", "", ""]);
            else for (const line of lines) body.push([productTitle(row), `${line.name}${line.prep ? " (п/ф)" : ""}`, line.gross, line.net]);
          }
          downloadDocumentExport(`menu-preps-composition_${today()}`, "menu-preps-composition", header, body);
        }}
        filterBar={<ExtraFilterStub />}
        rowLinks={(row) => (
          <>
            <button type="button" className="erpLink" onClick={() => setOpenId(row.id)}>
              {T("Состав", "Composition", "Thành phần")}
            </button>
            <NavLink href={`/erp/preps/recipe/${row.id}`} className="erpLink">
              {T("Ред.", "Edit", "Sửa")}
            </NavLink>
          </>
        )}
        rowMenu={(row, close) => (
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
        )}
        note={T(
          "Полуфабрикаты не продаются на кассе. Учёт в Poster — кг. Клик по названию показывает тех. карты, где используется. Изготовление партии — склад, не эта вкладка. Правка карточки склад не двигает.",
          "Preps are not sold at the till. Poster counts them in kg. Click the name to see recipes that use it. Making a batch is stock, not this tab. Editing the card does not move stock.",
          "Bán thành phẩm không bán ở thu ngân. Poster tính kg. Bấm tên để xem công thức dùng. Sản xuất mẻ là kho, không phải tab này.",
        )}
      />
      {usageRow ? (
        <CompositionPanel
          title={productTitle(usageRow)}
          usage={usageLinks}
          usageEmpty={T("Этот полуфабрикат ещё нигде не используется", "This prep is not used anywhere yet", "Bán thành phẩm này chưa dùng ở đâu")}
          onClose={() => setUsageId(null)}
        />
      ) : null}
      {openRow ? (
        <CompositionPanel
          title={T("Состав и история редактирования", "Composition and edit history", "Thành phần và lịch sử")}
          lines={compositionOf(openRow)}
          usage={dishesUsingProduct(state, openRow.id).map((dish) => ({ href: `/erp/menu/${dish.id}`, name: dish.name_en }))}
          usageEmpty={T("Этот полуфабрикат ещё нигде не используется", "This prep is not used anywhere yet", "Bán thành phẩm này chưa dùng ở đâu")}
          historyEntity="recipe"
          historyId={openRow.recipeId}
          onClose={() => setOpenId(null)}
        />
      ) : null}
    </>
  );
}
