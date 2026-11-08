"use client";

import { useState } from "react";
import { liveAccounts, payrollAmount, type FinanceEmployee, type FinancePayType } from "@/lib/erp/finance";
import { formatVietnamDate } from "@/lib/orders/datetime";
import { useErp } from "./ErpShell";
import { useErpRouter } from "./erpHref";
import { PAY_TYPES, payTypeLabel } from "./financeFields";
import { FinanceFormShell, FinanceMobileNav, FINANCE_HREFS } from "./financeNav";
import { Empty, Field, NavLink, NumberInput, PageHead, T, vnd } from "./ui";

export function FinanceSalaryPage() {
  const { state, act, busy } = useErp();
  const employees = (state?.financeEmployees ?? []).filter((row) => !row.archived_at);
  const payroll = state?.financePayroll ?? [];
  const accounts = liveAccounts(state?.financeAccounts);
  const [payId, setPayId] = useState<string | null>(null);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");

  return (
    <div className="erpMenu erpFinance">
      <PageHead
        title={T("Зарплата", "Payroll", "Lương")}
        sub={T("Ставка сотрудника и выплата — расход с датой сделки в периоде начисления.", "Employee rate and payment — an expense whose deal date is the pay period.", "Mức lương và chi: ngày phát sinh là kỳ lương.")}
        actions={
          <NavLink href={`${FINANCE_HREFS.salary}/new`} className="erpBtn primary">
            {T("Сотрудник", "Employee", "Nhân viên")}
          </NavLink>
        }
      />
      <FinanceMobileNav active={FINANCE_HREFS.salary} />
      <section className="erpMenuPanel">
        <h2 className="erpMenuNote">{T("Сотрудники", "Employees", "Nhân viên")}</h2>
        {!employees.length ? (
          <Empty title={T("Сотрудников пока нет", "No employees yet", "Chưa có nhân viên")} />
        ) : (
          <div className="erpTableWrap erpMenuWrap">
            <table className="erpTable erpMenuTable">
              <thead>
                <tr>
                  <th>{T("Имя", "Name", "Tên")}</th>
                  <th>{T("Должность", "Role", "Vị trí")}</th>
                  <th>{T("Тип", "Type", "Loại")}</th>
                  <th className="num">{T("Ставка", "Rate", "Mức")}</th>
                  <th className="erpMenuRowActions" />
                </tr>
              </thead>
              <tbody>
                {employees.map((row) => (
                  <tr key={row.id}>
                    <td className="main">{row.name}</td>
                    <td>{row.role || "—"}</td>
                    <td>{payTypeLabel(row.pay_type)}</td>
                    <td className="num">{vnd(row.rate)}</td>
                    <td className="erpMenuRowActions">
                      <div className="erpMenuLinks">
                        <NavLink href={`${FINANCE_HREFS.salary}/${row.id}`} className="erpLink">
                          {T("Ред.", "Edit", "Sửa")}
                        </NavLink>
                        <PayrollCreate employee={row} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="erpMenuPanel" style={{ marginTop: 16 }}>
        <h2 className="erpMenuNote">{T("Начисления", "Payslips", "Phiếu lương")}</h2>
        <div className="erpTableWrap erpMenuWrap">
          <table className="erpTable erpMenuTable">
            <thead>
              <tr>
                <th>{T("Сотрудник", "Employee", "Nhân viên")}</th>
                <th>{T("Период", "Period", "Kỳ")}</th>
                <th className="num">{T("Сумма", "Amount", "Số tiền")}</th>
                <th>{T("Выплата", "Paid", "Chi")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {payroll.map((row) => {
                const employee = employees.find((item) => item.id === row.employee_id) ?? (state?.financeEmployees ?? []).find((item) => item.id === row.employee_id);
                return (
                  <tr key={row.id}>
                    <td>{employee?.name ?? "—"}</td>
                    <td>
                      {formatVietnamDate(row.period_start)} — {formatVietnamDate(row.period_end)}
                    </td>
                    <td className="num">{vnd(row.amount)}</td>
                    <td>{row.paid_at ? formatVietnamDate(row.paid_at) : T("Не выплачено", "Unpaid", "Chưa trả")}</td>
                    <td>
                      {row.paid_at ? null : (
                        <button type="button" className="erpLink" disabled={busy} onClick={() => setPayId(row.id)}>
                          {T("Выплатить", "Pay", "Trả")}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {payId ? (
          <div className="erpFilters">
            <Field label={T("Счёт выплаты", "Payout account", "Tài khoản chi")}>
              <select value={accountId} onChange={(event) => setAccountId(event.target.value)}>
                {accounts.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </Field>
            <button
              type="button"
              className="erpBtn primary"
              disabled={busy || !accountId}
              onClick={async () => {
                const saved = await act({ action: "payFinancePayroll", value: { id: payId, account_id: accountId } }, T("Зарплата выплачена", "Payroll paid", "Đã trả lương"));
                if (saved) setPayId(null);
              }}
            >
              {T("Провести выплату", "Post payment", "Ghi chi")}
            </button>
            <button type="button" className="erpBtn" onClick={() => setPayId(null)}>
              {T("Отмена", "Cancel", "Hủy")}
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function PayrollCreate({ employee }: { employee: FinanceEmployee }) {
  const { act, busy } = useErp();
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [hours, setHours] = useState<number | null>(null);
  if (!open) {
    return (
      <button type="button" className="erpLink" onClick={() => setOpen(true)}>
        {T("Начислить", "Accrue", "Tính lương")}
      </button>
    );
  }
  return (
    <span className="erpMenuLinks">
      <input type="date" value={start} onChange={(event) => setStart(event.target.value)} />
      <input type="date" value={end} onChange={(event) => setEnd(event.target.value)} />
      {employee.pay_type === "hourly" ? <NumberInput value={hours} onChange={setHours} placeholder={T("Часы", "Hours", "Giờ")} /> : null}
      <button
        type="button"
        className="erpLink"
        disabled={busy || !start || !end}
        onClick={async () => {
          const saved = await act(
            {
              action: "saveFinancePayroll",
              value: { employee_id: employee.id, period_start: start, period_end: end, hours, amount: payrollAmount(employee, hours) },
            },
            T("Начисление создано", "Payslip created", "Đã tạo phiếu lương"),
          );
          if (saved) setOpen(false);
        }}
      >
        {T("OK", "OK", "OK")}
      </button>
      <button type="button" className="erpLink" onClick={() => setOpen(false)}>
        {T("Отмена", "Cancel", "Hủy")}
      </button>
    </span>
  );
}

export function FinanceEmployeeEditPage({ id }: { id?: string }) {
  const { state } = useErp();
  const employee = id ? (state?.financeEmployees ?? []).find((row) => row.id === id) : undefined;
  if (id && !employee) {
    return (
      <Empty
        title={T("Сотрудник не найден", "Employee not found", "Không thấy nhân viên")}
        action={
          <NavLink href={FINANCE_HREFS.salary} className="erpBtn">
            {T("К списку", "Back to list", "Về danh sách")}
          </NavLink>
        }
      />
    );
  }
  return <FinanceEmployeeForm employee={employee} />;
}

function FinanceEmployeeForm({ employee }: { employee?: FinanceEmployee }) {
  const { act, busy } = useErp();
  const router = useErpRouter();
  const [name, setName] = useState(employee?.name ?? "");
  const [role, setRole] = useState(employee?.role ?? "");
  const [payType, setPayType] = useState<FinancePayType>(employee?.pay_type ?? "monthly");
  const [rate, setRate] = useState<number | null>(employee?.rate ?? 0);

  return (
    <FinanceFormShell
      backHref={FINANCE_HREFS.salary}
      backLabel={T("Зарплата", "Payroll", "Lương")}
      activeHref={FINANCE_HREFS.salary}
      title={employee ? T("Сотрудник", "Employee", "Nhân viên") : T("Новый сотрудник", "New employee", "Nhân viên mới")}
      footer={
        <button
          type="button"
          className="erpBtn primary"
          disabled={busy || !name.trim()}
          onClick={async () => {
            const saved = await act(
              { action: "saveFinanceEmployee", value: { id: employee?.id, name: name.trim(), role, pay_type: payType, rate: rate ?? 0 } },
              T("Сотрудник сохранён", "Employee saved", "Đã lưu nhân viên"),
            );
            if (saved) router.push(FINANCE_HREFS.salary);
          }}
        >
          {T("Сохранить", "Save", "Lưu")}
        </button>
      }
    >
      <section className="erpCard">
        <Field label={T("Имя", "Name", "Tên")}>
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label={T("Должность", "Role", "Vị trí")}>
          <input value={role} onChange={(event) => setRole(event.target.value)} />
        </Field>
        <Field label={T("Тип оплаты", "Pay type", "Kiểu lương")}>
          <select value={payType} onChange={(event) => setPayType(event.target.value as FinancePayType)}>
            {PAY_TYPES.map((item) => (
              <option key={item} value={item}>
                {payTypeLabel(item)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={T("Ставка, ₫", "Rate, ₫", "Mức, ₫")}>
          <NumberInput value={rate} onChange={setRate} />
        </Field>
      </section>
    </FinanceFormShell>
  );
}
