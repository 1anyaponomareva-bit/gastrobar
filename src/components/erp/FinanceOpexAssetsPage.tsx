"use client";

import { useMemo, useState } from "react";
import { currentYearMonth, monthRange } from "@/lib/erp/finance";
import { useErp } from "./ErpShell";
import { FinanceMobileNav, FINANCE_HREFS } from "./financeNav";
import { errorText, NavLink, PageHead, savingText, T, vnd } from "./ui";

export function FinanceExpensesPage() {
  const { state, run } = useErp();
  const rows = (state?.expenseDocuments ?? []) as Array<Record<string, unknown>>;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="erpMenu erpFinance">
      <PageHead
        title={T("Операционные расходы", "Operating expenses", "Chi phí hoạt động")}
        sub={T(
          "Accrual expense documents. Payment ≠ second P&L hit. Platform commission/ads stay in Phase 9D.",
          "Accrual expense documents. Payment ≠ second P&L hit. Platform commission/ads stay in Phase 9D.",
          "Chứng từ chi phí accrual.",
        )}
      />
      <FinanceMobileNav active={FINANCE_HREFS.expenses} />
      {err ? <p className="erpNotice warn">{err}</p> : null}
      <section className="erpMenuPanel">
        <table className="erpTable erpMenuTable" data-testid="expenses-table">
          <thead>
            <tr>
              <th>{T("Дата", "Date", "Ngày")}</th>
              <th>{T("Категория", "Category", "Nhóm")}</th>
              <th>{T("Описание", "Description", "Mô tả")}</th>
              <th className="num">Net</th>
              <th className="num">VAT</th>
              <th className="num">Gross</th>
              <th>{T("Статус", "Status", "TT")}</th>
              <th>{T("Оплата", "Payment", "TT")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8}>—</td>
              </tr>
            ) : (
              rows.slice(0, 200).map((r) => (
                <tr key={String(r.id)}>
                  <td>{String(r.recognition_date ?? r.transaction_date)}</td>
                  <td>{String(r.expense_category)}</td>
                  <td>{String(r.description ?? "—")}</td>
                  <td className="num">{vnd(Number(r.net_amount) || null)}</td>
                  <td className="num">{vnd(Number(r.vat_amount) || null)}</td>
                  <td className="num">{vnd(Number(r.gross_amount) || null)}</td>
                  <td>{String(r.status)}</td>
                  <td>{String(r.payment_status ?? "unpaid")}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
      <p className="erpHint">
        <NavLink href={FINANCE_HREFS.payables}>{T("Кредиторка", "Payables", "Phải trả")}</NavLink>
        {" · "}
        <NavLink href={FINANCE_HREFS.inputVat}>{T("Входящий НДС", "Input VAT", "VAT đầu vào")}</NavLink>
        {" · "}
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
                  action: "saveExpenseDocument",
                  value: {
                    expense_category: "operations",
                    description: "UI draft expense",
                    transaction_date: new Date().toISOString().slice(0, 10),
                    net_amount: 0,
                    vat_amount: 0,
                    gross_amount: 0,
                  },
                });
              } catch (e) {
                setErr(errorText(e));
              } finally {
                setBusy(false);
              }
            })();
          }}
        >
          {busy ? savingText() : T("Черновик", "Draft", "Nháp")}
        </button>
      </p>
    </div>
  );
}

