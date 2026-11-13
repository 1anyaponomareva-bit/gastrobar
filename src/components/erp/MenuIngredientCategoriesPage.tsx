"use client";

import { useEffect, useMemo, useState } from "react";
import { useErpRouter } from "./erpHref";
import type { ErpCategory, ErpState } from "@/lib/erp/types";
import {
  CATEGORY_TRASH_DAYS,
  INGREDIENT_PRODUCT_TYPES,
  ingredientCategoryStats,
  liveCategories,
  sumIngredientCategoryStats,
  trashAlive,
  trashedCategories,
  withProductInputVat,
} from "@/lib/erp/ingredientCategoryStats";
import { stockByProduct, stockOf, stockValue } from "@/lib/erp/stockView";
import type { IngredientCategoryStat } from "@/lib/erp/ingredientCategoryStats";
import { CatalogTable, type CatalogColumn } from "./CatalogTable";
import { useErp } from "./ErpShell";
import { MenuFormShell } from "./MenuFormShell";
import { categoryLabel } from "./menuFields";
import { MENU_HREFS } from "./menuNav";
import { dateTimeText, Empty, Field, NavLink, packQtyText, T, unitLabel, vnd } from "./ui";

const pcs = () => T("шт.", "pcs", "cái");
const dash = "";

function qtyLabel(qty: number, unit: string | null, mixed: boolean) {
  if (mixed) return "—";
  if (qty === 0) return dash;
  return unit ? `${packQtyText(qty, unit)} ${unitLabel(unit)}` : packQtyText(qty);
}

function categoryValueWithVat(state: ErpState, categoryId: string): number | null {
  const stockMap = stockByProduct(state.stock, null);
  let sum = 0;
  for (const product of state.products) {
    if (product.archived_at || product.category_id !== categoryId || !INGREDIENT_PRODUCT_TYPES.has(product.type)) continue;
    const value = withProductInputVat(stockValue(stockOf(stockMap, product.id)), product.id, state.settings, state.vatExceptions);
    if (value == null) return null;
    sum += value;
  }
  return sum;
}

function editHref(row: { id: string }) {
  return `${MENU_HREFS.ingredientCategories}/${row.id}`;
}

