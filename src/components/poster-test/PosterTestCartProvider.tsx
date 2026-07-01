"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { PosterTestLoginScreen } from "@/components/poster-test/PosterTestLoginScreen";
import { usePosterTestAuth } from "@/components/poster-test/PosterTestAuthProvider";
import type { PosterFoodMenuItem } from "@/lib/poster/mapProducts";
import {
  cartKey,
  displayFoodName,
  formatVnd,
  selectedCartPrice,
  type CartItem,
  type CheckoutStep,
} from "@/lib/poster/posterTestCartHelpers";

type OrderResponse = {
  success: boolean;
  message?: string;
  orderId?: string;
  response?: {
    incoming_order_id?: string | null;
  };
};

type PosterTestCartContextValue = {
  cartItems: CartItem[];
  cartCount: number;
  cartTotal: number;
  checkoutOpen: boolean;
  checkoutStep: CheckoutStep;
  openCart: (step?: CheckoutStep) => void;
  closeCart: () => void;
  addItemToCart: (item: PosterFoodMenuItem, selectedSausageId: string) => string | null;
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
  if (step === "success") {
    return (
      <button
        type="button"
        className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-white/80"
        aria-label="Закрыть"
        onClick={onClose}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    );
  }

  return (
    <button
      type="button"
      className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-white/80"
      aria-label={step === "form" ? "Назад к корзине" : "К меню"}
      onClick={onBack}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
      </svg>
    </button>
  );
}

