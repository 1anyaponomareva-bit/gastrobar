"use client";

import { useMemo, useState } from "react";
import type { ErpCategory } from "@/lib/erp/types";
import { CatalogTable, notImplemented, type CatalogColumn } from "./CatalogTable";
import { useErp } from "./ErpShell";
import { ConditionFilters, matches, type Condition } from "./filters";
import { categoryLabel, INGREDIENT_TYPES } from "./menuFields";
import { MenuMobileNav, MENU_HREFS } from "./menuNav";
import { RefList } from "./RefList";
import { stockByProduct, stockOf, stockValue } from "@/lib/erp/stockView";
import { PageHead, T, vnd } from "./ui";

type IngredientCatRow = { id: string; name: string; count: number; stockSum: number | null };

export function MenuCategoriesPage({ kind }: { kind: "products" | "ingredients" }) {
  const { state, act, notify } = useErp();
  const [query, setQuery] = useState("");
  const [conditions, setConditions] = useState<Condition[]>([]);
  const stockMap = useMemo(() => stockByProduct(state?.stock ?? [], null), [state?.stock]);
  const ingredientRows: IngredientCatRow[] = useMemo(() => {
    if (!state) return [];
    const allowed = new Set<string>(INGREDIENT_TYPES);
    const items = state.products.filter((p) => allowed.has(p.type) && !p.archived_at);
    const groups = new Map<string, IngredientCatRow>();
    for (const product of items) {
      const id = product.category_id ?? "none";
      const category = product.category_id ? state.categories.find((c) => c.id === product.category_id) : undefined;
      const prev = groups.get(id) ?? {
        id,
        name: category ? categoryLabel(category) : T("Без категории", "No category", "Chưa phân nhóm"),
        count: 0,
        stockSum: 0,
      };
      const value = stockValue(stockOf(stockMap, product.id));
      groups.set(id, {
        ...prev,
        count: prev.count + 1,
        stockSum: prev.stockSum == null || value == null ? null : prev.stockSum + value,
      });
    }
    return [...groups.values()];
  }, [state, stockMap]);

  if (!state) return null;
  const products = kind === "products";
  const title = products
    ? T("Категории товаров и тех. карт", "Product & recipe categories", "Nhóm món và công thức")
    : T("Категории ингредиентов", "Ingredient categories", "Nhóm nguyên liệu");

  if (!products) {
    const q = query.trim().toLowerCase();
    const fields = [
      { id: "name", label: T("Категория", "Category", "Nhóm"), kind: "text" as const },
      { id: "count", label: T("Кол-во ингредиентов", "Ingredient count", "Số nguyên liệu"), kind: "number" as const },
      { id: "stockSum", label: T("Сумма остатков", "Stock value", "Giá trị tồn"), kind: "number" as const },
    ];
    const rows = ingredientRows.filter((row) => {
      if (q && !row.name.toLowerCase().includes(q)) return false;
      return fields.every((field) => {
        const cond = conditions.find((c) => c.field === field.id);
        if (!cond) return true;
        const value = field.id === "name" ? row.name : field.id === "count" ? row.count : row.stockSum;
        return matches(cond, field.kind, value);
      });
    });
    const columns: CatalogColumn<IngredientCatRow>[] = [
      { id: "name", label: T("Категория", "Category", "Nhóm"), locked: true, cell: (row) => row.name, text: (row) => row.name },
      { id: "count", label: T("Кол-во ингредиентов", "Ingredient count", "Số nguyên liệu"), num: true, cell: (row) => String(row.count), text: (row) => String(row.count) },
      {
        id: "stockSum",
        label: T("Сумма остатков", "Stock value", "Giá trị tồn"),
        num: true,
        cell: (row) => (row.stockSum == null ? "—" : vnd(row.stockSum)),
        text: (row) => (row.stockSum == null ? "" : String(Math.round(row.stockSum))),
      },
    ];
    return (
      <CatalogTable
        storeKey="gastrofood-erp-menu-ingredient-cats"
        activeHref={MENU_HREFS.ingredientCategories}
        title={title}
        sheetName="menu-ingredient-categories"
        columns={columns}
        rows={rows}
        query={query}
        onQuery={setQuery}
        searchPlaceholder={T("Быстрый поиск", "Quick search", "Tìm nhanh")}
        addLabel={T("Добавить", "Add", "Thêm")}
        onAdd={() => {
          const name = window.prompt(T("Название категории", "Category name", "Tên nhóm"));
          if (!name?.trim()) return;
          void act(
            { action: "saveRef", entity: "category", value: { name_en: name.trim(), name_vn: name.trim(), name: name.trim() } },
            T("Категория создана", "Category created", "Đã tạo nhóm"),
          );
        }}
        hideTrash
        hideMore
        filterBar={<ConditionFilters fields={fields} value={conditions} onChange={setConditions} />}
        rowMenu={(_row, close) => (
          <button
            type="button"
            className="erpDropAction erpDanger"
            onClick={() => {
              close();
              notify({
                ok: false,
                text: notImplemented(
                  T("Удалить (оставить без категории / удалить ингредиенты)", "Delete (leave uncategorized / delete ingredients)", "Xóa (bỏ nhóm / xóa nguyên liệu)"),
                ),
              });
            }}
          >
            {T("Удалить", "Delete", "Xóa")}
          </button>
        )}
        note={T(
          "Колонки — из документации Poster. Это те же erp_categories, не второй справочник. Восстановить удалённую категорию ингредиентов в Poster нельзя. Добавить пишет в общий список категорий.",
          "Columns follow Poster docs. This is the same erp_categories table, not a second catalog. Poster cannot restore a deleted ingredient category.",
          "Cột theo tài liệu Poster. Cùng erp_categories, không phải danh mục thứ hai.",
        )}
      />
    );
  }

  return (
    <div className="erpMenu">
      <PageHead title={title} />
      <MenuMobileNav active={MENU_HREFS.productCategories} />
      <p className="erpHint">
        {T(
          "Один справочник erp_categories для товаров, тех. карт и ингредиентов. Дерево кассы (Главный экран / вложенность) в API нет. Удаление категории вместе со всеми позициями — не реализовано.",
          "One erp_categories list for products, recipes and ingredients. The till tree (home screen / nesting) is not in the API. Deleting a category with all of its items is not implemented.",
          "Một erp_categories cho hàng, công thức và nguyên liệu. Cây thu ngân chưa có API. Xóa nhóm kèm món chưa làm.",
        )}
      </p>
      <RefList<ErpCategory>
        entity="category"
        rows={state.categories}
        columns={[
          { key: "name_en", label: T("Название (English)", "Name (English)", "Tên (English)") },
          { key: "name_vn", label: T("Название (Tiếng Việt)", "Name (Tiếng Việt)", "Tên (Tiếng Việt)") },
        ]}
        addLabel={T("Добавить категорию", "Add category", "Thêm nhóm")}
        emptyTitle={T("Категорий пока нет", "No categories yet", "Chưa có nhóm")}
        emptyText={T("Категории товаров помогают фильтровать блюда и тех. карты.", "Product categories filter dishes and recipes.", "Nhóm hàng giúp lọc món và công thức.")}
      />
    </div>
  );
}
