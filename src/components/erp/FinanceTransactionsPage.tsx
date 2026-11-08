"use client";

import { useMemo, useState } from "react";
import {
  accountBalance,
  cashDate,
  categoryOptions,
  categoryPath,
  currentYearMonth,
  liveAccounts,
  liveCategories,
  liveTransactions,
  monthRange,
  txLocked,
  type FinanceTransaction,
  type FinanceTxType,
} from "@/lib/erp/finance";
import { formatVietnamDateTime } from "@/lib/orders/datetime";
import { downloadDocumentExport } from "./docs";
import { useErp } from "./ErpShell";
import { useErpRouter } from "./erpHref";
import { Caret, notImplemented } from "./CatalogTable";
import { DropMenu } from "./filters";
import { accountKindLabel, fromDatetimeLocal, toDatetimeLocal, txTypeLabel } from "./financeFields";
import { FinanceFormShell, FinanceMobileNav, FINANCE_HREFS } from "./financeNav";
import { Empty, Field, NavLink, NumberInput, PageHead, T, today, vnd } from "./ui";

function useFinance() {
  const { state } = useErp();
  return {
    accounts: liveAccounts(state?.financeAccounts),
    categories: liveCategories(state?.financeCategories),
    transactions: state?.financeTransactions ?? [],
  };
}

