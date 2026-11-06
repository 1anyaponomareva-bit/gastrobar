"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { errorMessage, getOrder, isAuthError, newIdempotencyKey, receiveOrder } from "@/lib/orders/api";
import { formatOrderLineName } from "@/lib/orders/orderPdf";
import { formatQty, parseQty } from "@/lib/orders/qty";
import type { DiscrepancyKind, OrderPhoto, ReceiveLineInput, SupplierOrder } from "@/lib/orders/types";
import { OrdersEmpty, OrdersError, OrdersLoading } from "./LoadState";
import { useOrders } from "./OrdersShell";
import { QtyField } from "./QtyField";

const KINDS: DiscrepancyKind[] = ["none", "short", "over", "substitute", "other"];
const MAX_PHOTO = 6 * 1024 * 1024;

type LineState = Omit<ReceiveLineInput, "actualQty"> & {
  actualText: string;
  unit: string;
  nameEn: string;
  nameVn: string;
  packLabel: string;
  remainingQty: number;
};

function kindFor(actual: number, remaining: number): DiscrepancyKind {
  if (!(actual > 0)) return "none";
  if (actual < remaining) return "short";
  if (actual > remaining) return "over";
  return "none";
}

export function ReceiveForm({ orderId }: { orderId: string }) {
  const { t, setEmail } = useOrders();
  const router = useRouter();
  const [order, setOrder] = useState<SupplierOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<LineState[]>([]);
  const [comment, setComment] = useState("");
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
          .map((line) => ({
            orderLineId: line.id ?? line.product_id,
            product_id: line.product_id,
            pack_id: line.pack_id,
            actualText: formatQty(line.remainingQty),
            discrepancyKind: "none",
            discrepancyNote: null,
            unit: line.unit,
            nameEn: line.nameEn,
            nameVn: line.nameVn,
            packLabel: line.packLabel,
            remainingQty: line.remainingQty,
          })),
      );
    } catch (err) {
      if (isAuthError(err)) {
        setEmail(null);
        return;
      }
      setOrder(null);
      setError(errorMessage(err, t("error_network"), t("error_load")));
    }
  }, [orderId, setEmail, t]);

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
    const filled = lines.filter((line) => parseQty(line.actualText) > 0);
    if (!filled.length) {
      setSubmitError(t("place_need_lines"));
      return;
    }
    if (!window.confirm(t("receive_confirm"))) return;
    setSubmitError(null);
    setBusy(true);
    try {
      const saved = await receiveOrder(order.id, {
        idempotencyKey,
        comment,
        photos,
        lines: filled.map((line) => ({
          orderLineId: line.orderLineId,
          product_id: line.product_id,
          pack_id: line.pack_id,
          actualQty: parseQty(line.actualText),
          discrepancyKind: line.discrepancyKind === "none" ? kindFor(parseQty(line.actualText), line.remainingQty) : line.discrepancyKind,
          discrepancyNote: line.discrepancyNote,
        })),
      });
      router.push(`/orders/${saved.id}`);
    } catch (err) {
      if (isAuthError(err)) {
        setEmail(null);
        return;
      }
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
      <div className="orders-banner warn">{t("receive_stock_hint")}</div>
      {order.clarifyReason ? <div className="orders-banner warn">{t("clarify_banner", { reason: order.clarifyReason })}</div> : null}
      {submitError ? <div className="orders-banner error">{submitError}</div> : null}
      {photoError ? <div className="orders-banner error">{photoError}</div> : null}

      {lines.map((line, index) => (
        <div key={line.orderLineId} className="orders-card">
          <div className="orders-name">{formatOrderLineName({ nameEn: line.nameEn, nameVn: line.nameVn })}</div>
          <div className="orders-meta">
            {line.packLabel} · {t("qty_remaining")} {formatQty(line.remainingQty)} {line.unit}
          </div>
          <QtyField
            label={t("actual_qty")}
            unit={line.unit}
            value={line.actualText}
            onChange={(value) => {
              patchLine(index, { actualText: value, discrepancyKind: kindFor(parseQty(value), line.remainingQty) });
            }}
          />
          <div className="orders-field" style={{ marginTop: 8 }}>
            <label>{t("discrepancy")}</label>
            <select
              className="orders-select"
              value={line.discrepancyKind}
              onChange={(event) => patchLine(index, { discrepancyKind: event.target.value as DiscrepancyKind })}
            >
              {KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {t(`discrepancy_${kind}`)}
                </option>
              ))}
            </select>
          </div>
          {line.discrepancyKind !== "none" ? (
            <div className="orders-field" style={{ marginTop: 8 }}>
              <label>{t("discrepancy_note")}</label>
              <textarea
                className="orders-textarea"
                value={line.discrepancyNote ?? ""}
                onChange={(event) => patchLine(index, { discrepancyNote: event.target.value || null })}
              />
            </div>
          ) : null}
        </div>
      ))}

      <div className="orders-field" style={{ margin: "12px 0" }}>
        <label>{t("comment")}</label>
        <textarea className="orders-textarea" value={comment} onChange={(event) => setComment(event.target.value)} />
      </div>

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
        <button
          type="button"
          className="orders-btn primary block"
          disabled={busy}
          onClick={() => void submit()}
        >
          {busy ? t("submitting") : t("submit_receive")}
        </button>
      </div>
    </div>
  );
}
