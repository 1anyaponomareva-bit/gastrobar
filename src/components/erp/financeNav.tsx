"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { NavLink, PageHead, T } from "./ui";

export const FINANCE_HREFS = {
  overview: "/erp/finance/overview",
  transactions: "/erp/finance",
  trash: "/erp/finance/trash",
  shifts: "/erp/finance/shifts",
  accounts: "/erp/finance/accounts",
  accountsTrash: "/erp/finance/accounts/trash",
  categories: "/erp/finance/categories",
  salary: "/erp/finance/salary",
  sales: "/erp/finance/sales",
  expenses: "/erp/finance/expenses",
  assets: "/erp/finance/assets",
  payables: "/erp/finance/payables",
  receivables: "/erp/finance/receivables",
  outputVat: "/erp/finance/vat/output",
  inputVat: "/erp/finance/vat/input",
  platforms: "/erp/finance/platforms",
  vatSettlement: "/erp/finance/vat/settlement",
  profitability: "/erp/finance/profitability",
  report: "/erp/finance/report",
  cashflow: "/erp/finance/cashflow",
  cashflowMgmt: "/erp/finance/cashflow/management",
  pnl: "/erp/finance/pnl",
  pnlAccrual: "/erp/finance/pnl/accrual",
  periods: "/erp/finance/periods",
  audit: "/erp/finance/audit",
} as const;

export function financeNavItems() {
  return [
    { href: FINANCE_HREFS.overview, label: T("Обзор", "Overview", "Tổng quan") },
    { href: FINANCE_HREFS.transactions, label: T("Касса", "Cashbook", "Sổ quỹ") },
    { href: FINANCE_HREFS.sales, label: T("Продажи", "Sales", "Bán hàng") },
    { href: FINANCE_HREFS.expenses, label: T("Расходы", "Expenses", "Chi phí") },
    { href: FINANCE_HREFS.platforms, label: T("Агрегаторы", "Platforms", "Sàn") },
    { href: FINANCE_HREFS.profitability, label: T("Прибыльность", "Profitability", "Lợi nhuận") },
    { href: FINANCE_HREFS.inputVat, label: T("Входящий НДС", "Input VAT", "VAT đầu vào") },
    { href: FINANCE_HREFS.outputVat, label: T("Исходящий НДС", "Output VAT", "VAT đầu ra") },
    { href: FINANCE_HREFS.vatSettlement, label: T("НДС к уплате", "VAT Settlement", "VAT phải nộp") },
    { href: FINANCE_HREFS.assets, label: T("Основные средства", "Fixed assets", "TSCĐ") },
    { href: FINANCE_HREFS.payables, label: T("Кредиторка", "Payables", "Phải trả") },
    { href: FINANCE_HREFS.receivables, label: T("Дебиторка", "Receivables", "Phải thu") },
    { href: FINANCE_HREFS.pnlAccrual, label: T("P&L (Accrual)", "P&L (Accrual)", "P&L Accrual") },
    { href: FINANCE_HREFS.cashflowMgmt, label: T("Cash Flow", "Cash Flow", "Cash Flow") },
    { href: FINANCE_HREFS.periods, label: T("Финансовые периоды", "Financial periods", "Kỳ tài chính") },
    { href: FINANCE_HREFS.audit, label: T("Журнал аудита", "Audit log", "Nhật ký audit") },
    { href: FINANCE_HREFS.salary, label: T("Зарплата", "Payroll", "Lương") },
    { href: FINANCE_HREFS.shifts, label: T("Кассовые смены", "Cash shifts", "Ca quỹ") },
    { href: FINANCE_HREFS.accounts, label: T("Счета", "Accounts", "Tài khoản") },
    { href: FINANCE_HREFS.categories, label: T("Категории", "Categories", "Nhóm") },
    {
      href: FINANCE_HREFS.pnl,
      label: T("P&L (Cash Basis / Legacy)", "P&L (Cash Basis / Legacy)", "P&L Cash Legacy"),
    },
    {
      href: FINANCE_HREFS.cashflow,
      label: T("CF (Cash Basis / Legacy)", "CF (Cash Basis / Legacy)", "CF Cash Legacy"),
    },
    {
      href: FINANCE_HREFS.report,
      label: T("Отчет (Cash Basis)", "Report (Cash Basis)", "Báo cáo Cash"),
    },
  ];
}

