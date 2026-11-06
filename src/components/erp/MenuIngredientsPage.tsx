"use client";

import { useMemo, useState } from "react";
import { costLine, productTitle } from "@/lib/erp/costing";
import { stockByProduct, stockOf, stockValue } from "@/lib/erp/stockView";
import type { ErpProduct, ErpState } from "@/lib/erp/types";
import { CatalogTable, ExtraFilterStub, type CatalogColumn } from "./CatalogTable";
import { useErp } from "./ErpShell";
import { MultiSelect } from "./filters";
import { netOf } from "./losses";
import { IngredientUsage, type IngredientUsageRow } from "./MenuComposition";
import {
  categoryLabel,
  costContextOf,
  dishTitle,
  INGREDIENT_TYPES,
  lossPercentsText,
  posterStockQty,
  prepsUsingProduct,
} from "./menuFields";
import { MENU_HREFS } from "./menuNav";
import { NavLink, qtyText, T, unitLabel, unitOf, vnd } from "./ui";

type Row = ErpProduct & { categoryName: string; cost: number | null; stockQty: number; stockValue: number | null };

function dishUsage(state: ErpState, productId: string): IngredientUsageRow[] {
  const rows: IngredientUsageRow[] = [];
  for (const dish of state.dishes) {
    if (dish.archived_at) continue;
    for (const line of dish.lines) {
      if (line.product_id !== productId) continue;
      const unit = unitOf(state, line.product_id);
      const net = netOf(state, line);
      rows.push({
        href: `/erp/menu/${dish.id}`,
        name: dishTitle(dish),
        gross: qtyText(line.qty, unit),
        net: net == null ? "—" : qtyText(net, unit),
        price: dish.sale_price,
      });
    }
  }
  return rows;
}

function prepUsage(state: ErpState, productId: string): IngredientUsageRow[] {
  const rows: IngredientUsageRow[] = [];
  for (const prep of prepsUsingProduct(state, productId)) {
    const recipe = state.recipes.find((item) => item.product_id === prep.id && item.status === "active");
    for (const line of recipe?.lines ?? []) {
      if (line.product_id !== productId) continue;
      const unit = unitOf(state, line.product_id);
      const net = netOf(state, line);
      rows.push({
        href: `/erp/preps/recipe/${prep.id}`,
        name: productTitle(prep),
        gross: qtyText(line.qty, unit),
        net: net == null ? "—" : qtyText(net, unit),
      });
    }
  }
  return rows;
}

