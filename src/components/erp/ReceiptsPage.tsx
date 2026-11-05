"use client";

import { Fragment, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { productTitle } from "@/lib/erp/costing";
import { documentSupplierIds, documentSupplierLabel, receiptMatchesSupplier } from "@/lib/erp/docSupplier";
import type { ErpDocument, ErpDocumentLine, ErpState } from "@/lib/erp/types";
import { docHref, StatusBadge } from "./docs";
import { useErp } from "./ErpShell";
import { DropMenu, MultiSelect } from "./filters";
import { Pager, PAGE } from "./StockBalances";
import { StockMobileNav } from "./stockNav";
import { addDays, dateText, docLabel, Empty, errorText, loadingText, NavLink, packText, PageHead, qtyText, statusLabel, T, today, unitOf, vnd, warehouseName } from "./ui";

const STORE_KEY = "gastrofood-erp-receipts";

type ColumnId = "no" | "date" | "supplier" | "warehouse" | "account" | "products" | "comment" | "payment" | "posting" | "amount";
type SortKey = "no" | "date" | "supplier" | "warehouse" | "amount";
type PeriodId = "all" | "today" | "yesterday" | "week" | "month" | "lastMonth" | "year" | "custom";
type ExtraId = "posting" | "employee" | "cancelled";
type CancelledMode = "show" | "hide" | "only";

type Saved = {
  suppliers: string[];
  warehouses: string[];
  categories: string[];
  extras: ExtraId[];
  posting: string[];
  employees: string[];
  cancelled: CancelledMode;
  period: PeriodId;
  from: string;
  to: string;
  hidden: ColumnId[];
  sort: SortKey;
  desc: boolean;
};

const initial: Saved = {
  suppliers: [],
  warehouses: [],
  categories: [],
  extras: [],
  posting: [],
  employees: [],
  cancelled: "show",
  period: "all",
  from: "",
  to: "",
  hidden: [],
  sort: "date",
  desc: true,
};

/** Poster's column order; the debt column is left out on purpose. */
const columns = (): { id: ColumnId; label: string; num?: boolean; sort?: SortKey }[] => [
  { id: "no", label: "№", sort: "no" },
  { id: "date", label: T("Дата", "Date", "Ngày"), sort: "date" },
  { id: "supplier", label: T("Поставщик", "Supplier", "Nhà cung cấp"), sort: "supplier" },
  { id: "warehouse", label: T("Склад", "Location", "Kho"), sort: "warehouse" },
  { id: "account", label: T("Счёт", "Account", "Tài khoản") },
  { id: "products", label: T("Товары", "Products", "Hàng hóa") },
  { id: "comment", label: T("Комментарий", "Comment", "Ghi chú") },
  { id: "payment", label: T("Статус", "Status", "Trạng thái") },
  { id: "posting", label: T("Проведение", "Posting", "Ghi sổ") },
  { id: "amount", label: T("Сумма", "Amount", "Số tiền"), num: true, sort: "amount" },
];

const periodLabels = (): Record<PeriodId, string> => ({
  all: T("За всё время", "All time", "Toàn bộ"),
  today: T("Сегодня", "Today", "Hôm nay"),
  yesterday: T("Вчера", "Yesterday", "Hôm qua"),
  week: T("Последние 7 дней", "Last 7 days", "7 ngày qua"),
  month: T("Этот месяц", "This month", "Tháng này"),
  lastMonth: T("Прошлый месяц", "Last month", "Tháng trước"),
  year: T("Этот год", "This year", "Năm nay"),
  custom: T("Свой период", "Custom range", "Tùy chọn"),
});

const extraLabels = (): Record<ExtraId, string> => ({
  posting: T("Проведение", "Posting", "Ghi sổ"),
  employee: T("Сотрудник", "Employee", "Nhân viên"),
  cancelled: T("Отменённые", "Cancelled", "Đã hủy"),
});

/** [from, to] in YYYY-MM-DD; empty means open-ended. */
function periodRange(saved: Saved): [string, string] {
  const now = today();
  const [y, m] = now.split("-");
  switch (saved.period) {
    case "today":
      return [now, now];
    case "yesterday":
      return [addDays(now, -1), addDays(now, -1)];
    case "week":
      return [addDays(now, -6), now];
    case "month":
      return [`${y}-${m}-01`, now];
    case "lastMonth": {
      const first = `${y}-${m}-01`;
      const end = addDays(first, -1);
      return [`${end.slice(0, 7)}-01`, end];
    }
    case "year":
      return [`${y}-01-01`, now];
    case "custom":
      return [saved.from, saved.to];
    default:
      return ["", ""];
  }
}

const periodTitle = (saved: Saved) => {
  if (saved.period !== "custom") return periodLabels()[saved.period];
  if (!saved.from && !saved.to) return periodLabels().custom;
  return `${saved.from ? dateText(saved.from) : "…"} – ${saved.to ? dateText(saved.to) : "…"}`;
};

type Page = { documents: ErpDocument[]; more: boolean };
const cache = new Map<string, Page & { docsVersion: number }>();

function useReceipts(from: string, to: string) {
  const { docsVersion } = useErp();
  const key = `${from}|${to}`;
  const hit = cache.get(key);
  const [page, setPage] = useState<Page | null>(hit && hit.docsVersion === docsVersion ? hit : null);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);

  const load = useCallback(async () => {
    const id = ++request.current;
    const fresh = cache.get(key);
    const usable = fresh && fresh.docsVersion === docsVersion;
    setPage(usable ? fresh : null);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const response = await fetch(`/api/erp/receipts?${params}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "server");
      if (id !== request.current) return;
      cache.set(key, { ...(data as Page), docsVersion });
      setPage(data as Page);
    } catch (e) {
      if (id !== request.current || usable) return;
      setError(errorText(e instanceof Error && e.message !== "Failed to fetch" ? e.message : "network"));
    }
  }, [key, from, to, docsVersion]);

  useEffect(() => {
    void load();
  }, [load]);

  return { page, error, reload: load };
}

type Row = {
  doc: ErpDocument;
  supplier: string;
  supplierIds: string[];
  warehouse: string;
  products: string[];
  categories: Set<string>;
  employee: string;
  /** Posted amount; null while a draft or cancelled. */
  amount: number | null;
};

const personName = (email: string | null | undefined) => (email ? email.split("@")[0] : "");

function buildRows(state: ErpState, documents: ErpDocument[]): Row[] {
  const products = new Map(state.products.map((p) => [p.id, p]));
  return documents.map((doc) => {
    const lines = doc.lines ?? [];
    return {
      doc,
      supplier: documentSupplierLabel(state, doc),
      supplierIds: documentSupplierIds(state, doc),
      warehouse: doc.warehouse_id ? warehouseName(state, doc.warehouse_id) : "",
      products: lines.map((line) => {
        const product = products.get(line.product_id);
        return product ? productTitle(product) : "?";
      }),
      categories: new Set(lines.map((line) => products.get(line.product_id)?.category_id ?? "none")),
      employee: doc.created_by ?? "",
      amount: doc.status === "posted" ? (doc.total_cost ?? null) : null,
    };
  });
}

const sortValue = (row: Row, key: SortKey): string | number => {
  switch (key) {
    case "no":
      return Number(String(row.doc.doc_no ?? "").replace(/\D/g, "")) || 0;
    case "date":
      return `${row.doc.doc_date ?? ""} ${row.doc.created_at ?? ""}`;
    case "supplier":
      return row.supplier.toLowerCase();
    case "warehouse":
      return row.warehouse.toLowerCase();
    case "amount":
      return row.amount ?? -Infinity;
  }
};

/** Local time of saving, shown next to the date when it was saved on that day. */
function timeOf(doc: ErpDocument): string {
  if (!doc.created_at) return "";
  const at = new Date(doc.created_at);
  if (Number.isNaN(at.getTime())) return "";
  const local = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}`;
  return local === doc.doc_date ? `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}` : "";
}

const lineSum = (line: ErpDocumentLine): number | null =>
  line.gross_amount ?? (line.unit_price !== null && line.unit_price !== undefined ? line.qty * line.unit_price : null);

const docNo = (doc: ErpDocument) => `${doc.doc_type === "opening" ? `${docLabel("opening")} ` : ""}${doc.doc_no ?? ""}`;

function readSaved(): Saved {
  try {
    return { ...initial, ...(JSON.parse(window.localStorage.getItem(STORE_KEY) ?? "{}") as Partial<Saved>) };
  } catch {
    return initial;
  }
}

const Caret = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden>
    <path d="M7 10l5 5 5-5z" />
  </svg>
);

const DetailsIcon = ({ open }: { open: boolean }) => (
  <svg className="erpRcIcon" viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden>
    <path d={open ? "M7 14l5-5 5 5z" : "M7 10l5 5 5-5z"} />
  </svg>
);

const EditIcon = () => (
  <svg className="erpRcIcon" viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden>
    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm17.71-10.21a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
  </svg>
);

const noAccountText = () =>
  T(
    "В ERP пока нет счетов оплаты: назначение колонки «Счёт» в Poster ещё не подтверждено",
    "The ERP has no payment accounts yet; the meaning of Poster's Account column is not confirmed",
    "ERP chưa có tài khoản thanh toán",
  );
const noPaymentText = () =>
  T("В ERP пока нет данных об оплате поставок", "The ERP has no delivery payment data yet", "ERP chưa có dữ liệu thanh toán");

export function ReceiptsPage() {
  const { state, act } = useErp();
  const [saved, setSaved] = useState<Saved | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPageNo] = useState(0);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [printDoc, setPrintDoc] = useState<string | null>(null);

  useEffect(() => setSaved(readSaved()), []);
  useEffect(() => {
    if (saved) window.localStorage.setItem(STORE_KEY, JSON.stringify(saved));
  }, [saved]);

  const filters = saved ?? initial;
  const [from, to] = periodRange(filters);
  const { page: data, error, reload } = useReceipts(saved ? from : "", saved ? to : "");
  const search = useDeferredValue(query);

  const rows = useMemo(() => (state && data && saved ? buildRows(state, data.documents) : null), [state, data, saved]);
  const list = useMemo(() => {
    if (!rows) return [];
    const q = search.trim().toLowerCase();
    const sup = new Set(filters.suppliers);
    const wh = new Set(filters.warehouses);
    const cats = new Set(filters.categories);
    const posting = new Set(filters.extras.includes("posting") ? filters.posting : []);
    const people = new Set(filters.extras.includes("employee") ? filters.employees : []);
    const cancelled = filters.extras.includes("cancelled") ? filters.cancelled : "show";
    const out = rows.filter(
      (row) =>
        (!q || `${row.doc.doc_no ?? ""} ${row.supplier} ${row.warehouse} ${row.products.join(" ")} ${row.doc.comment ?? ""}`.toLowerCase().includes(q)) &&
        receiptMatchesSupplier(row.supplierIds, sup) &&
        (!wh.size || wh.has(row.doc.warehouse_id ?? "")) &&
        (!cats.size || [...row.categories].some((c) => cats.has(c))) &&
        (!posting.size || posting.has(row.doc.status ?? "draft")) &&
        (!people.size || people.has(row.employee)) &&
        (cancelled === "show" || (cancelled === "only" ? row.doc.status === "cancelled" : row.doc.status !== "cancelled")),
    );
    const dir = filters.desc ? -1 : 1;
    return out.sort((a, b) => {
      const x = sortValue(a, filters.sort);
      const y = sortValue(b, filters.sort);
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * dir;
    });
  }, [rows, search, filters]);

  useEffect(() => setPageNo(0), [query, filters.suppliers, filters.warehouses, filters.categories, filters.posting, filters.employees, filters.cancelled, filters.extras, from, to]);

  useEffect(() => {
    if (!printDoc) return;
    const done = () => setPrintDoc(null);
    window.addEventListener("afterprint", done);
    const timer = window.setTimeout(() => window.print(), 50);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("afterprint", done);
    };
  }, [printDoc]);

  if (!state) return null;
  const set = (patch: Partial<Saved>) => setSaved((prev) => ({ ...(prev ?? initial), ...patch }));
  const shown = columns().filter((c) => !filters.hidden.includes(c.id));
  const amountAt = shown.findIndex((c) => c.id === "amount");
  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  const current = Math.min(page, pages - 1);
  const pageRows = list.slice(current * PAGE, current * PAGE + PAGE);
  const total = list.reduce((sum, row) => sum + (row.amount ?? 0), 0);
  const incomplete = list.some((row) => row.doc.status === "posted" && row.doc.cost_known === false);
  const anyFilter = Boolean(query || filters.suppliers.length || filters.warehouses.length || filters.categories.length || filters.extras.length);
  const employees = [...new Set((rows ?? []).map((row) => row.employee).filter(Boolean))].sort();

  const toggleSort = (key: SortKey) => set(filters.sort === key ? { desc: !filters.desc } : { sort: key, desc: key === "date" || key === "amount" });
  const toggleOpen = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const cellText = (row: Row, id: ColumnId): string => {
    switch (id) {
      case "no":
        return docNo(row.doc);
      case "date":
        return `${dateText(row.doc.doc_date)} ${timeOf(row.doc)}`.trim();
      case "supplier":
        return row.supplier;
      case "warehouse":
        return row.warehouse;
      case "account":
      case "payment":
        return "";
      case "products":
        return row.products.join(", ");
      case "comment":
        return row.doc.comment ?? "";
      case "posting":
        return statusLabel(row.doc.status ?? "draft");
      case "amount":
        return row.amount === null ? "" : String(Math.round(row.amount));
    }
  };

  const exportCsv = () => {
    const cell = (v: string) => (/[",;\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const lines = [shown.map((c) => cell(c.label)).join(","), ...list.map((row) => shown.map((c) => cell(cellText(row, c.id))).join(","))];
    const blob = new Blob([`\uFEFF${lines.join("\n")}`], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `deliveries_${today()}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const deleteDraft = async (doc: ErpDocument) => {
    if (!doc.id || !window.confirm(T(`Удалить черновик ${doc.doc_no}?`, `Delete draft ${doc.doc_no}?`, `Xóa bản nháp ${doc.doc_no}?`))) return;
    if (await act({ action: "deleteDraft", id: doc.id }, T("Черновик удалён", "Draft deleted", "Đã xóa bản nháp"))) void reload();
  };

  const columnsMenu = (
    <DropMenu
      align="right"
      trigger={({ open: menuOpen, toggle }) => (
        <button type="button" className="erpHeadBtn" aria-expanded={menuOpen} onClick={toggle}>
          {T("Столбцы", "Columns", "Cột")}
          <Caret />
        </button>
      )}
    >
      {() => (
        <div className="erpDropList">
          {columns().map((c) => (
            <label key={c.id} className="erpDropItem">
              <input type="checkbox" checked={!filters.hidden.includes(c.id)} onChange={() => set({ hidden: filters.hidden.includes(c.id) ? filters.hidden.filter((h) => h !== c.id) : [...filters.hidden, c.id] })} />
              <span>{c.label}</span>
            </label>
          ))}
          <hr />
          <button type="button" className="erpDropAction" onClick={() => set({ hidden: [] })}>
            {T("Сбросить по умолчанию", "Reset to default", "Mặc định")}
          </button>
        </div>
      )}
    </DropMenu>
  );

  const periodMenu = (
    <DropMenu
      align="right"
      trigger={({ open: menuOpen, toggle }) => (
        <button type="button" className={`erpHeadBtn ${filters.period !== "all" ? "on" : ""}`} aria-expanded={menuOpen} onClick={toggle} data-testid="period">
          {periodTitle(filters)}
          <Caret />
        </button>
      )}
    >
      {(close) => (
        <div className="erpDropList">
          {(Object.keys(periodLabels()) as PeriodId[])
            .filter((id) => id !== "custom")
            .map((id) => (
              <button
                key={id}
                type="button"
                className={`erpDropAction ${filters.period === id ? "on" : ""}`}
                onClick={() => {
                  set({ period: id });
                  close();
                }}
              >
                {periodLabels()[id]}
              </button>
            ))}
          <hr />
          <p className="erpDropTitle">{periodLabels().custom}</p>
          <div className="erpPeriodCustom">
            <input type="date" aria-label={T("С", "From", "Từ")} value={filters.period === "custom" ? filters.from : from} max={filters.to || undefined} onChange={(e) => set({ period: "custom", from: e.target.value, to: filters.period === "custom" ? filters.to : to })} />
            <span>–</span>
            <input type="date" aria-label={T("По", "To", "Đến")} value={filters.period === "custom" ? filters.to : to} min={filters.from || undefined} onChange={(e) => set({ period: "custom", to: e.target.value, from: filters.period === "custom" ? filters.from : from })} />
          </div>
        </div>
      )}
    </DropMenu>
  );

  const actions = (
    <div className="erpHeadActions">
      <div className="erpHeadGroup">
        {columnsMenu}
        <button type="button" className="erpHeadBtn" onClick={exportCsv} disabled={!list.length}>
          {T("Экспорт", "Export", "Xuất")}
        </button>
        <button type="button" className="erpHeadBtn" onClick={() => window.print()} disabled={!list.length}>
          {T("Печать", "Print", "In")}
        </button>
      </div>
      {periodMenu}
      <NavLink href="/erp/documents/new?type=receipt" className="erpBtn primary">
        {T("Добавить", "Add", "Thêm")}
      </NavLink>
    </div>
  );

  const extraChip = (id: ExtraId) => {
    const remove = () => set({ extras: filters.extras.filter((e) => e !== id) });
    const x = (
      <button type="button" className="erpCondX" aria-label={T("Убрать фильтр", "Remove filter", "Bỏ lọc")} onClick={remove}>
        ×
      </button>
    );
    if (id === "cancelled") {
      return (
        <div key={id} className="erpCond">
          <span className="erpCondName">{extraLabels().cancelled}</span>
          <select value={filters.cancelled} onChange={(e) => set({ cancelled: e.target.value as CancelledMode })} aria-label={extraLabels().cancelled}>
            <option value="hide">{T("Скрыть", "Hide", "Ẩn")}</option>
            <option value="only">{T("Только отменённые", "Only cancelled", "Chỉ đã hủy")}</option>
            <option value="show">{T("Показывать", "Show", "Hiện")}</option>
          </select>
          {x}
        </div>
      );
    }
    return (
      <div key={id} className="erpCondMulti">
        <MultiSelect
          label={extraLabels()[id]}
          options={
            id === "posting"
              ? ["draft", "posted", "cancelled"].map((s) => ({ id: s, label: statusLabel(s) }))
              : employees.map((e) => ({ id: e, label: personName(e) || e }))
          }
          value={id === "posting" ? filters.posting : filters.employees}
          onChange={(value) => set(id === "posting" ? { posting: value } : { employees: value })}
        />
        {x}
      </div>
    );
  };

  const addFilter = (
    <DropMenu
      trigger={({ open: menuOpen, toggle }) => (
        <button type="button" className="erpFilterBtn erpAddFilter" aria-expanded={menuOpen} onClick={toggle}>
          <span>+ {T("Фильтр", "Filter", "Bộ lọc")}</span>
        </button>
      )}
    >
      {(close) => (
        <div className="erpDropList">
          {(Object.keys(extraLabels()) as ExtraId[]).map((id) => (
            <button
              key={id}
              type="button"
              className="erpDropAction"
              disabled={filters.extras.includes(id)}
              onClick={() => {
                set({ extras: [...filters.extras, id], ...(id === "cancelled" ? { cancelled: "hide" as const } : {}) });
                close();
              }}
            >
              {extraLabels()[id]}
            </button>
          ))}
          <button type="button" className="erpDropAction" disabled title={noPaymentText()}>
            {T("Статус оплаты — нет данных", "Payment status — no data", "Thanh toán — chưa có")}
          </button>
        </div>
      )}
    </DropMenu>
  );

  const head = (c: ReturnType<typeof columns>[number]) => (
    <th key={c.id} className={`erpRcC-${c.id} ${c.num ? "num" : ""}`} title={c.label} aria-sort={c.sort && filters.sort === c.sort ? (filters.desc ? "descending" : "ascending") : undefined}>
      {c.sort ? (
        <button type="button" className="erpSortBtn" onClick={() => toggleSort(c.sort as SortKey)}>
          {c.label}
          {filters.sort === c.sort ? <span aria-hidden>{filters.desc ? " ▾" : " ▴"}</span> : null}
        </button>
      ) : (
        c.label
      )}
    </th>
  );

  const cell = (row: Row, id: ColumnId) => {
    const doc = row.doc;
    switch (id) {
      case "no":
        return (
          <td key={id} className="erpRcC-no erpRcNo" title={docNo(doc)}>
            {docNo(doc)}
          </td>
        );
      case "date":
        return (
          <td key={id} className="erpRcC-date">
            {dateText(doc.doc_date)} <span className="erpRcTime">{timeOf(doc)}</span>
          </td>
        );
      case "supplier":
        return (
          <td key={id} className="erpRcC-supplier erpRcClip" title={row.supplier}>
            <span className="erpRcText">{row.supplier || "—"}</span>
          </td>
        );
      case "warehouse":
        return (
          <td key={id} className="erpRcC-warehouse erpRcClip" title={row.warehouse}>
            <span className="erpRcText">{row.warehouse || "—"}</span>
          </td>
        );
      case "account":
        return (
          <td key={id} className="erpRcC-account erpRcNone" title={noAccountText()}>
            —
          </td>
        );
      case "products":
        return (
          <td key={id} className="erpRcC-products erpRcProducts" title={row.products.join("\n")}>
            <span className="erpRcText">
              {row.products.slice(0, 2).join(", ") || "—"}
              {row.products.length > 2 ? <span className="erpRcMore"> {T(`и ещё ${row.products.length - 2}`, `+${row.products.length - 2} more`, `+${row.products.length - 2}`)}</span> : null}
            </span>
          </td>
        );
      case "comment":
        return (
          <td key={id} className={`erpRcC-comment erpRcComment ${doc.comment ? "" : "empty"}`} title={doc.comment ?? ""}>
            <span className="erpRcText">{doc.comment || "—"}</span>
          </td>
        );
      case "payment":
        return (
          <td key={id} className="erpRcC-payment erpRcNone" title={noPaymentText()}>
            —
          </td>
        );
      case "posting":
        return (
          <td key={id} className="erpRcC-posting">
            <StatusBadge status={doc.status} />
          </td>
        );
      case "amount":
        return (
          <td key={id} className="erpRcC-amount num erpRcAmount">
            {row.amount === null ? "—" : doc.cost_known === false ? <span className="erpBadge warn">{T("неполная", "incomplete", "chưa đủ")}</span> : vnd(row.amount)}
          </td>
        );
    }
  };

  const rowMenu = (doc: ErpDocument) => (
    <DropMenu
      align="right"
      fixed
      trigger={({ open: menuOpen, toggle }) => (
        <button type="button" className="erpRcDots" aria-label={T("Ещё", "More", "Thêm")} aria-expanded={menuOpen} onClick={toggle}>
          ⋯
        </button>
      )}
    >
      {(close) => (
        <div className="erpDropList">
          <NavLink href={docHref({ id: doc.id, doc_type: doc.doc_type })} className="erpDropAction">
            {T("Открыть документ", "Open document", "Mở chứng từ")}
          </NavLink>
          <button
            type="button"
            className="erpDropAction"
            onClick={() => {
              close();
              setPrintDoc(doc.id ?? null);
            }}
          >
            {T("Печать поставки", "Print delivery", "In phiếu nhập")}
          </button>
          {doc.status === "draft" ? (
            <button
              type="button"
              className="erpDropAction erpDanger"
              onClick={() => {
                close();
                void deleteDraft(doc);
              }}
            >
              {T("Удалить черновик", "Delete draft", "Xóa bản nháp")}
            </button>
          ) : doc.status === "posted" ? (
            <NavLink href={docHref({ id: doc.id, doc_type: doc.doc_type })} className="erpDropAction erpDanger">
              {T("Отменить поставку…", "Cancel delivery…", "Hủy phiếu nhập…")}
            </NavLink>
          ) : null}
        </div>
      )}
    </DropMenu>
  );

  const printed = printDoc ? list.find((row) => row.doc.id === printDoc) : null;

  return (
    <div className={printed ? "erpPrintingDoc" : ""}>
      <PageHead
        title={
          <>
            {T("Поставки", "Deliveries", "Nhập hàng")} {rows ? <span className="erpHeadCount">{list.length}</span> : null}
          </>
        }
        actions={actions}
      />
      <StockMobileNav active="/erp/stock/receipts" />

      <section className="erpPanel erpReceipts">
        <div className="erpFilters erpNoPrint">
          <input type="search" className="erpSearch" placeholder={T("Быстрый поиск", "Quick search", "Tìm nhanh")} value={query} onChange={(e) => setQuery(e.target.value)} />
          <MultiSelect
            label={T("Поставщик", "Supplier", "Nhà cung cấp")}
            options={[...state.suppliers.filter((s) => !s.archived_at).map((s) => ({ id: s.id, label: s.name })), { id: "none", label: T("Без поставщика", "No supplier", "Không có NCC") }]}
            value={filters.suppliers}
            onChange={(suppliers) => set({ suppliers })}
            searchable
          />
          <MultiSelect label={T("Склад", "Location", "Kho")} options={state.warehouses.filter((w) => !w.archived_at).map((w) => ({ id: w.id, label: w.name }))} value={filters.warehouses} onChange={(warehouses) => set({ warehouses })} />
          <button type="button" className="erpFilterBtn" disabled title={noAccountText()}>
            <span>{T("Счёт", "Account", "Tài khoản")}</span>
            <Caret />
          </button>
          <MultiSelect
            label={T("Категории", "Categories", "Nhóm")}
            options={[
              ...state.categories.filter((c) => !c.archived_at).map((c) => ({ id: c.id, label: c.name_vn && c.name_vn !== c.name_en ? `${c.name_en} / ${c.name_vn}` : c.name_en })),
              { id: "none", label: T("Без категории", "No category", "Chưa phân nhóm") },
            ]}
            value={filters.categories}
            onChange={(categories) => set({ categories })}
            searchable
          />
          {filters.extras.map(extraChip)}
          {addFilter}
          {anyFilter ? (
            <button
              type="button"
              className="erpLink"
              onClick={() => {
                setQuery("");
                set({ suppliers: [], warehouses: [], categories: [], extras: [], posting: [], employees: [], cancelled: "show" });
              }}
            >
              {T("Сбросить всё", "Reset all", "Đặt lại")}
            </button>
          ) : null}
        </div>

        {error ? (
          <Empty
            kind="error"
            title={T("Не удалось загрузить поставки", "Could not load deliveries", "Không tải được phiếu nhập")}
            text={error}
            action={
              <button type="button" className="erpBtn" onClick={() => void reload()}>
                {T("Повторить", "Try again", "Thử lại")}
              </button>
            }
          />
        ) : !rows ? (
          <div className="erpLoading">{loadingText()}</div>
        ) : !rows.length && filters.period === "all" ? (
          <Empty
            title={T("Поставок ещё не было", "No deliveries yet", "Chưa có lần nhập hàng")}
            text={T("Принятые поставки и начальные остатки появятся здесь.", "Received deliveries and opening balances appear here.", "Các lần nhập hàng sẽ hiện ở đây.")}
          />
        ) : (
          <>
            {data?.more ? (
              <p className="erpScope erpNoPrint">
                {T("Показаны 1000 последних поставок периода — выберите период короче.", "Showing the latest 1000 deliveries of the period — choose a shorter period.", "Chỉ hiện 1000 phiếu mới nhất — hãy chọn kỳ ngắn hơn.")}
              </p>
            ) : null}
            <div className="erpTableWrap erpPrintArea">
              <h2 className="erpPrintOnly">
                {T("Поставки", "Deliveries", "Nhập hàng")} · {periodTitle(filters)}
              </h2>
              <table className="erpTable erpRcTable">
                <thead>
                  <tr>
                    {shown.map(head)}
                    <th className="erpRcActions erpNoPrint" aria-label={T("Действия", "Actions", "Thao tác")} />
                  </tr>
                </thead>
                <tbody>
                  {!pageRows.length ? (
                    <tr>
                      <td colSpan={shown.length + 1} className="erpNoRows">
                        {T("Ничего не найдено. Попробуйте изменить поиск, фильтры или период.", "Nothing found. Try changing the search, filters or period.", "Không tìm thấy. Hãy đổi từ khóa, bộ lọc hoặc kỳ.")}
                      </td>
                    </tr>
                  ) : (
                    pageRows.map((row) => {
                      const doc = row.doc;
                      const id = doc.id ?? "";
                      const expanded = open.has(id);
                      return (
                        <Fragment key={id}>
                          <tr className={`${expanded ? "open" : ""} ${doc.status === "cancelled" ? "muted" : ""}`} data-testid="receipt-row">
                            {shown.map((c) => cell(row, c.id))}
                            <td className="erpRcActions erpNoPrint">
                              <button type="button" className="erpRcLink" aria-expanded={expanded} title={T("Детали", "Details", "Chi tiết")} onClick={() => toggleOpen(id)}>
                                <DetailsIcon open={expanded} />
                                <span className="erpRcLabel">{T("Детали", "Details", "Chi tiết")}</span>
                              </button>
                              {doc.status === "draft" ? (
                                <NavLink href={docHref({ id: doc.id, doc_type: doc.doc_type })} className="erpRcLink">
                                  <EditIcon />
                                  <span className="erpRcLabel">{T("Ред.", "Edit", "Sửa")}</span>
                                </NavLink>
                              ) : (
                                <span
                                  className="erpRcLink off"
                                  title={T(
                                    "Проведённую или отменённую поставку изменить нельзя: остатки и себестоимость уже посчитаны. Отмените её и создайте новую.",
                                    "A posted or cancelled delivery cannot be changed: stock and costs are already counted. Cancel it and create a new one.",
                                    "Không thể sửa phiếu đã ghi sổ hoặc đã hủy.",
                                  )}
                                >
                                  <EditIcon />
                                  <span className="erpRcLabel">{T("Ред.", "Edit", "Sửa")}</span>
                                </span>
                              )}
                              {rowMenu(doc)}
                            </td>
                          </tr>
                          {expanded ? (
                            <tr className="erpDetailRow">
                              <td colSpan={shown.length + 1}>
                                <ReceiptDetail state={state} row={row} />
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      );
                    })
                  )}
                </tbody>
                {list.length ? (
                  <tfoot>
                    <tr data-testid="receipts-total">
                      {amountAt < 0 ? (
                        <td colSpan={shown.length} className="erpTotalLabel">
                          {T("Итого", "Total", "Tổng")}: {vnd(total)}
                        </td>
                      ) : (
                        <>
                          {amountAt > 0 ? (
                            <td colSpan={amountAt} className="erpTotalLabel">
                              {T("Итого", "Total", "Tổng")}
                            </td>
                          ) : null}
                          <td className="num erpRcAmount">
                            {vnd(total)}
                            {incomplete ? <small className="erpCellSub">{T("без поставок с неизвестной ценой", "excluding deliveries with unknown price", "trừ phiếu chưa rõ giá")}</small> : null}
                          </td>
                          {shown.slice(amountAt + 1).map((c) => (
                            <td key={c.id} />
                          ))}
                        </>
                      )}
                      <td className="erpNoPrint" />
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>
            {pages > 1 ? (
              <div className="erpNoPrint">
                <Pager total={list.length} page={current} pages={pages} onPage={setPageNo} />
              </div>
            ) : null}
            <p className="erpScope erpRcNote erpNoPrint">
              {T(
                "«Статус» — оплата поставки, «Проведение» — учёт в остатках. Данных об оплате и счетах в ERP пока нет, поэтому там «—». Задолженность не показывается.",
                "Status is the delivery payment; Posting is whether it counts in stock. The ERP has no payment or account data yet, so these show “—”. Debt is not shown.",
                "Trạng thái = thanh toán; Ghi sổ = tính vào tồn kho. Chưa có dữ liệu thanh toán nên hiện “—”.",
              )}
            </p>
          </>
        )}
      </section>

      {printed ? (
        <div className="erpPrintDoc">
          <ReceiptDetail state={state} row={printed} printable />
        </div>
      ) : null}
    </div>
  );
}

function ReceiptDetail({ state, row, printable }: { state: ErpState; row: Row; printable?: boolean }) {
  const doc = row.doc;
  const packs = new Map(state.packs.map((p) => [p.id, p]));
  const lines = doc.lines ?? [];
  const sum = lines.reduce((acc, line) => acc + (lineSum(line) ?? 0), 0);
  return (
    <div className="erpDetail erpRcDetail">
      {printable ? (
        <h2>
          {T("Поставка", "Delivery", "Phiếu nhập")} {docNo(doc)} · {dateText(doc.doc_date)}
        </h2>
      ) : null}
      <dl className="erpRcFacts">
        <div>
          <dt>{T("Поставщик", "Supplier", "Nhà cung cấp")}</dt>
          <dd>{row.supplier || "—"}</dd>
        </div>
        <div>
          <dt>{T("Склад", "Location", "Kho")}</dt>
          <dd>{row.warehouse || "—"}</dd>
        </div>
        <div>
          <dt>{T("Проведение", "Posting", "Ghi sổ")}</dt>
          <dd>{statusLabel(doc.status ?? "draft")}</dd>
        </div>
        <div>
          <dt>{T("Цены", "Prices", "Giá")}</dt>
          <dd>{doc.prices_include_vat ? T("с НДС", "incl. VAT", "gồm VAT") : T("без НДС", "excl. VAT", "chưa VAT")}</dd>
        </div>
        <div>
          <dt>{T("Создал", "Created by", "Người tạo")}</dt>
          <dd>{personName(doc.created_by) || "—"}</dd>
        </div>
        {doc.status === "cancelled" ? (
          <div>
            <dt>{T("Причина отмены", "Cancel reason", "Lý do hủy")}</dt>
            <dd>{doc.cancel_reason || "—"}</dd>
          </div>
        ) : null}
        {doc.comment ? (
          <div className="wide">
            <dt>{T("Комментарий", "Comment", "Ghi chú")}</dt>
            <dd>{doc.comment}</dd>
          </div>
        ) : null}
      </dl>
      {!lines.length ? (
        <p className="erpHint">{T("В поставке нет строк.", "The delivery has no lines.", "Phiếu không có dòng.")}</p>
      ) : (
        <table className="erpTable erpRcLines">
          <thead>
            <tr>
              <th>{T("Товар", "Product", "Hàng hóa")}</th>
              <th className="num">{T("Количество", "Quantity", "Số lượng")}</th>
              <th className="num">{T("Цена за единицу", "Unit price", "Đơn giá")}</th>
              <th className="num">{T("Сумма", "Amount", "Số tiền")}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => {
              const product = state.products.find((p) => p.id === line.product_id);
              const pack = line.pack_id ? packs.get(line.pack_id) : undefined;
              const unit = unitOf(state, line.product_id);
              const amount = lineSum(line);
              return (
                <tr key={line.id ?? `${line.product_id}-${index}`}>
                  <td>{product ? productTitle(product) : "?"}</td>
                  <td className="num">
                    {qtyText(line.qty, unit)}
                    {pack && line.pack_qty ? <small className="erpCellSub">{`${line.pack_qty} × ${packText(pack.label)}`}</small> : null}
                  </td>
                  <td className="num">{line.unit_price === null || line.unit_price === undefined ? "—" : vnd(line.unit_price)}</td>
                  <td className="num">{amount === null ? "—" : vnd(amount)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} className="erpTotalLabel">
                {T("Всего", "Total", "Tổng")}
              </td>
              <td className="num">{vnd(sum)}</td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
}
