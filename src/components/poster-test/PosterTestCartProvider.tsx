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
import { usePathname, useRouter } from "next/navigation";
import { usePosterTestAuth } from "@/components/poster-test/PosterTestAuthProvider";
import type { PosterFoodMenuItem } from "@/lib/poster/mapProducts";
import {
  barUnitPrice,
  cartKey,
  displayFoodName,
  formatVnd,
  selectedCartPrice,
  type CartItem,
  type CheckoutStep,
  type OrderFulfillment,
} from "@/lib/poster/posterTestCartHelpers";
import {
  clearPosterTestCartItems,
  getStoredCustomerName,
  getStoredCustomerPhone,
  loadPosterTestCartItems,
  savePosterTestCartItems,
  setStoredCustomerName,
  setStoredCustomerPhone,
} from "@/lib/poster/posterTestCartStorage";
import { POSTER_TEST_LOGIN_PATH } from "@/lib/posterTestRoutes";
import { useTranslation } from "@/lib/useTranslation";

type PlacedOrderResult = {
  orderId: string;
  posterOrderId: string | null;
  totalVnd: number;
};

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
  addBarItemToCart: (
    item: { id: string; price: string },
    displayName: string,
    options?: { openCart?: boolean },
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
  const { t } = useTranslation();

  const ariaLabel =
    step === "checkout"
      ? t("poster_test_back_to_cart")
      : step === "success"
        ? t("poster_test_to_menu")
        : t("poster_test_to_menu");

  return (
    <button
      type="button"
      className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-white/80"
      aria-label={ariaLabel}
      onClick={step === "cart" ? onClose : onBack}
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
  const { t } = useTranslation();

  if (large) {
    return (
      <div className="poster-test-order-show__item">
        <div className="poster-test-order-show__item-main">
          <span
            className="poster-test-order-show__qty"
            aria-label={t("poster_test_qty_aria").replace("{qty}", String(item.quantity))}
          >
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
            {t("poster_test_remove")}
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
  const router = useRouter();
  const pathname = usePathname() ?? "/poster-test";
  const { user, loading: authLoading } = usePosterTestAuth();
  const { lang, t } = useTranslation();

  const [cartHydrated, setCartHydrated] = useState(false);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState<CheckoutStep>("cart");
  const [orderComment, setOrderComment] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [fulfillment, setFulfillment] = useState<OrderFulfillment>("pickup");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [placedOrder, setPlacedOrder] = useState<PlacedOrderResult | null>(null);

  useEffect(() => {
    setCartItems(loadPosterTestCartItems());
    setCustomerPhone(getStoredCustomerPhone());
    setCustomerName(getStoredCustomerName());
    setCartHydrated(true);
  }, []);

  useEffect(() => {
    if (!cartHydrated) return;
    savePosterTestCartItems(cartItems);
  }, [cartItems, cartHydrated]);

  useEffect(() => {
    if (checkoutStep === "checkout" && user?.name && !customerName.trim()) {
      setCustomerName(user.name);
    }
  }, [checkoutStep, user?.name, customerName]);

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
    setSubmitError(null);
  }, []);

  const closeCart = useCallback(() => {
    setCheckoutOpen(false);
    setCheckoutStep("cart");
    setSubmitError(null);
    if (placedOrder) {
      setPlacedOrder(null);
    }
  }, [placedOrder]);

  const addItemToCart = useCallback(
    (
      item: PosterFoodMenuItem,
      selectedSausageId: string,
      options?: { openCart?: boolean; selectedOptionIds?: string[] },
    ) => {
      const selectedOptionIds = options?.selectedOptionIds ?? [];
      const price = selectedCartPrice(item, selectedSausageId, selectedOptionIds);
      if (price.unitPrice <= 0) {
        return t("poster_test_price_error");
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
            name: displayFoodName(item, lang),
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
    },
    [lang, openCart, t],
  );

  const addBarItemToCart = useCallback(
    (
      item: { id: string; price: string },
      displayName: string,
      options?: { openCart?: boolean },
    ) => {
      const unitPrice = barUnitPrice(item);
      if (unitPrice <= 0) {
        return t("poster_test_price_error");
      }

      const key = item.id;
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
            name: displayName,
            quantity: 1,
            unitPrice,
          },
        ];
      });
      if (options?.openCart !== false) {
        openCart("cart");
      }
      return null;
    },
    [openCart, t],
  );

  const updateCartQuantity = useCallback((key: string, nextQuantity: number) => {
    setCartItems((current) => {
      if (nextQuantity <= 0) return current.filter((item) => item.key !== key);
      return current.map((item) =>
        item.key === key ? { ...item, quantity: Math.min(99, nextQuantity) } : item,
      );
    });
  }, []);

  function beginCheckout() {
    if (cartItems.length === 0) return;
    if (!user && !authLoading) {
      router.push(
        `${POSTER_TEST_LOGIN_PATH}?returnTo=${encodeURIComponent(pathname)}`,
      );
      return;
    }
    setSubmitError(null);
    setCheckoutStep("checkout");
  }

  function handleCheckoutBack() {
    if (checkoutStep === "success") {
      closeCart();
      return;
    }
    if (checkoutStep === "checkout") {
      setCheckoutStep("cart");
      return;
    }
    closeCart();
  }

  async function submitOrder() {
    if (submitting || cartItems.length === 0) return;

    const name = customerName.trim();
    const phone = customerPhone.trim();
    const address = deliveryAddress.trim();

    if (!name || !phone) {
      setSubmitError(t("poster_test_checkout_required"));
      return;
    }
    if (fulfillment === "delivery" && !address) {
      setSubmitError(t("poster_test_delivery_address_required"));
      return;
    }

    setStoredCustomerName(name);
    setStoredCustomerPhone(phone);
    setSubmitting(true);
    setSubmitError(null);

    try {
      const response = await fetch("/api/poster-test/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer: {
            name,
            phone,
            comment: orderComment.trim() || undefined,
            fulfillment,
            deliveryAddress: fulfillment === "delivery" ? address : undefined,
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

      const data = (await response.json()) as {
        success?: boolean;
        message?: string;
        orderId?: string;
        posterOrderId?: string;
        totalVnd?: number;
      };

      if (!response.ok || !data.success || !data.orderId) {
        setSubmitError(data.message ?? t("poster_test_order_error"));
        return;
      }

      setPlacedOrder({
        orderId: data.orderId,
        posterOrderId: data.posterOrderId ?? null,
        totalVnd: Number(data.totalVnd) || cartTotal,
      });
      setCartItems([]);
      clearPosterTestCartItems();
      setOrderComment("");
      setCheckoutStep("success");
    } catch {
      setSubmitError(t("poster_test_order_error"));
    } finally {
      setSubmitting(false);
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
      addBarItemToCart,
      updateCartQuantity,
    }),
    [
      addBarItemToCart,
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

  const modalTitle =
    checkoutStep === "success"
      ? t("poster_test_order_success_title")
      : checkoutStep === "checkout"
        ? t("poster_test_checkout_title")
        : t("poster_test_cart_title");

  const modalSubtitle =
    checkoutStep === "success"
      ? t("poster_test_order_success_subtitle")
      : checkoutStep === "checkout"
        ? t("poster_test_checkout_subtitle")
        : t("poster_test_build_order");

  const displayOrderId =
    placedOrder?.posterOrderId?.trim() ||
    placedOrder?.orderId.slice(0, 8) ||
    "";

  return (
    <PosterTestCartContext.Provider value={contextValue}>
      {children}

      {checkoutOpen ? (
        <div
          className="fixed inset-0 z-[2200] flex items-end justify-center bg-black/80 px-0 pb-0 pt-[env(safe-area-inset-top,0px)] backdrop-blur-sm sm:items-center sm:px-4 sm:py-6"
          role="dialog"
          aria-modal="true"
          aria-label={modalTitle}
          onClick={(event) => {
            if (event.target === event.currentTarget && !submitting) {
              closeCart();
            }
          }}
        >
          <div
            className={[
              "mx-auto flex w-full flex-col overflow-hidden border border-white/10 bg-[#080808] text-white shadow-2xl",
              checkoutStep === "success" || checkoutStep === "checkout"
                ? "max-h-[min(96dvh,calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)))] max-w-lg rounded-t-[28px] sm:max-h-[min(92dvh,calc(100dvh-48px))] sm:rounded-[28px]"
                : "max-h-[min(92dvh,calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)))] max-w-md rounded-t-[28px] sm:max-h-[min(88dvh,calc(100dvh-48px))] sm:rounded-[28px]",
            ].join(" ")}
          >
            <div className="flex items-center gap-3 border-b border-white/10 px-4 py-4">
              <CheckoutBackButton
                step={checkoutStep}
                onBack={handleCheckoutBack}
                onClose={closeCart}
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs uppercase tracking-[0.18em] text-white/45">{modalSubtitle}</p>
                <h2 className="truncate text-lg font-semibold">{modalTitle}</h2>
              </div>
            </div>

            {checkoutStep === "success" && placedOrder ? (
              <>
                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-8 text-center sm:px-6">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 text-3xl">
                    ✓
                  </div>
                  <p className="text-xl font-semibold">
                    {t("poster_test_order_number").replace("{id}", displayOrderId)}
                  </p>
                  <p className="mt-3 text-sm text-white/60">{t("poster_test_order_success_hint")}</p>
                  <p className="mt-2 text-sm text-amber-200">
                    {formatVnd(placedOrder.totalVnd)} VND · {t("poster_test_pay_on_receipt")}
                  </p>
                  <p className="mt-1 text-xs text-white/45">
                    {fulfillment === "delivery"
                      ? t("poster_test_fulfillment_delivery")
                      : t("poster_test_fulfillment_pickup")}
                  </p>
                </div>
                <div className="shrink-0 border-t border-white/10 px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] sm:px-6 sm:pb-4">
                  <button
                    type="button"
                    className="w-full rounded-2xl bg-amber-300 px-5 py-3.5 text-sm font-semibold text-black"
                    onClick={closeCart}
                  >
                    {t("poster_test_done")}
                  </button>
                </div>
              </>
            ) : checkoutStep === "checkout" ? (
              <>
                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
                  <div className="space-y-4">
                    <label className="block">
                      <span className="mb-2 block text-xs uppercase tracking-[0.16em] text-white/45">
                        {t("poster_test_customer_name")}
                      </span>
                      <input
                        type="text"
                        value={customerName}
                        onChange={(event) => setCustomerName(event.target.value)}
                        className="w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm outline-none focus:border-amber-300/60"
                        autoComplete="name"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-xs uppercase tracking-[0.16em] text-white/45">
                        {t("poster_test_customer_phone")}
                      </span>
                      <input
                        type="tel"
                        value={customerPhone}
                        onChange={(event) => setCustomerPhone(event.target.value)}
                        className="w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm outline-none focus:border-amber-300/60"
                        autoComplete="tel"
                      />
                    </label>

                    <div>
                      <span className="mb-2 block text-xs uppercase tracking-[0.16em] text-white/45">
                        {t("poster_test_fulfillment_label")}
                      </span>
                      <div className="grid grid-cols-2 gap-2">
                        {(["pickup", "delivery"] as OrderFulfillment[]).map((option) => (
                          <button
                            key={option}
                            type="button"
                            className={[
                              "rounded-2xl border px-3 py-3 text-sm font-semibold transition",
                              fulfillment === option
                                ? "border-amber-300 bg-amber-300/15 text-amber-100"
                                : "border-white/10 bg-white/[0.04] text-white/70",
                            ].join(" ")}
                            onClick={() => setFulfillment(option)}
                          >
                            {option === "pickup"
                              ? t("poster_test_fulfillment_pickup")
                              : t("poster_test_fulfillment_delivery")}
                          </button>
                        ))}
                      </div>
                    </div>

                    {fulfillment === "delivery" ? (
                      <label className="block">
                        <span className="mb-2 block text-xs uppercase tracking-[0.16em] text-white/45">
                          {t("poster_test_delivery_address")}
                        </span>
                        <textarea
                          value={deliveryAddress}
                          onChange={(event) => setDeliveryAddress(event.target.value)}
                          className="min-h-[80px] w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm outline-none focus:border-amber-300/60"
                          placeholder={t("poster_test_delivery_address_placeholder")}
                        />
                      </label>
                    ) : null}

                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                      <p className="mb-3 text-xs uppercase tracking-[0.16em] text-white/45">
                        {t("poster_test_order_title")}
                      </p>
                      <div className="space-y-2">
                        {cartItems.map((item) => (
                          <CartItemRow key={item.key} item={item} large />
                        ))}
                      </div>
                      {orderComment.trim() ? (
                        <p className="mt-3 text-xs text-white/50">
                          {t("poster_test_comment_label")}: {orderComment.trim()}
                        </p>
                      ) : null}
                    </div>

                    {submitError ? (
                      <p className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                        {submitError}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="shrink-0 border-t border-white/10 px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] sm:px-5 sm:pb-4">
                  <div className="mb-4 flex items-center justify-between">
                    <span className="text-sm text-white/55">{t("food_byo_total")}</span>
                    <span className="text-lg font-semibold">{formatVnd(cartTotal)} VND</span>
                  </div>
                  <p className="mb-3 text-center text-xs text-white/45">{t("poster_test_pay_on_receipt")}</p>
                  <button
                    type="button"
                    className="w-full rounded-2xl bg-amber-300 px-5 py-3.5 text-sm font-semibold text-black disabled:opacity-50"
                    disabled={submitting || authLoading}
                    onClick={() => void submitOrder()}
                  >
                    {submitting ? t("poster_test_submitting") : t("poster_test_place_order")}
                  </button>
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
                      <p>{t("poster_test_cart_empty")}</p>
                      <button
                        type="button"
                        className="rounded-2xl border border-white/15 px-4 py-2 text-sm text-white/80"
                        onClick={closeCart}
                      >
                        {t("poster_test_to_menu")}
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
                          {t("poster_test_order_comment_label")}
                        </span>
                        <textarea
                          value={orderComment}
                          onChange={(event) => setOrderComment(event.target.value)}
                          className="min-h-[88px] w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm outline-none focus:border-amber-300/60"
                          placeholder={t("poster_test_order_comment_placeholder")}
                        />
                      </label>
                    </div>
                  )}
                </div>

                <div className="shrink-0 border-t border-white/10 px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] sm:px-5 sm:pb-4">
                  {cartItems.length > 0 ? (
                    <div className="mb-4 flex items-center justify-between">
                      <span className="text-sm text-white/55">{t("food_byo_total")}</span>
                      <span className="text-lg font-semibold">{formatVnd(cartTotal)} VND</span>
                    </div>
                  ) : null}
                  <button
                    type="button"
                    className="w-full rounded-2xl bg-amber-300 px-5 py-3.5 text-sm font-semibold text-black disabled:opacity-50"
                    disabled={cartItems.length === 0 || authLoading}
                    onClick={beginCheckout}
                  >
                    {user ? t("poster_test_place_order") : t("poster_test_login_to_order")}
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
