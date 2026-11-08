"use client";

import { useState } from "react";
import { categoryDepth, liveCategories, nestedCategories, type FinanceCategory, type FinancePnlBlock } from "@/lib/erp/finance";
import { useErp } from "./ErpShell";
import { useErpRouter } from "./erpHref";
import { PNL_BLOCKS, pnlBlockLabel } from "./financeFields";
import { FinanceFormShell, FinanceMobileNav, FINANCE_HREFS } from "./financeNav";
import { Empty, Field, NavLink, PageHead, T } from "./ui";

export function FinanceCategoriesPage() {
  const { state, act, busy } = useErp();
  const categories = liveCategories(state?.financeCategories);
  const rows = nestedCategories(categories);
  const [moveFor, setMoveFor] = useState<FinanceCategory | null>(null);
  const [moveTo, setMoveTo] = useState("");

  const remove = (row: FinanceCategory, moveToId: string | null) => {
    void act(
      { action: "deleteFinanceCategory", id: row.id, moveToId },
      T("Категория удалена", "Category deleted", "Đã xóa nhóm"),
    );
    setMoveFor(null);
  };

  return (
    <div className="erpMenu erpFinance">
      <PageHead
        title={
          <>
            {T("Категории", "Categories", "Nhóm")} <span className="erpHeadCount">{rows.length}</span>
          </>
        }
        sub={T("Доходы, расходы и блок в P&L. Базовые категории Poster удалить нельзя.", "Income, expense and the P&L block. Poster system categories cannot be deleted.", "Thu/chi và khối P&L. Không xóa nhóm mặc định Poster.")}
        actions={
          <NavLink href={`${FINANCE_HREFS.categories}/new`} className="erpBtn primary">
            {T("Добавить", "Add", "Thêm")}
          </NavLink>
        }
      />
      <FinanceMobileNav active={FINANCE_HREFS.categories} />
      <section className="erpMenuPanel">
        <div className="erpTableWrap erpMenuWrap">
          <table className="erpTable erpMenuTable">
            <thead>
              <tr>
                <th>{T("Название", "Name", "Tên")}</th>
                <th>{T("Доход", "Income", "Thu")}</th>
                <th>{T("Расход", "Expense", "Chi")}</th>
                <th>{T("P&L", "P&L", "P&L")}</th>
                <th>{T("На кассе", "On POS", "Trên POS")}</th>
                <th className="erpMenuRowActions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="main">
                    <span className="erpFinanceIndent" style={{ paddingLeft: categoryDepth(categories, row.id) * 16 }}>
                      {row.name}
                      {row.is_system ? <span className="erpMuted"> · {T("базовая", "system", "mặc định")}</span> : null}
                    </span>
                  </td>
                  <td>{row.allow_income ? T("Да", "Yes", "Có") : T("Нет", "No", "Không")}</td>
                  <td>{row.allow_expense ? T("Да", "Yes", "Có") : T("Нет", "No", "Không")}</td>
                  <td>{row.show_in_pnl ? pnlBlockLabel(row.pnl_block) : T("Нет", "No", "Không")}</td>
                  <td>{row.show_on_pos ? T("Да", "Yes", "Có") : T("Нет", "No", "Không")}</td>
                  <td className="erpMenuRowActions">
                    <div className="erpMenuLinks">
                      <NavLink href={`${FINANCE_HREFS.categories}/${row.id}`} className="erpLink">
                        {T("Ред.", "Edit", "Sửa")}
                      </NavLink>
                      {row.is_system ? null : (
                        <button type="button" className="erpLink erpDanger" disabled={busy} onClick={() => setMoveFor(row)}>
                          {T("Удалить", "Delete", "Xóa")}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {moveFor ? (
        <section className="erpCard" style={{ marginTop: 16 }}>
          <h2>
            {T("Удалить «", "Delete “", "Xóa “")}
            {moveFor.name}
            {T("»", "”", "”")}
          </h2>
          <p className="erpHint">
            {T(
              "Категорию восстановить нельзя. Транзакции можно перенести в другую категорию или удалить навсегда.",
              "A deleted category cannot be restored. Move its transactions or delete them forever.",
              "Không khôi phục nhóm. Chuyển giao dịch hoặc xóa hẳn.",
            )}
          </p>
          <Field label={T("Перенести транзакции в", "Move transactions to", "Chuyển giao dịch sang")}>
            <select value={moveTo} onChange={(event) => setMoveTo(event.target.value)}>
              <option value="">{T("Удалить транзакции навсегда", "Delete transactions forever", "Xóa hẳn giao dịch")}</option>
              {categories
                .filter((row) => row.id !== moveFor.id)
                .map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
            </select>
          </Field>
          <div className="erpActions">
            <button type="button" className="erpBtn" onClick={() => setMoveFor(null)}>
              {T("Отмена", "Cancel", "Hủy")}
            </button>
            <button type="button" className="erpBtn primary" disabled={busy} onClick={() => remove(moveFor, moveTo || null)}>
              {T("Удалить", "Delete", "Xóa")}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

export function FinanceCategoryEditPage({ id }: { id?: string }) {
  const { state } = useErp();
  const category = id ? liveCategories(state?.financeCategories).find((row) => row.id === id) : undefined;
  if (id && !category) {
    return (
      <Empty
        title={T("Категория не найдена", "Category not found", "Không thấy nhóm")}
        action={
          <NavLink href={FINANCE_HREFS.categories} className="erpBtn">
            {T("К списку", "Back to list", "Về danh sách")}
          </NavLink>
        }
      />
    );
  }
  return <FinanceCategoryForm category={category} />;
}

function FinanceCategoryForm({ category }: { category?: FinanceCategory }) {
  const { state, act, busy } = useErp();
  const router = useErpRouter();
  const categories = liveCategories(state?.financeCategories);
  const [name, setName] = useState(category?.name ?? "");
  const [parentId, setParentId] = useState(category?.parent_id ?? "");
  const [income, setIncome] = useState(category?.allow_income ?? false);
  const [expense, setExpense] = useState(category?.allow_expense ?? true);
  const [pos, setPos] = useState(category?.show_on_pos ?? false);
  const [pnl, setPnl] = useState(category?.show_in_pnl ?? true);
  const [block, setBlock] = useState<FinancePnlBlock>(category?.pnl_block ?? "opex");

  return (
    <FinanceFormShell
      backHref={FINANCE_HREFS.categories}
      backLabel={T("Категории", "Categories", "Nhóm")}
      activeHref={FINANCE_HREFS.categories}
      title={category ? T("Редактирование категории", "Edit category", "Sửa nhóm") : T("Новая категория", "New category", "Nhóm mới")}
      footer={
        <button
          type="button"
          className="erpBtn primary"
          disabled={busy || !name.trim() || (!income && !expense)}
          onClick={async () => {
            const saved = await act(
              {
                action: "saveFinanceCategory",
                value: {
                  id: category?.id,
                  name: name.trim(),
                  parent_id: parentId || null,
                  allow_income: income,
                  allow_expense: expense,
                  show_on_pos: pos,
                  show_in_pnl: pnl,
                  pnl_block: block,
                },
              },
              T("Категория сохранена", "Category saved", "Đã lưu nhóm"),
            );
            if (saved) router.push(FINANCE_HREFS.categories);
          }}
        >
          {T("Сохранить", "Save", "Lưu")}
        </button>
      }
    >
      <section className="erpCard">
        <Field label={T("Название", "Name", "Tên")}>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder={T("Аренда", "Rent", "Thuê mặt bằng")} />
        </Field>
        <Field label={T("Родительская категория", "Parent category", "Nhóm cha")}>
          <select value={parentId} onChange={(event) => setParentId(event.target.value)}>
            <option value="">{T("Главный уровень", "Top level", "Cấp gốc")}</option>
            {categories
              .filter((row) => row.id !== category?.id)
              .map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
          </select>
        </Field>
        <label className="erpCheck">
          <input type="checkbox" checked={income} onChange={(event) => setIncome(event.target.checked)} />
          {T("Доходы", "Income", "Thu")}
        </label>
        <label className="erpCheck">
          <input type="checkbox" checked={expense} onChange={(event) => setExpense(event.target.checked)} />
          {T("Расходы", "Expense", "Chi")}
        </label>
        <label className="erpCheck">
          <input type="checkbox" checked={pos} onChange={(event) => setPos(event.target.checked)} />
          {T("Отображать на кассе", "Show on POS", "Hiện trên POS")}
        </label>
        <label className="erpCheck">
          <input type="checkbox" checked={pnl} onChange={(event) => setPnl(event.target.checked)} />
          {T("Отображать в P&L", "Show in P&L", "Hiện trong P&L")}
        </label>
        {pnl ? (
          <Field label={T("Блок в P&L", "P&L block", "Khối P&L")}>
            <select value={block} onChange={(event) => setBlock(event.target.value as FinancePnlBlock)}>
              {PNL_BLOCKS.filter((item) => item !== "none").map((item) => (
                <option key={item} value={item}>
                  {pnlBlockLabel(item)}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
      </section>
    </FinanceFormShell>
  );
}
