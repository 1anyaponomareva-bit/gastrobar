"use client";

import { useCallback, useEffect, useState } from "react";
import { errorMessage, getPurchasingReceipt, postErpDocument, returnReceiptToClarify } from "@/lib/orders/api";
import { formatOrderLineQty } from "@/lib/orders/orderList";
import type { OrderReceipt, SupplierOrder } from "@/lib/orders/types";
import { useErp } from "./ErpShell";
import { PurchasingStatusBadge } from "./PurchasingStatus";
import { Empty, errorText, loadingText, NavLink, savingText, T } from "./ui";

/**
 * Source order + actuals + discrepancies for a receipt created from employee receive.
 * Safe to mount on the existing DocumentEditor: returns null when the receipt has no order.
 * Agent 4 can import this into DocumentEditor without rewriting that file here.
 */
export function PurchasingReceiptPanel({ documentId, required = false }: { documentId: string; required?: boolean }) {
  const { act, busy } = useErp();
  const [receipt, setReceipt] = useState<OrderReceipt | null>(null);
  const [order, setOrder] = useState<SupplierOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setMissing(false);
    try {
      const data = await getPurchasingReceipt(documentId);
      if (!data.order && !data.receipt.id) {
        setMissing(true);
        setReceipt(null);
        setOrder(null);
        return;
      }
      setReceipt(data.receipt);
      setOrder(data.order);
      if (!data.order) setMissing(true);
    } catch (err) {
      const status = typeof err === "object" && err && "status" in err ? Number((err as { status: number }).status) : 0;
      if (status === 404) {
        setMissing(true);
        setReceipt(null);
        setOrder(null);
        return;
      }
      setError(errorMessage(err, errorText("network"), T("Не удалось загрузить приёмку заказа", "Could not load the order receipt", "Không tải được phiếu nhập đơn")));
    }
  }, [documentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const post = async () => {
    if (busy) return;
    setNotice(null);
    const postedText = T("Поставка проведена — остатки обновлены", "Receipt posted — stock updated", "Đã ghi sổ — tồn kho đã cập nhật");
    const viaAct = await act({ action: "postDocument", id: documentId }, postedText);
    if (viaAct) {
      setNotice({ ok: true, text: postedText });
      await load();
      return;
    }
    try {
      await postErpDocument(documentId);
      setNotice({ ok: true, text: postedText });
      await load();
    } catch (err) {
      setNotice({
        ok: false,
        text: errorMessage(err, errorText("network"), T("Проведение не выполнено", "Posting did not complete", "Chưa ghi sổ được")),
      });
    }
  };

  const sendBack = async () => {
    const reason = window.prompt(T("Почему вернуть сотруднику на уточнение?", "Why return this to the employee?", "Lý do trả nhân viên làm rõ?"));
    if (!reason?.trim()) return;
    setNotice(null);
    try {
      const updated = await returnReceiptToClarify(documentId, reason.trim());
      setReceipt(updated);
      setNotice({ ok: true, text: T("Возвращено на уточнение", "Returned to clarify", "Đã trả lại để làm rõ") });
      await load();
    } catch (err) {
      setNotice({
        ok: false,
        text: errorMessage(err, errorText("network"), T("Не удалось вернуть на уточнение", "Could not return to clarify", "Không trả lại được")),
      });
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

  if (!receipt && !missing && !error) return <div className="erpLoading">{loadingText()}</div>;
  if (missing && !order) {
    if (!required) return null;
    return (
      <Empty
        title={T("У этой поставки нет исходного заказа", "This receipt has no source order", "Phiếu nhập này không có đơn gốc")}
        action={
          <NavLink href={`/erp/documents/${documentId}`} className="erpBtn">
            {T("Открыть поставку", "Open receipt", "Mở phiếu nhập")}
          </NavLink>
        }
      />
    );
  }

  const unpublished = receipt && receipt.status !== "posted" && receipt.status !== "cancelled";

  return (
    <section className="erpCard" data-testid="purchasing-receipt-source">
      <h3>{T("Исходный заказ", "Source order", "Đơn gốc")}</h3>
      {order ? (
        <p>
          <NavLink href={`/erp/purchasing/orders/${order.id}`} className="erpName">
            {order.docNo || order.id}
          </NavLink>{" "}
          <PurchasingStatusBadge status={order.status} />
          <span className="erpMuted">
            {" "}
            · {order.supplierName} · {order.warehouseName ?? ""}
          </span>
        </p>
      ) : (
        <p className="erpMuted">{T("Заказ не найден", "Order not found", "Không thấy đơn")}</p>
      )}

      {receipt?.clarifyReason ? (
        <div className="erpNotice warn">
          {T("Причина уточнения", "Clarify reason", "Lý do làm rõ")}: {receipt.clarifyReason}
        </div>
      ) : null}

      {notice ? <div className={`erpNotice ${notice.ok ? "ok" : "bad"}`}>{notice.text}</div> : null}

      <h3>{T("Фактически принято", "Actual received", "Thực nhận")}</h3>
      {receipt?.lines.length ? (
        <div className="erpTableWrap">
          <table className="erpTable stack">
            <thead>
              <tr>
                <th>{T("Товар", "Product", "Hàng")}</th>
                <th>{T("Заказано", "Ordered", "Đặt")}</th>
                <th>{T("Факт", "Actual", "Thực")}</th>
                <th>{T("Расхождение", "Discrepancy", "Chênh")}</th>
              </tr>
            </thead>
            <tbody>
              {receipt.lines.map((line, index) => (
                <tr key={line.orderLineId ?? `${line.product_id}-${index}`}>
                  <td className="main">
                    <div>{line.nameEn || line.nameVn}</div>
                    <div className="erpMuted">{line.packLabel}</div>
                  </td>
                  <td>{formatOrderLineQty(line.orderedQty, line, "ordered")}</td>
                  <td>{formatOrderLineQty(line.actualQty, line, "base")}</td>
                  <td>
                    {line.discrepancyKind !== "none" ? (
                      <span className="erpBadge warn">
                        {line.discrepancyKind}
                        {line.discrepancyNote ? ` · ${line.discrepancyNote}` : ""}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="erpMuted">{T("Нет строк фактического получения", "No actual receive lines", "Chưa có dòng thực nhận")}</p>
      )}

      {receipt?.photos.length ? (
        <div className="erpRow" style={{ flexWrap: "wrap", gap: 8, marginTop: 12 }}>
          {receipt.photos.map((photo) => (
            <a key={photo.id ?? photo.url} href={photo.url || photo.dataUrl} target="_blank" rel="noopener noreferrer">
              <img src={photo.url || photo.dataUrl} alt={photo.fileName} width={96} height={96} style={{ objectFit: "cover", borderRadius: 8 }} />
            </a>
          ))}
        </div>
      ) : null}

      <p className="erpHint">
        {T(
          "Подтверждение сотрудником остатки не увеличивает. Проведение делает это через существующую поставку ERP.",
          "The employee confirm does not increase stock. Posting this existing ERP receipt does.",
          "Nhân viên xác nhận không tăng tồn. Ghi sổ phiếu nhập ERP này mới tăng.",
        )}
      </p>

      {unpublished ? (
        <div className="erpActions split">
          <button type="button" className="erpBtn" disabled={busy} onClick={() => void sendBack()}>
            {T("Вернуть на уточнение", "Return to clarify", "Trả lại để làm rõ")}
          </button>
          <button type="button" className="erpBtn primary" disabled={busy} onClick={() => void post()}>
            {busy ? savingText() : T("Подтвердить и провести", "Confirm and post", "Xác nhận và ghi sổ")}
          </button>
        </div>
      ) : null}
    </section>
  );
}

export function PurchasingReceiptPage({ id }: { id: string }) {
  return (
    <>
      <NavLink href="/erp/purchasing/orders" className="erpBack">
        ← {T("Заказы поставщикам", "Supplier orders", "Đơn nhà cung cấp")}
      </NavLink>
      <PurchasingReceiptPanel documentId={id} required />
      <p className="erpHint">
        <NavLink href={`/erp/documents/${id}`} className="erpLink">
          {T("Открыть полную форму поставки", "Open the full receipt form", "Mở form nhập hàng đầy đủ")}
        </NavLink>
      </p>
    </>
  );
}
