"use client";

import { useState } from "react";
import { notImplemented } from "./CatalogTable";
import { useErp } from "./ErpShell";
import { MenuFormShell } from "./MenuFormShell";
import { POSTER_WORKSHOPS } from "./menuFields";
import { MenuMobileNav, MENU_HREFS } from "./menuNav";
import { Field, PageHead, T } from "./ui";

const WORKSHOPS = POSTER_WORKSHOPS.filter((name) => name !== "Без цеха");

export function MenuWorkshopsPage() {
  const { notify } = useErp();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [printTickets, setPrintTickets] = useState(false);

  if (adding) {
    return (
      <MenuFormShell
        backHref={MENU_HREFS.workshops}
        backLabel={T("Цехи", "Workshops", "Phân xưởng")}
        activeHref={MENU_HREFS.workshops}
        title={T("Добавление цеха", "Add workshop", "Thêm phân xưởng")}
        footer={
          <button
            type="button"
            className="erpBtn primary"
            onClick={() => notify({ ok: false, text: notImplemented(T("Сохранить цех", "Save workshop", "Lưu phân xưởng")) })}
          >
            {T("Сохранить", "Save", "Lưu")}
          </button>
        }
      >
        <section className="erpCard">
          <Field label={T("Название", "Name", "Tên")}>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={T("Бар, Горячий цех…", "Bar, hot kitchen…", "Quầy bar, bếp nóng…")} />
          </Field>
          <label className="erpCheck">
            <input type="checkbox" checked={printTickets} onChange={(e) => setPrintTickets(e.target.checked)} />
            {T("Печатать бегунки", "Print kitchen tickets", "In phiếu bếp")}
          </label>
          <p className="erpHint">
            {T(
              "В ERP нет таблицы цехов. Сохранить не записывает данные. Цех — не склад.",
              "The ERP has no workshops table. Save does not write data. A workshop is not a warehouse.",
              "ERP chưa có bảng phân xưởng. Lưu không ghi dữ liệu. Phân xưởng không phải kho.",
            )}
          </p>
        </section>
      </MenuFormShell>
    );
  }

  return (
    <div className="erpMenu">
      <PageHead
        title={
          <>
            {T("Цехи", "Workshops", "Phân xưởng")} <span className="erpHeadCount">{WORKSHOPS.length}</span>
          </>
        }
        actions={
          <button type="button" className="erpBtn primary" onClick={() => setAdding(true)}>
            {T("Добавить", "Add", "Thêm")}
          </button>
        }
      />
      <MenuMobileNav active={MENU_HREFS.workshops} />
      <section className="erpMenuPanel">
        <div className="erpTableWrap erpMenuWrap">
          <table className="erpTable erpMenuTable">
            <thead>
              <tr>
                <th>{T("Название", "Name", "Tên")}</th>
              </tr>
            </thead>
            <tbody>
              {WORKSHOPS.map((item) => (
                <tr key={item}>
                  <td>{item}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="erpMenuNote">
          {T(
            "Имена с формы товара и корзины тех. карт (вкладку Цехи в Poster не открывали). «Без цеха» — пустое значение, не строка справочника. Склады ERP — не цехи. Сохранить на форме Добавить не реализовано: нет workshop_id.",
            "Names come from the product form and recipe trash (the Workshops tab itself was not opened in Poster). “No workshop” is an empty value, not a catalog row. ERP locations are not workshops. Save on Add is not implemented: there is no workshop_id.",
            "Tên lấy từ form hàng và thùng rác công thức. Kho ERP không phải phân xưởng. Lưu chưa làm: chưa có workshop_id.",
          )}
        </p>
      </section>
    </div>
  );
}
