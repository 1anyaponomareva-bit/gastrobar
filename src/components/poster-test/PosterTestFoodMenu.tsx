"use client";

import { useEffect, useMemo, useState } from "react";
import type { PosterFoodMenuItem } from "@/lib/poster/mapProducts";
import { POSTER_TEST_BANNER_HEIGHT_PX } from "@/lib/posterTestRoutes";

const CATEGORY_LABELS: Record<string, string> = {
  appetizers: "Закуски",
  snacks: "Снеки",
  "hot-dogs": "Hot Dogs",
  burgers: "Бургеры",
  grill: "Гриль",
  combos: "Комбо наборы",
  kids: "Детские комбо",
};

const CATEGORY_ORDER = [
  "hot-dogs",
  "burgers",
  "grill",
  "appetizers",
  "snacks",
  "combos",
  "kids",
] as const;

function formatVnd(price: number | null | undefined): string {
  if (price == null) return "—";
  const vnd = Number(price) || 0;
  if (vnd >= 1000) {
    const k = Math.round(vnd / 1000);
    return `${k.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}.000`;
  }
  return vnd.toString();
}

function displayFoodName(item: PosterFoodMenuItem): string {
  if (item.category === "hot-dogs" && !item.name.toLowerCase().includes("hot dog")) {
    return `Hot Dog ${item.name}`;
  }
  return item.name;
}

function formatItemPrice(item: PosterFoodMenuItem): string {
  if (item.priceMin != null && item.priceMax != null) {
    if (item.priceMin === item.priceMax) return formatVnd(item.priceMin);
    return `${formatVnd(item.priceMin)} – ${formatVnd(item.priceMax)}`;
  }
  return formatVnd(item.price);
}

export function PosterTestFoodMenu() {
  const [items, setItems] = useState<PosterFoodMenuItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [detailItem, setDetailItem] = useState<PosterFoodMenuItem | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/poster-test/menu?venue=food", { cache: "no-store" });
        const data = await response.json();
        if (cancelled) return;

        if (!data.success) {
          setLoadError(data.errorText ?? data.error ?? "Failed to load Poster menu");
          setItems([]);
          return;
        }

        setItems(Array.isArray(data.items) ? data.items : []);
        setLoadError(null);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : String(err));
          setItems([]);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const categories = useMemo(
    () => [
      { id: "all", label: "Все" },
      ...CATEGORY_ORDER.filter((id) => items.some((item) => item.category === id)).map(
        (id) => ({ id, label: CATEGORY_LABELS[id] ?? id }),
      ),
    ],
    [items],
  );

  const visibleItems = useMemo(() => {
    if (activeCategory === "all") return items;
    return items.filter((item) => item.category === activeCategory);
  }, [activeCategory, items]);

  return (
    <>
      <link rel="stylesheet" href="/food/styles.css?v=poster-test" />

      <header
        className="site-header"
        style={{
          marginTop: `calc(${POSTER_TEST_BANNER_HEIGHT_PX}px + env(safe-area-inset-top, 0px))`,
        }}
      >
        <div className="header-inner">
          <div className="header-logo">
            <img
              src="/food/menu/GASTROFOOD.png"
              alt="GASTROFOOD"
              className="header-logo__img"
              width={220}
              height={76}
              draggable={false}
            />
          </div>
        </div>
      </header>

      <div className="category-tabs-wrap">
        <div className="category-tabs-wrap__inner">
          <div className="category-tabs" role="tablist" aria-label="Категории меню">
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                role="tab"
                aria-selected={activeCategory === category.id}
                className={`category-tab${activeCategory === category.id ? " is-active" : ""}`}
                onClick={() => setActiveCategory(category.id)}
              >
                {category.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <main className="app-shell" aria-label="Меню">
        <div className="menu-scroll" id="menu-scroll">
          {loadError ? (
            <div className="menu-empty">
              <p className="menu-empty__text">Не удалось загрузить меню из Poster</p>
              <p className="menu-empty__sub">{loadError}</p>
            </div>
          ) : visibleItems.length === 0 ? (
            <div className="menu-empty">
              <p className="menu-empty__text">Скоро здесь появятся блюда</p>
              <p className="menu-empty__sub">Poster не вернул позиции для этой категории</p>
            </div>
          ) : (
            <div className="menu-list" role="list">
              <div className="menu-list__spacer" aria-hidden="true" />
              {visibleItems.map((item, index) => (
                <article
                  key={item.id}
                  className="menu-card"
                  role="listitem button"
                  tabIndex={0}
                  style={{ animationDelay: `${index * 0.03}s` }}
                  onClick={() => setDetailItem(item)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setDetailItem(item);
                    }
                  }}
                >
                  <div className="menu-card__body">
                    <div className="menu-card__header">
                      <div className="menu-card__header-badge" aria-hidden="true" />
                    </div>
                    <div className="menu-card__content">
                      <h3 className="menu-card__name">{displayFoodName(item)}</h3>
                      {item.grammage ? (
                        <p className="menu-card__grammage">{item.grammage}</p>
                      ) : null}
                      <p className="menu-card__desc">{item.description || ""}</p>
                      <span className="menu-card__price">
                        {formatItemPrice(item)} VND
                      </span>
                    </div>
                  </div>
                  <div
                    className={`menu-card__media${
                      !item.image ? " menu-card__media--no-photo" : ""
                    }`}
                  >
                    {item.image ? (
                      <img src={item.image} alt="" loading="lazy" decoding="async" />
                    ) : (
                      <div className="menu-card__no-image">нет изображения</div>
                    )}
                    <span className="menu-card__open" aria-hidden="true">
                      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M7 17L17 7M17 7H7M17 7v10"
                        />
                      </svg>
                    </span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </main>

      <div
        className={`detail-overlay${detailItem ? "" : " is-hidden"}`}
        aria-hidden={!detailItem}
      >
        {detailItem ? (
          <>
            <button
              type="button"
              className="detail-back"
              aria-label="Назад"
              onClick={() => setDetailItem(null)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="detail-stage">
              <div className="detail-image-wrap">
                {detailItem.image ? (
                  <img src={detailItem.image} alt="" />
                ) : (
                  <div className="detail-no-image">нет изображения</div>
                )}
              </div>
              <div className="detail-info">
                <h2 className="detail-info__title">{displayFoodName(detailItem)}</h2>
                {detailItem.grammage ? (
                  <p className="detail-info__grammage">{detailItem.grammage}</p>
                ) : null}
                <p className="detail-info__desc">{detailItem.description || ""}</p>
                <p className="detail-info__price">{formatItemPrice(detailItem)} VND</p>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}
