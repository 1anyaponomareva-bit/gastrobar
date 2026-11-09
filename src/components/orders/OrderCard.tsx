"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { errorMessage, getOrder, getSuppliers, newIdempotencyKey, receiveOrder } from "@/lib/orders/api";
import { productDisplayName } from "@/lib/erp/productName";
import { formatOrderLineBaseHint, formatOrderLineQty } from "@/lib/orders/orderList";
import { displayRemainingQty, orderCanReceive, parseDotQty, receiveActualBaseQty, receiveLineUnits, type ReceiveMode } from "@/lib/orders/qty";
import { formatVietnamDateTime } from "@/lib/orders/datetime";
import { personLabel } from "@/lib/orders/person";
import type { OrderPhoto, SupplierOrder } from "@/lib/orders/types";
import { OrdersEmpty, OrdersError, OrdersLoading } from "./LoadState";
import { statusClass } from "./OrderHistoryList";
import { OrderZaloButton } from "./OrderZaloButton";
import { useOrders } from "./OrdersShell";
import { QtyField } from "./QtyField";

const MAX_PHOTO = 6 * 1024 * 1024;

type LineMode = {
  orderLineId: string;
  product_id: string;
  pack_id: string | null;
  remainingQty: number;
  baseUnit: string;
  mode: ReceiveMode;
  actualText: string;
  actualUnit: string;
};

function receiveLinesOf(order: SupplierOrder): LineMode[] {
  return order.lines
    .filter((line) => line.remainingQty > 0)
    .map((line) => {
      const units = receiveLineUnits(line.baseUnit);
      const baseUnit = units[0] || line.baseUnit || "";
      return {
        orderLineId: line.id ?? line.product_id,
        product_id: line.product_id,
        pack_id: line.pack_id,
        remainingQty: line.remainingQty,
        baseUnit,
        mode: "as_ordered" as const,
        actualText: "",
        actualUnit: baseUnit,
      };
    });
}

