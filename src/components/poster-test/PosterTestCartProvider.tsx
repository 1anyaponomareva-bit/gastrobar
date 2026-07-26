"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { PosterFoodMenuItem } from "@/lib/poster/mapProducts";
import {
  cartKey,
  displayFoodName,
  formatVnd,
  selectedCartPrice,
  type CartItem,
  type CheckoutStep,
} from "@/lib/poster/posterTestCartHelpers";

type PosterTestCartContextValue = {
  cartItems: CartItem[];
  cartCount: number;
  cartTotal: number;
  checkoutOpen: boolean;
  checkoutStep: CheckoutStep;
  openCart: (step?: CheckoutStep) => void;
  closeCart: () => void;
  addItemToCart: (
    item: PosterFoodMenuItem,
    selectedSausageId: string,
    options?: { openCart?: boolean; selectedOptionIds?: string[] },
  ) => string | null;
  updateCartQuantity: (key: string, nextQuantity: number) => void;
};

const PosterTestCartContext = createContext<PosterTestCartContextValue | null>(null);

export function usePosterTestCart(): PosterTestCartContextValue {
  const value = useContext(PosterTestCartContext);
  if (!value) {
    throw new Error("usePosterTestCart must be used within PosterTestCartProvider");
  }
  return value;
}

function CheckoutBackButton({
  step,
  onBack,
  onClose,
}: {
  step: CheckoutStep;
  onBack: () => void;
  onClose: () => void;
}) {
  return (
    <button
      type="button"
      className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-white/80"
      aria-label={step === "show" ? "Назад к корзине" : "К меню"}
      onClick={step === "show" ? onBack : onClose}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
      </svg>
    </button>
  );
}

