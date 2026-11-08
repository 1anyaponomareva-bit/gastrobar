"use client";

import { useState } from "react";
import { liveAccounts, liveTransactions, shiftBookCash, type FinanceShift } from "@/lib/erp/finance";
import { formatVietnamDateTime } from "@/lib/orders/datetime";
import { useErp } from "./ErpShell";
import { useErpRouter } from "./erpHref";
import { fromDatetimeLocal, toDatetimeLocal } from "./financeFields";
import { FinanceFormShell, FinanceMobileNav, FINANCE_HREFS } from "./financeNav";
import { Empty, Field, NavLink, NumberInput, PageHead, T, vnd } from "./ui";

export function FinanceShiftsPage() {
  const { state } = useErp();
  const shifts = state?.financeShifts ?? [];
  const accounts = liveAccounts(state?.financeAccounts);
  const txs = liveTransactions(state?.financeTransactions);
  const accountName = (id: string) => accounts.find((row) => row.id === id)?.name ?? "—";
  return (
    <div className="erpMenu erpFinance">
      <PageHead
        title={
          <>
            {T("Кассовые смены", "Cash shifts", "Ca quỹ")} <span className="erpHeadCount">{shifts.length}</span>
          </>
        }
        sub={T("Книжный и фактический баланс. Разница создаёт актуализацию.", "Book vs actual cash. The difference creates an adjustment.", "Số sách và thực tế. Chênh lệch tạo bút toán điều chỉnh.")}
        actions={
          <NavLink href={`${FINANCE_HREFS.shifts}/new`} className="erpBtn primary">
            {T("Открыть смену", "Open shift", "Mở ca")}
          </NavLink>
        }
      />
      <FinanceMobileNav active={FINANCE_HREFS.shifts} />
      {!shifts.length ? (
        <Empty
          title={T("Смен пока нет", "No cash shifts yet", "Chưa có ca quỹ")}
          text={T("Откройте смену на денежном ящике, укажите продажи и закройте с фактическим остатком.", "Open a shift on the cash drawer, enter sales, close with the counted cash.", "Mở ca trên két, nhập doanh thu, đóng với tiền đếm được.")}
          action={
            <NavLink href={`${FINANCE_HREFS.shifts}/new`} className="erpBtn primary">
              {T("Открыть смену", "Open shift", "Mở ca")}
            </NavLink>
          }
        />
      ) : (
        <section className="erpMenuPanel">
          <div className="erpTableWrap erpMenuWrap">
            <table className="erpTable erpMenuTable">
              <thead>
                <tr>
                  <th>{T("Открыта", "Opened", "Mở")}</th>
                  <th>{T("Счет", "Account", "Tài khoản")}</th>
                  <th>{T("Статус", "Status", "Trạng thái")}</th>
                  <th className="num">{T("Книжный", "Book", "Sách")}</th>
                  <th className="num">{T("Фактический", "Actual", "Thực tế")}</th>
                  <th className="num">{T("Разница", "Difference", "Chênh")}</th>
                  <th className="erpMenuRowActions" />
                </tr>
              </thead>
              <tbody>
                {shifts.map((row) => {
                  const book = shiftBookCash(row, txs);
                  const actual = row.actual_cash;
                  const diff = actual == null ? null : actual - book;
                  return (
                    <tr key={row.id}>
                      <td>{formatVietnamDateTime(row.opened_at)}</td>
                      <td>{accountName(row.account_id)}</td>
                      <td>{row.status === "open" ? T("Открыта", "Open", "Đang mở") : T("Закрыта", "Closed", "Đã đóng")}</td>
                      <td className="num">{vnd(book)}</td>
                      <td className="num">{actual == null ? "—" : vnd(actual)}</td>
                      <td className={`num ${diff == null ? "" : diff < 0 ? "erpMoneyOut" : "erpMoneyIn"}`}>{diff == null ? "—" : vnd(diff)}</td>
                      <td className="erpMenuRowActions">
                        <NavLink href={`${FINANCE_HREFS.shifts}/${row.id}`} className="erpLink">
                          {row.status === "open" ? T("Закрыть", "Close", "Đóng") : T("Показатели", "Totals", "Chỉ số")}
                        </NavLink>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

export function FinanceShiftEditPage({ id }: { id?: string }) {
  const { state } = useErp();
  const shift = id ? (state?.financeShifts ?? []).find((row) => row.id === id) : undefined;
  if (id && !shift) {
    return (
      <Empty
        title={T("Смена не найдена", "Shift not found", "Không thấy ca")}
        action={
          <NavLink href={FINANCE_HREFS.shifts} className="erpBtn">
            {T("К списку", "Back to list", "Về danh sách")}
          </NavLink>
        }
      />
    );
  }
  return <FinanceShiftForm shift={shift} />;
}

function FinanceShiftForm({ shift }: { shift?: FinanceShift }) {
  const { state, act, busy } = useErp();
  const router = useErpRouter();
  const accounts = liveAccounts(state?.financeAccounts);
  const cashAccounts = accounts.filter((row) => row.kind === "cash");
  const locations = state?.locations ?? [];
  const txs = liveTransactions(state?.financeTransactions);
  const drawer = accounts.find((row) => row.system_role === "cash_drawer") ?? cashAccounts[0];
  const [accountId, setAccountId] = useState(shift?.account_id ?? drawer?.id ?? "");
  const [locationId, setLocationId] = useState(shift?.location_id ?? "");
  const [openedAt, setOpenedAt] = useState(toDatetimeLocal(shift?.opened_at));
  const [opening, setOpening] = useState<number | null>(shift?.opening_cash ?? 0);
  const [salesCash, setSalesCash] = useState<number | null>(shift?.sales_cash ?? 0);
  const [salesCard, setSalesCard] = useState<number | null>(shift?.sales_card ?? 0);
  const [collection, setCollection] = useState<number | null>(shift?.collection_sum ?? 0);
  const [actual, setActual] = useState<number | null>(shift?.actual_cash ?? null);
  const [comment, setComment] = useState(shift?.comment ?? "");
  const book = shift ? shiftBookCash({ ...shift, opening_cash: opening ?? 0, account_id: accountId }, txs) : opening ?? 0;
  const closing = shift?.status === "closed" || Boolean(shift);

  const saveOpen = async () => {
    const saved = await act(
      {
        action: "saveFinanceShift",
        value: { id: shift?.id, account_id: accountId, location_id: locationId || null, opened_at: fromDatetimeLocal(openedAt), opening_cash: opening ?? 0, comment },
      },
      T("Смена сохранена", "Shift saved", "Đã lưu ca"),
    );
    if (saved && !shift) router.push(`${FINANCE_HREFS.shifts}/${(saved as { id: string }).id}`);
    else if (saved && !closing) router.push(FINANCE_HREFS.shifts);
  };

  const closeShift = async () => {
    if (!shift) {
      await saveOpen();
      return;
    }
    const saved = await act(
      {
        action: "closeFinanceShift",
        value: {
          id: shift.id,
          sales_cash: salesCash ?? 0,
          sales_card: salesCard ?? 0,
          collection_sum: collection ?? 0,
          actual_cash: actual ?? 0,
          comment,
        },
      },
      T("Смена закрыта", "Shift closed", "Đã đóng ca"),
    );
    if (saved) router.push(FINANCE_HREFS.shifts);
  };

  return (
    <FinanceFormShell
      backHref={FINANCE_HREFS.shifts}
      backLabel={T("Кассовые смены", "Cash shifts", "Ca quỹ")}
      activeHref={FINANCE_HREFS.shifts}
      title={shift ? T("Кассовая смена", "Cash shift", "Ca quỹ") : T("Открыть смену", "Open shift", "Mở ca")}
      footer={
        <>
          {shift?.status === "open" || !shift ? (
            <button type="button" className="erpBtn" disabled={busy || !accountId} onClick={() => void saveOpen()}>
              {T("Сохранить", "Save", "Lưu")}
            </button>
          ) : null}
          <button type="button" className="erpBtn primary" disabled={busy || !shift || actual == null} onClick={() => void closeShift()}>
            {shift?.status === "closed" ? T("Сохранить показатели", "Save totals", "Lưu chỉ số") : T("Закрыть смену", "Close shift", "Đóng ca")}
          </button>
        </>
      }
    >
      <section className="erpCard">
        <Field label={T("Денежный ящик", "Cash drawer", "Két tiền")}>
          <select value={accountId} disabled={shift?.status === "closed"} onChange={(event) => setAccountId(event.target.value)}>
            {cashAccounts.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </Field>
        {locations.length ? (
          <Field label={T("Заведение", "Venue", "Cơ sở")}>
            <select value={locationId} disabled={shift?.status === "closed"} onChange={(event) => setLocationId(event.target.value)}>
              <option value="">{T("Не указано", "Not set", "Chưa chọn")}</option>
              {locations.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        <Field label={T("Открыта", "Opened", "Mở")}>
          <input type="datetime-local" value={openedAt} disabled={shift?.status === "closed"} onChange={(event) => setOpenedAt(event.target.value)} />
        </Field>
        <Field label={T("Наличные на открытие", "Opening cash", "Tiền đầu ca")}>
          <NumberInput value={opening} onChange={setOpening} disabled={shift?.status === "closed"} />
        </Field>
        {shift ? (
          <>
            <Field label={T("Выручка наличными", "Cash sales", "Doanh thu tiền mặt")}>
              <NumberInput value={salesCash} onChange={setSalesCash} />
            </Field>
            <Field label={T("Выручка безнал", "Card sales", "Doanh thu thẻ")}>
              <NumberInput value={salesCard} onChange={setSalesCard} />
            </Field>
            <Field label={T("Инкассация в сейф", "Collection to safe", "Nộp két")}>
              <NumberInput value={collection} onChange={setCollection} />
            </Field>
            <Field label={T("Книжный баланс", "Book balance", "Số sách")}>
              <input value={vnd(book)} readOnly />
            </Field>
            <Field label={T("Фактический баланс", "Actual cash", "Tiền thực tế")}>
              <NumberInput value={actual} onChange={setActual} />
            </Field>
            {actual != null ? (
              <p className="erpHint">
                {T("Разница (актуализация)", "Difference (adjustment)", "Chênh lệch")}: {vnd(actual - book)}
              </p>
            ) : null}
          </>
        ) : (
          <p className="erpHint">{T("После открытия укажите продажи, инкассацию и фактический остаток, затем закройте смену.", "After opening, enter sales, collection and counted cash, then close the shift.", "Sau khi mở, nhập doanh thu, nộp két và tiền đếm được, rồi đóng ca.")}</p>
        )}
        <Field label={T("Комментарий", "Comment", "Ghi chú")} wide>
          <textarea value={comment} onChange={(event) => setComment(event.target.value)} rows={2} />
        </Field>
      </section>
    </FinanceFormShell>
  );
}
