"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { errorMessage, getSuppliers, listOrders } from "@/lib/orders/api";
import { formatVietnamDateTime } from "@/lib/orders/datetime";
import { orderStatusClass, sortOrdersForHistory } from "@/lib/orders/orderList";
import { personLabel } from "@/lib/orders/person";
import type { OrderStatus, OrderSupplier, SupplierOrder } from "@/lib/orders/types";
import { OrdersEmpty, OrdersError, OrdersLoading } from "./LoadState";
import { OrderHeading } from "./OrderHeading";
import { OrderZaloOpenRow } from "./OrderZaloButton";
import { useOrders } from "./OrdersShell";

const STATUSES: OrderStatus[] = ["ordered", "partial", "received", "closed"];

export function statusClass(status: string): string {
  return orderStatusClass(status);
}

export function OrderHistoryList() {
  const { t } = useOrders();
  const [orders, setOrders] = useState<SupplierOrder[] | null>(null);
  const [suppliers, setSuppliers] = useState<OrderSupplier[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [status, setStatus] = useState<OrderStatus | "">("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const [list, catalog] = await Promise.all([
        listOrders({
          supplierId: supplierId || undefined,
          status: status || undefined,
        }),
        getSuppliers().catch(() => ({ suppliers: [], warehouses: [], defaultWarehouseId: null })),
      ]);
      setOrders(list);
      setSuppliers(catalog.suppliers);
    } catch (err) {
      setOrders(null);
      setError(errorMessage(err, t("error_network"), t("error_load")));
    }
  }, [status, supplierId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = (orders ?? []).filter((order) => {
      if (supplierId && order.supplierId !== supplierId) return false;
      if (status && order.status !== status) return false;
      if (!q) return true;
      return `${order.docNo} ${order.supplierName} ${order.comment ?? ""} ${order.placedByName ?? ""}`.toLowerCase().includes(q);
    });
    return sortOrdersForHistory(filtered);
  }, [orders, query, status, supplierId]);

  return (
    <div>
      <div className="orders-searchRow">
        <input className="orders-search" placeholder={t("search_placeholder")} value={query} onChange={(event) => setQuery(event.target.value)} />
        <button type="button" className="orders-btn dark" onClick={() => void load()}>
          {t("retry")}
        </button>
      </div>
      <div className="orders-chipRow">
        <button type="button" className={`orders-chip ${status === "" ? "active" : ""}`} onClick={() => setStatus("")}>
          {t("filter_all")}
        </button>
        {STATUSES.map((item) => (
          <button key={item} type="button" className={`orders-chip ${status === item ? "active" : ""}`} onClick={() => setStatus(item)}>
            {t(`status_${item}`)}
          </button>
        ))}
      </div>
      {suppliers.length ? (
        <div className="orders-field" style={{ marginBottom: 12 }}>
          <label>{t("filter_supplier")}</label>
          <select className="orders-select" value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
            <option value="">{t("filter_all")}</option>
            {suppliers.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {error ? <OrdersError text={error} onRetry={() => void load()} /> : null}
      {!error && !orders ? <OrdersLoading /> : null}
      {!error && orders && !shown.length ? <OrdersEmpty title={t("orders_empty")} text={t("orders_empty_text")} /> : null}

      {shown.map((order) => {
        const zaloUrl = order.zaloUrl ?? suppliers.find((row) => row.id === order.supplierId)?.zaloUrl ?? null;
        return (
          <div key={order.id} className="orders-card">
            <Link href={`/orders/${order.id}`} className="orders-supplierBtn">
              <div>
                <OrderHeading supplierName={order.supplierName} docNo={order.docNo || order.id} warehouseName={order.warehouseName} />
                <div className="orders-meta" style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span className={orderStatusClass(order.status)}>{t(`status_${order.status}`)}</span>
                </div>
                <div className="orders-meta" style={{ marginTop: 8 }}>
                  {t("placed_by")} {personLabel(order.placedByName, order.placedBy, order.createdByName, order.createdBy)} ·{" "}
                  {formatVietnamDateTime(order.placedAt ?? order.createdAt) || "—"}
                </div>
              </div>
            </Link>
            <OrderZaloOpenRow
              status={order.status}
              zaloUrl={zaloUrl}
              zaloLabel={t("open_zalo")}
              openLabel={t("open_half")}
              openHref={`/orders/${order.id}`}
            />
          </div>
        );
      })}
    </div>
  );
}