export function PosterTestCartProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading, refreshSession } = usePosterTestAuth();
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
    if (!user?.name || customerName.trim()) return;
    setCustomerName(user.name);
  }, [customerName, user?.name]);

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
    setOrderError(null);
  }, []);

  const closeCart = useCallback(() => {
    setCheckoutOpen(false);
    setCheckoutStep("cart");
    setOrderError(null);
  }, []);

  useEffect(() => {
    if (authLoading) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") !== "form") return;
    setCheckoutOpen(true);
    setCheckoutStep(user ? "form" : "auth");
    setOrderError(null);
  }, [authLoading, user]);

  const addItemToCart = useCallback((item: PosterFoodMenuItem, selectedSausageId: string) => {
    const price = selectedCartPrice(item, selectedSausageId);
    if (price.unitPrice <= 0) {
      return "Для этой позиции не удалось определить цену.";
    }

    const key = cartKey(item.id, price.selectedSausageId);
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
        },
      ];
    });
    openCart("cart");
    return null;
  }, [openCart]);

  function updateCartQuantity(key: string, nextQuantity: number) {
    setCartItems((current) => {
      if (nextQuantity <= 0) return current.filter((item) => item.key !== key);
      return current.map((item) =>
        item.key === key ? { ...item, quantity: Math.min(99, nextQuantity) } : item,
      );
    });
  }

  function handleCheckoutBack() {
    if (checkoutStep === "form") {
      setCheckoutStep("cart");
      setOrderError(null);
      return;
    }
    if (checkoutStep === "auth") {
      setCheckoutStep("cart");
      setOrderError(null);
      return;
    }
    closeCart();
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
            name: item.name,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            selectedSausageId: item.selectedSausageId,
            selectedSausageLabel: item.selectedSausageLabel,
          })),
        }),
      });
      const data = (await response.json()) as OrderResponse;
      if (!response.ok || !data.success) {
        if (response.status === 401) {
          setCheckoutStep("auth");
        }
        throw new Error(data.message || "Не удалось оформить заказ.");
      }

      setCreatedOrderId(data.orderId ?? data.response?.incoming_order_id ?? null);
      setCheckoutStep("success");
      setCartItems([]);
    } catch (err) {
      setOrderError(err instanceof Error ? err.message : "Не удалось отправить заказ.");
    } finally {
      setOrderLoading(false);
    }
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
    }),
    [addItemToCart, cartCount, cartItems, cartTotal, checkoutOpen, checkoutStep, closeCart, openCart],
  );

  return (
    <PosterTestCartContext.Provider value={contextValue}>
      {children}

      {checkoutOpen ? (
        <div
          className="fixed inset-0 z-[2200] flex items-end justify-center bg-black/80 px-0 pb-0 pt-[calc(28px+env(safe-area-inset-top,0px))] backdrop-blur-sm sm:items-center sm:px-4 sm:py-6"
          role="dialog"
          aria-modal="true"
          aria-label="Корзина"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeCart();
          }}
        >
          <div className="mx-auto flex max-h-[min(92dvh,calc(100dvh-28px-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)))] w-full max-w-md flex-col overflow-hidden rounded-t-[28px] border border-white/10 bg-[#080808] text-white shadow-2xl sm:max-h-[min(88dvh,calc(100dvh-48px))] sm:rounded-[28px]">
            <div className="flex items-center gap-3 border-b border-white/10 px-4 py-4">
              <CheckoutBackButton step={checkoutStep} onBack={handleCheckoutBack} onClose={closeCart} />
              <div className="min-w-0 flex-1">
                <p className="text-xs uppercase tracking-[0.18em] text-white/45">
                  {checkoutStep === "success"
                    ? "Готово"
                    : checkoutStep === "auth"
                      ? "Вход"
                    : checkoutStep === "form"
                      ? "Оформление"
                      : "Ваш заказ"}
                </p>
                <h2 className="truncate text-lg font-semibold">
                  {checkoutStep === "success"
                    ? "Заказ принят"
                    : checkoutStep === "auth"
                      ? "Войдите в аккаунт"
                    : checkoutStep === "form"
                      ? "Оформить заказ"
                      : "Корзина"}
                </h2>
              </div>
            </div>

            {checkoutStep === "success" ? (
              <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
                <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-400 text-3xl text-black">
                  ✓
                </div>
                <h3 className="text-xl font-semibold">Заказ принят</h3>
                <p className="mt-3 text-sm leading-6 text-white/65">
                  Заказ сохранён в вашем кабинете. Отправка в Poster будет подключена на следующем этапе.
                </p>
                {createdOrderId ? (
                  <p className="mt-3 text-xs text-white/40">Order ID: {createdOrderId}</p>
                ) : null}
                <button
                  type="button"
                  className="mt-8 w-full rounded-2xl bg-amber-300 px-5 py-3 text-sm font-semibold text-black"
                  onClick={closeCart}
                >
                  Вернуться в меню
                </button>
              </div>
            ) : (
              <>
                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
                  {cartItems.length === 0 ? (
                    <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 text-center text-sm text-white/55">
                      <span className="text-3xl" aria-hidden="true">
                        🛒
                      </span>
                      <p>Корзина пуста. Откройте блюдо и добавьте его в заказ.</p>
                      <button
                        type="button"
                        className="rounded-2xl border border-white/15 px-4 py-2 text-sm text-white/80"
                        onClick={closeCart}
                      >
                        К меню
                      </button>
                    </div>
                  ) : checkoutStep === "auth" ? (
                    <PosterTestLoginScreen
                      compact
                      returnTo="/poster-test/food?checkout=form"
                      title="Войдите, чтобы оформить заказ"
                      subtitle="Меню доступно без регистрации. Для оформления заказа нужен аккаунт."
                      onSuccess={() => {
                        void refreshSession().then(() => setCheckoutStep("form"));
                      }}
                    />
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
                            <span className="text-sm font-semibold">
                              {formatVnd(item.unitPrice * item.quantity)} VND
                            </span>
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
                        <span className="mb-2 block text-xs uppercase tracking-[0.16em] text-white/45">
                          Способ получения
                        </span>
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

                <div className="shrink-0 border-t border-white/10 px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] sm:px-5 sm:pb-4">
                  {orderError ? (
                    <p className="mb-3 rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                      {orderError}
                    </p>
                  ) : null}
                  {cartItems.length > 0 ? (
                    <div className="mb-4 flex items-center justify-between">
                      <span className="text-sm text-white/55">Итого</span>
                      <span className="text-lg font-semibold">{formatVnd(cartTotal)} VND</span>
                    </div>
                  ) : null}
                  {checkoutStep === "cart" ? (
                    <button
                      type="button"
                      className="w-full rounded-2xl bg-amber-300 px-5 py-3.5 text-sm font-semibold text-black disabled:opacity-50"
                      disabled={cartItems.length === 0}
                      onClick={() => {
                        if (!user) {
                          setCheckoutStep("auth");
                          setOrderError(null);
                          return;
                        }
                        setCheckoutStep("form");
                        setOrderError(null);
                      }}
                    >
                      Оформить заказ
                    </button>
                  ) : checkoutStep === "auth" ? null : cartItems.length > 0 ? (
                    <div className="grid grid-cols-[0.8fr_1.2fr] gap-3">
                      <button
                        type="button"
                        className="rounded-2xl border border-white/10 px-5 py-3.5 text-sm font-semibold text-white/75"
                        onClick={() => setCheckoutStep("cart")}
                        disabled={orderLoading}
                      >
                        Назад
                      </button>
                      <button
                        type="button"
                        className="rounded-2xl bg-amber-300 px-5 py-3.5 text-sm font-semibold text-black disabled:opacity-50"
                        onClick={submitOrder}
                        disabled={orderLoading || cartItems.length === 0}
                      >
                        {orderLoading ? "Отправляем..." : "Подтвердить заказ"}
                      </button>
                    </div>
                  ) : null}
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </PosterTestCartContext.Provider>
  );
}
