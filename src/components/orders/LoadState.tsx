"use client";

import type { ReactNode } from "react";
import { useOrders } from "./OrdersShell";

export function OrdersLoading() {
  const { t } = useOrders();
  return (
    <div className="orders-loading" role="status">
      {t("loading")}
    </div>
  );
}

export function OrdersError({ text, onRetry }: { text: string; onRetry?: () => void }) {
  const { t } = useOrders();
  return (
    <div className="orders-banner error" role="alert">
      <div>{text}</div>
      {onRetry ? (
        <button type="button" className="orders-btn dark" style={{ marginTop: 10 }} onClick={onRetry}>
          {t("retry")}
        </button>
      ) : null}
    </div>
  );
}

export function OrdersEmpty({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="orders-empty">
      <strong>{title}</strong>
      {text ? <p>{text}</p> : null}
      {action}
    </div>
  );
}
