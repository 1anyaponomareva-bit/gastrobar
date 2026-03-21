"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTheme } from "@/components/ThemeProvider";
import { useFavorites } from "@/components/FavoritesProvider";
import { useHighlightProduct } from "@/components/HighlightProductContext";
import { useBarHome } from "@/components/BarHomeContext";
import { CategoryTabs, type BarCategoryId, type MenuCategoryId } from "@/components/CategoryTabs";
import { MenuListItem } from "@/components/MenuListItem";
import { MenuDetailView } from "@/components/MenuDetailView";
import { PromoCarousel } from "@/components/PromoCarousel";
import { getActiveBonus, isCategoryBonus, BONUS_PERIOD } from "@/services/bonusService";
import { BONUS_VALIDITY_LABEL } from "@/lib/bonusCopy";
import type { MenuItem } from "@/data/menu";

const HEADER_HEIGHT = 60;
const TABS_HEIGHT = 58; // высота полосы табов (Все, Коктейли, ...)
const TOP_BUFFER = 24; // зазор между табами и первой карточкой
/** Высота spacer под хедер + табы (бар) или только под хедер (снеки) */
const BAR_LIST_TOP = HEADER_HEIGHT + TABS_HEIGHT + TOP_BUFFER; // 142
const MENU_LIST_TOP = HEADER_HEIGHT + TOP_BUFFER; // 84
/** Нижний отступ списка: нижняя навигация (высота + bottom-4) + safe-area, чтобы последние карточки не перекрывались */
const LIST_BOTTOM_PADDING = "calc(7rem + env(safe-area-inset-bottom, 0px))"; // ~112px + safe-area

function filterByCategory(
  items: MenuItem[],
  period: "bar" | "menu",
  categoryId: BarCategoryId | MenuCategoryId
): MenuItem[] {
  if (period === "bar") {
    const barItems = items.filter((i) => i.category === "cocktail");
    if (categoryId === "all") return barItems;
    return barItems.filter((i) => i.barSubcategory === categoryId);
  }
  const menuItems = items.filter((i) => i.category === "food");
  if (categoryId === "all") return menuItems;
  return menuItems.filter((i) => i.menuSubcategory === categoryId);
}