export function OrderCard({ orderId }: { orderId: string }) {
  const { t, lang } = useOrders();
  const [order, setOrder] = useState<SupplierOrder | null>(null);
  const [supplierZaloUrl, setSupplierZaloUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [receiveLines, setReceiveLines] = useState<LineMode[]>([]);
  const [photos, setPhotos] = useState<OrderPhoto[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);

  const load = useCallback(async () => {
    setError(null);
    try {
      const loaded = await getOrder(orderId);
      setOrder(loaded);
      setReceiveLines(orderCanReceive(loaded) ? receiveLinesOf(loaded) : []);
      setIdempotencyKey(newIdempotencyKey());
    } catch (err) {
      setOrder(null);
      setError(errorMessage(err, t("error_network"), t("error_load")));
    }
  }, [orderId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!order?.supplierId) {
      setSupplierZaloUrl(null);
      return;
    }
    if (order.zaloUrl) {
      setSupplierZaloUrl(order.zaloUrl);
      return;
    }
    let cancelled = false;
    void getSuppliers()
      .then((catalog) => {
        if (!cancelled) {
          setSupplierZaloUrl(catalog.suppliers.find((row) => row.id === order.supplierId)?.zaloUrl ?? null);
        }
      })
      .catch(() => {
        if (!cancelled) setSupplierZaloUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [order]);

  const canReceive = order ? orderCanReceive(order) && receiveLines.length > 0 : false;
  const zaloUrl = order?.zaloUrl ?? supplierZaloUrl;

  const patchLine = (index: number, patch: Partial<LineMode>) => {
    setReceiveLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  };

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setPhotoError(null);
    const next: OrderPhoto[] = [];
    for (const file of Array.from(files)) {
      if (file.size > MAX_PHOTO) {
        setPhotoError(t("photo_too_big", { name: file.name }));
        continue;
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      next.push({ fileName: file.name, mimeType: file.type || "image/jpeg", dataUrl });
    }
    if (next.length) setPhotos((prev) => [...prev, ...next]);
  };

  const submit = async () => {
    if (busy || !order || !canReceive) return;
    const invalidOther = receiveLines.some((line) => line.mode === "other" && !(parseDotQty(line.actualText) > 0));
    if (invalidOther) {
      setSubmitError(t("receive_need_qty"));
      return;
    }
    setSubmitError(null);
    setBusy(true);
    try {
      const saved = await receiveOrder(order.id, {
        idempotencyKey,
        comment: "",
        photos,
        lines: receiveLines.map((line) => ({
          orderLineId: line.orderLineId,
          product_id: line.product_id,
          pack_id: line.pack_id,
          actualQty: receiveActualBaseQty({
            mode: line.mode,
            remainingQty: line.remainingQty,
            actualText: line.actualText,
          }),
          discrepancyKind: line.mode === "other" ? "other" : "none",
          discrepancyNote: null,
        })),
      });
      setOrder(saved);
      setReceiveLines([]);
      setPhotos([]);
    } catch (err) {
      setSubmitError(errorMessage(err, t("error_network"), t("error_receive")));
    } finally {
      setBusy(false);
    }
  };

  if (error) return <OrdersError text={error} onRetry={() => void load()} />;
  if (!order) return <OrdersLoading />;
  if (!order.id) return <OrdersEmpty title={t("order_not_found")} />;

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
      <div className="orders-meta" style={{ marginTop: 8 }}>
        {t("placed_by")} {personLabel(order.placedByName, order.placedBy, order.createdByName, order.createdBy)} ·{" "}
        {formatVietnamDateTime(order.placedAt ?? order.createdAt) || "—"}
      </div>
      <OrderZaloButton status={order.status} zaloUrl={zaloUrl} label={t("open_zalo")} className="orders-zaloWrap" />
      {order.receivedAt ? (
        <div className="orders-meta" style={{ marginTop: 8 }}>
          {t("receive_goods")} · {personLabel(order.receivedByName, order.receivedBy)} · {formatVietnamDateTime(order.receivedAt) || "—"}
        </div>
      ) : null}

      {order.clarifyReason ? <div className="orders-banner warn">{t("clarify_banner", { reason: order.clarifyReason })}</div> : null}

      <p className="orders-note">{t("stock_note")}</p>
      {submitError ? <div className="orders-banner error">{submitError}</div> : null}
      {photoError ? <div className="orders-banner error">{photoError}</div> : null}

      <div className="orders-category">{t("lines_title")}</div>
      {order.lines.map((line) => {
        const receiveIndex = receiveLines.findIndex((row) => row.orderLineId === (line.id ?? line.product_id));
        const receive = receiveIndex >= 0 ? receiveLines[receiveIndex] : null;
        const units = receive ? receiveLineUnits(receive.baseUnit) : [];
        return (
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
                  {formatOrderLineQty(line.acceptedQty, line, "base")}
                </b>
              </span>
              <span>
                {t("qty_posted")}
                <b>
                  {formatOrderLineQty(line.postedQty, line, "base")}
                </b>
              </span>
              <span>
                {t("qty_remaining")}
                <b>
                  {formatOrderLineQty(displayRemainingQty(line), line, "base")}
                </b>
              </span>
            </div>
            {receive ? (
              <>
                <div className="orders-field" style={{ marginTop: 8 }}>
                  <label>{t("actual_qty")}</label>
                  <select
                    className="orders-select"
                    value={receive.mode}
                    onChange={(event) => patchLine(receiveIndex, { mode: event.target.value as ReceiveMode, actualText: "" })}
                  >
                    <option value="as_ordered">{t("discrepancy_none")}</option>
                    <option value="other">{t("discrepancy_other")}</option>
                  </select>
                </div>
                {receive.mode === "other" ? (
                  <>
                    <div className="orders-field" style={{ marginTop: 8 }}>
                      <label>{t("receive_unit")}</label>
                      <select
                        className="orders-select"
                        value={receive.actualUnit}
                        onChange={(event) => patchLine(receiveIndex, { actualUnit: event.target.value })}
                      >
                        {units.map((unit) => (
                          <option key={unit} value={unit}>
                            {unit}
                          </option>
                        ))}
                      </select>
                    </div>
                    <QtyField
                      label={t("actual_qty")}
                      unit={receive.actualUnit}
                      value={receive.actualText}
                      dotOnly
                      onChange={(value) => patchLine(receiveIndex, { actualText: value })}
                    />
                  </>
                ) : null}
              </>
            ) : null}
          </div>
        );
      })}

      {canReceive ? (
        <>
          <div className="orders-field">
            <label>{t("invoice_photo")}</label>
            <input className="orders-input" type="file" accept="image/*" multiple onChange={(event) => void addPhotos(event.target.files)} />
          </div>
          {photos.length ? (
            <div className="orders-photos">
              {photos.map((photo, index) => (
                <button
                  key={`${photo.fileName}-${index}`}
                  type="button"
                  className="orders-photo"
                  style={{ background: `url(${photo.dataUrl}) center/cover no-repeat`, border: 0 }}
                  onClick={() => setPhotos((prev) => prev.filter((_, i) => i !== index))}
                  aria-label={t("remove_photo")}
                />
              ))}
            </div>
          ) : null}
        </>
      ) : null}

      <div className="orders-category">{t("receipts_title")}</div>
      {order.receipts.length ? (
        order.receipts.map((receipt) => (
          <div key={receipt.id} className="orders-card">
            <div className="orders-name">{receipt.docNo || receipt.id}</div>
            <div className="orders-meta">
              {formatVietnamDateTime(receipt.createdAt) || "—"} · {personLabel(receipt.createdByName, receipt.createdBy)}
            </div>
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
          <div className="orders-actions">
            <OrderZaloButton status={order.status} zaloUrl={zaloUrl} label={t("open_zalo")} />
            <button type="button" className="orders-btn primary block" disabled={busy} onClick={() => void submit()}>
              {busy ? t("submitting") : t("receive_goods")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
