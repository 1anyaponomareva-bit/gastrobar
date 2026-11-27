"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getStaffStockItems,
  staffStockLabel,
  staffStockNote,
  type StaffStockItem,
} from "@/data/staffInStockItems";
import { deliverPdfFile, detectInAppBrowser } from "@/lib/deliverPdfFile";
import { formatVietnamDateTime } from "@/lib/orders/datetime";
import { supplierZaloHref } from "@/lib/orders/orderList";
import {
  getPrepStockSettings,
  getPrepStockTransfer,
  listPrepStockCatalogItems,
  PrepStockApiError,
  prepStockErrorMessage,
  receivePrepStockTransfer,
  type PrepStockTransferRow,
} from "@/lib/orders/prepStockApi";
import { OrdersEmpty, OrdersError, OrdersLoading } from "./LoadState";
import { useOrders } from "./OrdersShell";

const VENUE = "gastrofood" as const;

export function PrepStockTransferPage({ transferId }: { transferId: string }) {
  const { t, lang } = useOrders();
  const fallbackItems = useMemo(() => getStaffStockItems(VENUE), []);
  const [items, setItems] = useState<StaffStockItem[]>(fallbackItems);
  const [transfer, setTransfer] = useState<PrepStockTransferRow | null>(null);
  const [zaloUrl, setZaloUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [loaded, catalog, settings] = await Promise.all([
        getPrepStockTransfer(transferId),
        listPrepStockCatalogItems().catch(() => null),
        getPrepStockSettings().catch(() => ({ zaloUrl: null as string | null })),
      ]);
      setTransfer(loaded);
      setZaloUrl(settings.zaloUrl);
      if (catalog?.length) {
        setItems(
          catalog.map((item) => ({
            id: item.id,
            name: item.name,
            note: item.note || undefined,
            noWarehouse: item.noWarehouse,
          })),
        );
      }
    } catch (err) {
      setTransfer(null);
      setError(prepStockErrorMessage(err, t("error_network"), t("error_load")));
    }
  }, [t, transferId]);

  useEffect(() => {
    void load();
  }, [load]);

  const item = items.find((row) => row.id === transfer?.itemId);
  const label = item
    ? staffStockLabel(item, lang)
    : transfer?.itemId || "";
  const note = item ? staffStockNote(item) : "";
  const zaloHref = supplierZaloHref(zaloUrl);
  const canReceive = transfer?.status === "pending";

  const openPdf = async () => {
    if (pdfBusy || !transfer) return;
    if (detectInAppBrowser()) {
      window.alert(t("prep_stock_inapp_blocked"));
      return;
    }
    setPdfBusy(true);
    try {
      const res = await fetch(
        `/api/orders/prep-stock/transfers/${encodeURIComponent(transfer.id)}/pdf`,
        { cache: "no-store", credentials: "same-origin" },
      );
      if (!res.ok) throw new Error("pdf");
      const blob = await res.blob();
      const delivered = await deliverPdfFile(
        blob,
        `PrepTransfer-${transfer.id.slice(0, 8)}.pdf`,
      );
      if (delivered !== "shared" && delivered !== "cancelled" && delivered !== "downloaded") {
        window.alert(t("prep_stock_share_error"));
      }
    } catch {
      window.alert(t("prep_stock_share_error"));
    } finally {
      setPdfBusy(false);
    }
  };

  const onReceive = async () => {
    if (!transfer || !canReceive || busy) return;
    if (!window.confirm(t("prep_stock_transfer_receive_confirm"))) return;
    setBusy(true);
    try {
      const saved = await receivePrepStockTransfer(transfer.id);
      setTransfer(saved.transfer);
    } catch (err) {
      window.alert(
        err instanceof PrepStockApiError && err.code === "ERP_INVALID"
          ? t("prep_stock_transfer_receive_fail")
          : prepStockErrorMessage(err, t("error_network"), t("prep_stock_transfer_receive_fail")),
      );
    } finally {
      setBusy(false);
    }
  };

  if (error) return <OrdersError text={error} onRetry={() => void load()} />;
  if (!transfer) return <OrdersLoading />;
  if (!transfer.id) return <OrdersEmpty title={t("prep_stock_transfer_not_found")} />;

  const directionLabel =
    transfer.direction === "to_warehouse"
      ? t("prep_stock_to_warehouse")
      : t("prep_stock_to_kitchen");
  const statusLabel =
    transfer.status === "received"
      ? t("prep_stock_transfer_status_received")
      : transfer.status === "cancelled"
        ? t("prep_stock_transfer_status_cancelled")
        : t("prep_stock_transfer_status_pending");

  return (
    <div className="orders-prepStock orders-prepTransfer">
      <div className="orders-prepTransferTop">
        <Link href="/orders/prep-stock" className="orders-btn ghost">
          ← {t("prep_stock")}
        </Link>
      </div>

      <div className="orders-prepStockCard">
        <div className="orders-prepTransferHead">
          <h2>{t("prep_stock_transfer_title")}</h2>
          <span className={`orders-prepTransferStatus ${transfer.status}`}>{statusLabel}</span>
        </div>
        <p className="orders-prepStockName">
          {label}
          {note ? <span className="orders-prepStockNote"> / {note}</span> : null}
        </p>
        <div className="orders-prepTransferMeta">
          <div>
            <span>{t("prep_stock_transfer_direction")}</span>
            <strong>{directionLabel}</strong>
          </div>
          <div>
            <span>{t("prep_stock_qty_prompt")}</span>
            <strong>
              {transfer.qty} {t("prep_stock_pcs_short")}
            </strong>
          </div>
          <div>
            <span>{t("prep_stock_employee")}</span>
            <strong>{transfer.actor || "—"}</strong>
          </div>
          {transfer.createdAt ? (
            <div>
              <span>{t("prep_stock_transfer_created")}</span>
              <strong>{formatVietnamDateTime(transfer.createdAt)}</strong>
            </div>
          ) : null}
          {transfer.receivedAt ? (
            <div>
              <span>{t("prep_stock_transfer_received_at")}</span>
              <strong>
                {formatVietnamDateTime(transfer.receivedAt)}
                {transfer.receivedBy ? ` · ${transfer.receivedBy}` : ""}
              </strong>
            </div>
          ) : null}
        </div>

        <p className="orders-prepStockMoveHint">{t("prep_stock_transfer_hint")}</p>

        {zaloHref ? (
          <div className="orders-zaloOpenRow">
            <a className="orders-btn zalo orders-zaloHalf" href={zaloHref} target="_blank" rel="noopener noreferrer">
              {t("open_zalo")}
            </a>
            <button
              type="button"
              className="orders-btn orders-openHalf"
              onClick={() => void openPdf()}
              disabled={pdfBusy}
            >
              {pdfBusy ? t("prep_stock_sharing") : t("prep_stock_transfer_share")}
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="orders-btn primary block"
            onClick={() => void openPdf()}
            disabled={pdfBusy}
          >
            {pdfBusy ? t("prep_stock_sharing") : t("prep_stock_transfer_share")}
          </button>
        )}

        {!zaloHref ? <p className="orders-prepStockMoveHint">{t("prep_stock_transfer_no_zalo")}</p> : null}

        {canReceive ? (
          <button
            type="button"
            className="orders-btn dark block orders-prepTransferReceive"
            disabled={busy}
            onClick={() => void onReceive()}
          >
            {busy ? t("prep_stock_busy") : t("prep_stock_transfer_receive")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
