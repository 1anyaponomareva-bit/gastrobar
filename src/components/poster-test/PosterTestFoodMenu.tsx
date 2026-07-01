"use client";

import { useEffect, useMemo, useState } from "react";
import type { PosterFoodMenuItem } from "@/lib/poster/mapProducts";
import { usePosterTestCart } from "@/components/poster-test/PosterTestCartProvider";
import { getAssetUrl } from "@/lib/appVersion";
import {
  displayFoodName,
  formatVnd,
  getHotDogSausageOptions,
} from "@/lib/poster/posterTestCartHelpers";

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

function formatItemPrice(item: PosterFoodMenuItem): string {
  if (item.priceMin != null && item.priceMax != null) {
    if (item.priceMin === item.priceMax) return formatVnd(item.priceMin);
    return `${formatVnd(item.priceMin)} – ${formatVnd(item.priceMax)}`;
  }
  return formatVnd(item.price);
}

function formatHotDogListPrice(item: PosterFoodMenuItem): string {
  const options = getHotDogSausageOptions(item);
  if (options.length > 0) {
    const prices = options.map((option) => option.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    if (min === max) return formatVnd(min);
    return `${formatVnd(min)} – ${formatVnd(max)}`;
  }
  return formatItemPrice(item);
}

function hasPickerCardLayout(item: PosterFoodMenuItem): boolean {
  return item.category === "hot-dogs" && getHotDogSausageOptions(item).length > 0;
}

function HotDogSausageListNote({ item }: { item: PosterFoodMenuItem }) {
  const options = getHotDogSausageOptions(item);
  if (options.length === 0) return null;

  return (
    <div className="menu-card__sausage" aria-label="Сосиска на выбор">
      <span className="menu-card__sausage-label">Сосиска на выбор</span>
      <span className="menu-card__sausage-options">
        {options.map((option) => {
          const meta = [option.grammage, `${formatVnd(option.price)} VND`].filter(Boolean).join(" · ");
          return (
            <span key={option.id} className="menu-card__sausage-chip">
              <span className="menu-card__sausage-chip-label">
                {option.shortLabel || option.label}
              </span>
              {meta ? <span className="menu-card__sausage-chip-meta">{meta}</span> : null}
            </span>
          );
        })}
      </span>
    </div>
  );
}

function HitBadge() {
  return (
    <span className="hit-badge" aria-hidden="true">
      <span className="hit-badge__icon">🔥</span>
      <span className="hit-badge__text">Хит</span>
    </span>
  );
}

function HotDogDetailPanel({
  item,
  selectedSausageId,
  onSelectSausage,
}: {
  item: PosterFoodMenuItem;
  selectedSausageId: string;
  onSelectSausage: (id: string) => void;
}) {
  const options = getHotDogSausageOptions(item);
  const hasSausage = options.length > 0;
  const selected =
    options.find((option) => option.id === selectedSausageId) ?? options[0] ?? null;

  const priceLabel = hasSausage
    ? `${formatVnd(selected?.price)} VND`
    : `${formatItemPrice(item)} VND`;

  return (
    <>
      <h2 className="detail-info__title">{displayFoodName(item)}</h2>
      {hasSausage ? (
        <>
          <p className="detail-info__sausage" id="detail-hotdog-sausage-label">
            {selected?.label ?? ""}
          </p>
          <p className="detail-info__grammage" id="detail-hotdog-grammage">
            {selected?.grammage ?? ""}
          </p>
        </>
      ) : item.grammage ? (
        <p className="detail-info__grammage">{item.grammage}</p>
      ) : null}
      <p className="detail-info__desc">{item.description || ""}</p>
      {hasSausage ? (
        <div
          className="detail-sausage-picker"
          id="detail-sausage-picker"
          aria-label="Выберите сосиску"
        >
          <p className="detail-sausage-picker__title">Выберите сосиску</p>
          <div className="detail-sausage-picker__options">
            {options.map((option, index) => {
              const meta = [option.grammage, `${formatVnd(option.price)} VND`]
                .filter(Boolean)
                .join(" · ");
              const active = option.id === (selected?.id ?? "");
              return (
                <button
                  key={option.id}
                  type="button"
                  className={`detail-sausage-option${active ? " is-active" : ""}`}
                  data-sausage={option.id}
                  onClick={() => onSelectSausage(option.id)}
                  aria-pressed={active}
                >
                  <span className="detail-sausage-option__label">
                    {option.shortLabel || option.label}
                  </span>
                  {meta ? <span className="detail-sausage-option__meta">{meta}</span> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      <p className="detail-info__price" id={hasSausage ? "detail-hotdog-price" : "detail-item-price"}>
        {priceLabel}
      </p>
    </>
  );
}

export function PosterTestFoodMenu() {
  const { addItemToCart } = usePosterTestCart();
  const [items, setItems] = useState<PosterFoodMenuItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [detailItem, setDetailItem] = useState<PosterFoodMenuItem | null>(null);
  const [selectedSausageId, setSelectedSausageId] = useState("standard-pork");
  const [addToCartError, setAddToCartError] = useState<string | null>(null);

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

  useEffect(() => {
    if (!detailItem) return;
    const options = getHotDogSausageOptions(detailItem);
    setSelectedSausageId(options[0]?.id ?? "standard-pork");
  }, [detailItem]);

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

  function addDetailItemToCart() {
    if (!detailItem) return;
    const error = addItemToCart(detailItem, selectedSausageId);
    if (error) {
      setAddToCartError(error);
      return;
    }
    setAddToCartError(null);
    setDetailItem(null);
  }

  return (
    <>
      <link rel="stylesheet" href="/food/styles.css?v=poster-test" />

      <header className="site-header">
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
              {visibleItems.map((item, index) => {
                const isHotDogPicker = hasPickerCardLayout(item);
                const priceLabel =
                  item.category === "hot-dogs"
                    ? `${formatHotDogListPrice(item)} VND`
                    : `${formatItemPrice(item)} VND`;

                return (
                  <article
                    key={item.id}
                    className={`menu-card${item.badge === "hit" ? " menu-card--has-hit" : ""}${
                      isHotDogPicker ? " menu-card--hot-dog" : ""
                    }`}
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
                        {item.badge === "hit" ? (
                          <div className="menu-card__header-badge">
                            <HitBadge />
                          </div>
                        ) : (
                          <div className="menu-card__header-badge" aria-hidden="true" />
                        )}
                      </div>
                      <div className="menu-card__content">
                        <h3 className="menu-card__name">{displayFoodName(item)}</h3>
                        {!isHotDogPicker && item.grammage ? (
                          <p className="menu-card__grammage">{item.grammage}</p>
                        ) : null}
                        <p className="menu-card__desc">{item.description || ""}</p>
                        {isHotDogPicker ? <HotDogSausageListNote item={item} /> : null}
                        <span className="menu-card__price">{priceLabel}</span>
                      </div>
                    </div>
                    <div
                      className={`menu-card__media${
                        !item.image ? " menu-card__media--no-photo" : ""
                      }`}
                    >
                      {item.image ? (
                        <img
                          src={getAssetUrl(item.image)}
                          alt=""
                          loading="lazy"
                          decoding="async"
                        />
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
                );
              })}
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
                  <img src={getAssetUrl(detailItem.image)} alt="" />
                ) : (
                  <div className="detail-no-image">нет изображения</div>
                )}
              </div>
              <div className="detail-info">
                <HotDogDetailPanel
                  item={detailItem}
                  selectedSausageId={selectedSausageId}
                  onSelectSausage={setSelectedSausageId}
                />
                <button
                  type="button"
                  className="mt-4 w-full rounded-2xl bg-amber-300 px-5 py-3 text-sm font-semibold text-black shadow-[0_12px_30px_rgba(251,191,36,0.22)] active:scale-[0.99]"
                  onClick={addDetailItemToCart}
                >
                  Добавить в корзину
                </button>
                {addToCartError ? (
                  <p className="mt-3 text-center text-sm text-red-300">{addToCartError}</p>
                ) : null}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}
