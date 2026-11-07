"use client";

import type { OrderWarehouse } from "@/lib/orders/types";
import { useOrders } from "./OrdersShell";

type Props = {
  open: boolean;
  warehouses: OrderWarehouse[];
  warehouseId: string;
  expectedDelivery: string;
  comment: string;
  busy: boolean;
  error: string | null;
  onWarehouse: (value: string) => void;
  onExpectedDelivery: (value: string) => void;
  onComment: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
};

export function PlaceOrderDialog({
  open,
  warehouses,
  warehouseId,
  expectedDelivery,
  comment,
  busy,
  error,
  onWarehouse,
  onExpectedDelivery,
  onComment,
  onCancel,
  onSubmit,
}: Props) {
  const { t } = useOrders();
  if (!open) return null;
  return (
    <div className="orders-modal" role="dialog" aria-modal="true" aria-labelledby="orders-place-title">
      <div className="orders-modalCard">
        <h2 id="orders-place-title">{t("place_dialog_title")}</h2>
        {error ? (
          <div className="orders-banner error" role="alert">
            {error}
          </div>
        ) : null}
        <div className="orders-field" style={{ marginBottom: 10 }}>
          <label>{t("warehouse")}</label>
          <select className="orders-select" value={warehouseId} onChange={(event) => onWarehouse(event.target.value)}>
            <option value="">{t("warehouse")}</option>
            {warehouses.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </div>
        <div className="orders-field" style={{ marginBottom: 10 }}>
          <label>{t("expected_delivery")}</label>
          <input className="orders-input" type="date" value={expectedDelivery} onChange={(event) => onExpectedDelivery(event.target.value)} />
        </div>
        <div className="orders-field" style={{ marginBottom: 14 }}>
          <label>{t("comment")}</label>
          <textarea
            className="orders-textarea"
            value={comment}
            placeholder={t("comment_placeholder")}
            onChange={(event) => onComment(event.target.value)}
          />
        </div>
        <div className="orders-actions">
          <button type="button" className="orders-btn ok block" onClick={onSubmit} disabled={busy}>
            {busy ? t("placing") : t("place_submit")}
          </button>
          <button type="button" className="orders-btn ghost block" onClick={onCancel} disabled={busy}>
            {t("place_cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
