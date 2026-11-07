"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { errorMessage, getOrder, newIdempotencyKey, receiveOrder } from "@/lib/orders/api";
import { formatOrderLineName } from "@/lib/orders/orderPdf";
import { formatOrderLineBaseHint, formatOrderLineQty } from "@/lib/orders/orderList";
import { parseDotQty, receiveActualBaseQty, receiveLineUnits, type ReceiveMode } from "@/lib/orders/qty";
import type { OrderPhoto, SupplierOrder } from "@/lib/orders/types";
import { OrdersEmpty, OrdersError, OrdersLoading } from "./LoadState";
import { useOrders } from "./OrdersShell";
import { QtyField } from "./QtyField";

const MAX_PHOTO = 6 * 1024 * 1024;

type LineState = {
  orderLineId: string;
  product_id: string;
  pack_id: string | null;
  nameEn: string;
  nameVn: string;
  packLabel: string;
  unit: string;
  remainingQty: number;
  orderedQty: number;
  packQty?: number | null;
  packQtyBase?: number | null;
  baseUnit: string;
  mode: ReceiveMode;
  actualText: string;
  actualUnit: string;
};

export function ReceiveForm({ orderId }: { orderId: string }) {
  const { t } = useOrders();
  const router = useRouter();
  const [order, setOrder] = useState<SupplierOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<LineState[]>([]);
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
      setLines(
        loaded.lines
          .filter((line) => line.remainingQty > 0)
          .map((line) => {
            const units = receiveLineUnits(line.baseUnit);
            const baseUnit = units[0] || line.baseUnit || "";
            return {
              orderLineId: line.id ?? line.product_id,
              product_id: line.product_id,
              pack_id: line.pack_id,
              nameEn: line.nameEn,
              nameVn: line.nameVn,
              packLabel: line.packLabel,
              unit: line.unit,
              remainingQty: line.remainingQty,
              orderedQty: line.orderedQty,
              packQty: line.packQty,
              packQtyBase: line.packQtyBase,
              baseUnit,
              mode: "as_ordered" as const,
              actualText: "",
              actualUnit: baseUnit,
            };
          }),
      );
    } catch (err) {
      setOrder(null);
      setError(errorMessage(err, t("error_network"), t("error_load")));
    }
  }, [orderId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const patchLine = (index: number, patch: Partial<LineState>) => {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
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
    if (busy || !order) return;
    const invalidOther = lines.some((line) => line.mode === "other" && !(parseDotQty(line.actualText) > 0));
    if (invalidOther) {
      setSubmitError(t("receive_need_qty"));
      return;
    }
    if (!window.confirm(t("receive_confirm"))) return;
    setSubmitError(null);
    setBusy(true);
    try {
      const saved = await receiveOrder(order.id, {
        idempotencyKey,
        comment: "",
        photos,
        lines: lines.map((line) => ({
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
      router.push(`/orders/${saved.id}`);
    } catch (err) {
      setSubmitError(errorMessage(err, t("error_network"), t("error_receive")));
    } finally {
      setBusy(false);
    }
  };

  if (error) return <OrdersError text={error} onRetry={() => void load()} />;
  if (!order) return <OrdersLoading />;
  if (!lines.length) return <OrdersEmpty title={t("orders_empty")} text={t("stock_note")} />;

  return (
    <div>
      <Link href={`/orders/${order.id}`} className="orders-back">
        ← {order.docNo || order.id}
      </Link>
      <h2 className="orders-name" style={{ margin: "0 0 8px" }}>
        {t("receive_title")}
      </h2>
      <p className="orders-note">{t("receive_lead")}</p>
      {order.clarifyReason ? <div className="orders-banner warn">{t("clarify_banner", { reason: order.clarifyReason })}</div> : null}
      {submitError ? <div className="orders-banner error">{submitError}</div> : null}
      {photoError ? <div className="orders-banner error">{photoError}</div> : null}

      {lines.map((line, index) => {
        const units = receiveLineUnits(line.baseUnit);
        const qtyView = {
          orderedQty: line.orderedQty,
          packLabel: line.packLabel,
          unit: line.unit,
          packQty: line.packQty,
          packQtyBase: line.packQtyBase,
          baseUnit: line.baseUnit,
        };
        const orderedHint = formatOrderLineBaseHint(qtyView);
        return (
          <div key={line.orderLineId} className="orders-card">
            <div className="orders-name">{formatOrderLineName({ nameEn: line.nameEn, nameVn: line.nameVn })}</div>
            <div className="orders-meta">
              {line.packLabel} · {t("qty_ordered")} {formatOrderLineQty(line.orderedQty, qtyView, "ordered")}
              {orderedHint ? <span> {orderedHint}</span> : null}
            </div>
            <div className="orders-field" style={{ marginTop: 8 }}>
              <label>{t("actual_qty")}</label>
              <select
                className="orders-select"
                value={line.mode}
                onChange={(event) => patchLine(index, { mode: event.target.value as ReceiveMode, actualText: "" })}
              >
                <option value="as_ordered">{t("discrepancy_none")}</option>
                <option value="other">{t("discrepancy_other")}</option>
              </select>
            </div>
            {line.mode === "other" ? (
              <>
                <div className="orders-field" style={{ marginTop: 8 }}>
                  <label>{t("receive_unit")}</label>
                  <select
                    className="orders-select"
                    value={line.actualUnit}
                    onChange={(event) => patchLine(index, { actualUnit: event.target.value })}
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
                  unit={line.actualUnit}
                  value={line.actualText}
                  dotOnly
                  onChange={(value) => patchLine(index, { actualText: value })}
                />
              </>
            ) : null}
          </div>
        );
      })}

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

      <div className="orders-stickyActions">
        <button type="button" className="orders-btn primary block" disabled={busy} onClick={() => void submit()}>
          {busy ? t("submitting") : t("submit_receive")}
        </button>
      </div>
    </div>
  );
}
