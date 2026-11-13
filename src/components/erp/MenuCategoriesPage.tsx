"use client";

import type { ErpCategory } from "@/lib/erp/types";
import { useErp } from "./ErpShell";
import { MenuMobileNav, MENU_HREFS } from "./menuNav";
import { sortCategoriesByLabel } from "./menuFields";
import { RefList } from "./RefList";
import { PageHead, T } from "./ui";

export function MenuCategoriesPage({ kind }: { kind: "products" | "ingredients" }) {
  const { state } = useErp();
  if (!state) return null;
  const products = kind === "products";
  const title = products
    ? T("Категории товаров и тех. карт", "Product & recipe categories", "Nhóm món và công thức")
    : T("Категории ингредиентов", "Ingredient categories", "Nhóm nguyên liệu");
  return (
    <div className="erpMenu">
      <PageHead title={title} />
      <MenuMobileNav active={products ? MENU_HREFS.productCategories : MENU_HREFS.ingredientCategories} />
      <p className="erpHint">
        {T(
          "Пока один справочник erp_categories: блюда и ингредиенты делят его. Отдельные деревья Poster — после контракта данных.",
          "There is one erp_categories list for now: dishes and ingredients share it. Poster's two trees wait on the data contract.",
          "Hiện một danh mục erp_categories dùng chung. Hai cây riêng của Poster chờ hợp đồng dữ liệu.",
        )}
      </p>
      <RefList<ErpCategory>
        entity="category"
        rows={sortCategoriesByLabel(state.categories)}
        columns={[
          { key: "name_en", label: T("Название (English)", "Name (English)", "Tên (English)") },
          { key: "name_vn", label: T("Название (Tiếng Việt)", "Name (Tiếng Việt)", "Tên (Tiếng Việt)") },
        ]}
        addLabel={T("Добавить категорию", "Add category", "Thêm nhóm")}
        emptyTitle={T("Категорий пока нет", "No categories yet", "Chưa có nhóm")}
        emptyText={
          products
            ? T("Категории товаров помогают фильтровать блюда и тех. карты.", "Product categories filter dishes and recipes.", "Nhóm hàng giúp lọc món và công thức.")
            : T("Категории ингредиентов помогают фильтровать сырьё.", "Ingredient categories filter raw products.", "Nhóm nguyên liệu giúp lọc hàng.")
        }
      />
    </div>
  );
}
