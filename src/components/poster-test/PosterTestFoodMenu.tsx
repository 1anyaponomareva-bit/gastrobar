"use client";

import { useEffect, useMemo, useState } from "react";
import type { HotDogSausageOption, PosterFoodMenuItem } from "@/lib/poster/mapProducts";
import { getAssetUrl } from "@/lib/appVersion";
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

const HOT_DOG_LABEL = "Hot Dog";

type CartItem = {
  key: string;
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  selectedSausageId?: string;
  selectedSausageLabel?: string;
};

type CheckoutStep = "cart" | "form" | "success";

type OrderResponse = {
  success: boolean;
  message?: string;
  response?: {
    incoming_order_id?: string;
  };
};

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
  if (item.category === "hot-dogs") {
    if (item.hotDogPrefix === false) return item.name;
    if (!item.name.toLowerCase().includes("hot dog")) {
      return `${HOT_DOG_LABEL} ${item.name}`;
    }
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

function getHotDogSausageOptions(item: PosterFoodMenuItem): HotDogSausageOption[] {
  if (item.hotDogNoSausage) return [];
  return item.sausageOptions ?? [];
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

function cartKey(itemId: string, selectedSausageId?: string): string {
  return selectedSausageId ? `${itemId}:${selectedSausageId}` : itemId;
}

function selectedCartPrice(
  item: PosterFoodMenuItem,
  selectedSausageId: string,
): {
  unitPrice: number;
  selectedSausageId?: string;
  selectedSausageLabel?: string;
} {
  const options = getHotDogSausageOptions(item);
  if (options.length > 0) {
    const selected = options.find((option) => option.id === selectedSausageId) ?? options[0];
    return {
      unitPrice: selected.price,
      selectedSausageId: selected.id,
      selectedSausageLabel: selected.label,
    };
  }

  return {
    unitPrice: item.price ?? item.priceMin ?? item.priceMax ?? 0,
  };
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
  const [items, setItems] = useState<PosterFoodMenuItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [detailItem, setDetailItem] = useState<PosterFoodMenuItem | null>(null);
  const [selectedSausageId, setSelectedSausageId] = useState("standard-pork");
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState<CheckoutStep>("cart");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerComment, setCustomerComment] = useState("");
  const [fulfillment, setFulfillment] = useState<"pickup" | "table">("pickup");
  const [orderError, setOrderError] = useState<string | null>(null);
  const [orderLoading, setOrderLoading] = useState(false);
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);

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

  const cartTotal = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
    [cartItems],
  );
  const cartCount = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.quantity, 0),
    [cartItems],
  );

  function addDetailItemToCart() {
    if (!detailItem) return;
    const price = selectedCartPrice(detailItem, selectedSausageId);
    if (price.unitPrice <= 0) {
      setOrderError("Для этой позиции не удалось определить цену.");
      return;
    }

    const key = cartKey(detailItem.id, price.selectedSausageId);
    setCartItems((current) => {
      const existing = current.find((item) => item.key === key);
      if (existing) {
        return current.map((item) =>
          item.key === key ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }
      return [
        ...current,
        {
          key,
          id: detailItem.id,
          name: displayFoodName(detailItem),
          quantity: 1,
          unitPrice: price.unitPrice,
          selectedSausageId: price.selectedSausageId,
          selectedSausageLabel: price.selectedSausageLabel,
        },
      ];
    });
    setCheckoutOpen(true);
    setCheckoutStep("cart");
    setDetailItem(null);
  }

  function updateCartQuantity(key: string, nextQuantity: number) {
    setCartItems((current) => {
      if (nextQuantity <= 0) return current.filter((item) => item.key !== key);
      return current.map((item) =>
        item.key === key ? { ...item, quantity: Math.min(99, nextQuantity) } : item,
      );
    });
  }

  async function submitOrder() {
    setOrderError(null);
    if (!customerName.trim()) {
      setOrderError("Введите имя.");
      return;
    }
    if (!customerPhone.trim()) {
      setOrderError("Введите телефон.");
      return;
    }
    if (cartItems.length === 0) {
      setOrderError("Корзина пуста.");
      return;
    }

    setOrderLoading(true);
    try {
      const response = await fetch("/api/poster-test/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer: {
            name: customerName,
            phone: customerPhone,
            comment: customerComment,
            fulfillment,
          },
          items: cartItems.map((item) => ({
            id: item.id,
            quantity: item.quantity,
            selectedSausageId: item.selectedSausageId,
          })),
        }),
      });
      const data = (await response.json()) as OrderResponse;
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Poster вернул ошибку при создании заказа.");
      }

      setCreatedOrderId(data.response?.incoming_order_id ?? null);
      setCheckoutStep("success");
      setCartItems([]);
    } catch (err) {
      setOrderError(err instanceof Error ? err.message : "Не удалось отправить заказ.");
    } finally {
      setOrderLoading(false);
    }
  }

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
              </div>
            </div>
          </>
        ) : null}
      </div>

      {cartCount > 0 ? (
        <button
          type="button"
          className="fixed left-1/2 z-[70] flex w-[min(420px,calc(100vw-32px))] -translate-x-1/2 items-center justify-between rounded-2xl border border-amber-300/30 bg-[#111] px-5 py-3 text-left text-white shadow-[0_18px_50px_rgba(0,0,0,0.65)]"
          style={{ bottom: "calc(92px + env(safe-area-inset-bottom, 0px))" }}
          onClick={() => {
            setCheckoutOpen(true);
            setCheckoutStep("cart");
            setOrderError(null);
          }}
        >
          <span>
            <span className="block text-xs uppercase tracking-[0.18em] text-white/45">Корзина</span>
            <span className="block text-sm font-semibold">{cartCount} поз. · {formatVnd(cartTotal)} VND</span>
          </span>
          <span className="rounded-full bg-amber-300 px-4 py-2 text-sm font-semibold text-black">
            Открыть
          </span>
        </button>
      ) : null}

      {checkoutOpen ? (
        <div className="fixed inset-0 z-[90] bg-black/75 px-4 py-6 backdrop-blur-sm">
          <div className="mx-auto flex h-full max-w-md flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[#080808] text-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-white/45">
                  {checkoutStep === "success" ? "Готово" : checkoutStep === "form" ? "Оформление" : "Ваш заказ"}
                </p>
                <h2 className="text-lg font-semibold">
                  {checkoutStep === "success" ? "Заказ отправлен" : "Корзина"}
                </h2>
              </div>
              <button
                type="button"
                className="rounded-full border border-white/10 px-3 py-2 text-sm text-white/70"
                onClick={() => {
                  setCheckoutOpen(false);
                  setCheckoutStep("cart");
                  setOrderError(null);
                }}
              >
                Закрыть
              </button>
            </div>

            {checkoutStep === "success" ? (
              <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
                <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-400 text-3xl text-black">
                  ✓
                </div>
                <h3 className="text-xl font-semibold">Заказ успешно отправлен.</h3>
                <p className="mt-3 text-sm leading-6 text-white/65">
                  Ваш заказ уже появился у бармена.
                </p>
                {createdOrderId ? (
                  <p className="mt-3 text-xs text-white/40">Poster order ID: {createdOrderId}</p>
                ) : null}
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto px-5 py-4">
                  {cartItems.length === 0 ? (
                    <div className="flex min-h-[220px] items-center justify-center text-center text-sm text-white/55">
                      Корзина пуста. Откройте блюдо и добавьте его в заказ.
                    </div>
                  ) : checkoutStep === "cart" ? (
                    <div className="space-y-3">
                      {cartItems.map((item) => (
                        <div key={item.key} className="rounded-2xl bg-white/[0.06] p-4">
                          <div className="flex gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold">{item.name}</p>
                              {item.selectedSausageLabel ? (
                                <p className="mt-1 text-xs text-white/50">{item.selectedSausageLabel}</p>
                              ) : null}
                              <p className="mt-2 text-sm text-amber-200">{formatVnd(item.unitPrice)} VND</p>
                            </div>
                            <button
                              type="button"
                              className="h-8 rounded-full px-2 text-xs text-white/45"
                              onClick={() => updateCartQuantity(item.key, 0)}
                            >
                              Удалить
                            </button>
                          </div>
                          <div className="mt-3 flex items-center justify-between">
                            <div className="flex items-center rounded-full border border-white/10">
                              <button
                                type="button"
                                className="h-9 w-10 text-lg text-white/75"
                                onClick={() => updateCartQuantity(item.key, item.quantity - 1)}
                              >
                                −
                              </button>
                              <span className="w-9 text-center text-sm">{item.quantity}</span>
                              <button
                                type="button"
                                className="h-9 w-10 text-lg text-white/75"
                                onClick={() => updateCartQuantity(item.key, item.quantity + 1)}
                              >
                                +
                              </button>
                            </div>
                            <span className="text-sm font-semibold">{formatVnd(item.unitPrice * item.quantity)} VND</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <label className="block">
                        <span className="mb-2 block text-xs uppercase tracking-[0.16em] text-white/45">Имя</span>
                        <input
                          value={customerName}
                          onChange={(event) => setCustomerName(event.target.value)}
                          className="w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm outline-none focus:border-amber-300/60"
                          placeholder="Ваше имя"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-2 block text-xs uppercase tracking-[0.16em] text-white/45">Телефон</span>
                        <input
                          value={customerPhone}
                          onChange={(event) => setCustomerPhone(event.target.value)}
                          className="w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm outline-none focus:border-amber-300/60"
                          placeholder="+84..."
                          inputMode="tel"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-2 block text-xs uppercase tracking-[0.16em] text-white/45">Комментарий</span>
                        <textarea
                          value={customerComment}
                          onChange={(event) => setCustomerComment(event.target.value)}
                          className="min-h-[96px] w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm outline-none focus:border-amber-300/60"
                          placeholder="Например: без лука, заберу через 20 минут"
                        />
                      </label>
                      <div>
                        <span className="mb-2 block text-xs uppercase tracking-[0.16em] text-white/45">Способ получения</span>
                        <div className="grid gap-2">
                          <label className="flex items-center gap-3 rounded-2xl border border-amber-300/40 bg-amber-300/10 px-4 py-3 text-sm">
                            <input
                              type="radio"
                              checked={fulfillment === "pickup"}
                              onChange={() => setFulfillment("pickup")}
                            />
                            Самовывоз
                          </label>
                          <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/40">
                            <input type="radio" disabled />
                            За столик (скоро)
                          </label>
                          <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/40">
                            <input type="radio" disabled />
                            Доставка (пока отключено)
                          </label>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="border-t border-white/10 px-5 py-4">
                  {orderError ? (
                    <p className="mb-3 rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                      {orderError}
                    </p>
                  ) : null}
                  <div className="mb-4 flex items-center justify-between">
                    <span className="text-sm text-white/55">Итого</span>
                    <span className="text-lg font-semibold">{formatVnd(cartTotal)} VND</span>
                  </div>
                  {checkoutStep === "cart" ? (
                    <button
                      type="button"
                      className="w-full rounded-2xl bg-amber-300 px-5 py-3 text-sm font-semibold text-black disabled:opacity-50"
                      disabled={cartItems.length === 0}
                      onClick={() => {
                        setCheckoutStep("form");
                        setOrderError(null);
                      }}
                    >
                      Оформить заказ
                    </button>
                  ) : (
                    <div className="grid grid-cols-[0.8fr_1.2fr] gap-3">
                      <button
                        type="button"
                        className="rounded-2xl border border-white/10 px-5 py-3 text-sm font-semibold text-white/75"
                        onClick={() => setCheckoutStep("cart")}
                        disabled={orderLoading}
                      >
                        Назад
                      </button>
                      <button
                        type="button"
                        className="rounded-2xl bg-amber-300 px-5 py-3 text-sm font-semibold text-black disabled:opacity-50"
                        onClick={submitOrder}
                        disabled={orderLoading || cartItems.length === 0}
                      >
                        {orderLoading ? "Отправляем..." : "Подтвердить"}
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