export function MenuIngredientCategoriesPage() {
  const { state, act } = useErp();
  const [query, setQuery] = useState("");
  const stats = useMemo(
    () => (state ? ingredientCategoryStats(state.categories, state.products, state.dishes, state.stock) : []),
    [state],
  );
  if (!state) return null;

  const vatOf = (categoryId: string) => categoryValueWithVat(state, categoryId);
  const q = query.trim().toLowerCase();
  const rows = stats.filter((row) => {
    if (!q) return true;
    return `${row.nameEn} ${row.nameVn}`.toLowerCase().includes(q);
  });
  const totals = sumIngredientCategoryStats(rows);

  const columns: CatalogColumn<IngredientCategoryStat>[] = [
    {
      id: "name",
      label: T("Категория", "Category", "Nhóm"),
      locked: true,
      cell: (row) => categoryLabel({ name_en: row.nameEn, name_vn: row.nameVn }),
      text: (row) => categoryLabel({ name_en: row.nameEn, name_vn: row.nameVn }),
    },
    {
      id: "count",
      label: T("Кол-во ингредиентов", "Ingredient count", "Số nguyên liệu"),
      num: true,
      cell: (row) => `${row.count} ${pcs()}`,
      text: (row) => String(row.count),
    },
    {
      id: "stockQty",
      label: T("Остатки на всех складах", "Stock on all warehouses", "Tồn mọi kho"),
      num: true,
      cell: (row) => qtyLabel(row.qty, row.unit, row.mixedUnits) || "—",
      text: (row) => (row.mixedUnits || row.qty === 0 ? "" : String(row.qty)),
    },
    {
      id: "valueNet",
      label: T("Стоимость остатков без НДС", "Stock value excl. VAT", "Giá trị tồn chưa VAT"),
      num: true,
      defaultHidden: true,
      cell: (row) => (row.valueNet == null ? "—" : vnd(row.valueNet)),
      text: (row) => (row.valueNet == null ? "" : String(Math.round(row.valueNet))),
    },
    {
      id: "valueVat",
      label: T("Стоимость остатков с НДС", "Stock value incl. VAT", "Giá trị tồn gồm VAT"),
      num: true,
      cell: (row) => {
        const value = vatOf(row.id);
        return value == null ? "—" : vnd(value);
      },
      text: (row) => {
        const value = vatOf(row.id);
        return value == null ? "" : String(Math.round(value));
      },
    },
  ];

  const remove = (row: IngredientCategoryStat) => {
    const label = categoryLabel({ name_en: row.nameEn, name_vn: row.nameVn });
    if (
      !window.confirm(
        T(
          `Удалить «${label}»? Категория попадёт в «Удалённые» на ${CATEGORY_TRASH_DAYS} дней.`,
          `Delete “${label}”? It will stay in Deleted for ${CATEGORY_TRASH_DAYS} days.`,
          `Xóa “${label}”? Sẽ nằm trong Đã xóa ${CATEGORY_TRASH_DAYS} ngày.`,
        ),
      )
    ) {
      return;
    }
    void act({ action: "deleteCategory", id: row.id }, T("Категория удалена", "Category deleted", "Đã xóa nhóm"));
  };

  return (
    <CatalogTable
      storeKey="gastrofood-erp-menu-ingredient-cats"
      activeHref={MENU_HREFS.ingredientCategories}
      title={T("Категории ингредиентов", "Ingredient categories", "Nhóm nguyên liệu")}
      sheetName="menu-ingredient-categories"
      columns={columns}
      rows={rows}
      query={query}
      onQuery={setQuery}
      searchPlaceholder={T("Быстрый поиск", "Quick search", "Tìm nhanh")}
      addHref={`${MENU_HREFS.ingredientCategories}/new`}
      addLabel={T("Добавить", "Add", "Thêm")}
      trashHref={MENU_HREFS.ingredientCategoriesTrash}
      rowHref={editHref}
      hideMore
      hideCheck
      defaultSort="name"
      emptyTitle={T("Категорий ингредиентов пока нет", "No ingredient categories yet", "Chưa có nhóm nguyên liệu")}
      emptyMessage={T("Нет категорий, соответствующих выбранным фильтрам", "No categories match the selected filters", "Không có nhóm khớp bộ lọc")}
      rowEnd={(row) => (
        <NavLink href={editHref(row)} className="erpLink">
          {T("Ред.", "Edit", "Sửa")}
        </NavLink>
      )}
      rowMenu={(row, close) => (
        <button
          type="button"
          className="erpDropAction erpDanger"
          onClick={() => {
            close();
            remove(row);
          }}
        >
          {T("Удалить", "Delete", "Xóa")}
        </button>
      )}
      footer={(shown) => (
        <tr className="erpMenuTotal">
          {shown.map((column) => (
            <td key={column.id} className={column.num ? "num" : ""}>
              {column.id === "name"
                ? T("Итого", "Total", "Tổng")
                : column.id === "count"
                  ? `${totals.count} ${pcs()}`
                  : column.id === "stockQty"
                    ? totals.qty == null
                      ? "—"
                      : qtyLabel(totals.qty, totals.unit, false) || "—"
                    : column.id === "valueNet"
                      ? totals.valueNet == null
                        ? "—"
                        : vnd(totals.valueNet)
                      : column.id === "valueVat"
                        ? (() => {
                            const values = rows.map((row) => vatOf(row.id));
                            if (values.some((value) => value == null)) return "—";
                            return vnd(values.reduce((sum: number, value) => sum + (value ?? 0), 0));
                          })()
                        : null}
            </td>
          ))}
          <td className="erpMenuRowActions erpNoPrint" />
        </tr>
      )}
    />
  );
}

export function MenuIngredientCategoryNewPage() {
  return <MenuIngredientCategoryForm />;
}

export function MenuIngredientCategoryEditPage({ id }: { id: string }) {
  const { state } = useErp();
  if (!state) return null;
  const category = liveCategories(state.categories).find((row) => row.id === id);
  if (!category) {
    return (
      <Empty
        title={T("Категория не найдена", "Category not found", "Không thấy nhóm")}
        text={T("Её уже удалили или она в «Удалённых».", "It may already be deleted or in Deleted.", "Có thể đã xóa hoặc nằm trong Đã xóa.")}
        action={
          <NavLink href={MENU_HREFS.ingredientCategories} className="erpBtn">
            {T("К списку", "Back to list", "Về danh sách")}
          </NavLink>
        }
      />
    );
  }
  return <MenuIngredientCategoryForm category={category} />;
}

