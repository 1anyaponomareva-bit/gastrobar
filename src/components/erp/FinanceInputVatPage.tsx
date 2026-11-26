"use client";

import { useEffect, useMemo, useState } from "react";
import { currentYearMonth, monthRange } from "@/lib/erp/finance";
import { useErp } from "./ErpShell";
import { FinanceMobileNav, FINANCE_HREFS } from "./financeNav";
import { Field, PageHead, T, vnd } from "./ui";

type RegisterRow = {
  source_document_type?: string;
  source_document_id?: string;
  source_document_no?: string | null;
  supplier_name?: string | null;
  invoice_number?: string | null;
  expense_category?: string | null;
  tax_rate?: number | null;
  net_amount?: number | null;
  vat_amount?: number | null;
  deductible_vat?: number | null;
  non_deductible_vat?: number | null;
  pending_vat?: number | null;
  deduction_status?: string | null;
  transaction_date?: string | null;
  invoice_date?: string | null;
  tax_recognition_date?: string | null;
  href?: string | null;
  business_location_id?: string | null;
};

type RegisterPayload = {
  rows?: RegisterRow[];
  totals?: {
    input_vat_total?: number;
    deductible_vat?: number;
    pending_vat?: number;
    non_deductible_vat?: number;
    vat_adjustments?: number;
  };
  tax_period_mode?: string;
};

function statusLabel(s?: string | null) {
  switch (s) {
    case "pending":
      return T("Ожидает", "Pending", "Chờ");
    case "deductible":
      return T("К вычету", "Deductible", "Được khấu trừ");
    case "partial":
      return T("Частично", "Partial", "Một phần");
    case "non_deductible":
      return T("Без вычета", "Non-deductible", "Không khấu trừ");
    default:
      return s ?? "—";
  }
}