function CartItemRow({
  item,
  onUpdateQuantity,
  large = false,
}: {
  item: CartItem;
  onUpdateQuantity?: (key: string, nextQuantity: number) => void;
  large?: boolean;
}) {
  if (large) {
    return (
      <div className="poster-test-order-show__item">
        <div className="poster-test-order-show__item-main">
          <span className="poster-test-order-show__qty" aria-label={`Количество: ${item.quantity}`}>
            {item.quantity}×
          </span>
          <div className="min-w-0 flex-1">
            <p className="poster-test-order-show__name">{item.name}</p>
            {item.selectedSausageLabel ? (
              <p className="poster-test-order-show__modifier">{item.selectedSausageLabel}</p>
            ) : null}
            {item.selectedOptionLabels?.map((label) => (
              <p key={label} className="poster-test-order-show__modifier">
                + {label}
              </p>
            ))}
          </div>
          <span className="poster-test-order-show__line-total">
            {formatVnd(item.unitPrice * item.quantity)} VND
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white/[0.06] p-4">
      <div className="flex gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{item.name}</p>
          {item.selectedSausageLabel ? (
            <p className="mt-1 text-xs text-white/50">{item.selectedSausageLabel}</p>
          ) : null}
          {item.selectedOptionLabels?.length ? (
            <p className="mt-1 text-xs text-white/50">+ {item.selectedOptionLabels.join(", ")}</p>
          ) : null}
          <p className="mt-2 text-sm text-amber-200">{formatVnd(item.unitPrice)} VND</p>
        </div>
        {onUpdateQuantity ? (
          <button
            type="button"
            className="h-8 rounded-full px-2 text-xs text-white/45"
            onClick={() => onUpdateQuantity(item.key, 0)}
          >
            Удалить
          </button>
        ) : null}
      </div>
      {onUpdateQuantity ? (
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center rounded-full border border-white/10">
            <button
              type="button"
              className="h-9 w-10 text-lg text-white/75"
              onClick={() => onUpdateQuantity(item.key, item.quantity - 1)}
            >
              −
            </button>
            <span className="w-9 text-center text-sm">{item.quantity}</span>
            <button
              type="button"
              className="h-9 w-10 text-lg text-white/75"
              onClick={() => onUpdateQuantity(item.key, item.quantity + 1)}
            >
              +
            </button>
          </div>
          <span className="text-sm font-semibold">
            {formatVnd(item.unitPrice * item.quantity)} VND
          </span>
        </div>
      ) : null}
    </div>
  );
}

export function PosterTestCartProvider({ children }: { children: ReactNode }) {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState<CheckoutStep>("cart");
  const [orderComment, setOrderComment] = useState("");

  const cartTotal = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
    [cartItems],
  );
  const cartCount = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.quantity, 0),
    [cartItems],
  );

  const openCart = useCallback((step: CheckoutStep = "cart") => {
    setCheckoutOpen(true);
    setCheckoutStep(step);
  }, []);

  const closeCart = useCallback(() => {
    setCheckoutOpen(false);
    setCheckoutStep("cart");
  }, []);

  const addItemToCart = useCallback((item: PosterFoodMenuItem, selectedSausageId: string, options?: { openCart?: boolean; selectedOptionIds?: string[] }) => {
    const selectedOptionIds = options?.selectedOptionIds ?? [];
    const price = selectedCartPrice(item, selectedSausageId, selectedOptionIds);
    if (price.unitPrice <= 0) {
      return "Для этой позиции не удалось определить цену.";
    }

    const key = cartKey(item.id, price.selectedSausageId, selectedOptionIds);
    setCartItems((current) => {
      const existing = current.find((entry) => entry.key === key);
      if (existing) {
        return current.map((entry) =>
          entry.key === key ? { ...entry, quantity: entry.quantity + 1 } : entry,
        );
      }
      return [
        ...current,
        {
          key,
          id: item.id,
          name: displayFoodName(item),
          quantity: 1,
          unitPrice: price.unitPrice,
          selectedSausageId: price.selectedSausageId,
          selectedSausageLabel: price.selectedSausageLabel,
          selectedOptionIds: price.selectedOptionIds,
          selectedOptionLabels: price.selectedOptionLabels,
        },
      ];
    });
    if (options?.openCart !== false) {
      openCart("cart");
    }
    return null;
  }, [openCart]);

  const updateCartQuantity = useCallback((key: string, nextQuantity: number) => {
    setCartItems((current) => {
      if (nextQuantity <= 0) return current.filter((item) => item.key !== key);
      return current.map((item) =>
        item.key === key ? { ...item, quantity: Math.min(99, nextQuantity) } : item,
      );
    });
  }, []);

  function showToBartender() {
    if (cartItems.length === 0) return;
    setCheckoutStep("show");
  }

  function handleCheckoutBack() {
    if (checkoutStep === "show") {
      setCheckoutStep("cart");
      return;
    }
    closeCart();
  }

  const contextValue = useMemo(
    () => ({
      cartItems,
      cartCount,
      cartTotal,
      checkoutOpen,
      checkoutStep,
      openCart,
      closeCart,
      addItemToCart,
      updateCartQuantity,
    }),
    [
      addItemToCart,
      cartCount,
      cartItems,
      cartTotal,
      checkoutOpen,
      checkoutStep,
      closeCart,
      openCart,
      updateCartQuantity,
    ],
  );

  const trimmedComment = orderComment.trim();

  return (
    <PosterTestCartContext.Provider value={contextValue}>
      {children}

      {checkoutOpen ? (
        <div
          className="fixed inset-0 z-[2200] flex items-end justify-center bg-black/80 px-0 pb-0 pt-[env(safe-area-inset-top,0px)] backdrop-blur-sm sm:items-center sm:px-4 sm:py-6"
          role="dialog"
          aria-modal="true"
          aria-label={checkoutStep === "show" ? "Ваш заказ" : "Корзина"}
          onClick={(event) => {
            if (event.target === event.currentTarget) closeCart();
          }}
        >
          <div
            className={[
              "mx-auto flex w-full flex-col overflow-hidden border border-white/10 bg-[#080808] text-white shadow-2xl",
              checkoutStep === "show"
                ? "max-h-[min(96dvh,calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)))] max-w-lg rounded-t-[28px] sm:max-h-[min(92dvh,calc(100dvh-48px))] sm:rounded-[28px]"
                : "max-h-[min(92dvh,calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)))] max-w-md rounded-t-[28px] sm:max-h-[min(88dvh,calc(100dvh-48px))] sm:rounded-[28px]",
            ].join(" ")}
          >
            <div className="flex items-center gap-3 border-b border-white/10 px-4 py-4">
              <CheckoutBackButton step={checkoutStep} onBack={handleCheckoutBack} onClose={closeCart} />
              <div className="min-w-0 flex-1">
                <p className="text-xs uppercase tracking-[0.18em] text-white/45">
                  {checkoutStep === "show" ? "Для бармена" : "Соберите заказ"}
                </p>
                <h2 className="truncate text-lg font-semibold">
                  {checkoutStep === "show" ? "Ваш заказ" : "Корзина"}
                </h2>
              </div>
            </div>

            {checkoutStep === "show" ? (
              <>
                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
                  <p className="poster-test-order-show__hint">
                    Покажите этот экран бармену — он оформит заказ и примет оплату на месте.
                  </p>
                  <div className="poster-test-order-show__list">
                    {cartItems.map((item) => (
                      <CartItemRow key={item.key} item={item} large />
                    ))}
                  </div>
                  {trimmedComment ? (
                    <div className="poster-test-order-show__comment">
                      <p className="poster-test-order-show__comment-label">Комментарий</p>
                      <p className="poster-test-order-show__comment-text">{trimmedComment}</p>
                    </div>
                  ) : null}
                </div>
                <div className="shrink-0 border-t border-white/10 px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] sm:px-6 sm:pb-4">
                  <div className="poster-test-order-show__total-row">
                    <span>Итого</span>
                    <span className="poster-test-order-show__total">{formatVnd(cartTotal)} VND</span>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      className="rounded-2xl border border-white/10 px-5 py-3.5 text-sm font-semibold text-white/75"
                      onClick={() => setCheckoutStep("cart")}
                    >
                      Изменить
                    </button>
                    <button
                      type="button"
                      className="rounded-2xl bg-amber-300 px-5 py-3.5 text-sm font-semibold text-black"
                      onClick={closeCart}
                    >
                      Готово
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
                  {cartItems.length === 0 ? (
                    <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 text-center text-sm text-white/55">
                      <span className="text-3xl" aria-hidden="true">
                        🛒
                      </span>
                      <p>Корзина пуста. Выберите блюда в меню и покажите заказ бармену.</p>
                      <button
                        type="button"
                        className="rounded-2xl border border-white/15 px-4 py-2 text-sm text-white/80"
                        onClick={closeCart}
                      >
                        К меню
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {cartItems.map((item) => (
                        <CartItemRow
                          key={item.key}
                          item={item}
                          onUpdateQuantity={updateCartQuantity}
                        />
                      ))}
                      <label className="mt-2 block">
                        <span className="mb-2 block text-xs uppercase tracking-[0.16em] text-white/45">
                          Комментарий к заказу
                        </span>
                        <textarea
                          value={orderComment}
                          onChange={(event) => setOrderComment(event.target.value)}
                          className="min-h-[88px] w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm outline-none focus:border-amber-300/60"
                          placeholder="Например: без лука, острое"
                        />
                      </label>
                    </div>
                  )}
                </div>

                <div className="shrink-0 border-t border-white/10 px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] sm:px-5 sm:pb-4">
                  {cartItems.length > 0 ? (
                    <div className="mb-4 flex items-center justify-between">
                      <span className="text-sm text-white/55">Итого</span>
                      <span className="text-lg font-semibold">{formatVnd(cartTotal)} VND</span>
                    </div>
                  ) : null}
                  <button
                    type="button"
                    className="w-full rounded-2xl bg-amber-300 px-5 py-3.5 text-sm font-semibold text-black disabled:opacity-50"
                    disabled={cartItems.length === 0}
                    onClick={showToBartender}
                  >
                    Показать бармену
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </PosterTestCartContext.Provider>
  );
}