export function MenuIngredientsPage() {
  const { state, act } = useErp();
  const [query, setQuery] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [units, setUnits] = useState<string[]>([]);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const ctx = useMemo(() => (state ? costContextOf(state) : null), [state]);
  if (!state || !ctx) return null;

  const catMap = new Map(state.categories.map((c) => [c.id, c]));
  const stockMap = stockByProduct(state.stock, null);
  const q = query.trim().toLowerCase();
  const catSet = new Set(categories);
  const unitSet = new Set(units);
  const allowed = new Set<string>(INGREDIENT_TYPES);
  const pool = state.products.filter((p) => allowed.has(p.type) && !p.archived_at);
  const rows: Row[] = pool
    .filter((p) => {
      if (catSet.size && !catSet.has(p.category_id ?? "none")) return false;
      if (unitSet.size && !unitSet.has(p.base_unit ?? "none")) return false;
      return !q || `${p.name_en} ${p.name_vn} ${p.brand ?? ""} ${p.code}`.toLowerCase().includes(q);
    })
    .map((p) => {
      const stock = stockOf(stockMap, p.id);
      return {
        ...p,
        categoryName: categoryLabel(p.category_id ? catMap.get(p.category_id) : undefined),
        cost: p.base_unit ? costLine(ctx, p.id, 1).cost : null,
        stockQty: stock.qty,
        stockValue: stockValue(stock),
      };
    });

  const columns: CatalogColumn<Row>[] = [
    {
      id: "name",
      label: T("Название", "Name", "Tên"),
      cell: (row) => (
        <NavLink href={`/erp/products/${row.id}`} className="erpName">
          {productTitle(row)}
        </NavLink>
      ),
      text: (row) => productTitle(row),
    },
    { id: "barcode", label: T("Штрихкод", "Barcode", "Mã vạch"), defaultHidden: true, sort: false, cell: () => "—", text: () => "" },
    { id: "category", label: T("Категория", "Category", "Nhóm"), cell: (row) => row.categoryName, text: (row) => row.categoryName },
    {
      id: "unit",
      label: T("Ед. измерения", "Unit", "Đơn vị"),
      cell: (row) => (row.base_unit ? unitLabel(row.base_unit) : "—"),
      text: (row) => row.base_unit ?? "",
    },
    {
      id: "pieceWeight",
      label: T("Вес штучного ингредиента", "Piece weight", "Khối lượng 1 cái"),
      defaultHidden: true,
      num: true,
      cell: (row) => (row.unit_weight_kg == null ? "—" : posterStockQty(row.unit_weight_kg, "kg")),
      text: (row) => (row.unit_weight_kg == null ? "" : String(row.unit_weight_kg)),
    },
    {
      id: "loss",
      label: T("Потери", "Losses", "Hao hụt"),
      sort: false,
      cell: (row) => lossPercentsText(row),
      text: (row) => lossPercentsText(row),
    },
    {
      id: "stock",
      label: T("Остатки на складах", "Stock on hand", "Tồn kho"),
      num: true,
      cell: (row) => posterStockQty(row.stockQty, row.base_unit),
      text: (row) => String(row.stockQty),
    },
    {
      id: "cost",
      label: T("Себестоимость", "Cost", "Giá vốn"),
      num: true,
      cell: (row) => (row.cost == null ? "—" : <span className={row.cost === 0 ? "erpCostZero" : undefined}>{vnd(row.cost)}</span>),
      text: (row) => (row.cost == null ? "" : String(Math.round(row.cost))),
    },
    {
      id: "stockValue",
      label: T("Сумма остатков", "Stock value", "Giá trị tồn"),
      num: true,
      cell: (row) => (row.stockValue == null ? "—" : vnd(row.stockValue)),
      text: (row) => (row.stockValue == null ? "" : String(Math.round(row.stockValue))),
    },
  ];

  return (
    <CatalogTable
      storeKey="gastrofood-erp-menu-ingredients-v3"
      activeHref={MENU_HREFS.ingredients}
      title={T("Ингредиенты", "Ingredients", "Nguyên liệu")}
      sheetName="menu-ingredients"
      columns={columns}
      rows={rows}
      query={query}
      onQuery={setQuery}
      searchPlaceholder={T("Быстрый поиск", "Quick search", "Tìm nhanh")}
      addHref="/erp/products/new?type=ingredient"
      addLabel={T("Добавить", "Add", "Thêm")}
      rowHref={(row) => `/erp/products/${row.id}`}
      hideTrash
      hideMore
      showImport
      expandedId={detailsId}
      rowExpand={(row) => <IngredientUsage dishes={dishUsage(state, row.id)} preps={prepUsage(state, row.id)} />}
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
          <MultiSelect
            label={T("Ед. измерения", "Unit", "Đơn vị")}
            options={[
              { id: "kg", label: T("кг", "kg", "kg") },
              { id: "l", label: T("л", "l", "l") },
              { id: "pcs", label: T("шт", "pcs", "cái") },
              { id: "none", label: T("Без единицы", "No unit", "Chưa có đơn vị") },
            ]}
            value={units}
            onChange={setUnits}
          />
          <ExtraFilterStub />
        </>
      }
      rowLinks={(row) => (
        <>
          <button type="button" className="erpLink" onClick={() => setDetailsId(row.id === detailsId ? null : row.id)}>
            {T("Детали", "Details", "Chi tiết")}
          </button>
          <NavLink href={`/erp/products/${row.id}`} className="erpLink">
            {T("Ред.", "Edit", "Sửa")}
          </NavLink>
        </>
      )}
      rowMenu={(row, close) => (
        <button
          type="button"
          className="erpDropAction erpDanger"
          onClick={() => {
            close();
            if (
              !window.confirm(
                T(
                  `Удалить «${productTitle(row)}»? В Poster ингредиент нельзя восстановить из корзины — в ERP он уйдёт в архив справочника.`,
                  `Delete “${productTitle(row)}”? Poster cannot restore ingredients from trash — ERP will archive the catalog row.`,
                  `Xóa “${productTitle(row)}”? Poster không khôi phục nguyên liệu — ERP sẽ lưu trữ.`,
                ),
              )
            )
              return;
            void act({ action: "setArchived", entity: "product", id: row.id, archived: true }, T("Ингредиент в архиве", "Ingredient archived", "Đã lưu trữ"));
          }}
        >
          {T("Удалить", "Delete", "Xóa")}
        </button>
      )}
      note={T(
        "Это тот же erp_products (сырьё, упаковка, расходники), не второй каталог. Колонки как на скрине Poster. Неизвестная себестоимость — «—», не 0. Удаление архивирует карточку; корзины 30 дней у ингредиентов в Poster нет. Импорт не реализован. Складской учёт при создании не заполняем — это поставка.",
        "This is the same erp_products catalog (ingredients, packaging, consumables), not a second list. Columns match the Poster screenshot. Unknown cost is —, not 0. Delete archives the card; Poster has no 30-day ingredient trash. Import is not implemented. Creation does not post stock.",
        "Cùng erp_products, không phải danh mục thứ hai. Cột theo ảnh Poster. Giá vốn chưa biết là —. Xóa lưu trữ thẻ. Nhập chưa làm.",
      )}
    />
  );
}