export function FinanceAssetsPage() {
  const { state } = useErp();
  const rows = (state?.fixedAssets ?? []) as Array<Record<string, unknown>>;
  return (
    <div className="erpMenu erpFinance">
      <PageHead
        title={T("Основные средства", "Fixed assets", "TSCĐ")}
        sub={T(
          "Straight-line only. Useful life/CIT recognition — accountant TBD. Depreciation is non-cash P&L.",
          "Straight-line only. Useful life/CIT recognition — accountant TBD. Depreciation is non-cash P&L.",
          "Khấu hao thẳng. Chính sách kế toán TBD.",
        )}
      />
      <FinanceMobileNav active={FINANCE_HREFS.assets} />
      <section className="erpMenuPanel">
        <table className="erpTable erpMenuTable">
          <thead>
            <tr>
              <th>{T("Название", "Name", "Tên")}</th>
              <th>{T("Категория", "Category", "Nhóm")}</th>
              <th className="num">{T("Стоимость", "Cost", "Nguyên giá")}</th>
              <th className="num">{T("Амортизация", "Accum. depr.", "KH lũy kế")}</th>
              <th className="num">NBV</th>
              <th>{T("Статус", "Status", "TT")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6}>—</td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={String(r.id)}>
                  <td>{String(r.name)}</td>
                  <td>{String(r.category)}</td>
                  <td className="num">{vnd(Number(r.acquisition_cost) || null)}</td>
                  <td className="num">{vnd(Number(r.accumulated_depreciation) || null)}</td>
                  <td className="num">{vnd(Number(r.net_book_value) || null)}</td>
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

export function FinancePayablesPage() {
  const { state } = useErp();
  const rows = ((state?.apArItems ?? []) as Array<Record<string, unknown>>).filter((r) => r.kind === "payable");
  return (
    <div className="erpMenu erpFinance">
      <PageHead title={T("Кредиторская задолженность", "Accounts payable", "Phải trả")} />
      <FinanceMobileNav active={FINANCE_HREFS.payables} />
      <ApArTable rows={rows} />
    </div>
  );
}

export function FinanceReceivablesPage() {
  const { state } = useErp();
  const rows = ((state?.apArItems ?? []) as Array<Record<string, unknown>>).filter((r) => r.kind === "receivable");
  return (
    <div className="erpMenu erpFinance">
      <PageHead title={T("Дебиторская задолженность", "Accounts receivable", "Phải thu")} />
      <FinanceMobileNav active={FINANCE_HREFS.receivables} />
      <ApArTable rows={rows} />
      <p className="erpHint">
        {T("Grab/Shopee payouts — Phase 9D. Not double-counted as revenue.", "Grab/Shopee payouts — Phase 9D.", "Grab/Shopee — Phase 9D.")}
      </p>
    </div>
  );
}

function ApArTable({ rows }: { rows: Array<Record<string, unknown>> }) {
  return (
    <section className="erpMenuPanel">
      <table className="erpTable erpMenuTable">
        <thead>
          <tr>
            <th>{T("Источник", "Source", "Nguồn")}</th>
            <th className="num">{T("Исходная", "Original", "Gốc")}</th>
            <th className="num">{T("Оплачено", "Paid", "Đã trả")}</th>
            <th className="num">{T("Остаток", "Outstanding", "Còn")}</th>
            <th>{T("Срок", "Due", "Hạn")}</th>
            <th>{T("Статус", "Status", "TT")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6}>—</td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={String(r.id)}>
                <td>
                  {String(r.source_type)} · {String(r.source_id).slice(0, 8)}
                </td>
                <td className="num">{vnd(Number(r.original_amount) || null)}</td>
                <td className="num">{vnd(Number(r.paid_amount) || null)}</td>
                <td className="num">{vnd(Number(r.outstanding_amount) || null)}</td>
                <td>{String(r.due_date ?? "—")}</td>
                <td>{String(r.status)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  );
}

export function FinanceAccrualPnlPage() {
  const { run } = useErp();
  const [month, setMonth] = useState(currentYearMonth);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pnl, setPnl] = useState<Record<string, unknown> | null>(null);
  const { from, to } = useMemo(() => monthRange(month), [month]);

  const load = async () => {
    setBusy(true);
    setErr(null);
    try {
      setPnl((await run({ action: "accrualPnl", value: { from, to } })) as Record<string, unknown>);
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const lines: Array<[string, unknown]> = pnl
    ? [
        ["Net Revenue", pnl.net_revenue],
        ["Food Actual COGS", pnl.food_actual_cogs],
        ["Packaging Actual COGS", pnl.packaging_actual_cogs],
        ["Gross Profit", pnl.gross_profit],
        ["Platform Commission", pnl.platform_commission],
        ["Advertising", pnl.advertising],
        ["Contribution Margin", pnl.contribution_margin],
        ["Payroll", pnl.payroll],
        ["Employer SI", pnl.employer_social_insurance],
        ["Staff Meals", pnl.staff_meals],
        ["Rent", pnl.rent],
        ["Utilities", pnl.utilities],
        ["Other OPEX", pnl.other_operating_expenses],
        ["EBITDA", pnl.ebitda],
        ["Depreciation", pnl.depreciation],
        ["EBIT / Operating Profit", pnl.ebit],
        ["Profit Before Tax", pnl.profit_before_tax],
        ["Net Profit", pnl.net_profit ?? pnl.net_profit_status],
      ]
    : [];

  return (
    <div className="erpMenu erpFinance">
      <PageHead
        title={T("P&L (Accrual)", "P&L (Accrual)", "P&L (Accrual)")}
        sub={T(
          "Management Accrual P&L from sales/COGS/platforms/opex/payroll/depr. Cash Basis Legacy: /erp/finance/pnl?basis=cash",
          "Management Accrual P&L. Cash Basis Legacy remains available.",
          "P&L quản trị Accrual.",
        )}
      />
      <FinanceMobileNav active={FINANCE_HREFS.pnlAccrual} />
      <div className="erpFinancePeriod" style={{ display: "flex", gap: 12 }}>
        <label>
          {T("Период", "Period", "Kỳ")} <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </label>
        <button type="button" className="erpBtn primary" disabled={busy} onClick={() => void load()}>
          {busy ? savingText() : T("Рассчитать", "Calculate", "Tính")}
        </button>
        <NavLink href={FINANCE_HREFS.pnl}>{T("Cash Basis (Legacy)", "Cash Basis (Legacy)", "Cash Basis")}</NavLink>
      </div>
      {err ? <p className="erpNotice warn">{err}</p> : null}
      {pnl ? (
        <>
          <p className="erpHint">
            Completeness: {String((pnl.completeness as Record<string, unknown>)?.status)} · CIT: {String(pnl.cit_status)}
          </p>
          <div className="erpFinanceTotals" data-testid="accrual-pnl">
            {lines.map(([k, v]) => (
              <div key={k}>
                <span>{k}</span>
                <strong>{typeof v === "number" ? vnd(v) : String(v ?? "—")}</strong>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

export function FinanceManagementCashflowPage() {
  const { run } = useErp();
  const [month, setMonth] = useState(currentYearMonth);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [cf, setCf] = useState<Record<string, unknown> | null>(null);
  const { from, to } = useMemo(() => monthRange(month), [month]);

  return (
    <div className="erpMenu erpFinance">
      <PageHead
        title={T("Cash Flow (Management)", "Cash Flow (Management)", "Cash Flow")}
        sub={T(
          "Opening/closing cash from cashbook. Internal transfers excluded from external CF. Legacy cashflow also available.",
          "Opening/closing cash from cashbook. Internal transfers excluded.",
          "Dòng tiền quản trị.",
        )}
      />
      <FinanceMobileNav active={FINANCE_HREFS.cashflowMgmt} />
      <div className="erpFinancePeriod" style={{ display: "flex", gap: 12 }}>
        <label>
          {T("Период", "Period", "Kỳ")} <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </label>
        <button
          type="button"
          className="erpBtn primary"
          disabled={busy}
          onClick={() => {
            void (async () => {
              setBusy(true);
              setErr(null);
              try {
                setCf((await run({ action: "managementCashflow", value: { from, to } })) as Record<string, unknown>);
              } catch (e) {
                setErr(errorText(e));
              } finally {
                setBusy(false);
              }
            })();
          }}
        >
          {busy ? savingText() : T("Рассчитать", "Calculate", "Tính")}
        </button>
        <NavLink href={FINANCE_HREFS.cashflow}>{T("Cash Basis (Legacy)", "Cash Basis (Legacy)", "Cash Basis")}</NavLink>
      </div>
      {err ? <p className="erpNotice warn">{err}</p> : null}
      {cf ? (
        <div className="erpFinanceTotals" data-testid="mgmt-cashflow">
          {(
            [
              ["Opening", cf.opening_cash_balance],
              ["Operating In", cf.operating_cash_inflows],
              ["Operating Out", cf.operating_cash_outflows],
              ["Investing", cf.investing_cash_flow],
              ["Financing In", cf.financing_cash_inflows],
              ["Financing Out", cf.financing_cash_outflows],
              ["Net Movement", cf.net_cash_movement],
              ["Closing", cf.closing_cash_balance],
            ] as Array<[string, unknown]>
          ).map(([k, v]) => (
            <div key={k}>
              <span>{k}</span>
              <strong>{vnd(Number(v) || null)}</strong>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function FinanceDashboardPage() {
  const { run } = useErp();
  const [month, setMonth] = useState(currentYearMonth);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [dash, setDash] = useState<Record<string, unknown> | null>(null);
  const { from, to } = useMemo(() => monthRange(month), [month]);

  return (
    <div className="erpMenu erpFinance">
      <PageHead title={T("Финансы — Обзор", "Finance overview", "Tổng quan tài chính")} />
      <FinanceMobileNav active={FINANCE_HREFS.overview} />
      <div className="erpFinancePeriod" style={{ display: "flex", gap: 12 }}>
        <label>
          {T("Период", "Period", "Kỳ")} <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </label>
        <button
          type="button"
          className="erpBtn primary"
          disabled={busy}
          onClick={() => {
            void (async () => {
              setBusy(true);
              setErr(null);
              try {
                setDash((await run({ action: "financeDashboard", value: { from, to } })) as Record<string, unknown>);
              } catch (e) {
                setErr(errorText(e));
              } finally {
                setBusy(false);
              }
            })();
          }}
        >
          {busy ? savingText() : T("Обновить", "Refresh", "Làm mới")}
        </button>
      </div>
      {err ? <p className="erpNotice warn">{err}</p> : null}
      {dash ? (
        <div className="erpFinanceTotals" data-testid="finance-dashboard">
          {(
            [
              ["Net Revenue", dash.net_revenue],
              ["Actual COGS", dash.actual_cogs],
              ["Gross Profit", dash.gross_profit],
              ["Contribution Margin", dash.contribution_margin],
              ["Payroll", dash.payroll],
              ["OPEX", dash.operating_expenses],
              ["EBITDA", dash.ebitda],
              ["Operating Profit", dash.operating_profit],
              ["Profit Before Tax", dash.profit_before_tax],
              ["Net Profit", dash.net_profit ?? dash.net_profit_status],
              ["Cash Balance", dash.cash_balance],
              ["AP", dash.accounts_payable],
              ["AR", dash.accounts_receivable],
              ["VAT Payable", dash.vat_payable],
            ] as Array<[string, unknown]>
          ).map(([k, v]) => (
            <div key={k}>
              <span>{k}</span>
              <strong>{typeof v === "number" ? vnd(v) : String(v ?? "—")}</strong>
            </div>
          ))}
        </div>
      ) : (
        <p className="erpHint">{T("Выберите период", "Pick a period", "Chọn kỳ")}</p>
      )}
    </div>
  );
}
