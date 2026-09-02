"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePosterTestAuth } from "@/components/poster-test/PosterTestAuthProvider";
import { formatVnd } from "@/lib/poster/posterTestCartHelpers";
import type { PosterTestOrder, PosterTestOrderStatus } from "@/lib/poster-test-auth/types";
import { POSTER_TEST_LOGIN_PATH } from "@/lib/posterTestRoutes";
import { useTranslation } from "@/lib/useTranslation";
import "./poster-test-merchant.css";

type MerchantTab = "new" | "active" | "ready" | "done";

const POLL_MS = 12_000;
const SOUND_STORAGE_KEY = "poster_test_merchant_sound";

function shortOrderId(order: PosterTestOrder): string {
  return order.posterOrderId?.trim() || order.id.slice(0, 8);
}

function formatOrderTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function tabForStatus(status: PosterTestOrderStatus): MerchantTab | null {
  if (status === "pending") return "new";
  if (status === "preparing") return "active";
  if (status === "ready") return "ready";
  if (status === "completed" || status === "cancelled") return "done";
  return null;
}

function playNewOrderSound() {
  try {
    const AudioContextCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;
    const ctx = new AudioContextCtor();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.value = 0.001;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.stop(ctx.currentTime + 0.36);
    window.setTimeout(() => {
      void ctx.close();
    }, 500);
  } catch {
    // ignore autoplay / audio errors
  }
}

