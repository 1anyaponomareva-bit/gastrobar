import { VIETNAM_TZ, vietnamIsoDate, vietnamTodayIso } from "@/lib/orders/datetime";

/** Poster Finance: balances, deal date vs cash date, P&L, Cash flow, monthly report. */

export type FinanceTxType = "income" | "expense" | "transfer";
export type FinanceAccountKind = "cash" | "bank" | "card";
export type FinancePnlBlock = "revenue" | "cogs" | "opex" | "other_income" | "other_expense" | "tax" | "none";
export type FinancePayType = "monthly" | "hourly" | "shift" | "percent";
export type FinanceShiftStatus = "open" | "closed";
export type FinanceTxSource = "manual" | "shift" | "payroll" | "receipt" | "adjustment" | "bank_import";
export type FinanceAutoKind = "sales_cash" | "sales_card" | "collection" | "adjustment" | "payroll" | "receipt";
export type FinanceSystemRole = "cash_drawer" | "acquiring" | "safe";

export type FinanceAccount = {
  id: string;
  code: string;
  name: string;
  kind: FinanceAccountKind;
  currency: string;
  opening_balance: number;
  location_id: string | null;
  is_system: boolean;
  system_role: FinanceSystemRole | null;
  sort: number;
  archived_at: string | null;
  deleted_at: string | null;
};

export type FinanceCategory = {
  id: string;
  code: string | null;
  name: string;
  parent_id: string | null;
  allow_income: boolean;
  allow_expense: boolean;
  show_on_pos: boolean;
  show_in_pnl: boolean;
  pnl_block: FinancePnlBlock;
  is_system: boolean;
  sort: number;
  deleted_at: string | null;
};

export type FinanceTransaction = {
  id: string;
  type: FinanceTxType;
  amount: number;
  account_id: string;
  to_account_id: string | null;
  category_id: string | null;
  occurred_at: string;
  deal_at: string | null;
  comment: string | null;
  source: FinanceTxSource;
  source_id: string | null;
  auto_kind: FinanceAutoKind | null;
  shift_id: string | null;
  user_name: string | null;
  created_by: string | null;
  created_at: string;
  deleted_at: string | null;
  deleted_with_account_id: string | null;
};

export type FinanceShift = {
  id: string;
  location_id: string | null;
  account_id: string;
  opened_at: string;
  closed_at: string | null;
  opened_by: string | null;
  closed_by: string | null;
  opening_cash: number;
  sales_cash: number;
  sales_card: number;
  collection_sum: number;
  actual_cash: number | null;
  comment: string | null;
  status: FinanceShiftStatus;
};

export type FinanceEmployee = {
  id: string;
  name: string;
  role: string | null;
  pay_type: FinancePayType;
  rate: number;
  archived_at: string | null;
};

export type FinancePayroll = {
  id: string;
  employee_id: string;
  period_start: string;
  period_end: string;
  hours: number | null;
  amount: number;
  account_id: string | null;
  paid_at: string | null;
  transaction_id: string | null;
  comment: string | null;
};

