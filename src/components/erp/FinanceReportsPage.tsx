"use client";

import { Fragment, useMemo, useState } from "react";
import {
  buildCashflow,
  buildMonthlyReport,
  buildPnl,
  currentYearMonth,
  liveAccounts,
  liveCategories,
  liveTransactions,
  monthRange,
  type FinancePnlBlock,
} from "@/lib/erp/finance";
import { pnlBlockLabel } from "./financeFields";
import { FinanceMobileNav, FINANCE_HREFS } from "./financeNav";
import { useErp } from "./ErpShell";
import { PageHead, T, vnd } from "./ui";

function PeriodBar({ month, onChange }: { month: string; onChange: (value: string) => void }) {
  return (
    <div className="erpFinancePeriod">
      <label>
        {T("Период", "Period", "Kỳ")}{" "}
        <input type="month" value={month} onChange={(event) => onChange(event.target.value)} />
      </label>
    </div>
  );
}

function Totals({ items }: { items: { label: string; value: number; tone?: "in" | "out" }[] }) {
  return (
    <div className="erpFinanceTotals">
      {items.map((item) => (
        <div key={item.label}>
          <span>{item.label}</span>
          <strong className={item.tone === "in" ? "erpMoneyIn" : item.tone === "out" ? "erpMoneyOut" : undefined}>{vnd(item.value)}</strong>
        </div>
      ))}
    </div>
  );
}

function useMonthData(month: string) {
  const { state } = useErp();
  const { from, to } = monthRange(month);
  const accounts = liveAccounts(state?.financeAccounts);
  const categories = liveCategories(state?.financeCategories);
  const transactions = liveTransactions(state?.financeTransactions);
  return { from, to, accounts, categories, transactions };
}

const PNL_ORDER: FinancePnlBlock[] = ["revenue", "cogs", "opex", "other_income", "other_expense", "tax"];