export function PosterTestMerchantApp() {
  const { t } = useTranslation();
  const { user, loading, refreshSession } = usePosterTestAuth();
  const [orders, setOrders] = useState<PosterTestOrder[]>([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<MerchantTab>("new");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const knownPendingRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(SOUND_STORAGE_KEY);
      if (stored === "0") setSoundEnabled(false);
    } catch {
      // ignore
    }
  }, []);

  const toggleSound = useCallback(() => {
    setSoundEnabled((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(SOUND_STORAGE_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const loadOrders = useCallback(async () => {
    try {
      const response = await fetch("/api/poster-test/merchant/orders", { cache: "no-store" });
      const data = (await response.json()) as {
        success?: boolean;
        orders?: PosterTestOrder[];
        message?: string;
      };
      if (!response.ok || !data.success) {
        if (response.status === 403) {
          setForbidden(true);
          setOrders([]);
          setError(null);
          return;
        }
        setError(data.message ?? t("poster_test_merchant_load_error"));
        setOrders([]);
        return;
      }
      setForbidden(false);
      const nextOrders = Array.isArray(data.orders) ? data.orders : [];
      setError(null);
      setOrders(nextOrders);

      const pendingIds = new Set(nextOrders.filter((o) => o.status === "pending").map((o) => o.id));
      if (knownPendingRef.current) {
        const hasNew = [...pendingIds].some((id) => !knownPendingRef.current!.has(id));
        if (hasNew && soundEnabled) playNewOrderSound();
      }
      knownPendingRef.current = pendingIds;
    } catch {
      setError(t("poster_test_merchant_load_error"));
      setOrders([]);
    } finally {
      setFetching(false);
    }
  }, [soundEnabled, t]);

  useEffect(() => {
    if (!user) return;
    void loadOrders();
    const timer = window.setInterval(() => {
      void loadOrders();
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [user, loadOrders]);

  const updateStatus = useCallback(
    async (orderId: string, status: PosterTestOrderStatus) => {
      setUpdatingId(orderId);
      try {
        const response = await fetch(`/api/poster-test/merchant/orders/${orderId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        });
        const data = (await response.json()) as { success?: boolean; order?: PosterTestOrder };
        if (!response.ok || !data.success || !data.order) {
          window.alert(t("poster_test_merchant_update_error"));
          return;
        }
        setOrders((prev) => prev.map((order) => (order.id === orderId ? data.order! : order)));
      } catch {
        window.alert(t("poster_test_merchant_update_error"));
      } finally {
        setUpdatingId(null);
      }
    },
    [t],
  );

  const filteredOrders = useMemo(
    () => orders.filter((order) => tabForStatus(order.status) === tab),
    [orders, tab],
  );

  const counts = useMemo(() => {
    const result: Record<MerchantTab, number> = { new: 0, active: 0, ready: 0, done: 0 };
    for (const order of orders) {
      const key = tabForStatus(order.status);
      if (key) result[key] += 1;
    }
    return result;
  }, [orders]);

  const loginHref = `${POSTER_TEST_LOGIN_PATH}?returnTo=${encodeURIComponent("/poster-test/merchant")}`;

  if (loading) {
    return (
      <div className="poster-test-merchant flex min-h-[100dvh] items-center justify-center text-white/50">
        {t("poster_test_merchant_loading")}
      </div>
    );
  }

  if (!user) {
    return (
      <div className="poster-test-merchant flex min-h-[100dvh] flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-2xl font-bold text-white">{t("poster_test_merchant_title")}</h1>
        <p className="max-w-md text-sm text-white/60">{t("poster_test_merchant_login_hint")}</p>
        <Link href={loginHref} className="poster-test-merchant__primary-btn">
          {t("poster_test_merchant_login")}
        </Link>
      </div>
    );
  }

  if (forbidden) {
    return (
      <div className="poster-test-merchant flex min-h-[100dvh] flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-2xl font-bold text-white">{t("poster_test_merchant_title")}</h1>
        <p className="max-w-md text-sm text-red-300">{t("poster_test_merchant_forbidden")}</p>
        <button type="button" className="poster-test-merchant__ghost-btn" onClick={() => void refreshSession()}>
          {t("poster_test_merchant_retry")}
        </button>
      </div>
    );
  }

  const tabs: Array<{ id: MerchantTab; label: string }> = [
    { id: "new", label: t("poster_test_merchant_tab_new") },
    { id: "active", label: t("poster_test_merchant_tab_active") },
    { id: "ready", label: t("poster_test_merchant_tab_ready") },
    { id: "done", label: t("poster_test_merchant_tab_done") },
  ];

  return (
    <div className="poster-test-merchant min-h-[100dvh] bg-[#0b0b0f] text-white">
      <header className="poster-test-merchant__header">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-amber-300/80">GASTROBAR</p>
          <h1 className="text-xl font-bold">{t("poster_test_merchant_title")}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={`poster-test-merchant__icon-btn ${soundEnabled ? "is-on" : ""}`}
            onClick={toggleSound}
            aria-pressed={soundEnabled}
            title={t("poster_test_merchant_sound_toggle")}
          >
            {soundEnabled ? "🔔" : "🔕"}
          </button>
          <button
            type="button"
            className="poster-test-merchant__icon-btn"
            onClick={() => {
              setFetching(true);
              void loadOrders();
            }}
            title={t("poster_test_merchant_refresh")}
          >
            ↻
          </button>
        </div>
      </header>

      <nav className="poster-test-merchant__tabs" aria-label={t("poster_test_merchant_title")}>
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`poster-test-merchant__tab ${tab === item.id ? "is-active" : ""}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
            <span className="poster-test-merchant__tab-count">{counts[item.id]}</span>
          </button>
        ))}
      </nav>

      <main className="poster-test-merchant__main">
        {fetching && orders.length === 0 ? (
          <p className="text-center text-sm text-white/50">{t("poster_test_merchant_loading")}</p>
        ) : error ? (
          <p className="text-center text-sm text-red-300">{error}</p>
        ) : filteredOrders.length === 0 ? (
          <p className="text-center text-sm text-white/50">{t("poster_test_merchant_empty")}</p>
        ) : (
          <ul className="poster-test-merchant__list">
            {filteredOrders.map((order) => {
              const busy = updatingId === order.id;
              const completeLabel =
                order.fulfillment === "delivery"
                  ? t("poster_test_merchant_action_delivered")
                  : t("poster_test_merchant_action_handed");

              return (
                <li
                  key={order.id}
                  className={`poster-test-merchant__card ${order.status === "pending" ? "is-new" : ""}`}
                >
                  <div className="poster-test-merchant__card-head">
                    <div>
                      <p className="poster-test-merchant__order-id">
                        {t("poster_test_order_number").replace("{id}", shortOrderId(order))}
                      </p>
                      <p className="poster-test-merchant__order-time">{formatOrderTime(order.createdAt)}</p>
                    </div>
                    <span className="poster-test-merchant__badge">
                      {order.fulfillment === "delivery"
                        ? t("poster_test_fulfillment_delivery")
                        : order.fulfillment === "table"
                          ? t("poster_test_fulfillment_table")
                          : t("poster_test_fulfillment_pickup")}
                    </span>
                  </div>

                  <div className="poster-test-merchant__customer">
                    <p className="font-semibold">{order.customerName}</p>
                    <a href={`tel:${order.customerPhone}`} className="text-amber-200/90">
                      {order.customerPhone}
                    </a>
                  </div>

                  {order.customerComment ? (
                    <p className="poster-test-merchant__comment">{order.customerComment}</p>
                  ) : null}

                  <ul className="poster-test-merchant__items">
                    {order.items.map((item, index) => (
                      <li key={`${order.id}-${item.id}-${index}`}>
                        <span>
                          {item.quantity}× {item.name}
                          {item.selectedSausageLabel ? ` (${item.selectedSausageLabel})` : ""}
                        </span>
                        <span>{formatVnd(item.unitPrice * item.quantity)}</span>
                      </li>
                    ))}
                  </ul>

                  <p className="poster-test-merchant__total">
                    {formatVnd(order.totalVnd)} VND · {t("poster_test_pay_on_receipt")}
                  </p>

                  <div className="poster-test-merchant__actions">
                    {order.status === "pending" ? (
                      <>
                        <button
                          type="button"
                          className="poster-test-merchant__primary-btn"
                          disabled={busy}
                          onClick={() => void updateStatus(order.id, "preparing")}
                        >
                          {t("poster_test_merchant_action_accept")}
                        </button>
                        <button
                          type="button"
                          className="poster-test-merchant__danger-btn"
                          disabled={busy}
                          onClick={() => void updateStatus(order.id, "cancelled")}
                        >
                          {t("poster_test_merchant_action_cancel")}
                        </button>
                      </>
                    ) : null}
                    {order.status === "preparing" ? (
                      <>
                        <button
                          type="button"
                          className="poster-test-merchant__primary-btn"
                          disabled={busy}
                          onClick={() => void updateStatus(order.id, "ready")}
                        >
                          {t("poster_test_merchant_action_ready")}
                        </button>
                        <button
                          type="button"
                          className="poster-test-merchant__danger-btn"
                          disabled={busy}
                          onClick={() => void updateStatus(order.id, "cancelled")}
                        >
                          {t("poster_test_merchant_action_cancel")}
                        </button>
                      </>
                    ) : null}
                    {order.status === "ready" ? (
                      <button
                        type="button"
                        className="poster-test-merchant__primary-btn"
                        disabled={busy}
                        onClick={() => void updateStatus(order.id, "completed")}
                      >
                        {completeLabel}
                      </button>
                    ) : null}
                    {order.status === "completed" || order.status === "cancelled" ? (
                      <span className="poster-test-merchant__status-done">
                        {order.status === "cancelled"
                          ? t("poster_test_order_status_cancelled")
                          : t("poster_test_order_status_completed")}
                      </span>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
