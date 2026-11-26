"use client";

import { useMemo, useState } from "react";
import { currentYearMonth, monthRange } from "@/lib/erp/finance";
import { useErp } from "./ErpShell";
import { FinanceMobileNav, FINANCE_HREFS } from "./financeNav";
import { errorText, Field, NavLink, PageHead, savingText, T, vnd } from "./ui";

function VatSubNav({
  active,
}: {
  active: "overview" | "periods" | "carryforward" | "payments" | "corrections";
}) {
  const items = [
    { id: "overview", href: FINANCE_HREFS.vatSettlement, label: T("Обзор", "Overview", "Tổng quan") },
    { id: "periods", href: `${FINANCE_HREFS.vatSettlement}/periods`, label: T("Периоды", "Periods", "Kỳ") },
    { id: "carryforward", href: `${FINANCE_HREFS.vatSettlement}/carryforward`, label: T("Перенос", "Carryforward", "Chuyển") },
    { id: "payments", href: `${FINANCE_HREFS.vatSettlement}/payments`, label: T("Оплата", "Payments", "Thanh toán") },
    { id: "corrections", href: `${FINANCE_HREFS.vatSettlement}/corrections`, label: T("Корректировки", "Corrections", "Điều chỉnh") },
  ] as const;
  return (
    <nav className="erpSubTabs" aria-label="VAT Settlement">
      {items.map((t) => (
        <NavLink key={t.id} href={t.href} className={t.id === active ? "active" : ""}>
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}

export function FinanceVatSettlementOverviewPage() {
  const { state } = useErp();
  const settlements = (state?.vatSettlements ?? []) as Array<Record<string, unknown>>;
  const latest = settlements[0];
  const cards: Array<[string, unknown]> = latest
    ? [
        ["Output VAT", latest.output_vat],
        ["Total Input VAT", latest.total_input_vat],
        ["Deductible Input VAT", latest.deductible_input_vat],
        ["Pending Input VAT", latest.pending_input_vat],
        ["Non-Deductible Input VAT", latest.non_deductible_input_vat],
        ["VAT Adjustments", latest.vat_adjustments],
        ["Opening Carryforward", latest.opening_carryforward],
        ["Applied Carryforward", latest.applied_carryforward],
        ["VAT Payable", latest.vat_payable],
        ["Potential Carryforward", latest.potential_carryforward],
        ["VAT Paid", latest.vat_paid],
        ["Outstanding Liability", latest.outstanding_liability],
      ]
    : [];

  return (
    <div className="erpMenu erpFinance">
      <PageHead
        title={T("НДС к уплате", "VAT Settlement", "VAT phải nộp")}
        sub={T(
          "Внутренний налоговый расчёт. Не официальная декларация VN. Pending VAT исключён из вычета.",
          "Internal tax calculation. Not an official VN declaration. Pending VAT excluded from deductible.",
          "Tính thuế nội bộ. Không phải tờ khai chính thức.",
        )}
      />
      <FinanceMobileNav active={FINANCE_HREFS.vatSettlement} />
      <VatSubNav active="overview" />
      {!latest ? (
        <p className="erpHint">{T("Нет расчётов — создайте период", "No settlements yet — create a period", "Chưa có kỳ")}</p>
      ) : (
        <>
          <p className="erpHint">
            {String(latest.period_start)} → {String(latest.period_end)} · {String(latest.settlement_status)} ·{" "}
            {latest.is_final ? T("полный", "final-ready", "đủ dữ liệu") : T("неполный (warnings)", "incomplete warnings", "thiếu DL")}
          </p>
          <div className="erpFinanceTotals" data-testid="vat-settlement-dashboard">
            {cards.map(([label, val]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{vnd(Number(val) || null)}</strong>
              </div>
            ))}
          </div>
          <p className="erpHint">
            <NavLink href={FINANCE_HREFS.outputVat}>{T("Исходящий НДС", "Output VAT", "VAT đầu ra")}</NavLink>
            {" · "}
            <NavLink href={FINANCE_HREFS.inputVat}>{T("Входящий НДС", "Input VAT", "VAT đầu vào")}</NavLink>
            {" · "}
            <NavLink href={FINANCE_HREFS.platforms}>{T("Агрегаторы", "Platforms", "Sàn")}</NavLink>
          </p>
        </>
      )}
    </div>
  );
}

export function FinanceVatSettlementPeriodsPage() {
  const { state, run } = useErp();
  const settlements = (state?.vatSettlements ?? []) as Array<Record<string, unknown>>;
  const [month, setMonth] = useState(currentYearMonth);
  const [kind, setKind] = useState<"monthly" | "quarterly">("monthly");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { from, to } = useMemo(() => {
    if (kind === "monthly") return monthRange(month);
    const [y, m] = month.split("-").map(Number);
    const q = Math.floor((m - 1) / 3);
    const startM = q * 3 + 1;
    const fromQ = `${y}-${String(startM).padStart(2, "0")}-01`;
    const endM = startM + 2;
    const last = new Date(y, endM, 0);
    const toQ = `${y}-${String(endM).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`;
    return { from: fromQ, to: toQ };
  }, [month, kind]);

  const createCalc = async (manual?: Record<string, unknown>) => {
    setBusy(true);
    setErr(null);
    try {
      await run({
        action: "saveVatSettlement",
        value: {
          period_kind: kind,
          period_start: from,
          period_end: to,
          ...(manual
            ? { use_manual_amounts: true, is_final: true, warnings: [], ...manual }
            : {}),
        },
      });
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const approve = async (id: string, force = false) => {
    setBusy(true);
    setErr(null);
    try {
      await run({ action: "approveVatSettlement", id, force });
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = async (id: string) => {
    setBusy(true);
    setErr(null);
    try {
      const data = (await run({ action: "exportVatSettlement", id })) as {
        settlement?: Record<string, unknown>;
        lines?: Array<Record<string, unknown>>;
        disclaimer?: string;
      };
      const rows = [
        ["section", "field", "amount"],
        ...Object.entries(data.settlement || {})
          .filter(([, v]) => typeof v === "number" || v == null)
          .map(([k, v]) => ["settlement", k, String(v ?? "")]),
        ...(data.lines || []).map((l) => ["line", String(l.line_kind), String(l.amount ?? "")]),
        ["meta", "disclaimer", data.disclaimer || ""],
      ];
      const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `vat-settlement-${id}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="erpMenu erpFinance">
      <PageHead title={T("Расчёты по периодам", "Period settlements", "Quyết toán theo kỳ")} />
      <FinanceMobileNav active={FINANCE_HREFS.vatSettlement} />
      <VatSubNav active="periods" />
      <div className="erpFinancePeriod" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <label>
          {T("Период", "Period", "Kỳ")} <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </label>
        <Field label={T("Тип", "Kind", "Loại")}>
          <select value={kind} onChange={(e) => setKind(e.target.value as "monthly" | "quarterly")}>
            <option value="monthly">monthly</option>
            <option value="quarterly">quarterly</option>
          </select>
        </Field>
        <button type="button" className="erpBtn primary" disabled={busy} onClick={() => void createCalc()}>
          {busy ? savingText() : T("Рассчитать из регистров", "Calculate from registers", "Tính từ sổ")}
        </button>
      </div>
      {err ? <p className="erpNotice warn">{err}</p> : null}
      <section className="erpMenuPanel">
        <table className="erpTable erpMenuTable" data-testid="vat-settlements-table">
          <thead>
            <tr>
              <th>{T("Период", "Period", "Kỳ")}</th>
              <th>{T("Статус", "Status", "TT")}</th>
              <th className="num">Output</th>
              <th className="num">Deductible</th>
              <th className="num">Payable</th>
              <th className="num">Paid</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {settlements.length === 0 ? (
              <tr>
                <td colSpan={7}>—</td>
              </tr>
            ) : (
              settlements.map((s) => (
                <tr key={String(s.id)}>
                  <td>
                    {String(s.period_start)} → {String(s.period_end)}
                  </td>
                  <td>
                    {String(s.settlement_status)} / {String(s.payment_status)}
                    {!s.is_final ? " ⚠" : ""}
                  </td>
                  <td className="num">{vnd(Number(s.output_vat) || null)}</td>
                  <td className="num">{vnd(Number(s.deductible_input_vat) || null)}</td>
                  <td className="num">{vnd(Number(s.vat_payable) || null)}</td>
                  <td className="num">{vnd(Number(s.vat_paid) || null)}</td>
                  <td>
                    {s.settlement_status !== "approved" && s.settlement_status !== "filed" ? (
                      <button type="button" className="erpBtn" disabled={busy} onClick={() => void approve(String(s.id), !s.is_final)}>
                        {T("Утвердить", "Approve", "Duyệt")}
                      </button>
                    ) : null}{" "}
                    <button type="button" className="erpBtn" disabled={busy} onClick={() => void exportCsv(String(s.id))}>
                      CSV
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

export function FinanceVatCarryforwardPage() {
  const { state, run } = useErp();
  const rows = (state?.vatCarryforwards ?? []) as Array<Record<string, unknown>>;
  const [amt, setAmt] = useState("0");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="erpMenu erpFinance">
      <PageHead title={T("Перенос НДС", "VAT Carryforward", "VAT chuyển kỳ")} />
      <FinanceMobileNav active={FINANCE_HREFS.vatSettlement} />
      <VatSubNav active="carryforward" />
      <p className="erpHint">
        {T(
          "Отрицательный settlement ≠ автоматический возврат налога. Opening balance — только явным подтверждённым документом.",
          "Negative settlement ≠ automatic tax refund. Opening balance only via confirmed document.",
          "Số âm ≠ hoàn thuế tự động.",
        )}
      </p>
      <div className="erpActions" style={{ gap: 8 }}>
        <input className="erpInput" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="Opening amount" />
        <button
          type="button"
          className="erpBtn"
          disabled={busy}
          onClick={() => {
            void (async () => {
              setBusy(true);
              setErr(null);
              try {
                await run({
                  action: "saveVatCarryforwardOpening",
                  value: { opening_amount: Number(amt), confirmed: true, notes: "UI opening CF" },
                });
              } catch (e) {
                setErr(errorText(e));
              } finally {
                setBusy(false);
              }
            })();
          }}
        >
          {T("Opening CF (confirmed)", "Opening CF (confirmed)", "CF đầu kỳ")}
        </button>
      </div>
      {err ? <p className="erpNotice warn">{err}</p> : null}
      <section className="erpMenuPanel">
        <table className="erpTable erpMenuTable">
          <thead>
            <tr>
              <th>{T("Источник", "Source", "Nguồn")}</th>
              <th className="num">Opening</th>
              <th className="num">Applied</th>
              <th className="num">Remaining</th>
              <th>{T("Статус", "Status", "TT")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5}>—</td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={String(r.id)}>
                  <td>
                    {r.is_opening_balance ? "opening" : String(r.source_period_start ?? "—")} → {String(r.source_period_end ?? "—")}
                  </td>
                  <td className="num">{vnd(Number(r.opening_amount) || null)}</td>
                  <td className="num">{vnd(Number(r.applied_amount) || null)}</td>
                  <td className="num">{vnd(Number(r.remaining_amount) || null)}</td>
                  <td>{String(r.approval_status)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

export function FinanceVatPaymentsPage() {
  const { state } = useErp();
  const rows = (state?.vatPayments ?? []) as Array<Record<string, unknown>>;
  return (
    <div className="erpMenu erpFinance">
      <PageHead title={T("Оплата НДС", "VAT Payments", "Thanh toán VAT")} />
      <FinanceMobileNav active={FINANCE_HREFS.vatSettlement} />
      <VatSubNav active="payments" />
      <p className="erpHint">
        {T(
          "Уплата НДС ≠ операционный расход P&L. Ссылка на кассовую транзакцию без дубля.",
          "VAT payment ≠ operating P&L expense. Link cash tx without duplicate.",
          "Nộp VAT ≠ chi phí P&L.",
        )}
      </p>
      <section className="erpMenuPanel">
        <table className="erpTable erpMenuTable" data-testid="vat-payments-table">
          <thead>
            <tr>
              <th>{T("Дата", "Date", "Ngày")}</th>
              <th>{T("Reference", "Reference", "Ref")}</th>
              <th className="num">{T("Сумма", "Amount", "Số tiền")}</th>
              <th>{T("Статус", "Status", "TT")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4}>—</td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={String(r.id)}>
                  <td>{String(r.payment_date)}</td>
                  <td>{String(r.payment_reference ?? r.payment_key)}</td>
                  <td className="num">{vnd(Number(r.amount) || null)}</td>
                  <td>{String(r.status)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

export function FinanceVatCorrectionsPage() {
  const { state } = useErp();
  const rows = (state?.vatPeriodCorrections ?? []) as Array<Record<string, unknown>>;
  return (
    <div className="erpMenu erpFinance">
      <PageHead title={T("Корректировки периодов", "Period corrections", "Điều chỉnh kỳ")} />
      <FinanceMobileNav active={FINANCE_HREFS.vatSettlement} />
      <VatSubNav active="corrections" />
      <p className="erpHint">
        {T(
          "Не путать с VAT Cost Adjustments склада (R2). Не переписывает утверждённый settlement.",
          "Not stock VAT Cost Adjustments (R2). Does not rewrite approved settlement.",
          "Không phải điều chỉnh giá vốn kho.",
        )}
      </p>
      <section className="erpMenuPanel">
        <table className="erpTable erpMenuTable">
          <thead>
            <tr>
              <th>{T("Recognition", "Recognition", "Ghi nhận")}</th>
              <th className="num">{T("Сумма", "Amount", "Số tiền")}</th>
              <th>{T("Причина", "Reason", "Lý do")}</th>
              <th>{T("Статус", "Status", "TT")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4}>—</td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={String(r.id)}>
                  <td>
                    {String(r.recognition_period_start)} → {String(r.recognition_period_end)}
                  </td>
                  <td className="num">{vnd(Number(r.adjustment_amount) || null)}</td>
                  <td>{String(r.adjustment_reason)}</td>
                  <td>{String(r.approval_status)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
