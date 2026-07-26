"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { PosterFoodMenuItem } from "@/lib/poster/mapProducts";
import { usePosterTestCart } from "@/components/poster-test/PosterTestCartProvider";
import { getAssetUrl } from "@/lib/appVersion";
import {
  cartKey,
  displayFoodName,
  formatVnd,
  getHotDogSausageOptions,
  selectedCartPrice,
} from "@/lib/poster/posterTestCartHelpers";
import {
  BUILD_YOUR_OWN_HOT_DOG_BASE_PRICE,
  HOT_DOG_SAUCES,
  HOT_DOG_TOPPINGS,
  isBuildYourOwnHotDog,
} from "@/lib/poster/buildYourOwnHotDog";
import { BuildYourOwnHotDogBuilder } from "@/components/poster-test/BuildYourOwnHotDogBuilder";

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
  if (isBuildYourOwnHotDog(item.id)) {
    return formatVnd(BUILD_YOUR_OWN_HOT_DOG_BASE_PRICE);
  }
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

function hasSausageModifierPicker(item: PosterFoodMenuItem): boolean {
  if (isBuildYourOwnHotDog(item.id)) return false;
  return getHotDogSausageOptions(item).length > 0;
}

function needsDetailBuilder(item: PosterFoodMenuItem): boolean {
  return isBuildYourOwnHotDog(item.id) || getHotDogSausageOptions(item).length > 0;
}

