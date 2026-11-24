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
    ? T("Категории товаров и блюд", "Product & dish categories", "Nhóm hàng và món")
    : T("Категории ингредиентов", "Ingredient categories", "Nhóm nguyên liệu");
  return (
    <div className="erpMenu">
      <PageHead title={title} />
      <MenuMobileNav active={products ? MENU_HREFS.productCategories : MENU_HREFS.ingredientCategories} />
      <p className="erpHint">
        {products
          ? T(
              "Эти категории ставятся на товары и на блюда — один список для обоих. Категории ингредиентов — отдельный пункт меню.",
              "These categories are assigned to products and to dishes — one list for both. Ingredient categories are a separate menu item.",
              "Các nhóm này gắn cho hàng hóa và món — một danh sách dùng chung. Nhóm nguyên liệu là mục menu riêng.",
            )
          : T(
              "Категории для сырья и ингредиентов. Товары и блюда используют другой список в меню.",
              "Categories for raw ingredients. Products and dishes use the other list in the menu.",
              "Nhóm cho nguyên liệu. Hàng hóa và món dùng danh sách khác trong menu.",
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
            ? T("Категории товаров помогают фильтровать товары и блюда.", "Product categories filter products and dishes.", "Nhóm hàng giúp lọc hàng hóa và món.")
            : T("Категории ингредиентов помогают фильтровать сырьё.", "Ingredient categories filter raw products.", "Nhóm nguyên liệu giúp lọc hàng.")
        }
      />
    </div>
  );
}
