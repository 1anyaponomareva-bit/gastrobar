"use client";

import { useCallback, useEffect, useState } from "react";
import { closePurchasingOrder, errorMessage, getPurchasingOrder } from "@/lib/orders/api";
import { formatOrderLineBaseHint, formatOrderLineQty } from "@/lib/orders/orderList";
import { displayRemainingQty } from "@/lib/orders/qty";
import type { SupplierOrder } from "@/lib/orders/types";
import { PurchasingStatusBadge } from "./PurchasingStatus";
import { Empty, errorText, loadingText, NavLink, PageHead, T } from "./ui";

export function PurchasingOrderCard({ id }: { id: string }) {
  const [order, setOrder] = useState<SupplierOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setOrder(await getPurchasingOrder(id));
    } catch (err) {
      setOrder(null);
      setError(errorMessage(err, errorText("network"), T("Не удалось открыть заказ", "Could not open the order", "Không mở được đơn")));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const closeRemainder = async () => {
    if (!order || busy) return;
    const reason = window.prompt(T("Причина закрытия недопоставки", "Why close the remaining quantity?", "Lý do đóng phần còn lại"));
    if (!reason?.trim()) return;
    setBusy(true);
    setNotice(null);
    try {
      setOrder(await closePurchasingOrder(order.id, reason.trim()));
      setNotice(T("Остаток закрыт", "Remaining quantity closed", "Đã đóng phần còn lại"));
    } catch (err) {
      setNotice(errorMessage(err, errorText("network"), T("Не удалось закрыть остаток", "Could not close the remainder", "Không đóng được phần còn lại")));
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
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
    );
  }
  if (!order) return <div className="erpLoading">{loadingText()}</div>;

  const openQty = order.lines.reduce((sum, line) => sum + line.remainingQty, 0);

  return (
    <>
      <NavLink href="/erp/purchasing/orders" className="erpBack">
        ← {T("Заказы поставщикам", "Supplier orders", "Đơn nhà cung cấp")}
      </NavLink>
      <PageHead
        title={
          <>
            {order.docNo || order.id} <PurchasingStatusBadge status={order.status} />
          </>
        }
        sub={`${order.supplierName} · ${order.warehouseName ?? "—"}`}
      />

      {notice ? <div className={`erpNotice ${notice.includes("Не") || notice.includes("Could not") || notice.includes("Không") ? "bad" : "ok"}`}>{notice}</div> : null}
      {order.clarifyReason ? (
        <div className="erpNotice warn">
          {T("Возврат на уточнение", "Returned to clarify", "Trả lại để làm rõ")}: {order.clarifyReason}
        </div>
      ) : null}

      <p className="erpHint">
        {T(
          "«Товар получен» только помечает заказ. Поставка не создаётся, остаток склада не меняется.",
          "“Goods received” only marks the order. No warehouse receipt is created, and stock does not change.",
          "“Đã nhận hàng” chỉ đánh dấu đơn. Không tạo phiếu nhập, tồn kho không đổi.",
        )}
      </p>

      <section className="erpCard">
        <p>
          {T("Заказал", "Placed by", "Đặt bởi")} {order.placedBy ?? order.createdBy ?? "—"} · {order.placedAt ?? order.createdAt ?? "—"}
        </p>
        {order.receivedAt ? (
          <p>
            {T("Товар получен", "Goods received", "Đã nhận hàng")} · {order.receivedBy ?? "—"} · {order.receivedAt}
          </p>
        ) : null}
        {order.expectedDelivery ? (
          <p>
            {T("Ожидаемая доставка", "Expected delivery", "Giao dự kiến")}: {order.expectedDelivery}
          </p>
        ) : null}
        {order.comment ? <p>{order.comment}</p> : null}
      </section>

      <h3>{T("Позиции", "Lines", "Dòng hàng")}</h3>
      <div className="erpTableWrap">
        <table className="erpTable stack">
          <thead>
            <tr>
              <th>{T("Товар", "Product", "Hàng")}</th>
              <th>{T("Заказано", "Ordered", "Đặt")}</th>
              <th>{T("Принято сотрудником", "Accepted", "NV nhận")}</th>
              <th>{T("Проведено", "Posted", "Ghi sổ")}</th>
              <th>{T("Осталось", "Remaining", "Còn")}</th>
            </tr>
          </thead>
          <tbody>
            {order.lines.map((line) => (
              <tr key={line.id ?? `${line.product_id}-${line.pack_id}`}>
                <td className="main">
                  <div>{line.nameEn || line.nameVn}</div>
                  <div className="erpMuted">{[line.nameVn !== line.nameEn ? line.nameVn : null, line.brand, line.packLabel].filter(Boolean).join(" · ")}</div>
                </td>
                <td>
                  {formatOrderLineQty(line.orderedQty, line, "ordered")}
                  {formatOrderLineBaseHint(line) ? <div className="erpMuted">{formatOrderLineBaseHint(line)}</div> : null}
                </td>
                <td>{formatOrderLineQty(line.acceptedQty, line, "base")}</td>
                <td>{formatOrderLineQty(line.postedQty, line, "base")}</td>
                <td>{formatOrderLineQty(displayRemainingQty(line), line, "base")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>{T("Приёмки", "Receipts", "Phiếu nhập")}</h3>
      {order.receipts.length ? (
        <div className="erpCard">
          {order.receipts.map((receipt) => (
            <div key={receipt.id} style={{ marginBottom: 12 }}>
              <NavLink href={`/erp/purchasing/receipts/${receipt.id}`} className="erpName">
                {receipt.docNo || receipt.id}
              </NavLink>{" "}
              <PurchasingStatusBadge status={receipt.status} />
              <div className="erpMuted">{receipt.createdAt} · {receipt.createdBy}</div>
              <NavLink href={`/erp/documents/${receipt.id}`} className="erpLink">
                {T("Форма поставки", "Receipt form", "Form nhập hàng")}
              </NavLink>
            </div>
          ))}
        </div>
      ) : (
        <Empty title={T("Приёмок ещё нет", "No receipts yet", "Chưa có phiếu nhập")} />
      )}

      <h3>{T("История", "History", "Lịch sử")}</h3>
      {order.history.length ? (
        <ul>
          {order.history.map((event, index) => (
            <li key={`${event.at}-${index}`}>
              {event.at} {event.by ? `· ${event.by}` : ""} — {event.text || event.type}
            </li>
          ))}
        </ul>
      ) : (
        <Empty title={T("Истории пока нет", "No history yet", "Chưa có lịch sử")} />
      )}

      {openQty > 0 && order.status !== "closed" && order.status !== "received" ? (
        <div className="erpActions">
          <button type="button" className="erpBtn" disabled={busy} onClick={() => void closeRemainder()}>
            {T("Закрыть недопоставку", "Close remaining qty", "Đóng phần còn lại")}
          </button>
        </div>
      ) : null}
    </>
  );
}
