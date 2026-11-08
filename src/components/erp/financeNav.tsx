"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { NavLink, PageHead, T } from "./ui";

export const FINANCE_HREFS = {
  transactions: "/erp/finance",
  trash: "/erp/finance/trash",
  shifts: "/erp/finance/shifts",
  accounts: "/erp/finance/accounts",
  accountsTrash: "/erp/finance/accounts/trash",
  categories: "/erp/finance/categories",
  salary: "/erp/finance/salary",
  report: "/erp/finance/report",
  cashflow: "/erp/finance/cashflow",
  pnl: "/erp/finance/pnl",
} as const;

export function financeNavItems() {
  return [
    { href: FINANCE_HREFS.transactions, label: T("Транзакции", "Transactions", "Giao dịch") },
    { href: FINANCE_HREFS.shifts, label: T("Кассовые смены", "Cash shifts", "Ca quỹ") },
    { href: FINANCE_HREFS.accounts, label: T("Счета", "Accounts", "Tài khoản") },
    { href: FINANCE_HREFS.categories, label: T("Категории", "Categories", "Nhóm") },
    { href: FINANCE_HREFS.salary, label: T("Зарплата", "Payroll", "Lương") },
    { href: FINANCE_HREFS.report, label: T("Финансовый отчет", "Financial report", "Báo cáo tài chính") },
    { href: FINANCE_HREFS.cashflow, label: T("Cash flow", "Cash flow", "Cash flow") },
    { href: FINANCE_HREFS.pnl, label: T("P&L", "P&L", "P&L") },
  ];
}

export function activeFinanceHref(pathname: string | null): string | null {
  const path = pathname ?? "";
  const listed = financeNavItems().find(
    (item) => path === item.href || (item.href !== FINANCE_HREFS.transactions && path.startsWith(`${item.href}/`)),
  );
  if (listed) return listed.href;
  if (path === FINANCE_HREFS.trash || path.startsWith(`${FINANCE_HREFS.trash}/`)) return FINANCE_HREFS.transactions;
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
