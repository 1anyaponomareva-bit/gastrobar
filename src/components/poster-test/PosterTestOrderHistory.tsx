"use client";

import { useEffect, useState } from "react";
import { formatVnd } from "@/lib/poster/posterTestCartHelpers";
import type { PosterTestOrder } from "@/lib/poster-test-auth/types";
import { useTranslation } from "@/lib/useTranslation";

function formatOrderDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function shortOrderId(order: PosterTestOrder): string {
  return order.posterOrderId?.trim() || order.id.slice(0, 8);
}

function statusLabel(t: (key: string) => string, status: PosterTestOrder["status"]): string {
  if (status === "preparing") return t("poster_test_order_status_preparing");
  if (status === "ready") return t("poster_test_order_status_ready");
  if (status === "completed") return t("poster_test_order_status_completed");
  if (status === "cancelled") return t("poster_test_order_status_cancelled");
  return t("poster_test_order_status_pending");
}

function fulfillmentLabel(
  t: (key: string) => string,
  fulfillment: PosterTestOrder["fulfillment"],
): string {
  if (fulfillment === "delivery") return t("poster_test_fulfillment_delivery");
  if (fulfillment === "table") return t("poster_test_fulfillment_table");
  return t("poster_test_fulfillment_pickup");
}

export function PosterTestOrderHistory() {
  const { t } = useTranslation();
  const [orders, setOrders] = useState<PosterTestOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/poster-test/orders", { cache: "no-store" });
        const data = (await response.json()) as {
          success?: boolean;
          orders?: PosterTestOrder[];
        };
        if (cancelled) return;
        if (!response.ok || !data.success) {
          setError(t("poster_test_orders_load_error"));
          setOrders([]);
          return;
        }
        setOrders(Array.isArray(data.orders) ? data.orders : []);
      } catch {
        if (!cancelled) {
          setError(t("poster_test_orders_load_error"));
          setOrders([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  return (
    <section className="mt-6 rounded-[24px] border border-white/10 bg-white/[0.05] p-5">
      <h2 className="mb-4 text-xs uppercase tracking-[0.18em] text-white/45">
        {t("poster_test_my_orders")}
      </h2>

      {loading ? (
        <p className="text-sm text-white/50">{t("poster_test_orders_loading")}</p>
      ) : error ? (
        <p className="text-sm text-red-300">{error}</p>
      ) : orders.length === 0 ? (
        <p className="text-sm text-white/50">{t("poster_test_orders_empty")}</p>
      ) : (
        <ul className="space-y-3">
          {orders.map((order) => (
            <li
              key={order.id}
              className="rounded-2xl border border-white/10 bg-black/20 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">
                    {t("poster_test_order_number").replace("{id}", shortOrderId(order))}
                  </p>
                  <p className="mt-1 text-xs text-white/45">{formatOrderDate(order.createdAt)}</p>
                </div>
                <span className="shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-white/70">
                  {statusLabel(t, order.status)}
                </span>
              </div>
              <p className="mt-2 text-xs text-amber-200/90">
                {fulfillmentLabel(t, order.fulfillment)} · {formatVnd(order.totalVnd)} VND
              </p>
              <ul className="mt-3 space-y-1 border-t border-white/10 pt-3 text-xs text-white/65">
                {order.items.map((item, index) => (
                  <li key={`${order.id}-${item.id}-${index}`}>
                    {item.quantity}× {item.name}
                    {item.selectedSausageLabel ? ` (${item.selectedSausageLabel})` : ""}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