export const FINANCE_TZ = VIETNAM_TZ;
export const vietnamDateIso = vietnamIsoDate;

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function monthRange(yearMonth: string): { from: string; to: string } {
  const match = /^(\d{4})-(\d{2})$/.exec(yearMonth);
  if (!match) {
    const now = vietnamTodayIso();
    return monthRange(now.slice(0, 7));
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const from = `${match[1]}-${match[2]}-01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const to = `${String(nextYear).padStart(4, "0")}-${String(nextMonth).padStart(2, "0")}-01`;
  return { from, to };
}

export function currentYearMonth(now = new Date()): string {
  return vietnamDateIso(now).slice(0, 7);
}

/** Cash-flow date: when the money moved. */
export function cashDate(tx: Pick<FinanceTransaction, "occurred_at">): string {
  return vietnamDateIso(tx.occurred_at);
}

/** P&L date: obligation / deal date, else the cash date. */
export function dealDate(tx: Pick<FinanceTransaction, "occurred_at" | "deal_at">): string {
  if (tx.deal_at) return vietnamDateIso(tx.deal_at);
  return cashDate(tx);
}

export function liveTransactions(rows: FinanceTransaction[] | null | undefined): FinanceTransaction[] {
  return (rows ?? []).filter((row) => !row.deleted_at);
}

export function liveAccounts(rows: FinanceAccount[] | null | undefined): FinanceAccount[] {
  return (rows ?? []).filter((row) => !row.deleted_at);
}

export function liveCategories(rows: FinanceCategory[] | null | undefined): FinanceCategory[] {
  return (rows ?? []).filter((row) => !row.deleted_at);
}

export function txLocked(tx: Pick<FinanceTransaction, "source" | "type">): boolean {
  return tx.source !== "manual" || tx.type === "transfer";
}

export function inRange(isoDate: string, from: string, to: string): boolean {
  return isoDate >= from && isoDate < to;
}

/** Signed movement on one account: +income / −expense; transfer −from / +to. */
export function accountDelta(tx: FinanceTransaction, accountId: string): number {
  if (tx.deleted_at) return 0;
  if (tx.type === "income" && tx.account_id === accountId) return tx.amount;
  if (tx.type === "expense" && tx.account_id === accountId) return -tx.amount;
  if (tx.type === "transfer") {
    if (tx.account_id === accountId) return -tx.amount;
    if (tx.to_account_id === accountId) return tx.amount;
  }
  return 0;
}

export function accountBalance(
  account: Pick<FinanceAccount, "id" | "opening_balance">,
  transactions: FinanceTransaction[],
  untilExclusive?: string,
): number {
  let sum = account.opening_balance;
  for (const tx of liveTransactions(transactions)) {
    if (untilExclusive && cashDate(tx) >= untilExclusive) continue;
    sum += accountDelta(tx, account.id);
  }
  return roundMoney(sum);
}

export function shiftBookCash(
  shift: Pick<FinanceShift, "id" | "account_id" | "opening_cash" | "opened_at" | "closed_at">,
  transactions: FinanceTransaction[],
): number {
  const from = shift.opened_at;
  const to = shift.closed_at;
  let sum = shift.opening_cash;
  for (const tx of liveTransactions(transactions)) {
    if (tx.shift_id && tx.shift_id !== shift.id) continue;
    if (!tx.shift_id) {
      if (tx.occurred_at < from) continue;
      if (to && tx.occurred_at > to) continue;
    }
    sum += accountDelta(tx, shift.account_id);
  }
  return roundMoney(sum);
}

export type PnlLine = {
  block: FinancePnlBlock;
  categoryId: string | null;
  categoryName: string;
  amount: number;
};

export type PnlReport = {
  from: string;
  to: string;
  lines: PnlLine[];
  revenue: number;
  cogs: number;
  gross: number;
  opex: number;
  otherIncome: number;
  otherExpense: number;
  tax: number;
  net: number;
};

const PNL_SIGN: Record<FinancePnlBlock, 1 | -1 | 0> = {
  revenue: 1,
  cogs: -1,
  opex: -1,
  other_income: 1,
  other_expense: -1,
  tax: -1,
  none: 0,
};

export function buildPnl(
  transactions: FinanceTransaction[],
  categories: FinanceCategory[],
  from: string,
  to: string,
): PnlReport {
  const byId = new Map(liveCategories(categories).map((row) => [row.id, row]));
  const sums = new Map<string, PnlLine>();
  const add = (block: FinancePnlBlock, categoryId: string | null, categoryName: string, amount: number) => {
    if (!amount) return;
    const key = `${block}:${categoryId ?? ""}`;
    const prev = sums.get(key);
    if (prev) prev.amount = roundMoney(prev.amount + amount);
    else sums.set(key, { block, categoryId, categoryName, amount: roundMoney(amount) });
  };

  for (const tx of liveTransactions(transactions)) {
    if (tx.type === "transfer") continue;
    if (!inRange(dealDate(tx), from, to)) continue;
    const category = tx.category_id ? byId.get(tx.category_id) : undefined;
    if (!category || !category.show_in_pnl || category.pnl_block === "none") continue;
    if (tx.type === "income") {
      const block = category.pnl_block === "cogs" || category.pnl_block === "opex" || category.pnl_block === "tax" ? "other_income" : category.pnl_block === "other_expense" ? "other_income" : category.pnl_block;
      add(block, category.id, category.name, tx.amount);
    } else {
      const block =
        category.pnl_block === "revenue" || category.pnl_block === "other_income" ? "other_expense" : category.pnl_block;
      add(block, category.id, category.name, tx.amount);
    }
  }

  const lines = [...sums.values()].sort((a, b) => a.block.localeCompare(b.block) || a.categoryName.localeCompare(b.categoryName));
  const sumBlock = (block: FinancePnlBlock) => roundMoney(lines.filter((line) => line.block === block).reduce((n, line) => n + line.amount, 0));
  const revenue = sumBlock("revenue");
  const cogs = sumBlock("cogs");
  const opex = sumBlock("opex");
  const otherIncome = sumBlock("other_income");
  const otherExpense = sumBlock("other_expense");
  const tax = sumBlock("tax");
  const gross = roundMoney(revenue - cogs);
  const net = roundMoney(gross - opex + otherIncome - otherExpense - tax);
  return { from, to, lines, revenue, cogs, gross, opex, otherIncome, otherExpense, tax, net };
}

export function pnlContribution(block: FinancePnlBlock, amount: number): number {
  return roundMoney(amount * PNL_SIGN[block]);
}

export type CashflowLine = {
  categoryId: string | null;
  categoryName: string;
  income: number;
  expense: number;
};

export type CashflowReport = {
  from: string;
  to: string;
  opening: number;
  income: number;
  expense: number;
  closing: number;
  lines: CashflowLine[];
  byAccount: { accountId: string; name: string; opening: number; income: number; expense: number; closing: number }[];
};

export function buildCashflow(
  accounts: FinanceAccount[],
  transactions: FinanceTransaction[],
  categories: FinanceCategory[],
  from: string,
  to: string,
): CashflowReport {
  const cats = new Map(liveCategories(categories).map((row) => [row.id, row]));
  const live = liveAccounts(accounts);
  const txs = liveTransactions(transactions);
  const byAccount = live.map((account) => {
    const opening = accountBalance(account, txs, from);
    let income = 0;
    let expense = 0;
    for (const tx of txs) {
      if (!inRange(cashDate(tx), from, to)) continue;
      const delta = accountDelta(tx, account.id);
      if (delta > 0) income += delta;
      else if (delta < 0) expense += -delta;
    }
    income = roundMoney(income);
    expense = roundMoney(expense);
    return {
      accountId: account.id,
      name: account.name,
      opening,
      income,
      expense,
      closing: roundMoney(opening + income - expense),
    };
  });

  const lineMap = new Map<string, CashflowLine>();
  for (const tx of txs) {
    if (!inRange(cashDate(tx), from, to)) continue;
    if (tx.type === "transfer") continue;
    const category = tx.category_id ? cats.get(tx.category_id) : undefined;
    const key = category?.id ?? "";
    const name = category?.name ?? "";
    const line = lineMap.get(key) ?? { categoryId: category?.id ?? null, categoryName: name || "—", income: 0, expense: 0 };
    if (tx.type === "income") line.income = roundMoney(line.income + tx.amount);
    else line.expense = roundMoney(line.expense + tx.amount);
    lineMap.set(key, line);
  }

  const opening = roundMoney(byAccount.reduce((n, row) => n + row.opening, 0));
  const income = roundMoney(byAccount.reduce((n, row) => n + row.income, 0));
  const expense = roundMoney(byAccount.reduce((n, row) => n + row.expense, 0));
  return {
    from,
    to,
    opening,
    income,
    expense,
    closing: roundMoney(opening + income - expense),
    lines: [...lineMap.values()].sort((a, b) => a.categoryName.localeCompare(b.categoryName)),
    byAccount,
  };
}

export type MonthlyReportLine = {
  categoryId: string | null;
  categoryName: string;
  parentName: string | null;
  income: number;
  expense: number;
};

export function buildMonthlyReport(
  transactions: FinanceTransaction[],
  categories: FinanceCategory[],
  from: string,
  to: string,
): { from: string; to: string; income: number; expense: number; profit: number; lines: MonthlyReportLine[] } {
  const cats = liveCategories(categories);
  const byId = new Map(cats.map((row) => [row.id, row]));
  const map = new Map<string, MonthlyReportLine>();
  for (const tx of liveTransactions(transactions)) {
    if (tx.type === "transfer") continue;
    if (!inRange(dealDate(tx), from, to)) continue;
    const category = tx.category_id ? byId.get(tx.category_id) : undefined;
    const key = category?.id ?? "";
    const parent = category?.parent_id ? byId.get(category.parent_id) : undefined;
    const line = map.get(key) ?? {
      categoryId: category?.id ?? null,
      categoryName: category?.name ?? "—",
      parentName: parent?.name ?? null,
      income: 0,
      expense: 0,
    };
    if (tx.type === "income") line.income = roundMoney(line.income + tx.amount);
    else line.expense = roundMoney(line.expense + tx.amount);
    map.set(key, line);
  }
  const lines = [...map.values()].sort((a, b) => (a.parentName ?? a.categoryName).localeCompare(b.parentName ?? b.categoryName) || a.categoryName.localeCompare(b.categoryName));
  const income = roundMoney(lines.reduce((n, line) => n + line.income, 0));
  const expense = roundMoney(lines.reduce((n, line) => n + line.expense, 0));
  return { from, to, income, expense, profit: roundMoney(income - expense), lines };
}

export function categoryOptions(
  categories: FinanceCategory[],
  type: FinanceTxType,
): FinanceCategory[] {
  return liveCategories(categories)
    .filter((row) => (type === "income" ? row.allow_income : type === "expense" ? row.allow_expense : false))
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
}

export function categoryPath(categories: FinanceCategory[], id: string | null | undefined): string {
  if (!id) return "";
  const byId = new Map(liveCategories(categories).map((row) => [row.id, row]));
  const names: string[] = [];
  let current = byId.get(id);
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    names.unshift(current.name);
    current = current.parent_id ? byId.get(current.parent_id) : undefined;
  }
  return names.join(" / ");
}

export function nestedCategories(categories: FinanceCategory[]): FinanceCategory[] {
  const live = liveCategories(categories);
  const children = new Map<string | null, FinanceCategory[]>();
  for (const row of live) {
    const key = row.parent_id;
    const list = children.get(key) ?? [];
    list.push(row);
    children.set(key, list);
  }
  for (const list of children.values()) list.sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
  const out: FinanceCategory[] = [];
  const walk = (parentId: string | null) => {
    for (const row of children.get(parentId) ?? []) {
      out.push(row);
      walk(row.id);
    }
  };
  walk(null);
  return out;
}

export function categoryDepth(categories: FinanceCategory[], id: string): number {
  const byId = new Map(liveCategories(categories).map((row) => [row.id, row]));
  let depth = 0;
  let current = byId.get(id);
  const seen = new Set<string>();
  while (current?.parent_id && !seen.has(current.id)) {
    seen.add(current.id);
    current = byId.get(current.parent_id);
    depth += 1;
  }
  return depth;
}

export function payrollAmount(employee: Pick<FinanceEmployee, "pay_type" | "rate">, hours: number | null): number {
  if (employee.pay_type === "hourly") return roundMoney(employee.rate * (hours ?? 0));
  if (employee.pay_type === "percent") return roundMoney(employee.rate);
  return roundMoney(employee.rate);
}