export function FinanceTransactionsPage() {
  const { act, busy, notify } = useErp();
  const { accounts, categories, transactions } = useFinance();
  const [month, setMonth] = useState(currentYearMonth);
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [type, setType] = useState<"" | FinanceTxType>("");
  const [query, setQuery] = useState("");
  const { from, to } = monthRange(month);
  const live = liveTransactions(transactions).filter((row) => cashDate(row) >= from && cashDate(row) < to);
  const rows = live.filter((row) => {
    if (accountId && row.account_id !== accountId && row.to_account_id !== accountId) return false;
    if (categoryId && row.category_id !== categoryId) return false;
    if (type && row.type !== type) return false;
    const hay = `${categoryPath(categories, row.category_id)} ${row.comment ?? ""}`.toLowerCase();
    return !query.trim() || hay.includes(query.trim().toLowerCase());
  });
  const income = rows.filter((row) => row.type === "income").reduce((n, row) => n + row.amount, 0);
  const expense = rows.filter((row) => row.type === "expense" || row.type === "transfer").reduce((n, row) => n + row.amount, 0);
  const accountName = (id: string | null) => accounts.find((item) => item.id === id)?.name ?? "—";

  return (
    <div className="erpMenu erpFinance">
      <PageHead
        title={
          <>
            {T("Транзакции", "Transactions", "Giao dịch")} <span className="erpHeadCount">{rows.length}</span>
          </>
        }
        sub={T("Движение денег по счетам: доходы, расходы и переводы.", "Money in and out of accounts: income, expense and transfers.", "Tiền vào/ra tài khoản: thu, chi và chuyển.")}
        actions={
          <div className="erpHeadActions">
            <NavLink href={FINANCE_HREFS.trash} className="erpHeadBtn" title={T("Корзина", "Trash", "Thùng rác")}>
              {T("Корзина", "Trash", "Thùng rác")}
            </NavLink>
            <button
              type="button"
              className="erpHeadBtn"
              disabled={!rows.length}
              onClick={() =>
                downloadDocumentExport(
                  `transactions_${today()}`,
                  "transactions",
                  [T("Дата", "Date", "Ngày"), T("Счет", "Account", "Tài khoản"), T("Категория", "Category", "Nhóm"), T("Комментарий", "Comment", "Ghi chú"), T("Приход", "Income", "Thu"), T("Расход", "Expense", "Chi")],
                  rows.map((row) => [
                    formatVietnamDateTime(row.occurred_at),
                    row.type === "transfer" ? `${accountName(row.account_id)} → ${accountName(row.to_account_id)}` : accountName(row.account_id),
                    row.type === "transfer" ? txTypeLabel("transfer") : categoryPath(categories, row.category_id),
                    row.comment ?? "",
                    row.type === "income" ? String(row.amount) : "",
                    row.type !== "income" ? String(row.amount) : "",
                  ]),
                )
              }
            >
              {T("Экспорт", "Export", "Xuất")}
            </button>
            <button type="button" className="erpHeadBtn" onClick={() => notify({ ok: false, text: notImplemented(T("Импорт выписки", "Statement import", "Nhập sao kê")) })}>
              {T("Импорт выписки", "Import statement", "Nhập sao kê")}
            </button>
            <NavLink href={`${FINANCE_HREFS.transactions}/new`} className="erpBtn primary">
              {T("Добавить", "Add", "Thêm")}
            </NavLink>
          </div>
        }
      />
      <FinanceMobileNav active={FINANCE_HREFS.transactions} />
      <section className="erpMenuPanel">
        <div className="erpFilters erpNoPrint">
          <input type="search" className="erpSearch" placeholder={T("Поиск по комментарию", "Search comments", "Tìm ghi chú")} value={query} onChange={(event) => setQuery(event.target.value)} />
          <label className="erpFilterBtn on">
            <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
          </label>
          <FilterSelect label={T("Счет", "Account", "Tài khoản")} value={accountId} onChange={setAccountId} options={accounts.map((row) => [row.id, row.name] as [string, string])} />
          <FilterSelect label={T("Категория", "Category", "Nhóm")} value={categoryId} onChange={setCategoryId} options={categories.map((row) => [row.id, categoryPath(categories, row.id)] as [string, string])} />
          <FilterSelect
            label={T("Тип", "Type", "Loại")}
            value={type}
            onChange={(value) => setType(value as "" | FinanceTxType)}
            options={[
              ["income", txTypeLabel("income")],
              ["expense", txTypeLabel("expense")],
              ["transfer", txTypeLabel("transfer")],
            ]}
          />
        </div>
        {!liveTransactions(transactions).length ? (
          <Empty
            title={T("Транзакций пока нет", "No transactions yet", "Chưa có giao dịch")}
            text={T("Добавьте доход, расход или перевод между счетами.", "Add income, expense or a transfer between accounts.", "Thêm thu, chi hoặc chuyển khoản.")}
            action={
              <NavLink href={`${FINANCE_HREFS.transactions}/new`} className="erpBtn primary">
                {T("Добавить", "Add", "Thêm")}
              </NavLink>
            }
          />
        ) : (
          <div className="erpTableWrap erpMenuWrap">
            <table className="erpTable erpMenuTable">
              <thead>
                <tr>
                  <th>{T("Дата", "Date", "Ngày")}</th>
                  <th>{T("Счет", "Account", "Tài khoản")}</th>
                  <th>{T("Категория", "Category", "Nhóm")}</th>
                  <th>{T("Комментарий", "Comment", "Ghi chú")}</th>
                  <th className="num">{T("Приход", "Income", "Thu")}</th>
                  <th className="num">{T("Расход", "Expense", "Chi")}</th>
                  <th className="erpMenuRowActions" />
                </tr>
              </thead>
              <tbody>
                {!rows.length ? (
                  <tr>
                    <td colSpan={7} className="erpMenuEmpty">
                      {T("Нет данных за выбранный период", "No data in this period", "Không có dữ liệu kỳ này")}
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.id}>
                      <td>{formatVietnamDateTime(row.occurred_at)}</td>
                      <td>
                        {row.type === "transfer"
                          ? `${accountName(row.account_id)} → ${accountName(row.to_account_id)}`
                          : accountName(row.account_id)}
                      </td>
                      <td>{row.type === "transfer" ? txTypeLabel("transfer") : categoryPath(categories, row.category_id) || "—"}</td>
                      <td>{row.comment || "—"}</td>
                      <td className="num">{row.type === "income" ? <span className="erpMoneyIn">{vnd(row.amount)}</span> : ""}</td>
                      <td className="num">{row.type !== "income" ? <span className="erpMoneyOut">{vnd(row.amount)}</span> : ""}</td>
                      <td className="erpMenuRowActions">
                        <div className="erpMenuLinks">
                          <NavLink href={`${FINANCE_HREFS.transactions}/${row.id}`} className="erpLink">
                            {T("Ред.", "Edit", "Sửa")}
                          </NavLink>
                          {txLocked(row) ? null : (
                            <button
                              type="button"
                              className="erpLink erpDanger"
                              disabled={busy}
                              onClick={() => {
                                if (!window.confirm(T("Удалить транзакцию в корзину на 30 дней?", "Move this transaction to the 30-day trash?", "Chuyển giao dịch vào thùng rác 30 ngày?"))) return;
                                void act({ action: "deleteFinanceTransaction", id: row.id }, T("Транзакция удалена", "Transaction deleted", "Đã xóa giao dịch"));
                              }}
                            >
                              {T("Удалить", "Delete", "Xóa")}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4}>{T("Итого", "Total", "Tổng")}</td>
                  <td className="num erpMoneyIn">{vnd(income)}</td>
                  <td className="num erpMoneyOut">{vnd(expense)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
}) {
  return (
    <DropMenu
      trigger={({ open, toggle }) => (
        <button type="button" className={`erpFilterBtn ${value ? "on" : ""}`} aria-expanded={open} onClick={toggle}>
          <span>
            {label}
            {value ? `: ${options.find((item) => item[0] === value)?.[1] ?? ""}` : ""}
          </span>
          <Caret />
        </button>
      )}
    >
      {(close) => (
        <div className="erpDropList">
          <button
            type="button"
            className={`erpDropAction ${!value ? "on" : ""}`}
            onClick={() => {
              onChange("");
              close();
            }}
          >
            {T("Все", "All", "Tất cả")}
          </button>
          {options.map(([id, name]) => (
            <button
              key={id}
              type="button"
              className={`erpDropAction ${id === value ? "on" : ""}`}
              onClick={() => {
                onChange(id);
                close();
              }}
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </DropMenu>
  );
}

export function FinanceTransactionTrashPage() {
  const { act, busy } = useErp();
  const { transactions, accounts, categories } = useFinance();
  const rows = transactions.filter((row) => row.deleted_at);
  return (
    <div className="erpMenu erpFinance">
      <NavLink href={FINANCE_HREFS.transactions} className="erpBack">
        ← {T("Транзакции", "Transactions", "Giao dịch")}
      </NavLink>
      <PageHead title={T("Корзина", "Trash", "Thùng rác")} sub={T("30 дней, как в Poster.", "30 days, as in Poster.", "30 ngày, như Poster.")} />
      <FinanceMobileNav active={FINANCE_HREFS.transactions} />
      {!rows.length ? (
        <Empty title={T("Корзина пуста", "Trash is empty", "Thùng rác trống")} />
      ) : (
        <section className="erpMenuPanel">
          <table className="erpTable erpMenuTable">
            <thead>
              <tr>
                <th>{T("Дата", "Date", "Ngày")}</th>
                <th>{T("Счет", "Account", "Tài khoản")}</th>
                <th>{T("Категория", "Category", "Nhóm")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{formatVietnamDateTime(row.occurred_at)}</td>
                  <td>{accounts.find((item) => item.id === row.account_id)?.name ?? "—"}</td>
                  <td>{categoryPath(categories, row.category_id) || txTypeLabel(row.type)}</td>
                  <td>
                    <button type="button" className="erpLink" disabled={busy} onClick={() => void act({ action: "restoreFinanceTransaction", id: row.id }, T("Восстановлено", "Restored", "Đã khôi phục"))}>
                      {T("Восстановить", "Restore", "Khôi phục")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

export function FinanceTransactionEditPage({ id }: { id?: string }) {
  const { state } = useErp();
  const tx = id ? (state?.financeTransactions ?? []).find((row) => row.id === id && !row.deleted_at) : undefined;
  if (id && !tx) {
    return (
      <Empty
        title={T("Транзакция не найдена", "Transaction not found", "Không thấy giao dịch")}
        action={
          <NavLink href={FINANCE_HREFS.transactions} className="erpBtn">
            {T("К списку", "Back to list", "Về danh sách")}
          </NavLink>
        }
      />
    );
  }
  return <FinanceTransactionForm tx={tx} />;
}

function FinanceTransactionForm({ tx }: { tx?: FinanceTransaction }) {
  const { email, act, busy } = useErp();
  const router = useErpRouter();
  const { accounts, categories, transactions } = useFinance();
  const live = useMemo(() => liveTransactions(transactions), [transactions]);
  const locked = tx ? txLocked(tx) : false;
  const [type, setType] = useState<FinanceTxType>(tx?.type ?? "expense");
  const [amount, setAmount] = useState<number | null>(tx?.amount ?? null);
  const [accountId, setAccountId] = useState(tx?.account_id ?? accounts[0]?.id ?? "");
  const [toAccountId, setToAccountId] = useState(tx?.to_account_id ?? "");
  const [categoryId, setCategoryId] = useState(tx?.category_id ?? "");
  const [occurred, setOccurred] = useState(toDatetimeLocal(tx?.occurred_at));
  const [otherDeal, setOtherDeal] = useState(Boolean(tx?.deal_at));
  const [dealAt, setDealAt] = useState(tx?.deal_at ?? "");
  const [comment, setComment] = useState(tx?.comment ?? "");
  const cats = categoryOptions(categories, type);
  const commentLocked = Boolean(tx && (tx.source !== "manual" || tx.type === "transfer"));

  return (
    <FinanceFormShell
      backHref={FINANCE_HREFS.transactions}
      backLabel={T("Транзакции", "Transactions", "Giao dịch")}
      activeHref={FINANCE_HREFS.transactions}
      title={tx ? T("Редактирование транзакции", "Edit transaction", "Sửa giao dịch") : T("Новая транзакция", "New transaction", "Giao dịch mới")}
      footer={
        <button
          type="button"
          className="erpBtn primary"
          disabled={busy || !amount || amount <= 0 || !accountId || (type !== "transfer" && !categoryId) || (type === "transfer" && (!toAccountId || toAccountId === accountId))}
          onClick={async () => {
            const saved = await act(
              {
                action: "saveFinanceTransaction",
                value: {
                  id: tx?.id,
                  type,
                  amount,
                  account_id: accountId,
                  to_account_id: type === "transfer" ? toAccountId : null,
                  category_id: type === "transfer" ? null : categoryId,
                  occurred_at: fromDatetimeLocal(occurred),
                  deal_at: otherDeal && dealAt ? dealAt : null,
                  comment,
                  user_name: email,
                },
              },
              T("Транзакция сохранена", "Transaction saved", "Đã lưu giao dịch"),
            );
            if (saved) router.push(FINANCE_HREFS.transactions);
          }}
        >
          {T("Сохранить", "Save", "Lưu")}
        </button>
      }
    >
      <section className="erpCard">
        {locked ? (
          <p className="erpHint">
            {T(
              "Автоматические, кассовые и переводные транзакции: сумму и счета меняют через кассовую смену. Категорию и комментарий — только у ручных доходов и расходов.",
              "Automatic, POS and transfer rows keep amount and accounts locked. Only manual income and expense can change category and comment.",
              "Giao dịch tự động chỉ sửa được qua ca quỹ.",
            )}
          </p>
        ) : null}
        <Field label={T("Тип", "Type", "Loại")}>
          <select value={type} disabled={locked} onChange={(event) => setType(event.target.value as FinanceTxType)}>
            <option value="expense">{txTypeLabel("expense")}</option>
            <option value="income">{txTypeLabel("income")}</option>
            <option value="transfer">{txTypeLabel("transfer")}</option>
          </select>
        </Field>
        <Field label={T("Сумма", "Amount", "Số tiền")}>
          <NumberInput value={amount} onChange={setAmount} disabled={locked} />
        </Field>
        <Field label={type === "transfer" ? T("Со счета", "From account", "Từ tài khoản") : T("Счет", "Account", "Tài khoản")}>
          <select value={accountId} disabled={locked} onChange={(event) => setAccountId(event.target.value)}>
            {accounts.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name} · {vnd(accountBalance(row, live))} · {accountKindLabel(row.kind)}
              </option>
            ))}
          </select>
        </Field>
        {type === "transfer" ? (
          <Field label={T("На счет", "To account", "Đến tài khoản")}>
            <select value={toAccountId} disabled={locked} onChange={(event) => setToAccountId(event.target.value)}>
              <option value="">{T("Выберите счет", "Choose an account", "Chọn tài khoản")}</option>
              {accounts
                .filter((row) => row.id !== accountId)
                .map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
            </select>
          </Field>
        ) : (
          <Field label={T("Категория", "Category", "Nhóm")}>
            <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} disabled={Boolean(tx && tx.source !== "manual")}>
              <option value="">{T("Выберите категорию", "Choose a category", "Chọn nhóm")}</option>
              {cats.map((row) => (
                <option key={row.id} value={row.id}>
                  {categoryPath(categories, row.id)}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label={T("Дата и время", "Date and time", "Ngày giờ")}>
          <input type="datetime-local" value={occurred} disabled={locked} onChange={(event) => setOccurred(event.target.value)} />
        </Field>
        <label className="erpCheck">
          <input type="checkbox" checked={otherDeal} disabled={locked} onChange={(event) => setOtherDeal(event.target.checked)} />
          {T("Другая дата сделки", "Different deal date", "Ngày phát sinh khác")}
        </label>
        {otherDeal ? (
          <Field
            label={T("Дата сделки", "Deal date", "Ngày phát sinh")}
            hint={T("P&L берёт дату сделки, Cash flow — дату движения денег.", "P&L uses the deal date; Cash flow uses the money date.", "P&L lấy ngày phát sinh, Cash flow lấy ngày tiền.")}
          >
            <input type="date" value={dealAt} disabled={locked} onChange={(event) => setDealAt(event.target.value)} />
          </Field>
        ) : null}
        <Field label={T("Комментарий", "Comment", "Ghi chú")} wide>
          <textarea value={comment} disabled={commentLocked} onChange={(event) => setComment(event.target.value)} rows={3} />
        </Field>
      </section>
    </FinanceFormShell>
  );
}