export function MenuList({ items }: { items: MenuItem[] }) {
  const { period } = useTheme();
  const { favoriteIds } = useFavorites();
  const { highlightProductId, pendingListCategory, clearPendingListCategory } = useHighlightProduct();
  const { barHomeToken } = useBarHome();
  const scrollRef = useRef<HTMLDivElement>(null);
  const savedScrollTop = useRef<number>(0);

  const [barCategory, setBarCategory] = useState<BarCategoryId>("all");
  const [menuCategory, setMenuCategory] = useState<MenuCategoryId>("all");
  const [viewMode, setViewMode] = useState<"list" | "detail">("list");
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [activeBonus, setActiveBonus] = useState<ReturnType<typeof getActiveBonus>>(null);
  const bonusProductId = activeBonus && !isCategoryBonus(activeBonus.type) ? activeBonus.productId : null;

  const categoryId = period === "bar" ? barCategory : menuCategory;
  const setCategoryId = period === "bar" ? setBarCategory : setMenuCategory;

  const filtered =
    period === "bar" || period === "menu"
      ? filterByCategory(items, period, categoryId)
      : [];

  const favoriteItems = useMemo(() => {
    if (period !== "favorites") return [];
    const byId = new Map(items.map((i) => [i.id, i]));
    return favoriteIds.map((id) => byId.get(id)).filter((i): i is MenuItem => i != null);
  }, [period, items, favoriteIds]);

  useEffect(() => {
    setViewMode("list");
    setSelectedItem(null);
    setBarCategory("all");
    setMenuCategory("all");
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [period]);

  useEffect(() => {
    if (viewMode === "list" && savedScrollTop.current > 0) {
      const t = savedScrollTop.current;
      savedScrollTop.current = 0;
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: t, behavior: "auto" });
      });
    }
  }, [viewMode]);

  useEffect(() => {
    const sync = () => setActiveBonus(getActiveBonus());
    sync();
    const t = setInterval(sync, 2000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!pendingListCategory) return;
    if ("bar" in pendingListCategory) setBarCategory(pendingListCategory.bar);
    if ("menu" in pendingListCategory) setMenuCategory(pendingListCategory.menu);
    clearPendingListCategory();
  }, [pendingListCategory, clearPendingListCategory]);

  useEffect(() => {
    if (!highlightProductId || !scrollRef.current || (period !== "bar" && period !== "menu")) return;
    const el = scrollRef.current.querySelector(`[data-product-id="${highlightProductId}"]`);
    if (el) {
      requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }
  }, [highlightProductId, period]);

  /** Клик по логотипу: Бар + «Все» + закрыть карточку */
  useEffect(() => {
    if (barHomeToken === 0) return;
    setBarCategory("all");
    setMenuCategory("all");
    setViewMode("list");
    setSelectedItem(null);
    savedScrollTop.current = 0;
  }, [barHomeToken]);

  useEffect(() => {
    if (barHomeToken === 0 || period !== "bar" || viewMode !== "list") return;
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      });
    });
    return () => cancelAnimationFrame(id);
  }, [barHomeToken, period, viewMode]);

  const openDetail = (item: MenuItem, index: number) => {
    savedScrollTop.current = scrollRef.current?.scrollTop ?? 0;
    setSelectedItem(item);
    setSelectedIndex(index);
    setViewMode("detail");
  };

  const closeDetail = () => {
    setViewMode("list");
    setSelectedItem(null);
  };

  return (
    <>
      {period === "promo" && (
        <div className="h-[100dvh] snap-start">
          <PromoCarousel />
        </div>
      )}

      {period === "favorites" && (
        <div
          className="flex h-[100dvh] flex-col overflow-hidden bg-black"
          style={{ paddingTop: HEADER_HEIGHT }}
        >
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto overscroll-y-contain bg-black"
          >
            {favoriteItems.length === 0 ? (
              <div className="flex min-h-[60vh] flex-col items-center justify-center px-8 text-center">
                <p className="text-lg leading-relaxed text-white/80">
                  Здесь пока пусто. Добавьте напитки или блюда, которые вам понравились!
                </p>
              </div>
            ) : (
              <div
                className="flex flex-col pb-28"
                style={{ gap: 10, paddingLeft: 16, paddingRight: 16 }}
              >
                {favoriteItems.map((item, index) => (
                  <MenuListItem
                    key={item.id}
                    item={item}
                    index={index}
                    period={item.category === "cocktail" ? "bar" : "menu"}
                    bonusProductId={bonusProductId}
                    highlightProductId={highlightProductId}
                    onClick={() => openDetail(item, index)}
                  />
                ))}
              </div>
            )}
          </div>
          <AnimatePresence>
            {viewMode === "detail" && selectedItem && favoriteItems.length > 0 && (
              <MenuDetailView
                key={`detail-fav-${selectedIndex}-${favoriteItems[0]?.id}`}
                items={favoriteItems}
                initialIndex={selectedIndex}
                onClose={closeDetail}
              />
            )}
          </AnimatePresence>
        </div>
      )}

      {(period === "bar" || period === "menu") && (
        <>
          {viewMode === "list" && (
            <motion.div
              key="list"
              initial={{ opacity: 1 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="flex h-[100dvh] flex-col overflow-hidden bg-[#030303]"
            >
              {/* Табы категорий только для Бара; в Снеках — только список */}
              {period === "bar" && (
                <div
                  className="fixed left-0 right-0 z-[999]"
                  style={{ top: HEADER_HEIGHT }}
                >
                  <CategoryTabs
                    period={period}
                    value={categoryId}
                    onChange={(id) => setCategoryId(id as BarCategoryId & MenuCategoryId)}
                  />
                </div>
              )}

              {/* Список: spacer сверху, чтобы первая карточка не перекрывалась хедером и табами */}
              <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto overscroll-y-contain bg-[#030303]"
              >
                <div
                  className="flex flex-col"
                  style={{
                    gap: 8,
                    paddingLeft: 16,
                    paddingRight: 16,
                    paddingBottom: LIST_BOTTOM_PADDING,
                  }}
                >
                  {/* Spacer: резервирует место под фиксированные хедер и табы (бар) или только хедер (снеки) */}
                  <div
                    aria-hidden
                    className="shrink-0 bg-[#030303]"
                    style={{
                      minHeight: period === "menu"
                        ? `calc(${MENU_LIST_TOP}px + env(safe-area-inset-top, 0px))`
                        : `calc(${BAR_LIST_TOP}px + env(safe-area-inset-top, 0px))`,
                    }}
                  />
                  {activeBonus && isCategoryBonus(activeBonus.type) && BONUS_PERIOD[activeBonus.type] === period && (
                    <div className="mb-3 rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-transparent px-4 py-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-amber-500/80">
                        По бонусу колеса
                      </p>
                      <p className="mt-1 text-sm font-semibold text-white">{activeBonus.title}</p>
                      <p className="mt-0.5 text-xs text-white/55">Действует {BONUS_VALIDITY_LABEL}</p>
                    </div>
                  )}
                  {filtered.map((item, index) => (
                    <MenuListItem
                      key={item.id}
                      item={item}
                      index={index}
                      period={period}
                      bonusProductId={bonusProductId}
                      highlightProductId={highlightProductId}
                      onClick={() => openDetail(item, index)}
                    />
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          <AnimatePresence>
            {viewMode === "detail" && selectedItem && filtered.length > 0 && (
              <MenuDetailView
                key={`detail-${selectedIndex}-${filtered[0]?.id}`}
                items={filtered}
                initialIndex={selectedIndex}
                onClose={closeDetail}
              />
            )}
          </AnimatePresence>
        </>
      )}
    </>
  );
}
