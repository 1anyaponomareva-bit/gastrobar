"use client";

import { useEffect, useRef } from "react";
import { NavLink, T } from "./ui";

/** Poster → Меню. Paths stay under /erp/menu; old /erp/products and /erp/preps lists redirect here. */
export const MENU_HREFS = {
  goods: "/erp/menu",
  trash: "/erp/menu/trash",
  recipes: "/erp/menu/recipes",
  preps: "/erp/menu/preps",
  ingredients: "/erp/menu/ingredients",
  foodcost: "/erp/menu/foodcost",
  productCategories: "/erp/menu/categories",
  ingredientCategories: "/erp/menu/ingredient-categories",
  workshops: "/erp/menu/workshops",
} as const;

export function menuNavItems() {
  return [
    { href: MENU_HREFS.goods, label: T("Товары", "Products", "Hàng hóa") },
    { href: MENU_HREFS.recipes, label: T("Тех. карты", "Recipes", "Công thức") },
    { href: MENU_HREFS.preps, label: T("Полуфабрикаты", "Semi-finished", "Bán thành phẩm") },
    { href: MENU_HREFS.ingredients, label: T("Ингредиенты", "Ingredients", "Nguyên liệu") },
    { href: MENU_HREFS.foodcost, label: T("Контроль фудкоста", "Food cost", "Kiểm soát food cost") },
    { href: MENU_HREFS.productCategories, label: T("Категории товаров и тех. карт", "Product & recipe categories", "Nhóm món và công thức") },
    { href: MENU_HREFS.ingredientCategories, label: T("Категории ингредиентов", "Ingredient categories", "Nhóm nguyên liệu") },
    { href: MENU_HREFS.workshops, label: T("Цехи", "Workshops", "Phân xưởng") },
  ];
}

export function activeMenuHref(pathname: string | null): string | null {
  const path = pathname ?? "";
  const listed = menuNavItems().find((item) => path === item.href || (item.href !== MENU_HREFS.goods && path.startsWith(`${item.href}/`)));
  if (listed) return listed.href;
  if (path === MENU_HREFS.trash || path.startsWith(`${MENU_HREFS.trash}/`)) return MENU_HREFS.goods;
  if (path === "/erp/menu" || path === "/erp/menu/" || path.startsWith("/erp/menu/new") || /^\/erp\/menu\/[^/]+$/.test(path)) return MENU_HREFS.goods;
  if (path.startsWith("/erp/products/categories")) return MENU_HREFS.ingredientCategories;
  if (path.startsWith("/erp/products")) return MENU_HREFS.ingredients;
  if (path.startsWith("/erp/preps")) return MENU_HREFS.preps;
  return null;
}

/** On phones the side menu is hidden, so Menu pages show Poster tabs. */
export function MenuMobileNav({ active }: { active: string }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = ref.current;
    const link = nav?.querySelector<HTMLElement>("a.active");
    if (!nav || !link) return;
    const pad = 16;
    const min = Math.max(0, link.offsetLeft + link.offsetWidth + pad - nav.clientWidth);
    const max = Math.max(0, link.offsetLeft - pad);
    if (nav.scrollLeft < min) nav.scrollLeft = min;
    else if (nav.scrollLeft > max) nav.scrollLeft = max;
  }, [active]);
  return (
    <nav ref={ref} className="erpSubTabs erpMobileOnly" aria-label={T("Раздел Меню", "Menu section", "Mục Thực đơn")}>
      {menuNavItems().map((tab) => (
        <NavLink key={tab.href} href={tab.href} className={tab.href === active ? "active" : ""}>
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
