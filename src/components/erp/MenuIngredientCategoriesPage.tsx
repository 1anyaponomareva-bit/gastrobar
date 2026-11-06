"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CATEGORY_TRASH_DAYS,
  ingredientCategoryStats,
  sumIngredientCategoryStats,
  trashAlive,
  trashedCategories,
  withInputVat,
} from "@/lib/erp/ingredientCategoryStats";
import type { IngredientCategoryStat } from "@/lib/erp/ingredientCategoryStats";
import { CatalogTable, type CatalogColumn } from "./CatalogTable";
import { useErp } from "./ErpShell";
import { MenuFormShell } from "./MenuFormShell";
import { categoryLabel } from "./menuFields";
import { MENU_HREFS } from "./menuNav";
import { dateTimeText, Field, packQtyText, T, unitLabel, vnd } from "./ui";

const pcs = () => T("шт.", "pcs", "cái");
const dash = "";

function qtyLabel(qty: number, unit: string | null, mixed: boolean) {
  if (mixed) return "—";
  if (qty === 0) return dash;
  return unit ? `${packQtyText(qty, unit)} ${unitLabel(unit)}` : packQtyText(qty);
}

function valueCell(net: number | null, withVat: (n: number | null) => number | null) {
  const value = withVat(net);
  return value == null ? "—" : vnd(value);
}

export function MenuIngredientCategoriesPage() {
  const { state, act } = useErp();
  const [query, setQuery] = useState("");
  const stats = useMemo(
    () => (state ? ingredientCategoryStats(state.categories, state.products, state.dishes, state.stock) : []),
    [state],
  );
  if (!state) return null;

  const vat = (net: number | null) => withInputVat(net, state.settings);
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
      cell: (row) => (row.nameVn && row.nameVn !== row.nameEn ? `${row.nameEn} / ${row.nameVn}` : row.nameEn),
      text: (row) => row.nameEn,
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
      cell: (row) => valueCell(row.valueNet, vat),
      text: (row) => {
        const value = vat(row.valueNet);
        return value == null ? "" : String(Math.round(value));
      },
    },
  ];

  const remove = (row: IngredientCategoryStat) => {
    if (
      !window.confirm(
        T(
          `Удалить «${row.nameEn}»? Категория попадёт в «Удалённые» на ${CATEGORY_TRASH_DAYS} дней.`,
          `Delete “${row.nameEn}”? It will stay in Deleted for ${CATEGORY_TRASH_DAYS} days.`,
          `Xóa “${row.nameEn}”? Sẽ nằm trong Đã xóa ${CATEGORY_TRASH_DAYS} ngày.`,
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
      hideMore
      hideCheck
      defaultSort="name"
      emptyTitle={T("Категорий ингредиентов пока нет", "No ingredient categories yet", "Chưa có nhóm nguyên liệu")}
      emptyMessage={T("Нет категорий, соответствующих выбранным фильтрам", "No categories match the selected filters", "Không có nhóm khớp bộ lọc")}
      rowEnd={(row) => (
        <button type="button" className="erpLink erpDanger" onClick={() => remove(row)}>
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
                        ? valueCell(totals.valueNet, vat)
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
  const { act, busy } = useErp();
  const router = useRouter();
  const [name, setName] = useState("");
  return (
    <MenuFormShell
      backHref={MENU_HREFS.ingredientCategories}
      backLabel={T("Категории ингредиентов", "Ingredient categories", "Nhóm nguyên liệu")}
      activeHref={MENU_HREFS.ingredientCategories}
      title={T("Добавление категории ингредиентов", "Add ingredient category", "Thêm nhóm nguyên liệu")}
      footer={
        <button
          type="button"
          className="erpBtn primary"
          disabled={busy || !name.trim()}
          onClick={async () => {
            const value = name.trim();
            if (!value) return;
            const saved = await act(
              { action: "saveRef", entity: "category", value: { name_en: value, name_vn: value, name: value } },
              T("Категория создана", "Category created", "Đã tạo nhóm"),
            );
            if (saved) router.push(MENU_HREFS.ingredientCategories);
          }}
        >
          {T("Сохранить", "Save", "Lưu")}
        </button>
      }
    >
      <section className="erpCard">
        <Field label={T("Название", "Name", "Tên")}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={T("Например, «Овощи» или «Мясо»", "For example, “Vegetables” or “Meat”", "Ví dụ: “Rau” hoặc “Thịt”")} />
        </Field>
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
