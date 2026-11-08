"use client";

import { useState } from "react";
import { accountBalance, liveAccounts, liveTransactions, type FinanceAccount, type FinanceAccountKind } from "@/lib/erp/finance";
import { useErp } from "./ErpShell";
import { useErpRouter } from "./erpHref";
import { ACCOUNT_KINDS, accountKindLabel } from "./financeFields";
import { FinanceFormShell, FinanceMobileNav, FINANCE_HREFS } from "./financeNav";
import { Empty, Field, NavLink, NumberInput, PageHead, T, vnd } from "./ui";

export function FinanceAccountsPage() {
  const { state, act, busy } = useErp();
  const accounts = liveAccounts(state?.financeAccounts);
  const txs = liveTransactions(state?.financeTransactions);
  return (
    <div className="erpMenu erpFinance">
      <PageHead
        title={
          <>
            {T("Счета", "Accounts", "Tài khoản")} <span className="erpHeadCount">{accounts.length}</span>
          </>
        }
        sub={T("Наличные, безнал и сейф — как три обязательных счёта Poster.", "Cash, card and safe — Poster's three required accounts.", "Tiền mặt, thẻ và két — ba tài khoản bắt buộc của Poster.")}
        actions={
          <div className="erpHeadActions">
            <NavLink href={FINANCE_HREFS.accountsTrash} className="erpHeadBtn">
              {T("Корзина", "Trash", "Thùng rác")}
            </NavLink>
            <NavLink href={`${FINANCE_HREFS.accounts}/new`} className="erpBtn primary">
              {T("Добавить", "Add", "Thêm")}
            </NavLink>
          </div>
        }
      />
      <FinanceMobileNav active={FINANCE_HREFS.accounts} />
      <section className="erpMenuPanel">
        <div className="erpTableWrap erpMenuWrap">
          <table className="erpTable erpMenuTable">
            <thead>
              <tr>
                <th>{T("Название", "Name", "Tên")}</th>
                <th>{T("Тип", "Type", "Loại")}</th>
                <th className="num">{T("Начальный баланс", "Opening balance", "Số dư đầu")}</th>
                <th className="num">{T("Баланс", "Balance", "Số dư")}</th>
                <th className="erpMenuRowActions" />
              </tr>
            </thead>
            <tbody>
              {accounts.map((row) => {
                const balance = accountBalance(row, txs);
                return (
                  <tr key={row.id}>
                    <td className="main">
                      {row.name}
                      {row.is_system ? <span className="erpMuted"> · {T("базовый", "system", "mặc định")}</span> : null}
                    </td>
                    <td>{accountKindLabel(row.kind)}</td>
                    <td className="num">{vnd(row.opening_balance)}</td>
                    <td className={`num ${balance < 0 ? "erpMoneyOut" : "erpMoneyIn"}`}>{vnd(balance)}</td>
                    <td className="erpMenuRowActions">
                      <div className="erpMenuLinks">
                        <NavLink href={`${FINANCE_HREFS.accounts}/${row.id}`} className="erpLink">
                          {T("Ред.", "Edit", "Sửa")}
                        </NavLink>
                        {row.is_system ? null : (
                          <button
                            type="button"
                            className="erpLink erpDanger"
                            disabled={busy}
                            onClick={() => {
                              if (!window.confirm(T("Удалить счёт? Транзакции уйдут в корзину на 30 дней.", "Delete this account? Its transactions go to the 30-day trash.", "Xóa tài khoản? Giao dịch vào thùng rác 30 ngày."))) return;
                              void act({ action: "deleteFinanceAccount", id: row.id }, T("Счёт удалён", "Account deleted", "Đã xóa tài khoản"));
                            }}
                          >
                            {T("Удалить", "Delete", "Xóa")}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export function FinanceAccountsTrashPage() {
  const { state, act, busy } = useErp();
  const rows = (state?.financeAccounts ?? []).filter((row) => row.deleted_at);
  return (
    <div className="erpMenu erpFinance">
      <NavLink href={FINANCE_HREFS.accounts} className="erpBack">
        ← {T("Счета", "Accounts", "Tài khoản")}
      </NavLink>
      <PageHead title={T("Корзина счетов", "Account trash", "Thùng rác tài khoản")} />
      <FinanceMobileNav active={FINANCE_HREFS.accounts} />
      {!rows.length ? (
        <Empty title={T("Корзина пуста", "Trash is empty", "Thùng rác trống")} />
      ) : (
        <section className="erpMenuPanel">
          <table className="erpTable erpMenuTable">
            <thead>
              <tr>
                <th>{T("Название", "Name", "Tên")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.name}</td>
                  <td>
                    <button type="button" className="erpLink" disabled={busy} onClick={() => void act({ action: "restoreFinanceAccount", id: row.id }, T("Восстановлено", "Restored", "Đã khôi phục"))}>
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

export function FinanceAccountEditPage({ id }: { id?: string }) {
  const { state } = useErp();
  const account = id ? liveAccounts(state?.financeAccounts).find((row) => row.id === id) : undefined;
  if (id && !account) {
    return (
      <Empty
        title={T("Счёт не найден", "Account not found", "Không thấy tài khoản")}
        action={
          <NavLink href={FINANCE_HREFS.accounts} className="erpBtn">
            {T("К списку", "Back to list", "Về danh sách")}
          </NavLink>
        }
      />
    );
  }
  return <FinanceAccountForm account={account} />;
}

function FinanceAccountForm({ account }: { account?: FinanceAccount }) {
  const { state, act, busy } = useErp();
  const router = useErpRouter();
  const [name, setName] = useState(account?.name ?? "");
  const [kind, setKind] = useState<FinanceAccountKind>(account?.kind ?? "cash");
  const [opening, setOpening] = useState<number | null>(account?.opening_balance ?? 0);
  const [locationId, setLocationId] = useState(account?.location_id ?? "");
  const locations = state?.locations ?? [];

  return (
    <FinanceFormShell
      backHref={FINANCE_HREFS.accounts}
      backLabel={T("Счета", "Accounts", "Tài khoản")}
      activeHref={FINANCE_HREFS.accounts}
      title={account ? T("Редактирование счёта", "Edit account", "Sửa tài khoản") : T("Новый счёт", "New account", "Tài khoản mới")}
      footer={
        <button
          type="button"
          className="erpBtn primary"
          disabled={busy || !name.trim()}
          onClick={async () => {
            const saved = await act(
              {
                action: "saveFinanceAccount",
                value: { id: account?.id, name: name.trim(), kind, opening_balance: opening ?? 0, location_id: locationId || null, currency: "VND" },
              },
              T("Счёт сохранён", "Account saved", "Đã lưu tài khoản"),
            );
            if (saved) router.push(FINANCE_HREFS.accounts);
          }}
        >
          {T("Сохранить", "Save", "Lưu")}
        </button>
      }
    >
      <section className="erpCard">
        <Field label={T("Название", "Name", "Tên")}>
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label={T("Тип счёта", "Account type", "Loại tài khoản")}>
          <select value={kind} onChange={(event) => setKind(event.target.value as FinanceAccountKind)}>
            {ACCOUNT_KINDS.map((item) => (
              <option key={item} value={item}>
                {accountKindLabel(item)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={T("Валюта", "Currency", "Tiền tệ")}>
          <input value="VND" readOnly />
        </Field>
        <Field label={T("Начальный баланс", "Opening balance", "Số dư đầu")}>
          <NumberInput value={opening} onChange={setOpening} />
        </Field>
        {locations.length ? (
          <Field label={T("Заведение", "Venue", "Cơ sở")}>
            <select value={locationId} onChange={(event) => setLocationId(event.target.value)}>
              <option value="">{T("Не привязан", "Not linked", "Chưa gắn")}</option>
              {locations.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
      </section>
    </FinanceFormShell>
  );
}