export function FinanceReportPage() {
  const [month, setMonth] = useState(currentYearMonth);
  const data = useMonthData(month);
  const report = useMemo(
    () => buildMonthlyReport(data.transactions, data.categories, data.from, data.to),
    [data.transactions, data.categories, data.from, data.to],
  );
  return (
    <div className="erpMenu erpFinance">
      <PageHead
        title={T("Финансовый отчет", "Financial report", "Báo cáo tài chính")}
        sub={T("Доходы и расходы по категориям за месяц — по дате сделки.", "Income and expense by category for the month, using the deal date.", "Thu/chi theo nhóm trong tháng, theo ngày phát sinh.")}
      />
      <FinanceMobileNav active={FINANCE_HREFS.report} />
      <PeriodBar month={month} onChange={setMonth} />
      <Totals
        items={[
          { label: T("Доходы", "Income", "Thu"), value: report.income, tone: "in" },
          { label: T("Расходы", "Expense", "Chi"), value: report.expense, tone: "out" },
          { label: T("Прибыль", "Profit", "Lãi"), value: report.profit },
        ]}
      />
      <section className="erpMenuPanel">
        <div className="erpTableWrap erpMenuWrap">
          <table className="erpTable erpMenuTable">
            <thead>
              <tr>
                <th>{T("Категория", "Category", "Nhóm")}</th>
                <th className="num">{T("Доход", "Income", "Thu")}</th>
                <th className="num">{T("Расход", "Expense", "Chi")}</th>
              </tr>
            </thead>
            <tbody>
              {report.lines.map((line) => (
                <tr key={line.categoryId ?? "none"}>
                  <td>
                    {line.parentName ? `${line.parentName} / ` : ""}
                    {line.categoryName}
                  </td>
                  <td className="num erpMoneyIn">{line.income ? vnd(line.income) : ""}</td>
                  <td className="num erpMoneyOut">{line.expense ? vnd(line.expense) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export function FinanceCashflowPage() {
  const [month, setMonth] = useState(currentYearMonth);
  const data = useMonthData(month);
  const report = useMemo(
    () => buildCashflow(data.accounts, data.transactions, data.categories, data.from, data.to),
    [data.accounts, data.transactions, data.categories, data.from, data.to],
  );
  return (
    <div className="erpMenu erpFinance">
      <PageHead
        title={T("Cash flow", "Cash flow", "Cash flow")}
        sub={T("Движение денег по дате транзакции, не по дате сделки.", "Money movement by transaction date, not deal date.", "Dòng tiền theo ngày giao dịch, không theo ngày phát sinh.")}
      />
      <FinanceMobileNav active={FINANCE_HREFS.cashflow} />
      <PeriodBar month={month} onChange={setMonth} />
      <Totals
        items={[
          { label: T("На начало", "Opening", "Đầu kỳ"), value: report.opening },
          { label: T("Приход", "Inflow", "Thu"), value: report.income, tone: "in" },
          { label: T("Расход", "Outflow", "Chi"), value: report.expense, tone: "out" },
          { label: T("На конец", "Closing", "Cuối kỳ"), value: report.closing },
        ]}
      />
      <section className="erpMenuPanel">
        <div className="erpTableWrap erpMenuWrap">
          <table className="erpTable erpMenuTable">
            <thead>
              <tr>
                <th>{T("Счет", "Account", "Tài khoản")}</th>
                <th className="num">{T("Начало", "Opening", "Đầu")}</th>
                <th className="num">{T("Приход", "In", "Thu")}</th>
                <th className="num">{T("Расход", "Out", "Chi")}</th>
                <th className="num">{T("Конец", "Closing", "Cuối")}</th>
              </tr>
            </thead>
            <tbody>
              {report.byAccount.map((row) => (
                <tr key={row.accountId}>
                  <td>{row.name}</td>
                  <td className="num">{vnd(row.opening)}</td>
                  <td className="num erpMoneyIn">{vnd(row.income)}</td>
                  <td className="num erpMoneyOut">{vnd(row.expense)}</td>
                  <td className="num">{vnd(row.closing)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="erpMenuPanel" style={{ marginTop: 16 }}>
        <div className="erpTableWrap erpMenuWrap">
          <table className="erpTable erpMenuTable">
            <thead>
              <tr>
                <th>{T("Категория", "Category", "Nhóm")}</th>
                <th className="num">{T("Приход", "Inflow", "Thu")}</th>
                <th className="num">{T("Расход", "Outflow", "Chi")}</th>
              </tr>
            </thead>
            <tbody>
              {report.lines.map((line) => (
                <tr key={line.categoryId ?? "none"}>
                  <td>{line.categoryName}</td>
                  <td className="num erpMoneyIn">{line.income ? vnd(line.income) : ""}</td>
                  <td className="num erpMoneyOut">{line.expense ? vnd(line.expense) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export function FinancePnlPage() {
  const [month, setMonth] = useState(currentYearMonth);
  const data = useMonthData(month);
  const report = useMemo(() => buildPnl(data.transactions, data.categories, data.from, data.to), [data.transactions, data.categories, data.from, data.to]);
  return (
    <div className="erpMenu erpFinance">
      <PageHead
        title={T("P&L", "P&L", "P&L")}
        sub={T("Прибыли и убытки по дате сделки. Переводы между счетами сюда не входят.", "Profit and loss by deal date. Transfers between accounts are excluded.", "Lãi lỗ theo ngày phát sinh. Không gồm chuyển khoản.")}
      />
      <FinanceMobileNav active={FINANCE_HREFS.pnl} />
      <PeriodBar month={month} onChange={setMonth} />
      <Totals
        items={[
          { label: T("Выручка", "Revenue", "Doanh thu"), value: report.revenue, tone: "in" },
          { label: T("Себестоимость", "COGS", "Giá vốn"), value: report.cogs, tone: "out" },
          { label: T("Валовая прибыль", "Gross profit", "Lãi gộp"), value: report.gross },
          { label: T("Опер. расходы", "OPEX", "Chi phí HĐ"), value: report.opex, tone: "out" },
          { label: T("Чистая прибыль", "Net profit", "Lãi ròng"), value: report.net },
        ]}
      />
      <section className="erpMenuPanel">
        <div className="erpTableWrap erpMenuWrap">
          <table className="erpTable erpMenuTable">
            <thead>
              <tr>
                <th>{T("Статья", "Line", "Khoản")}</th>
                <th className="num">{T("Сумма", "Amount", "Số tiền")}</th>
              </tr>
            </thead>
            <tbody>
              {PNL_ORDER.map((block) => {
                const lines = report.lines.filter((line) => line.block === block);
                const total =
                  block === "revenue"
                    ? report.revenue
                    : block === "cogs"
                      ? report.cogs
                      : block === "opex"
                        ? report.opex
                        : block === "other_income"
                          ? report.otherIncome
                          : block === "other_expense"
                            ? report.otherExpense
                            : report.tax;
                if (!lines.length && !total) return null;
                return (
                  <Fragment key={block}>
                    <tr className="erpPnlHead">
                      <td>{pnlBlockLabel(block)}</td>
                      <td className="num">{vnd(total)}</td>
                    </tr>
                    {lines.map((line) => (
                      <tr key={`${block}-${line.categoryId}`}>
                        <td style={{ paddingLeft: 24 }}>{line.categoryName}</td>
                        <td className="num">{vnd(line.amount)}</td>
                      </tr>
                    ))}
                    {block === "cogs" ? (
                      <tr className="erpPnlTotal">
                        <td>{T("Валовая прибыль", "Gross profit", "Lãi gộp")}</td>
                        <td className="num">{vnd(report.gross)}</td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
              <tr className="erpPnlTotal">
                <td>{T("Чистая прибыль", "Net profit", "Lãi ròng")}</td>
                <td className="num">{vnd(report.net)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
