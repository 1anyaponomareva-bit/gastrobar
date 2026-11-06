"use client";

import { notImplemented } from "./CatalogTable";
import { useErp } from "./ErpShell";
import { MenuMobileNav, MENU_HREFS } from "./menuNav";
import { Empty, PageHead, T } from "./ui";

export function MenuWorkshopsPage() {
  const { notify } = useErp();
  return (
    <div className="erpMenu">
      <PageHead
        title={T("Цехи", "Workshops", "Phân xưởng")}
        actions={
          <button type="button" className="erpBtn primary" onClick={() => notify({ ok: false, text: notImplemented(T("Добавить цех", "Add workshop", "Thêm phân xưởng")) })}>
            {T("Добавить", "Add", "Thêm")}
          </button>
        }
      />
      <MenuMobileNav active={MENU_HREFS.workshops} />
      <Empty
        title={T("Цехов пока нет", "No workshops yet", "Chưa có phân xưởng")}
        text={T(
          "В ERP нет справочника цехов (Poster: GASTROBAR, GASTROFOOD, GASTROTRUCK WORKSHOP). Склады — это не цехи. Вкладка ждёт спецификацию и контракт данных.",
          "The ERP has no workshops catalog (Poster: GASTROBAR, GASTROFOOD, GASTROTRUCK WORKSHOP). Locations are not workshops. This tab waits on the spec and data contract.",
          "ERP chưa có danh mục phân xưởng. Kho không phải phân xưởng. Tab chờ spec.",
        )}
        action={
          <button type="button" className="erpBtn" onClick={() => notify({ ok: false, text: notImplemented() })}>
            {T("Добавить", "Add", "Thêm")}
          </button>
        }
      />
    </div>
  );
}
