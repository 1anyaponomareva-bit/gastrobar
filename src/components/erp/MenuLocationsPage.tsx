"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ErpLocation } from "@/lib/erp/types";
import { useErp } from "./ErpShell";
import { MenuFormShell } from "./MenuFormShell";
import { MenuMobileNav, MENU_HREFS } from "./menuNav";
import { Empty, Field, NavLink, PageHead, T } from "./ui";

function statusLabel(active: boolean) {
  return active ? T("Активна", "Active", "Đang hoạt động") : T("Неактивна", "Inactive", "Ngừng");
}

export function MenuLocationsPage() {
  const { state, act, busy } = useErp();
  const locations = state?.locations ?? [];
  if (!state) return null;

  const remove = (row: ErpLocation) => {
    if (!window.confirm(T(`Удалить точку «${row.name}»?`, `Delete location “${row.name}”?`, `Xóa điểm “${row.name}”?`))) return;
    void act({ action: "deleteLocation", id: row.id }, T("Точка продаж удалена", "Sales location deleted", "Đã xóa điểm bán"));
  };

  return (
    <div className="erpMenu">
      <PageHead
        title={
          <>
            {T("Точки продаж", "Sales locations", "Điểm bán")} <span className="erpHeadCount">{locations.length}</span>
          </>
        }
        actions={
          <NavLink href={`${MENU_HREFS.locations}/new`} className="erpBtn primary">
            {T("Добавить", "Add", "Thêm")}
          </NavLink>
        }
      />
      <MenuMobileNav active={MENU_HREFS.locations} />
      {!locations.length ? (
        <Empty
          title={T("Точек продаж пока нет", "No sales locations yet", "Chưa có điểm bán")}
          text={T("Добавьте Online Kitchen или Food Truck. Gastrobar сюда не входит.", "Add Online Kitchen or Food Truck. Gastrobar is not listed here.", "Thêm Online Kitchen hoặc Food Truck. Không có Gastrobar.")}
          action={
            <NavLink href={`${MENU_HREFS.locations}/new`} className="erpBtn primary">
              {T("Добавить", "Add", "Thêm")}
            </NavLink>
          }
        />
      ) : (
        <section className="erpMenuPanel">
          <div className="erpTableWrap erpMenuWrap">
            <table className="erpTable erpMenuTable">
              <thead>
                <tr>
                  <th>{T("Код", "Code", "Mã")}</th>
                  <th>{T("Название", "Name", "Tên")}</th>
                  <th>{T("Статус", "Status", "Trạng thái")}</th>
                  <th>{T("Адрес", "Address", "Địa chỉ")}</th>
                  <th className="erpMenuRowActions" />
                </tr>
              </thead>
              <tbody>
                {locations.map((row) => (
                  <tr key={row.id} className={row.is_active ? "" : "muted"}>
                    <td>{row.code}</td>
                    <td className="main">{row.name}</td>
                    <td>{statusLabel(row.is_active)}</td>
                    <td>{row.address || "—"}</td>
                    <td className="erpMenuRowActions">
                      <div className="erpMenuLinks">
                        <NavLink href={`${MENU_HREFS.locations}/${row.id}`} className="erpLink">
                          {T("Ред.", "Edit", "Sửa")}
                        </NavLink>
                        <button
                          type="button"
                          className="erpLink"
                          disabled={busy}
                          onClick={() =>
                            void act(
                              { action: "saveLocation", value: { id: row.id, name: row.name, code: row.code, is_active: !row.is_active } },
                              row.is_active
                                ? T("Точка деактивирована", "Location deactivated", "Đã ngưng điểm bán")
                                : T("Точка активирована", "Location activated", "Đã bật điểm bán"),
                            )
                          }
                        >
                          {row.is_active ? T("Отключить", "Deactivate", "Tắt") : T("Включить", "Activate", "Bật")}
                        </button>
                        <button type="button" className="erpLink erpDanger" disabled={busy} onClick={() => remove(row)}>
                          {T("Удалить", "Delete", "Xóa")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="erpMenuNote">
            {T(
              "Точка продаж — не склад. Списание документов идёт по warehouse_id. default_warehouse_id — склад списания по умолчанию, пока не выбран. Следующее решение: Location → Warehouse → списание (общий остаток или свой). Prep Kitchen — производственный цех, его здесь нет.",
              "A sales location is not a warehouse. Stock documents keep warehouse_id. default_warehouse_id is the default write-off warehouse until chosen. Next decision: Location → Warehouse → write-off (shared remainder vs own stock). Prep Kitchen is a production workshop and is not listed here.",
              "Điểm bán không phải kho. Chứng từ giữ warehouse_id. default_warehouse_id là kho xuất mặc định khi chưa chọn. Bếp sơ chế không nằm ở đây.",
            )}
          </p>
        </section>
      )}
    </div>
  );
}

export function MenuLocationEditPage({ id }: { id: string }) {
  const { state } = useErp();
  if (!state) return null;
  const location = (state.locations ?? []).find((row) => row.id === id);
  if (!location) {
    return (
      <Empty
        title={T("Точка продаж не найдена", "Sales location not found", "Không thấy điểm bán")}
        text={T("Возможно, её уже удалили.", "It may already have been deleted.", "Có thể đã bị xóa.")}
        action={
          <NavLink href={MENU_HREFS.locations} className="erpBtn">
            {T("К списку", "Back to list", "Về danh sách")}
          </NavLink>
        }
      />
    );
  }
  return <MenuLocationForm location={location} />;
}

export function MenuLocationForm({ location }: { location?: ErpLocation }) {
  const { state, act, busy } = useErp();
  const router = useRouter();
  const warehouses = useMemo(() => (state?.warehouses ?? []).filter((w) => !w.archived_at), [state?.warehouses]);
  const [name, setName] = useState(location?.name ?? "");
  const [code, setCode] = useState(location?.code ?? "");
  const [address, setAddress] = useState(location?.address ?? "");
  const [active, setActive] = useState(location?.is_active ?? true);
  const [warehouseId, setWarehouseId] = useState(location?.default_warehouse_id ?? "");
  if (!state) return null;

  const title = location
    ? T("Редактирование точки продаж", "Edit sales location", "Sửa điểm bán")
    : T("Добавление точки продаж", "Add sales location", "Thêm điểm bán");

  return (
    <MenuFormShell
      backHref={MENU_HREFS.locations}
      backLabel={T("Точки продаж", "Sales locations", "Điểm bán")}
      activeHref={MENU_HREFS.locations}
      title={title}
      footer={
        <button
          type="button"
          className="erpBtn primary"
          disabled={busy || !name.trim()}
          onClick={async () => {
            const saved = await act(
              {
                action: "saveLocation",
                value: {
                  id: location?.id,
                  name: name.trim(),
                  code: code.trim(),
                  address,
                  is_active: active,
                  default_warehouse_id: warehouseId,
                },
              },
              T("Точка продаж сохранена", "Sales location saved", "Đã lưu điểm bán"),
            );
            if (saved) router.push(MENU_HREFS.locations);
          }}
        >
          {location ? T("Сохранить", "Save", "Lưu") : T("Добавить", "Add", "Thêm")}
        </button>
      }
    >
      <section className="erpCard">
        <Field label={T("Название", "Name", "Tên")}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={T("Online Kitchen, Food Truck…", "Online Kitchen, Food Truck…", "Online Kitchen, Food Truck…")} />
        </Field>
        <Field label={T("Код", "Code", "Mã")} hint={T("Латиница и дефис. Пусто — из названия.", "Latin letters and hyphens. Empty = from the name.", "Chữ latin và gạch. Trống = theo tên.")}>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="online-kitchen" />
        </Field>
        <Field label={T("Адрес", "Address", "Địa chỉ")}>
          <input value={address} onChange={(e) => setAddress(e.target.value)} />
        </Field>
        <Field label={T("Склад списания по умолчанию", "Default write-off warehouse", "Kho xuất mặc định")}>
          <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
            <option value="">{T("Не выбран", "Not chosen", "Chưa chọn")}</option>
            {warehouses.map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {warehouse.name}
              </option>
            ))}
          </select>
        </Field>
        <label className="erpCheck">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          {T("Активна", "Active", "Đang hoạt động")}
        </label>
        <p className="erpHint">
          {T(
            "Точка ≠ склад. Остатки документов не сливаются между точками. Следующее решение: Location → Warehouse → списание (общий остаток vs свой).",
            "A location is not a warehouse. Document stock is not merged between locations. Next decision: Location → Warehouse → write-off (shared remainder vs own stock).",
            "Điểm bán không phải kho. Tồn chứng từ không gộp giữa các điểm.",
          )}
        </p>
      </section>
    </MenuFormShell>
  );
}