function hasPickerCardLayout(item: PosterFoodMenuItem): boolean {
  return item.category === "hot-dogs" && hasSausageModifierPicker(item);
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

function MenuCardCartControl({
  item,
  quantity,
  canAdd,
  opensPicker,
  onAdd,
  onDecrease,
}: {
  item: PosterFoodMenuItem;
  quantity: number;
  canAdd: boolean;
  opensPicker?: boolean;
  onAdd: () => void;
  onDecrease: () => void;
}) {
  const label = displayFoodName(item);
  const expanded = quantity > 0;
  const addLabel = opensPicker
    ? `Выбрать сосиску для ${label}`
    : `Добавить ${label} в корзину`;

  return (
    <div
      className={`menu-card__cart-control${expanded ? " menu-card__cart-control--expanded" : ""}`}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <div
        key={expanded ? "qty" : "add"}
        className="menu-card__cart-control-view"
      >
        {expanded ? (
          <div className="menu-card__cart-qty" role="group" aria-label={`Количество: ${label}`}>
            <button
              type="button"
              className="menu-card__cart-qty-btn"
              aria-label={`Уменьшить количество ${label}`}
              onClick={onDecrease}
            >
              −
            </button>
            <span className="menu-card__cart-qty-value" aria-live="polite">
              {quantity}
            </span>
            <button
              type="button"
              className="menu-card__cart-qty-btn menu-card__cart-qty-btn--plus"
              aria-label={`Добавить ещё ${label}`}
              onClick={onAdd}
              disabled={!canAdd}
            >
              +
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="menu-card__cart-btn"
            aria-label={addLabel}
            onClick={onAdd}
            disabled={!canAdd}
          >
            +
          </button>
        )}
      </div>
    </div>
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

  const selectedPrice = selectedCartPrice(item, selectedSausageId);
  const priceLabel = `${formatVnd(selectedPrice.unitPrice)} VND`;

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
            {options.map((option) => {
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
  const { addItemToCart, cartItems, updateCartQuantity } = usePosterTestCart();
  const [items, setItems] = useState<PosterFoodMenuItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [detailItem, setDetailItem] = useState<PosterFoodMenuItem | null>(null);
  const [selectedSausageId, setSelectedSausageId] = useState("standard-pork");
  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>([]);
  const [addToCartError, setAddToCartError] = useState<string | null>(null);
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => {
    setPortalReady(true);
  }, []);

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
    setSelectedOptionIds([]);
    setAddToCartError(null);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
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

  function quickSausageId(item: PosterFoodMenuItem): string {
    return getHotDogSausageOptions(item)[0]?.id ?? "standard-pork";
  }

  function quickCartKey(item: PosterFoodMenuItem): string {
    const price = selectedCartPrice(item, quickSausageId(item));
    return cartKey(item.id, price.selectedSausageId);
  }

  function quickCartQuantity(item: PosterFoodMenuItem): number {
    const key = quickCartKey(item);
    return cartItems.find((cartItem) => cartItem.key === key)?.quantity ?? 0;
  }

  function addDetailItemToCart() {
    if (!detailItem) return;
    const error = addItemToCart(detailItem, selectedSausageId, { selectedOptionIds });
    if (error) {
      setAddToCartError(error);
      return;
    }
    setAddToCartError(null);
    setDetailItem(null);
  }

  function toggleBuildYourOwnOption(id: string, group: "toppings" | "sauces") {
    const groupOptions = group === "toppings" ? HOT_DOG_TOPPINGS : HOT_DOG_SAUCES;
    const max = group === "toppings" ? 3 : 5;
    setSelectedOptionIds((current) => {
      if (current.includes(id)) return current.filter((optionId) => optionId !== id);
      const selectedInGroup = groupOptions.filter((option) => current.includes(option.id)).length;
      if (selectedInGroup >= max) return current;
      return [...current, id];
    });
  }

  return (
    <>
      <link rel="stylesheet" href="/food/styles.css?v=byo-fix-20260726" />

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
                const opensDetail = needsDetailBuilder(item);
                const priceLabel =
                  item.category === "hot-dogs"
                    ? `${formatHotDogListPrice(item)} VND`
                    : `${formatItemPrice(item)} VND`;
                const quickKey = quickCartKey(item);
                const quickQuantity = opensDetail ? 0 : quickCartQuantity(item);
                const quickPrice = selectedCartPrice(item, quickSausageId(item));
                const canQuickAdd = quickPrice.unitPrice > 0;

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
                        {!isHotDogPicker && !isBuildYourOwnHotDog(item.id) && item.grammage ? (
                          <p className="menu-card__grammage">{item.grammage}</p>
                        ) : null}
                        {isBuildYourOwnHotDog(item.id) ? (
                          <p className="menu-card__desc menu-card__desc--cta">
                            Нажми на карточку и собери свой Hot Dog: сосиска, добавки и соусы
                          </p>
                        ) : (
                          <p className="menu-card__desc">{item.description || ""}</p>
                        )}
                        {hasSausageModifierPicker(item) ? <HotDogSausageListNote item={item} /> : null}
                        <div className="menu-card__price-row">
                          <div className="menu-card__price-action">
                            <span className="menu-card__price">{priceLabel}</span>
                            <MenuCardCartControl
                              item={item}
                              quantity={quickQuantity}
                              canAdd={canQuickAdd}
                              opensPicker={opensDetail}
                              onAdd={() => {
                                if (opensDetail) {
                                  setDetailItem(item);
                                  return;
                                }
                                if (canQuickAdd) {
                                  addItemToCart(item, quickSausageId(item), { openCart: false });
                                }
                              }}
                              onDecrease={() => updateCartQuantity(quickKey, quickQuantity - 1)}
                            />
                          </div>
                        </div>
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

      {portalReady &&
      detailItem &&
      isBuildYourOwnHotDog(detailItem.id)
        ? createPortal(
            <BuildYourOwnHotDogBuilder
              item={detailItem}
              selectedSausageId={selectedSausageId}
              selectedOptionIds={selectedOptionIds}
              addToCartError={addToCartError}
              onSelectSausage={setSelectedSausageId}
              onToggleOption={toggleBuildYourOwnOption}
              onAddToCart={addDetailItemToCart}
              onClose={() => setDetailItem(null)}
            />,
            document.body,
          )
        : null}

      <div
        className={`detail-overlay${
          detailItem && !isBuildYourOwnHotDog(detailItem.id) ? "" : " is-hidden"
        }`}
        aria-hidden={!detailItem || isBuildYourOwnHotDog(detailItem.id)}
      >
        {detailItem && !isBuildYourOwnHotDog(detailItem.id) ? (
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
            <div className="detail-stage poster-test-detail-stage">
              <div className="detail-image-wrap poster-test-detail-image-wrap">
                {detailItem.image ? (
                  <img src={getAssetUrl(detailItem.image)} alt="" />
                ) : (
                  <div className="detail-no-image">нет изображения</div>
                )}
              </div>
              <div className="poster-test-detail-panel">
                <div className="detail-info poster-test-detail-info">
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
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}
