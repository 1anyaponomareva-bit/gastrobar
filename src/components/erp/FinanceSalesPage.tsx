"use client";

import { useMemo, useState } from "react";
import type { ErpSalesDocument } from "@/lib/erp/sales";
import { useErp } from "./ErpShell";
import { FinanceMobileNav, FINANCE_HREFS } from "./financeNav";
import { errorText, Field, NavLink, PageHead, savingText, T, vnd } from "./ui";

function statusLabel(status: string) {
  switch (status) {
    case "draft":
      return T("Черновик", "Draft", "Nháp");
    case "posted":
      return T("Проведён", "Posted", "Đã ghi");
    case "cancelled":
      return T("Отменён", "Cancelled", "Đã hủy");
    case "partially_refunded":
      return T("Частичный возврат", "Partially refunded", "Hoàn một phần");
    case "refunded":
      return T("Возврат", "Refunded", "Đã hoàn");
    default:
      return status;
  }
}

export function FinanceSalesListPage() {
  const { state, run } = useErp();
  const docs = state?.salesDocuments ?? [];
  const channels = state?.channels ?? [];
  const locations = state?.locations ?? [];
  const dishes = state?.dishes ?? [];
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const channelName = (id?: string | null) => channels.find((c) => c.id === id)?.name ?? "—";
  const locationName = (id?: string | null) => locations.find((l) => l.id === id)?.name ?? "—";

  const createDraft = async () => {
    setBusy(true);
    setErr(null);
    try {
      const dish = dishes[0];
      const res = await run({
        action: "saveSalesDocument",
        value: {
          source_system: "manual",
          sales_channel_id: channels[0]?.id ?? null,
          business_location_id: locations[0]?.id ?? null,
          payment_status: "unpaid",
          lines: dish
            ? [
                {
                  dish_id: dish.id,
                  description: dish.name_en || dish.name_vn || "Dish",
                  quantity: 1,
                  gross_sales: Number(dish.sale_price ?? 0),
                  merchant_funded_discount: 0,
                  platform_funded_discount: 0,
                },
              ]
            : [{ description: "Manual line", quantity: 1, gross_sales: 0 }],
        },
      });
      const id = (res as { id?: string })?.id;
      if (id) window.location.href = `/erp/finance/sales/${id}`;
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="erpMenu erpFinance">
      <PageHead
        title={T("Продажи", "Sales", "Bán hàng")}
        sub={T(
          "Документы продаж (начисление). Не путать с кассовой книгой Cash Basis.",
          "Accrual sales documents. Not the cashbook (Cash Basis).",
          "Chứng từ bán (dồn tích). Không phải sổ quỹ Cash Basis.",
        )}
      />
      <FinanceMobileNav active={FINANCE_HREFS.sales} />
      <div className="erpActions" style={{ marginBottom: 12 }}>
        <button type="button" className="erpBtn primary" disabled={busy} onClick={createDraft}>
          {busy ? savingText() : T("Новая продажа", "New sale", "Bán mới")}
        </button>
      </div>
      {err ? <p className="erpNotice warn">{err}</p> : null}
      <section className="erpMenuPanel">
        <div className="erpTableWrap erpMenuWrap">
          <table className="erpTable erpMenuTable" data-testid="sales-docs-table">
            <thead>
              <tr>
                <th>{T("Дата", "Date", "Ngày")}</th>
                <th>{T("Источник", "Source", "Nguồn")}</th>
                <th>{T("Канал", "Channel", "Kênh")}</th>
                <th>{T("Подразделение", "Location", "Điểm")}</th>
                <th>{T("Статус", "Status", "TT")}</th>
                <th>{T("Сверка", "Reconcile", "Đối soát")}</th>
                <th className="num">{T("Gross", "Gross", "Gross")}</th>
                <th className="num">{T("Net", "Net", "Net")}</th>
                <th className="num">VAT</th>
                <th className="num">COGS</th>
              </tr>
            </thead>
            <tbody>
              {docs.length === 0 ? (
                <tr>
                  <td colSpan={10}>{T("Нет документов продаж", "No sales documents", "Chưa có chứng từ bán")}</td>
                </tr>
              ) : (
                docs.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <NavLink href={`/erp/finance/sales/${d.id}`}>{d.business_date}</NavLink>
                    </td>
                    <td>{d.source_system}</td>
                    <td>{channelName(d.sales_channel_id)}</td>
                    <td>{locationName(d.business_location_id)}</td>
                    <td>{statusLabel(String(d.order_status))}</td>
                    <td>{d.reconciliation_status}</td>
                    <td className="num">{vnd(d.gross_sales)}</td>
                    <td className="num">{vnd(d.net_revenue ?? null)}</td>
                    <td className="num">{vnd(d.output_vat_amount ?? null)}</td>
                    <td className="num">
                      {d.cogs_status === "pending"
                        ? T("ожидает", "pending", "chờ")
                        : vnd(d.actual_cogs ?? null)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export function FinanceSalesDetailPage({ id }: { id: string }) {
  const { state, run } = useErp();
  const doc = useMemo(
    () => (state?.salesDocuments ?? []).find((d) => d.id === id) as ErpSalesDocument | undefined,
    [state?.salesDocuments, id],
  );
  const lines = useMemo(
    () => (state?.salesLines ?? []).filter((l) => l.document_id === id),
    [state?.salesLines, id],
  );
  const links = useMemo(
    () => (state?.salesSourceLinks ?? []).filter((l) => l.sales_document_id === id),
    [state?.salesSourceLinks, id],
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!doc) {
    return (
      <div className="erpMenu erpFinance">
        <PageHead title={T("Продажа не найдена", "Sale not found", "Không thấy")} />
        <NavLink href={FINANCE_HREFS.sales}>← {T("К списку", "Back to list", "Danh sách")}</NavLink>
      </div>
    );
  }

  const locked = doc.order_status !== "draft";

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="erpMenu erpFinance">
      <NavLink href={FINANCE_HREFS.sales} className="erpBack">
        ← {T("Продажи", "Sales", "Bán hàng")}
      </NavLink>
      <PageHead
        title={`${T("Продажа", "Sale", "Bán")} ${doc.internal_order_id}`}
        sub={`${statusLabel(String(doc.order_status))} · ${doc.source_system} · ${doc.canonical_order_key}`}
      />
      <FinanceMobileNav active={FINANCE_HREFS.sales} />
      {err ? <p className="erpNotice warn">{err}</p> : null}
      <section className="erpCard erpGrid two">
        <Field label={T("Business date", "Business date", "Business date")}>
          <input className="erpInput" value={doc.business_date} readOnly />
        </Field>
        <Field label={T("Order at", "Order at", "Order at")}>
          <input className="erpInput" value={doc.order_at} readOnly />
        </Field>
        <Field label={T("Payment status", "Payment status", "Payment")}>
          <input className="erpInput" value={doc.payment_status} readOnly />
        </Field>
        <Field label={T("Reconciliation", "Reconciliation", "Đối soát")}>
          <input className="erpInput" value={doc.reconciliation_status} readOnly />
        </Field>
        <Field label="Gross Sales">
          <strong>{vnd(doc.gross_sales)}</strong>
        </Field>
        <Field label="Net Revenue">
          <strong>{vnd(doc.net_revenue ?? null)}</strong>
        </Field>
        <Field label="Output VAT">
          <strong>
            {vnd(doc.output_vat_amount ?? null)}
            {doc.output_vat_rate != null ? ` (${doc.output_vat_rate}%)` : ""}
          </strong>
        </Field>
        <Field label="Actual / Pending COGS">
          <strong>
            {doc.cogs_status} · {vnd(doc.actual_cogs ?? null)}
          </strong>
          {doc.cogs_pending_reason ? <div className="erpHint">{doc.cogs_pending_reason}</div> : null}
        </Field>
      </section>

      <section className="erpMenuPanel" style={{ marginTop: 16 }}>
        <h2>{T("Строки", "Lines", "Dòng")}</h2>
        <div className="erpTableWrap">
          <table className="erpTable erpMenuTable">
            <thead>
              <tr>
                <th>#</th>
                <th>{T("Описание", "Description", "Mô tả")}</th>
                <th className="num">{T("Кол-во", "Qty", "SL")}</th>
                <th className="num">Gross</th>
                <th className="num">VAT</th>
                <th className="num">Net</th>
                <th>COGS</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id}>
                  <td>{l.line_no}</td>
                  <td>{l.description ?? l.dish_id ?? l.product_id ?? "—"}</td>
                  <td className="num">{l.quantity}</td>
                  <td className="num">{vnd(l.gross_sales)}</td>
                  <td className="num">{vnd(l.output_vat_amount ?? null)}</td>
                  <td className="num">{vnd(l.net_revenue ?? null)}</td>
                  <td>
                    {l.cogs_status}
                    {l.cogs_pending_reason ? ` (${l.cogs_pending_reason})` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="erpMenuPanel" style={{ marginTop: 16 }}>
        <h2>{T("Source links", "Source links", "Liên kết nguồn")}</h2>
        <ul>
          {links.length === 0 ? <li>—</li> : null}
          {links.map((l) => (
            <li key={l.id}>
              {l.source_system} / {l.external_id} · {l.match_kind}
            </li>
          ))}
        </ul>
      </section>

      <div className="erpActions" style={{ marginTop: 16, gap: 8, displayWrap: "wrap" }}>
        {!locked ? (
          <button
            type="button"
            className="erpBtn primary"
            disabled={busy}
            onClick={() => act(() => run({ action: "postSalesDocument", id: doc.id }))}
          >
            {T("Провести", "Post", "Ghi sổ")}
          </button>
        ) : null}
        {doc.order_status === "posted" || doc.order_status === "partially_refunded" ? (
          <>
            <button
              type="button"
              className="erpBtn"
              disabled={busy}
              onClick={() => act(() => run({ action: "postSalesCogs", id: doc.id, autoConsume: false }))}
              title={T("Без списания склада (по умолчанию)", "No stock consume (default)", "Không xuất kho")}
            >
              {T("COGS: pending check", "COGS: pending check", "COGS: pending")}
            </button>
            <button
              type="button"
              className="erpBtn"
              disabled={busy}
              onClick={() => act(() => run({ action: "refundSalesDocument", id: doc.id, full: true }))}
            >
              {T("Полный возврат", "Full refund", "Hoàn toàn bộ")}
            </button>
          </>
        ) : null}
        {doc.order_status !== "cancelled" ? (
          <button
            type="button"
            className="erpBtn"
            disabled={busy}
            onClick={() => act(() => run({ action: "cancelSalesDocument", id: doc.id, reason: "ui_cancel" }))}
          >
            {T("Отменить", "Cancel", "Hủy")}
          </button>
        ) : null}
      </div>
      <p className="erpHint" style={{ marginTop: 12 }}>
        {T(
          "Автосписание склада при проведении продажи выключено (sales_auto_consume_stock=false). FIFO COGS — только явным тестовым вызовом с autoConsume и флагом настроек.",
          "Auto stock consume on sale post is off (sales_auto_consume_stock=false). FIFO COGS only via explicit test call + settings flag.",
          "Tắt xuất kho tự động khi ghi bán. FIFO COGS chỉ khi bật cờ và gọi rõ ràng.",
        )}
      </p>
    </div>
  );
}
