"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { productTitle, type ErpProductType } from "@/lib/erp/costing";
import type { ErpMovementRow } from "@/lib/erp/types";
import { useErp } from "./ErpShell";
import { addDays, Empty, errorText, loadingText, NavLink, noSearchResults, PageHead, PRODUCT_TYPES, qtyText, T, today, typeLabel, unitLabel, vnd } from "./ui";

const WAREHOUSE_KEY = "gastrofood-erp-report-warehouse";

const monthStart = (date: string) => `${date.slice(0, 7)}-01`;
const prevMonth = (date: string) => {
  const d = new Date(`${monthStart(date)}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - 1);
  const from = d.toISOString().slice(0, 10);
  return { from, to: addDays(monthStart(date), -1) };
};

const presets = () => {
  const now = today();
  return [
    { id: "month", label: T("Этот месяц", "This month", "Tháng này"), from: monthStart(now), to: now },
    { id: "prev", label: T("Прошлый месяц", "Last month", "Tháng trước"), ...prevMonth(now) },
    { id: "week", label: T("7 дней", "7 days", "7 ngày"), from: addDays(now, -6), to: now },
  ];
};

/** Sum of values; null as soon as one value is unknown. */
const total = (rows: ErpMovementRow[], key: "opening_value" | "in_value" | "out_value" | "closing_value") =>
  rows.reduce<{ sum: number; known: boolean }>(
    (acc, row) => (row[key] === null ? { ...acc, known: false } : { sum: acc.sum + Number(row[key]), known: acc.known }),
    { sum: 0, known: true },
  );

const totalText = (t: { sum: number; known: boolean }) => `${t.known ? "" : "≥ "}${vnd(t.sum)}`;

export function MovementReport({ tabs }: { tabs: ReactNode }) {
  const { state } = useErp();
  const initial = presets()[0];
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [type, setType] = useState<ErpProductType | "">("");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<ErpMovementRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setWarehouseId(window.localStorage.getItem(WAREHOUSE_KEY) ?? "");
  }, []);

  useEffect(() => {
    if (warehouseId === null || !from || !to || from > to) return;
    let cancelled = false;
    setRows(null);
    setError(null);
    const params = new URLSearchParams({ from, to, ...(warehouseId ? { warehouse: warehouseId } : {}) });
    fetch(`/api/erp/report?${params}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "server");
        if (!cancelled) setRows(data.rows as ErpMovementRow[]);
      })
      .catch((e) => {
        if (!cancelled) setError(errorText(e instanceof Error && e.message !== "Failed to fetch" ? e.message : "network"));
      });
    return () => {
      cancelled = true;
    };
  }, [from, to, warehouseId]);

  const products = useMemo(() => new Map((state?.products ?? []).map((p) => [p.id, p])), [state]);
  if (!state) return null;

  const warehouses = state.warehouses.filter((w) => !w.archived_at || w.id === warehouseId);
  const chooseWarehouse = (id: string) => {
    setWarehouseId(id);
    window.localStorage.setItem(WAREHOUSE_KEY, id);
  };
  const q = query.trim().toLowerCase();
  const list = (rows ?? [])
    .map((row) => ({ row, product: products.get(row.product_id) }))
    .filter((entry) => entry.product && (!type || entry.product.type === type))
    .filter(({ product }) => !q || `${product!.name_en} ${product!.name_vn} ${product!.brand ?? ""}`.toLowerCase().includes(q))
    .sort((a, b) => a.product!.name_en.localeCompare(b.product!.name_en) || a.row.warehouse_id.localeCompare(b.row.warehouse_id));
  const shown = list.map((entry) => entry.row);
  const whName = (id: string) => state.warehouses.find((w) => w.id === id)?.name ?? "—";

  const exportCsv = () => {
    const header = ["Product", "Location", "Unit", "Opening qty", "Opening value", "In qty", "In value", "Out qty", "Out value", "Closing qty", "Closing value"];
    const cell = (v: unknown) => {
      const s = v === null || v === undefined ? "" : String(v);
      return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = list.map(({ row, product }) =>
      [
        productTitle(product!),
        whName(row.warehouse_id),
        product!.base_unit,
        row.opening_qty,
        row.opening_value,
        row.in_qty,
        row.in_value,
        row.out_qty,
        row.out_value,
        row.closing_qty,
        row.closing_value,
      ]
        .map(cell)
        .join(","),
    );
    const blob = new Blob([`\uFEFF${[header.join(","), ...lines].join("\n")}`], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `stock-movement_${from}_${to}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const sub = (value: number | null) =>
    value === null ? <span className="erpBadge warn">{T("цена неизвестна", "price unknown", "chưa rõ giá")}</span> : <span className="erpCellSub">{vnd(value)}</span>;

  return (
    <>
      <PageHead
        title={T("Отчёт по движению", "Movement report", "Báo cáo biến động")}
        sub={T(
          "Движение продуктов за период: сколько было, пришло, ушло и осталось.",
          "Product movement for a period: opening, in, out and closing stock.",
          "Biến động hàng trong kỳ: tồn đầu, nhập, xuất và tồn cuối.",
        )}
        actions={
          list.length ? (
            <button type="button" className="erpBtn" onClick={exportCsv}>
              {T("Скачать CSV", "Download CSV", "Tải CSV")}
            </button>
          ) : null
        }
      />
      {tabs}

      <div className="erpToolbar">
        {presets().map((p) => (
          <button
            key={p.id}
            type="button"
            className={`erpBtn small ${from === p.from && to === p.to ? "primary" : ""}`}
            onClick={() => {
              setFrom(p.from);
              setTo(p.to);
            }}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="erpToolbar">
        <input type="date" value={from} max={to} aria-label={T("С", "From", "Từ")} onChange={(e) => setFrom(e.target.value)} />
        <input type="date" value={to} min={from} aria-label={T("По", "To", "Đến")} onChange={(e) => setTo(e.target.value)} />
        <select value={warehouseId ?? ""} onChange={(e) => chooseWarehouse(e.target.value)} aria-label={T("Склад", "Location", "Kho")}>
          <option value="">{T("Все склады", "All locations", "Tất cả kho")}</option>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <select value={type} onChange={(e) => setType(e.target.value as ErpProductType | "")} aria-label={T("Тип", "Type", "Loại")}>
          <option value="">{T("Все типы", "All types", "Tất cả loại")}</option>
          {PRODUCT_TYPES.map((t) => (
            <option key={t} value={t}>
              {typeLabel(t)}
            </option>
          ))}
        </select>
        <input type="search" placeholder={T("Найти продукт…", "Find a product…", "Tìm sản phẩm…")} value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {from > to ? (
        <div className="erpNotice warn">{T("Начало периода позже конца.", "The start date is after the end date.", "Ngày bắt đầu sau ngày kết thúc.")}</div>
      ) : error ? (
        <div className="erpNotice bad">{error}</div>
      ) : rows === null ? (
        <p className="erpHint">{loadingText()}</p>
      ) : !rows.length ? (
        <Empty
          title={T("За этот период движений нет", "No movements in this period", "Không có biến động trong kỳ")}
          text={T(
            "Здесь учитываются проведённые поставки, перемещения, списания, инвентаризации и производство.",
            "Completed deliveries, transfers, write-offs, stock counts and production are counted here.",
            "Tính các chứng từ đã ghi sổ: nhập hàng, chuyển kho, xuất hủy, kiểm kê và sản xuất.",
          )}
          action={
            <NavLink href="/erp/stock" className="erpBtn">
              {T("К остаткам", "Back to stock", "Về tồn kho")}
            </NavLink>
          }
        />
      ) : (
        <>
          <div className="erpKpis">
            <div className="erpKpi">
              <span>{T("На начало", "Opening", "Đầu kỳ")}</span>
              <strong>{totalText(total(shown, "opening_value"))}</strong>
            </div>
            <div className="erpKpi">
              <span>{T("Приход", "In", "Nhập")}</span>
              <strong>{totalText(total(shown, "in_value"))}</strong>
            </div>
            <div className="erpKpi">
              <span>{T("Расход", "Out", "Xuất")}</span>
              <strong>{totalText(total(shown, "out_value"))}</strong>
            </div>
            <div className="erpKpi main">
              <span>{T("На конец", "Closing", "Cuối kỳ")}</span>
              <strong>{totalText(total(shown, "closing_value"))}</strong>
            </div>
          </div>
          <p className="erpHint">
            {T(
              "Приход — поставки, начальные остатки, изготовленные партии, перемещения на склад и излишки. Расход — списания, сырьё на производство, перемещения со склада и недостачи. Стоимость — по цене партий.",
              "In: deliveries, opening balances, produced batches, transfers in and count surpluses. Out: write-offs, production ingredients, transfers out and count shortages. Values use batch costs.",
              "Nhập: nhập hàng, tồn đầu, sản xuất, chuyển đến, thừa kiểm kê. Xuất: xuất hủy, nguyên liệu sản xuất, chuyển đi, thiếu kiểm kê. Giá trị theo giá lô.",
            )}
          </p>
          {!list.length ? (
            noSearchResults(() => {
              setQuery("");
              setType("");
            })
          ) : (
            <div className="erpTableWrap">
              <table className="erpTable stack">
                <thead>
                  <tr>
                    <th>{T("Продукт", "Product", "Sản phẩm")}</th>
                    <th className="num">{T("На начало", "Opening", "Đầu kỳ")}</th>
                    <th className="num">{T("Приход", "In", "Nhập")}</th>
                    <th className="num">{T("Расход", "Out", "Xuất")}</th>
                    <th className="num">{T("На конец", "Closing", "Cuối kỳ")}</th>
                    <th className="num">{T("Цена на конец", "Closing unit cost", "Giá cuối kỳ")}</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map(({ row, product }) => {
                    const unit = product!.base_unit;
                    return (
                      <tr key={`${row.product_id}-${row.warehouse_id}`} className={row.closing_qty < 0 ? "short" : ""}>
                        <td className="main">
                          <NavLink href={`/erp/products/${product!.id}`} className="erpName">
                            {productTitle(product!)}
                          </NavLink>
                          <span className="erpCellSub">
                            {typeLabel(product!.type)}
                            {warehouseId ? "" : ` · ${whName(row.warehouse_id)}`}
                          </span>
                        </td>
                        <td className="num" data-label={T("На начало", "Opening", "Đầu kỳ")}>
                          {qtyText(row.opening_qty, unit)}
                          {row.opening_qty ? sub(row.opening_value) : null}
                        </td>
                        <td className="num" data-label={T("Приход", "In", "Nhập")}>
                          {row.in_qty ? (
                            <>
                              +{qtyText(row.in_qty, unit)}
                              {sub(row.in_value)}
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="num" data-label={T("Расход", "Out", "Xuất")}>
                          {row.out_qty ? (
                            <>
                              −{qtyText(row.out_qty, unit)}
                              {sub(row.out_value)}
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="num" data-label={T("На конец", "Closing", "Cuối kỳ")}>
                          <strong>{qtyText(row.closing_qty, unit)}</strong>
                          {row.closing_qty ? sub(row.closing_value) : null}
                        </td>
                        <td className="num" data-label={T("Цена на конец", "Closing unit cost", "Giá cuối kỳ")}>
                          {row.closing_value !== null && row.closing_qty > 0 ? `${vnd(row.closing_value / row.closing_qty)} / ${unitLabel(unit)}` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}