export function FinanceInputVatPage() {
  const { state, run } = useErp();
  const [month, setMonth] = useState(currentYearMonth);
  const { from, to } = monthRange(month);
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [sourceType, setSourceType] = useState("");
  const [locationId, setLocationId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [payload, setPayload] = useState<RegisterPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const categories = state?.inputVatCategories ?? [];
  const locations = state?.locations ?? [];
  const suppliers = state?.suppliers ?? [];

  const load = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = (await run({
        action: "inputVatRegister",
        value: {
          from,
          to,
          status: status || null,
          category: category || null,
          source_type: sourceType || null,
          location_id: locationId || null,
          supplier_id: supplierId || null,
        },
      })) as RegisterPayload;
      setPayload(res);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, status, category, sourceType, locationId, supplierId]);

  const rows = payload?.rows ?? [];
  const totals = payload?.totals ?? {};
  const pendingOnly = useMemo(() => rows.filter((r) => r.deduction_status === "pending"), [rows]);

  const catName = (code?: string | null) =>
    categories.find((c) => c.code === code)?.name_ru ||
    categories.find((c) => c.code === code)?.name_en ||
    code ||
    "—";

  return (
    <div className="erpMenu erpFinance">
      <PageHead
        title={T("Входящий НДС", "Input VAT", "VAT đầu vào")}
        sub={T(
          "Единый налоговый регистр (закупки R2 + накладные + расходы-контракт). Без прогнозных сумм Grab.",
          "Unified tax register (R2 purchases + invoices + expense contract). No Grab forecast amounts.",
          "Sổ thuế thống nhất. Không gồm dự báo Grab.",
        )}
      />
      <FinanceMobileNav active={FINANCE_HREFS.inputVat} />

      <div className="erpFinanceTotals" data-testid="input-vat-totals">
        <div>
          <span>{T("Входящий НДС", "Input VAT total", "Tổng VAT đầu vào")}</span>
          <strong>{vnd(totals.input_vat_total ?? null)}</strong>
        </div>
        <div>
          <span>{T("К вычету", "Deductible", "Được khấu trừ")}</span>
          <strong>{vnd(totals.deductible_vat ?? null)}</strong>
        </div>
        <div>
          <span>{T("Pending VAT", "Pending VAT", "VAT chờ")}</span>
          <strong>{vnd(totals.pending_vat ?? null)}</strong>
        </div>
        <div>
          <span>{T("Без вычета", "Non-deductible", "Không khấu trừ")}</span>
          <strong>{vnd(totals.non_deductible_vat ?? null)}</strong>
        </div>
        <div>
          <span>{T("Корректировки", "VAT Adjustments", "Điều chỉnh")}</span>
          <strong>{vnd(totals.vat_adjustments ?? null)}</strong>
        </div>
      </div>

      <div className="erpFinancePeriod" style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        <label>
          {T("Период", "Period", "Kỳ")}{" "}
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </label>
        <Field label={T("Статус", "Status", "TT")}>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">{T("Все", "All", "Tất cả")}</option>
            <option value="pending">pending</option>
            <option value="deductible">deductible</option>
            <option value="partial">partial</option>
            <option value="non_deductible">non_deductible</option>
          </select>
        </Field>
        <Field label={T("Категория", "Category", "Nhóm")}>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">{T("Все", "All", "Tất cả")}</option>
            {categories.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name_ru || c.name_en}
              </option>
            ))}
          </select>
        </Field>
        <Field label={T("Источник", "Source", "Nguồn")}>
          <select value={sourceType} onChange={(e) => setSourceType(e.target.value)}>
            <option value="">{T("Все", "All", "Tất cả")}</option>
            <option value="receipt">{T("Поставка", "Receipt", "Nhập kho")}</option>
            <option value="expense">{T("Расход", "Expense", "Chi phí")}</option>
            <option value="tax_invoice">{T("Накладная", "Tax invoice", "HĐ VAT")}</option>
          </select>
        </Field>
        <Field label={T("Подразделение", "Location", "Điểm")}>
          <select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            <option value="">{T("Все", "All", "Tất cả")}</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={T("Поставщик", "Supplier", "NCC")}>
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">{T("Все", "All", "Tất cả")}</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <button type="button" className="erpBtn" disabled={busy} onClick={() => void load()}>
          {T("Обновить", "Refresh", "Tải lại")}
        </button>
      </div>

      {err ? <p className="erpNotice warn">{err}</p> : null}
      <p className="erpHint">
        {T("Режим налогового периода", "Tax period mode", "Chế độ kỳ thuế")}: {payload?.tax_period_mode ?? "accountant_tbd"}
      </p>

      <section className="erpMenuPanel">
        <h2>{T("Регистр", "Register", "Sổ")}</h2>
        <div className="erpTableWrap erpMenuWrap">
          <table className="erpTable erpMenuTable" data-testid="input-vat-register">
            <thead>
              <tr>
                <th>{T("Дата", "Date", "Ngày")}</th>
                <th>{T("Поставщик", "Supplier", "NCC")}</th>
                <th>{T("Накладная", "Invoice", "HĐ")}</th>
                <th>{T("Категория", "Category", "Nhóm")}</th>
                <th className="num">{T("Без НДС", "Net", "Chưa VAT")}</th>
                <th className="num">%</th>
                <th className="num">VAT</th>
                <th className="num">{T("К вычету", "Deductible", "Khấu trừ")}</th>
                <th>{T("Статус", "Status", "TT")}</th>
                <th>{T("Документ", "Document", "Chứng từ")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={10}>{T("Нет строк за период", "No rows in period", "Không có dòng")}</td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={`${r.source_document_id}-${r.source_document_line_id ?? i}`}>
                    <td>{r.tax_recognition_date || r.invoice_date || r.transaction_date}</td>
                    <td>{r.supplier_name ?? "—"}</td>
                    <td>{r.invoice_number ?? "—"}</td>
                    <td>{catName(r.expense_category)}</td>
                    <td className="num">{vnd(r.net_amount ?? null)}</td>
                    <td className="num">{r.tax_rate ?? "—"}</td>
                    <td className="num">{vnd(r.vat_amount ?? null)}</td>
                    <td className="num">{vnd(r.deductible_vat ?? null)}</td>
                    <td>{statusLabel(r.deduction_status)}</td>
                    <td>
                      {r.href ? (
                        <a className="erpLink" href={r.href}>
                          {r.source_document_no || r.source_document_type}
                        </a>
                      ) : (
                        r.source_document_type
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="erpMenuPanel" style={{ marginTop: 16 }}>
        <h2>{T("Ожидают подтверждения вычета", "Pending deduction confirmation", "Chờ xác nhận khấu trừ")}</h2>
        <p className="erpHint">
          {T(
            "Pending VAT не входит в сумму к вычету. Наличие накладной ≠ автоматический вычет.",
            "Pending VAT is excluded from deductible total. Invoice alone ≠ automatic deduction.",
            "VAT chờ không nằm trong số được khấu trừ.",
          )}
        </p>
        <ul data-testid="input-vat-pending-list">
          {pendingOnly.length === 0 ? <li>—</li> : null}
          {pendingOnly.map((r, i) => (
            <li key={`p-${r.source_document_id}-${i}`}>
              {r.supplier_name ?? "—"} · {vnd(r.pending_vat ?? null)} · {r.source_document_type}
              {r.href ? (
                <>
                  {" "}
                  <a className="erpLink" href={r.href}>
                    →
                  </a>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
