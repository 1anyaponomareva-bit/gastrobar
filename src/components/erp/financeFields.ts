import type { FinanceAccountKind, FinancePayType, FinancePnlBlock, FinanceTxType } from "@/lib/erp/finance";
import { vietnamDateTimeLocal } from "@/lib/orders/datetime";
import { T } from "./i18n";

export function accountKindLabel(kind: FinanceAccountKind) {
  return {
    cash: T("Наличные", "Cash", "Tiền mặt"),
    bank: T("Безналичный счет", "Bank account", "Tài khoản ngân hàng"),
    card: T("Банковская карта", "Card / acquiring", "Thẻ / POS"),
  }[kind];
}

export function txTypeLabel(type: FinanceTxType) {
  return {
    expense: T("Расход", "Expense", "Chi"),
    income: T("Доход", "Income", "Thu"),
    transfer: T("Перевод", "Transfer", "Chuyển"),
  }[type];
}

export function pnlBlockLabel(block: FinancePnlBlock) {
  return {
    revenue: T("Выручка", "Revenue", "Doanh thu"),
    cogs: T("Себестоимость", "Cost of goods", "Giá vốn"),
    opex: T("Операционные расходы", "Operating expenses", "Chi phí hoạt động"),
    other_income: T("Прочие доходы", "Other income", "Thu nhập khác"),
    other_expense: T("Прочие расходы", "Other expenses", "Chi phí khác"),
    tax: T("Налоги", "Taxes", "Thuế"),
    none: T("Не учитывать в P&L", "Hide from P&L", "Không đưa vào P&L"),
  }[block];
}

export function payTypeLabel(type: FinancePayType) {
  return {
    monthly: T("Оклад", "Monthly", "Lương tháng"),
    hourly: T("Почасовая", "Hourly", "Theo giờ"),
    shift: T("За смену", "Per shift", "Theo ca"),
    percent: T("% от продаж", "% of sales", "% doanh thu"),
  }[type];
}

export const ACCOUNT_KINDS: FinanceAccountKind[] = ["cash", "bank", "card"];
export const PNL_BLOCKS: FinancePnlBlock[] = ["revenue", "cogs", "opex", "other_income", "other_expense", "tax", "none"];
export const PAY_TYPES: FinancePayType[] = ["monthly", "hourly", "shift", "percent"];

export function toDatetimeLocal(iso: string | null | undefined, now = new Date()): string {
  const date = iso ? new Date(iso) : now;
  if (Number.isNaN(date.getTime())) return "";
  return vietnamDateTimeLocal(date);
}

/** datetime-local is wall time in Vietnam; store as +07:00. */
export function fromDatetimeLocal(value: string): string {
  if (!value) return new Date().toISOString();
  return `${value}:00+07:00`;
}
