"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { errorMessage, getOrder } from "@/lib/orders/api";
import { productDisplayName } from "@/lib/erp/productName";
import { formatOrderLineBaseHint, formatOrderLineQty } from "@/lib/orders/orderList";
import { displayRemainingQty } from "@/lib/orders/qty";
import type { SupplierOrder } from "@/lib/orders/types";
import { OrdersEmpty, OrdersError, OrdersLoading } from "./LoadState";
import { statusClass } from "./OrderHistoryList";
import { useOrders } from "./OrdersShell";

export function OrderCard({ orderId }: { orderId: string }) {
  const { t, lang } = useOrders();
  const [order, setOrder] = useState<SupplierOrder | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setOrder(await getOrder(orderId));
    } catch (err) {
      setOrder(null);
      setError(errorMessage(err, t("error_network"), t("error_load")));
    }
  }, [orderId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <OrdersError text={error} onRetry={() => void load()} />;
  if (!order) return <OrdersLoading />;
  if (!order.id) return <OrdersEmpty title={t("order_not_found")} />;

  const canReceive =
    (order.status === "ordered" || order.status === "partial") && order.lines.some((line) => line.remainingQty > 0);

  return (
    <div>
      <Link href="/orders/history" className="orders-back">
        ← {t("orders_section")}
      </Link>
      <h2 className="orders-name" style={{ margin: "0 0 8px" }}>
        {order.docNo || order.id}
      </h2>
      <div className="orders-meta" style={{ marginBottom: 12 }}>
        {order.supplierName} · {order.warehouseName ?? ""}
      </div>
      <span className={statusClass(order.status)}>{t(`status_${order.status}`)}</span>
      {order.receivedAt ? (
        <div className="orders-meta" style={{ marginTop: 8 }}>
          {t("receive_goods")} · {order.receivedBy ?? "—"} · {order.receivedAt}
        </div>
      ) : null}

      {order.clarifyReason ? <div className="orders-banner warn">{t("clarify_banner", { reason: order.clarifyReason })}</div> : null}

      <p className="orders-note">{t("stock_note")}</p>

      <div className="orders-category">{t("lines_title")}</div>
      {order.lines.map((line) => (
        <div key={line.id ?? `${line.product_id}-${line.pack_id}`} className="orders-card">
          <div className="orders-name">{productDisplayName({ locale: lang, nameEn: line.nameEn, nameVn: line.nameVn })}</div>
          <div className="orders-meta">
            {[line.brand, line.packLabel, line.unit].filter(Boolean).join(" · ")}
          </div>
          <div className="orders-qtyGrid">
            <span>
              {t("qty_ordered")}
              <b>
                {formatOrderLineQty(line.orderedQty, line, "ordered")}
                {formatOrderLineBaseHint(line) ? <span className="orders-meta"> {formatOrderLineBaseHint(line)}</span> : null}
              </b>
            </span>
            <span>
              {t("qty_accepted")}
              <b>
                {formatOrderLineQty(line.acceptedQty, line)}
              </b>
            </span>
            <span>
              {t("qty_posted")}
              <b>
                {formatOrderLineQty(line.postedQty, line)}
              </b>
            </span>
            <span>
              {t("qty_remaining")}
              <b>
                {formatOrderLineQty(displayRemainingQty(line), line)}
              </b>
            </span>
          </div>
        </div>
      ))}

      <div className="orders-category">{t("receipts_title")}</div>
      {order.receipts.length ? (
        order.receipts.map((receipt) => (
          <div key={receipt.id} className="orders-card">
            <div className="orders-name">{receipt.docNo || receipt.id}</div>
            <div className="orders-meta">{receipt.createdAt} · {receipt.createdBy}</div>
            <div style={{ marginTop: 8 }}>
              <span className={statusClass(receipt.status === "clarify" ? "partial" : receipt.status)}>
                {t(`receipt_${receipt.status === "draft" ? "draft" : receipt.status}`)}
              </span>
            </div>
            {receipt.clarifyReason ? <div className="orders-banner warn" style={{ marginTop: 10 }}>{receipt.clarifyReason}</div> : null}
            {receipt.photos.length ? (
              <div className="orders-photos">
                {receipt.photos.map((photo) => (
                  <img key={photo.id ?? photo.url ?? photo.fileName} src={photo.url || photo.dataUrl} alt={photo.fileName} />
                ))}
              </div>
            ) : null}
          </div>
        ))
      ) : (
        <OrdersEmpty title={t("receipts_empty")} />
      )}

      <div className="orders-category">{t("history_title")}</div>
      {order.history.length ? (
        <ul className="orders-history">
          {order.history.map((event, index) => (
            <li key={`${event.at}-${index}`}>
              <time>{event.at}{event.by ? ` · ${event.by}` : ""}</time>
              {event.text || event.type}
            </li>
          ))}
        </ul>
      ) : (
        <OrdersEmpty title={t("history_empty")} />
      )}

      {canReceive ? (
        <div className="orders-stickyActions">
          <Link href={`/orders/${order.id}/receive`} className="orders-btn primary block">
            {t("receive_goods")}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
