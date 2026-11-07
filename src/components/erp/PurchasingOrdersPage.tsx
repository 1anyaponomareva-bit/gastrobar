"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { errorMessage, listPurchasingOrders } from "@/lib/orders/api";
import type { OrderStatus, SupplierOrder } from "@/lib/orders/types";
import { formatQty, sumDisplayRemaining } from "@/lib/orders/qty";
import { PurchasingStatusBadge } from "./PurchasingStatus";
import { Empty, errorText, loadingText, NavLink, PageHead, T } from "./ui";

const STATUSES: OrderStatus[] = ["ordered", "partial", "received", "closed"];

export function PurchasingOrdersPage() {
  const [orders, setOrders] = useState<SupplierOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<OrderStatus | "">("");
  const [supplier, setSupplier] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      setOrders(await listPurchasingOrders({ status: status || undefined }));
    } catch (err) {
      setOrders(null);
      setError(errorMessage(err, errorText("network"), T("Не удалось загрузить заказы", "Could not load orders", "Không tải được đơn")));
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  const suppliers = useMemo(() => {
    const map = new Map<string, string>();
    for (const order of orders ?? []) map.set(order.supplierId, order.supplierName);
    return [...map.entries()];
  }, [orders]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (orders ?? []).filter((order) => {
      if (supplier && order.supplierId !== supplier) return false;
      if (status && order.status !== status) return false;
      if (!q) return true;
      return `${order.docNo} ${order.supplierName} ${order.comment ?? ""} ${order.createdBy ?? ""}`.toLowerCase().includes(q);
    });
  }, [orders, query, status, supplier]);

  return (
    <>
      <PageHead
        title={T("Заказы поставщикам", "Supplier orders", "Đơn nhà cung cấp")}
        sub={T("Заявки сотрудников и связанные приёмки.", "Staff orders and linked receipts.", "Đơn nhân viên và phiếu nhập liên quan.")}
      />

      <div className="erpFilters">
        <input className="erpSearch" value={query} placeholder={T("Поиск", "Search", "Tìm")} onChange={(event) => setQuery(event.target.value)} />
        <select value={status} onChange={(event) => setStatus(event.target.value as OrderStatus | "")}>
          <option value="">{T("Все состояния", "All statuses", "Mọi trạng thái")}</option>
          {STATUSES.map((item) => (
            <option key={item} value={item}>
              {item === "ordered"
                ? T("Заказан", "Ordered", "Đã đặt")
                : item === "partial"
                  ? T("Частично", "Partial", "Một phần")
                  : item === "received"
                    ? T("Получен", "Received", "Đã nhận")
                    : T("Закрыт", "Closed", "Đã đóng")}
            </option>
          ))}
        </select>
        <select value={supplier} onChange={(event) => setSupplier(event.target.value)}>
          <option value="">{T("Все поставщики", "All suppliers", "Mọi NCC")}</option>
          {suppliers.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </div>

      {error ? (
        <Empty
          kind="error"
          title={T("Ошибка загрузки", "Load failed", "Lỗi tải")}
          text={error}
          action={
            <button type="button" className="erpBtn" onClick={() => void load()}>
              {T("Повторить", "Try again", "Thử lại")}
            </button>
          }
        />
      ) : null}

      {!error && !orders ? <div className="erpLoading">{loadingText()}</div> : null}

      {!error && orders && !shown.length ? (
        <Empty
          kind="empty"
          title={T("Заказов пока нет", "No orders yet", "Chưa có đơn")}
          text={T("Оформленные сотрудниками заказы появятся здесь.", "Orders placed by staff appear here.", "Đơn nhân viên đặt sẽ hiện ở đây.")}
        />
      ) : null}

      {!error && shown.length ? (
        <div className="erpTableWrap">
          <table className="erpTable stack">
            <thead>
              <tr>
                <th>{T("Заказ", "Order", "Đơn")}</th>
                <th>{T("Поставщик", "Supplier", "NCC")}</th>
                <th>{T("Склад", "Location", "Kho")}</th>
                <th>{T("Статус", "Status", "TT")}</th>
                <th>{T("Осталось", "Remaining", "Còn")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((order) => {
                const remaining = sumDisplayRemaining(order.lines);
                return (
                  <tr key={order.id}>
                    <td className="main">
                      <NavLink href={`/erp/purchasing/orders/${order.id}`} className="erpName">
                        {order.docNo || order.id}
                      </NavLink>
                      <div className="erpMuted">{order.placedAt || order.createdAt}</div>
                    </td>
                    <td>{order.supplierName}</td>
                    <td>{order.warehouseName ?? "—"}</td>
                    <td>
                      <PurchasingStatusBadge status={order.status} />
                    </td>
                    <td>{formatQty(remaining)}</td>
                    <td>
                      <NavLink href={`/erp/purchasing/orders/${order.id}`} className="erpLink">
                        {T("Открыть", "Open", "Mở")}
                      </NavLink>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}