export function activeFinanceHref(pathname: string | null): string | null {
  const path = pathname ?? "";
  const listed = financeNavItems().find(
    (item) => path === item.href || (item.href !== FINANCE_HREFS.transactions && path.startsWith(`${item.href}/`)),
  );
  if (listed) return listed.href;
  if (path === FINANCE_HREFS.trash || path.startsWith(`${FINANCE_HREFS.trash}/`)) return FINANCE_HREFS.transactions;
  if (path.startsWith("/erp/finance/sales")) return FINANCE_HREFS.sales;
  if (path.startsWith("/erp/finance/vat/output")) return FINANCE_HREFS.outputVat;
  if (path.startsWith("/erp/finance/vat/input")) return FINANCE_HREFS.inputVat;
  if (path.startsWith("/erp/finance/platforms")) return FINANCE_HREFS.platforms;
  if (path.startsWith("/erp/finance/vat/settlement")) return FINANCE_HREFS.vatSettlement;
  if (path.startsWith("/erp/finance/profitability")) return FINANCE_HREFS.profitability;
  if (path.startsWith("/erp/finance/overview")) return FINANCE_HREFS.overview;
  if (path.startsWith("/erp/finance/expenses")) return FINANCE_HREFS.expenses;
  if (path.startsWith("/erp/finance/assets")) return FINANCE_HREFS.assets;
  if (path.startsWith("/erp/finance/payables")) return FINANCE_HREFS.payables;
  if (path.startsWith("/erp/finance/receivables")) return FINANCE_HREFS.receivables;
  if (path.startsWith("/erp/finance/pnl/accrual")) return FINANCE_HREFS.pnlAccrual;
  if (path.startsWith("/erp/finance/cashflow/management")) return FINANCE_HREFS.cashflowMgmt;
  if (path.startsWith("/erp/finance/periods")) return FINANCE_HREFS.periods;
  if (path.startsWith("/erp/finance/audit")) return FINANCE_HREFS.audit;
  if (path === "/erp/finance" || path === "/erp/finance/" || path.startsWith("/erp/finance/new") || /^\/erp\/finance\/[^/]+$/.test(path)) {
    return FINANCE_HREFS.transactions;
  }
  return null;
}

export function FinanceMobileNav({ active }: { active: string }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = ref.current;
    const link = nav?.querySelector<HTMLElement>("a.active");
    if (!nav || !link) return;
    const pad = 16;
    const min = Math.max(0, link.offsetLeft + link.offsetWidth + pad - nav.clientWidth);
    const max = Math.max(0, link.offsetLeft - pad);
    if (nav.scrollLeft < min) nav.scrollLeft = min;
    else if (nav.scrollLeft > max) nav.scrollLeft = max;
  }, [active]);
  return (
    <nav ref={ref} className="erpSubTabs erpMobileOnly" aria-label={T("Раздел Финансы", "Finance section", "Mục Tài chính")}>
      {financeNavItems().map((tab) => (
        <NavLink key={tab.href} href={tab.href} className={tab.href === active ? "active" : ""}>
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}

export function FinanceFormShell({
  backHref,
  backLabel,
  activeHref,
  title,
  sub,
  children,
  footer,
}: {
  backHref: string;
  backLabel: string;
  activeHref: string;
  title: ReactNode;
  sub?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="erpMenu erpFinance">
      <NavLink href={backHref} className="erpBack">
        ← {backLabel}
      </NavLink>
      <PageHead title={title} sub={sub} />
      <FinanceMobileNav active={activeHref} />
      <div className="erpMenuFormBody">{children}</div>
      {footer ? <div className="erpMenuSave erpNoPrint">{footer}</div> : null}
    </div>
  );
}