function MenuIngredientCategoryForm({ category }: { category?: ErpCategory }) {
  const { act, busy } = useErp();
  const router = useErpRouter();
  const [nameEn, setNameEn] = useState(category?.name_en ?? "");
  const [nameVn, setNameVn] = useState(category?.name_vn ?? "");
  const title = category
    ? T("Редактирование категории ингредиентов", "Edit ingredient category", "Sửa nhóm nguyên liệu")
    : T("Добавление категории ингредиентов", "Add ingredient category", "Thêm nhóm nguyên liệu");

  return (
    <MenuFormShell
      backHref={MENU_HREFS.ingredientCategories}
      backLabel={T("Категории ингредиентов", "Ingredient categories", "Nhóm nguyên liệu")}
      activeHref={MENU_HREFS.ingredientCategories}
      title={title}
      footer={
        <button
          type="button"
          className="erpBtn primary"
          disabled={busy || !nameEn.trim()}
          onClick={async () => {
            const english = nameEn.trim();
            if (!english) return;
            const saved = await act(
              {
                action: "saveRef",
                entity: "category",
                value: { id: category?.id, name_en: english, name_vn: nameVn.trim() },
              },
              category
                ? T("Категория сохранена", "Category saved", "Đã lưu nhóm")
                : T("Категория создана", "Category created", "Đã tạo nhóm"),
            );
            if (saved) router.push(MENU_HREFS.ingredientCategories);
          }}
        >
          {T("Сохранить", "Save", "Lưu")}
        </button>
      }
    >
      <section className="erpCard">
        <div className="erpGrid two">
          <Field label={T("Название (English) *", "Name (English) *", "Tên (English) *")}>
            <input
              value={nameEn}
              onChange={(e) => setNameEn(e.target.value)}
              autoFocus
              placeholder={T("Например, «Vegetables» или «Meat»", "For example, “Vegetables” or “Meat”", "Ví dụ: “Vegetables” hoặc “Meat”")}
            />
          </Field>
          <Field label={T("Название (Tiếng Việt)", "Name (Tiếng Việt)", "Tên (Tiếng Việt)")}>
            <input
              value={nameVn}
              onChange={(e) => setNameVn(e.target.value)}
              placeholder={T("Например, «Rau» или «Thịt»", "For example, “Rau” or “Thịt”", "Ví dụ: “Rau” hoặc “Thịt”")}
            />
          </Field>
        </div>
      </section>
    </MenuFormShell>
  );
}

type TrashRow = { id: string; name: string; deleted_at: string };

export function MenuIngredientCategoryTrashPage() {
  const { state, act } = useErp();
  const [query, setQuery] = useState("");
  useEffect(() => {
    void act({ action: "purgeCategoryTrash" }, false);
    // Purge expired rows once when opening the folder.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!state) return null;

  const q = query.trim().toLowerCase();
  const rows: TrashRow[] = trashedCategories(state.categories)
    .filter((c) => trashAlive(c.deleted_at as string))
    .filter((c) => !q || `${c.name_en} ${c.name_vn}`.toLowerCase().includes(q))
    .map((c) => ({ id: c.id, name: categoryLabel(c), deleted_at: c.deleted_at as string }));

  const columns: CatalogColumn<TrashRow>[] = [
    { id: "name", label: T("Категория", "Category", "Nhóm"), locked: true, cell: (row) => row.name, text: (row) => row.name },
    { id: "deletedAt", label: T("Дата удаления", "Deleted at", "Ngày xóa"), cell: (row) => dateTimeText(row.deleted_at), text: (row) => row.deleted_at },
  ];

  return (
    <CatalogTable
      storeKey="gastrofood-erp-menu-ingredient-cats-trash"
      activeHref={MENU_HREFS.ingredientCategories}
      title={T("Удалённые категории ингредиентов", "Deleted ingredient categories", "Nhóm nguyên liệu đã xóa")}
      sheetName="menu-ingredient-categories-trash"
      columns={columns}
      rows={rows}
      query={query}
      onQuery={setQuery}
      searchPlaceholder={T("Быстрый поиск", "Quick search", "Tìm nhanh")}
      hideTrash
      hideMore
      hideCheck
      backHref={MENU_HREFS.ingredientCategories}
      backLabel={T("К категориям ингредиентов", "Back to ingredient categories", "Về nhóm nguyên liệu")}
      emptyTitle={T("Корзина пуста", "Trash is empty", "Thùng rác trống")}
      emptyMessage={T("Нет удалённых категорий", "No deleted categories", "Không có nhóm đã xóa")}
      banner={T(
        `Категории ингредиентов хранятся в «Удалённые» ${CATEGORY_TRASH_DAYS} дней, затем удаляются окончательно.`,
        `Ingredient categories stay in Deleted for ${CATEGORY_TRASH_DAYS} days, then are purged.`,
        `Nhóm nguyên liệu lưu trong Đã xóa ${CATEGORY_TRASH_DAYS} ngày, sau đó xóa hẳn.`,
      )}
      rowEnd={(row) => (
        <button
          type="button"
          className="erpLink"
          onClick={() => void act({ action: "restoreCategory", id: row.id }, T("Категория восстановлена", "Category restored", "Đã khôi phục nhóm"))}
        >
          {T("Восстановить", "Restore", "Khôi phục")}
        </button>
      )}
    />
  );
}
