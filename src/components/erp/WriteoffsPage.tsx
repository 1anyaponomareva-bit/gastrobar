"use client";

import { Fragment, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { productTitle } from "@/lib/erp/costing";
import type { ErpDocument, ErpDocumentLine, ErpState, ErpWriteoffReason } from "@/lib/erp/types";
import { docHref } from "./docs";
import { useErp } from "./ErpShell";
import { DropMenu, matches, MultiSelect, type CondOp } from "./filters";
import { Pager, PAGE } from "./StockBalances";
import { StockMobileNav } from "./stockNav";
import { addDays, dateText, errorText, loadingText, NavLink, packText, qtyText, statusLabel, T, today, unitOf, vnd, warehouseName } from "./ui";
import "./writeoffs.css";

const STORE_KEY = "gastrofood-erp-writeoffs";
const LIST_HREF = "/erp/stock/writeoffs";
const REASONS_HREF = "/erp/stock/writeoffs/reasons";
const NEW_HREF = "/erp/documents/new?type=writeoff";
export const NO_REASON_COLOR = "#3b82f6";

type ColumnId = "warehouse" | "products" | "amount" | "employee" | "reason";
type SortKey = "date" | "warehouse" | "amount" | "employee" | "reason";
type PeriodId = "all" | "today" | "yesterday" | "week" | "month" | "lastMonth" | "year" | "custom";
type ExtraId = "products" | "amount" | "employee" | "comment" | "status";
type AmountOp = Extract<CondOp, ">" | ">=" | "<" | "<=" | "=">;

type Saved = {
  query: string;
  period: PeriodId;
  from: string;
  to: string;
  warehouses: string[];
  categories: string[];
  reasons: string[];
  extras: ExtraId[];
  products: string[];
  employees: string[];
  statuses: string[];
  amountOp: AmountOp;
  amount: string;
  comment: string;
  hidden: ColumnId[];
  sort: SortKey;
  desc: boolean;
  reasonsQuery: string;
  reasonsArchived: boolean;
};

const initial: Saved = {
  query: "",
  period: "all",
  from: "",
  to: "",
  warehouses: [],
  categories: [],
  reasons: [],
  extras: [],
  products: [],
  employees: [],
  statuses: [],
  amountOp: ">",
  amount: "",
  comment: "",
  hidden: [],
  sort: "date",
  desc: true,
  reasonsQuery: "",
  reasonsArchived: false,
};

/** Poster's column order after the expand arrow and the date. */
const columns = (): { id: ColumnId; label: string; num?: boolean; sort?: SortKey }[] => [
  { id: "warehouse", label: T("Склад", "Location", "Kho"), sort: "warehouse" },
  { id: "products", label: T("Товары", "Products", "Hàng hóa") },
  { id: "amount", label: T("Сумма", "Amount", "Số tiền"), num: true, sort: "amount" },
  { id: "employee", label: T("Сотрудник", "Employee", "Nhân viên"), sort: "employee" },
  { id: "reason", label: T("Причина", "Reason", "Lý do"), sort: "reason" },
];

const periodLabels = (): Record<PeriodId, string> => ({
  all: T("Всё время", "All time", "Toàn bộ"),
  today: T("Сегодня", "Today", "Hôm nay"),
  yesterday: T("Вчера", "Yesterday", "Hôm qua"),
  week: T("Последние 7 дней", "Last 7 days", "7 ngày qua"),
  month: T("Этот месяц", "This month", "Tháng này"),
  lastMonth: T("Прошлый месяц", "Last month", "Tháng trước"),
  year: T("Этот год", "This year", "Năm nay"),
  custom: T("Свой период", "Custom range", "Tùy chọn"),
});

const extraLabels = (): Record<ExtraId, string> => ({
  products: T("Товары", "Products", "Hàng hóa"),
  amount: T("Сумма", "Amount", "Số tiền"),
  employee: T("Сотрудник", "Employee", "Nhân viên"),
  comment: T("Комментарий", "Comment", "Ghi chú"),
  status: T("Статус", "Status", "Trạng thái"),
});

const pnlLabel = (block: ErpWriteoffReason["pnl_block"]) => (block === "expense" ? T("Расходы", "Expenses", "Chi phí") : T("Себестоимость", "Cost of goods", "Giá vốn"));
export const noReasonText = () => T("Без причины", "No reason", "Không có lý do");

/** [from, to] in YYYY-MM-DD; empty means open-ended. */
function periodRange(saved: Pick<Saved, "period" | "from" | "to">): [string, string] {
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
      const end = addDays(`${y}-${m}-01`, -1);
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

/** Write-offs of the period; a list seen before shows at once and refreshes. */
function useWriteoffs(from: string, to: string, enabled: boolean) {
  const { docsVersion } = useErp();
  const key = `${from}|${to}`;
  const hit = cache.get(key);
  const [page, setPage] = useState<Page | null>(hit && hit.docsVersion === docsVersion ? hit : null);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);

  const load = useCallback(async () => {
    if (!enabled) return;
    const id = ++request.current;
    const fresh = cache.get(key);
    const usable = fresh && fresh.docsVersion === docsVersion;
    setPage(usable ? fresh : null);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const response = await fetch(`/api/erp/writeoffs?${params}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "server");
      if (id !== request.current) return;
      cache.set(key, { ...(data as Page), docsVersion });
      setPage(data as Page);
    } catch (e) {
      if (id !== request.current || usable) return;
      setError(errorText(e instanceof Error && e.message !== "Failed to fetch" ? e.message : "network"));
    }
  }, [key, from, to, docsVersion, enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  return { page, error, reload: load };
}

type Row = {
  doc: ErpDocument;
  warehouse: string;
  products: string[];
  productIds: Set<string>;
  categories: Set<string>;
  employee: string;
  reason: ErpWriteoffReason | null;
  reasonName: string;
  /** Posted cost; null for drafts and cancelled documents. */
  amount: number | null;
  /** YYYY-MM-DD HH:MM for sorting and showing. */
  when: string;
};

const personName = (email: string | null | undefined) => (email ? email.split("@")[0] : "");

/** Time of the write-off; older documents without one show the time they were saved on that day. */
function timeOf(doc: ErpDocument): string {
  if (doc.doc_time) return doc.doc_time.slice(0, 5);
  if (!doc.created_at) return "";
  const at = new Date(doc.created_at);
  if (Number.isNaN(at.getTime())) return "";
  const local = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}`;
  return local === doc.doc_date ? `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}` : "";
}

function buildRows(state: ErpState, documents: ErpDocument[]): Row[] {
  const products = new Map(state.products.map((p) => [p.id, p]));
  const reasons = new Map(state.writeoffReasons.map((r) => [r.id, r]));
  return documents.map((doc) => {
    const lines = doc.lines ?? [];
    const reason = doc.reason_id ? (reasons.get(doc.reason_id) ?? null) : null;
    return {
      doc,
      warehouse: doc.warehouse_id ? warehouseName(state, doc.warehouse_id) : "",
      products: lines.map((line) => {
        const product = products.get(line.product_id);
        return product ? productTitle(product) : "?";
      }),
      productIds: new Set(lines.map((line) => line.product_id)),
      categories: new Set(lines.map((line) => products.get(line.product_id)?.category_id ?? "none")),
      employee: doc.created_by ?? "",
      reason,
      // Old write-offs have only a typed reason.
      reasonName: reason?.name ?? doc.reason ?? "",
      amount: doc.status === "posted" ? (doc.total_cost ?? null) : null,
      when: `${doc.doc_date ?? ""} ${timeOf(doc)}`,
    };
  });
}

const sortValue = (row: Row, key: SortKey): string | number => {
  switch (key) {
    case "date":
      return `${row.when}|${row.doc.created_at ?? ""}`;
    case "warehouse":
      return row.warehouse.toLowerCase();
    case "amount":
      return row.amount ?? -Infinity;
    case "employee":
      return row.employee.toLowerCase();
    case "reason":
      return row.reasonName.toLowerCase();
  }
};

function readSaved(): Saved {
  try {
    return { ...initial, ...(JSON.parse(window.localStorage.getItem(STORE_KEY) ?? "{}") as Partial<Saved>) };
  } catch {
    return initial;
  }
}

/** Filters live in localStorage, so they are the same after opening a document and coming back. */
function useSaved() {
  const [saved, setSaved] = useState<Saved | null>(null);
  useEffect(() => setSaved(readSaved()), []);
  useEffect(() => {
    if (saved) window.localStorage.setItem(STORE_KEY, JSON.stringify(saved));
  }, [saved]);
  const set = useCallback((patch: Partial<Saved>) => setSaved((prev) => ({ ...(prev ?? initial), ...patch })), []);
  return { saved, filters: saved ?? initial, set };
}

const Caret = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden>
    <path d="M7 10l5 5 5-5z" />
  </svg>
);

const Chevron = ({ open }: { open: boolean }) => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={open ? "open" : ""}>
    <path d="m9 6 6 6-6 6" />
  </svg>
);

export function ReasonMark({ reason, name }: { reason: ErpWriteoffReason | null; name?: string }) {
  const text = reason?.name ?? (name || noReasonText());
  return (
    <span className={`erpWoReason ${!reason && !name ? "none" : ""}`} title={reason?.archived_at ? T("Причина в архиве", "Archived reason", "Lý do đã lưu trữ") : undefined}>
      <i style={{ background: reason?.color ?? (name ? "#9ca3af" : NO_REASON_COLOR) }} aria-hidden />
      <span>{text}</span>
      {reason?.archived_at ? <small> · {T("архив", "archived", "lưu trữ")}</small> : null}
    </span>
  );
}

export function WriteoffsPage({ tab }: { tab: "list" | "reasons" }) {
  const { state } = useErp();
  const { saved, filters, set } = useSaved();
  const [from, to] = periodRange(filters);
  const { page: data, error, reload } = useWriteoffs(from, to, Boolean(saved));
  const [reasonForm, setReasonForm] = useState<Partial<ErpWriteoffReason> | null>(null);
  if (!state) return null;
  const rows = data && saved ? buildRows(state, data.documents) : null;

  const tabs = (
    <nav className="erpWoTabs" aria-label={T("Разделы списаний", "Write-off sections", "Mục xuất hủy")}>
      <NavLink href={LIST_HREF} className={tab === "list" ? "active" : ""}>
        {T("Список", "List", "Danh sách")}
      </NavLink>
      <NavLink href={REASONS_HREF} className={tab === "reasons" ? "active" : ""}>
        {T("Причины", "Reasons", "Lý do")}
      </NavLink>
    </nav>
  );

  return (
    <div className="erpWo">
      <StockMobileNav active={LIST_HREF} />
      {tab === "list" ? (
        <WriteoffList state={state} rows={rows} more={data?.more ?? false} error={error} reload={reload} filters={filters} set={set} tabs={tabs} />
      ) : (
        <ReasonsTab
          state={state}
          rows={rows}
          error={error}
          reload={reload}
          filters={filters}
          set={set}
          tabs={tabs}
          form={reasonForm}
          setForm={setReasonForm}
        />
      )}
    </div>
  );
}

function Head({ tabs, menu, add }: { tabs: ReactNode; menu: ReactNode; add: ReactNode }) {
  return (
    <div className="erpWoHead">
      <h1>{T("Списания", "Write-offs", "Xuất hủy")}</h1>
      {tabs}
      <div className="erpWoHeadActions">
        {menu}
        {add}
      </div>
    </div>
  );
}

function PeriodMenu({ filters, set, from, to }: { filters: Saved; set: (patch: Partial<Saved>) => void; from: string; to: string }) {
  return (
    <DropMenu
      trigger={({ open, toggle }) => (
        <button type="button" className={`erpFilterBtn ${filters.period !== "all" ? "on" : ""}`} aria-expanded={open} onClick={toggle} data-testid="wo-period">
          <span>{periodTitle(filters)}</span>
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
                className={`erpDropAction ${filters.period === id ? "erpWoOn" : ""}`}
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
          <div className="erpWoPeriodCustom">
            <input type="date" aria-label={T("С", "From", "Từ")} value={filters.period === "custom" ? filters.from : from} max={filters.to || undefined} onChange={(e) => set({ period: "custom", from: e.target.value, to: filters.period === "custom" ? filters.to : to })} />
            <span>–</span>
            <input type="date" aria-label={T("По", "To", "Đến")} value={filters.period === "custom" ? filters.to : to} min={filters.from || undefined} onChange={(e) => set({ period: "custom", to: e.target.value, from: filters.period === "custom" ? filters.from : from })} />
          </div>
        </div>
      )}
    </DropMenu>
  );
}

function downloadCsv(name: string, header: string[], body: string[][]) {
  const cell = (v: string) => (/[",;\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = [header.map(cell).join(","), ...body.map((row) => row.map(cell).join(","))];
  const blob = new Blob([`\uFEFF${lines.join("\n")}`], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${name}_${today()}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function LoadState({ error, reload, colSpan }: { error: string | null; reload: () => void; colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="erpWoEmpty">
        {error ? (
          <>
            <strong>{T("Не удалось загрузить списания", "Could not load write-offs", "Không tải được phiếu xuất hủy")}</strong>
            <span>{error}</span>
            <button type="button" className="erpBtn" onClick={reload}>
              {T("Повторить", "Try again", "Thử lại")}
            </button>
          </>
        ) : (
          loadingText()
        )}
      </td>
    </tr>
  );
}

/* ---------------------------------------------------------------- list */

function WriteoffList({
  state,
  rows,
  more,
  error,
  reload,
  filters,
  set,
  tabs,
}: {
  state: ErpState;
  rows: Row[] | null;
  more: boolean;
  error: string | null;
  reload: () => void;
  filters: Saved;
  set: (patch: Partial<Saved>) => void;
  tabs: ReactNode;
}) {
  const { act } = useErp();
  const [from, to] = periodRange(filters);
  const [pageNo, setPageNo] = useState(0);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const search = useDeferredValue(filters.query);

  const list = useMemo(() => {
    if (!rows) return [];
    const q = search.trim().toLowerCase();
    const wh = new Set(filters.warehouses);
    const cats = new Set(filters.categories);
    const reasons = new Set(filters.reasons);
    const on = (id: ExtraId) => filters.extras.includes(id);
    const products = new Set(on("products") ? filters.products : []);
    const people = new Set(on("employee") ? filters.employees : []);
    const statuses = new Set(on("status") ? filters.statuses : []);
    const comment = on("comment") ? filters.comment.trim().toLowerCase() : "";
    const amount = on("amount") ? filters.amount : "";
    const out = rows.filter(
      (row) =>
        (!q || `${row.doc.doc_no ?? ""} ${row.warehouse} ${row.products.join(" ")} ${row.reasonName} ${row.doc.comment ?? ""} ${row.employee}`.toLowerCase().includes(q)) &&
        (!wh.size || wh.has(row.doc.warehouse_id ?? "")) &&
        (!cats.size || [...row.categories].some((c) => cats.has(c))) &&
        (!reasons.size || reasons.has(row.doc.reason_id ?? "none")) &&
        (!products.size || [...row.productIds].some((p) => products.has(p))) &&
        (!people.size || people.has(row.employee)) &&
        (!statuses.size || statuses.has(row.doc.status ?? "draft")) &&
        (!comment || (row.doc.comment ?? "").toLowerCase().includes(comment)) &&
        (!amount || matches({ field: "amount", op: filters.amountOp, value: amount }, "number", row.amount)),
    );
    const dir = filters.desc ? -1 : 1;
    return out.sort((a, b) => {
      const x = sortValue(a, filters.sort);
      const y = sortValue(b, filters.sort);
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * dir;
    });
  }, [rows, search, filters]);

  const filterKey = JSON.stringify([filters.query, filters.warehouses, filters.categories, filters.reasons, filters.extras, filters.products, filters.employees, filters.statuses, filters.amount, filters.amountOp, filters.comment, from, to]);
  useEffect(() => setPageNo(0), [filterKey]);

  const shown = columns().filter((c) => !filters.hidden.includes(c.id));
  const colSpan = shown.length + 3;
  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  const current = Math.min(pageNo, pages - 1);
  const pageRows = list.slice(current * PAGE, current * PAGE + PAGE);
  const posted = list.filter((row) => row.doc.status === "posted");
  const total = posted.reduce((sum, row) => sum + (row.amount ?? 0), 0);
  const incomplete = posted.some((row) => row.doc.cost_known === false);
  const drafts = list.filter((row) => row.doc.status === "draft").length;
  const cancelled = list.filter((row) => row.doc.status === "cancelled").length;
  const anyFilter = Boolean(filters.query || filters.warehouses.length || filters.categories.length || filters.reasons.length || filters.extras.length || filters.period !== "all");
  const employees = [...new Set((rows ?? []).map((row) => row.employee).filter(Boolean))].sort();
  const usedProducts = [...new Set((rows ?? []).flatMap((row) => [...row.productIds]))]
    .map((id) => state.products.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .sort((a, b) => productTitle(a).localeCompare(productTitle(b)));
  const reasonOptions = [
    ...state.writeoffReasons.filter((r) => !r.archived_at || (rows ?? []).some((row) => row.doc.reason_id === r.id)).map((r) => ({ id: r.id, label: r.archived_at ? `${r.name} (${T("архив", "archived", "lưu trữ")})` : r.name })),
    { id: "none", label: noReasonText() },
  ];

  const toggleSort = (key: SortKey) => set(filters.sort === key ? { desc: !filters.desc } : { sort: key, desc: key === "date" || key === "amount" });
  const toggleOpen = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const resetAll = () =>
    set({ query: "", period: "all", from: "", to: "", warehouses: [], categories: [], reasons: [], extras: [], products: [], employees: [], statuses: [], amount: "", comment: "" });

  const exportCsv = () =>
    downloadCsv(
      "write-offs",
      [T("Дата", "Date", "Ngày"), T("Время", "Time", "Giờ"), "№", ...shown.map((c) => c.label), T("Статус", "Status", "Trạng thái"), T("Комментарий", "Comment", "Ghi chú")],
      list.map((row) => [
        dateText(row.doc.doc_date),
        timeOf(row.doc),
        row.doc.doc_no ?? "",
        ...shown.map((c) =>
          c.id === "warehouse" ? row.warehouse : c.id === "products" ? row.products.join(", ") : c.id === "amount" ? (row.amount === null ? "" : String(Math.round(row.amount))) : c.id === "employee" ? row.employee : row.reasonName || noReasonText(),
        ),
        statusLabel(row.doc.status ?? "draft"),
        row.doc.comment ?? "",
      ]),
    );

  const cancelDoc = async (doc: ErpDocument) => {
    if (!doc.id) return;
    const reason = window.prompt(
      T(
        `Отменить списание ${doc.doc_no}? Товары вернутся на склад. Укажите причину отмены:`,
        `Cancel write-off ${doc.doc_no}? The products return to stock. Why is it cancelled?`,
        `Hủy phiếu ${doc.doc_no}? Hàng sẽ trở lại kho. Lý do hủy:`,
      ),
    );
    if (!reason?.trim()) return;
    if (await act({ action: "cancelDocument", id: doc.id, reason }, T("Списание отменено", "Write-off cancelled", "Đã hủy phiếu"))) void reload();
  };
  const deleteDraft = async (doc: ErpDocument) => {
    if (!doc.id || !window.confirm(T(`Удалить черновик ${doc.doc_no}?`, `Delete draft ${doc.doc_no}?`, `Xóa bản nháp ${doc.doc_no}?`))) return;
    if (await act({ action: "deleteDraft", id: doc.id }, T("Черновик удалён", "Draft deleted", "Đã xóa bản nháp"))) void reload();
  };

  const sectionMenu = (
    <DropMenu
      align="right"
      trigger={({ open: menuOpen, toggle }) => (
        <button type="button" className="erpWoDots big" aria-label={T("Действия", "Actions", "Thao tác")} aria-expanded={menuOpen} onClick={toggle} data-testid="wo-section-menu">
          ⋮
        </button>
      )}
    >
      {(close) => (
        <div className="erpDropList">
          <p className="erpDropTitle">{T("Столбцы", "Columns", "Cột")}</p>
          {columns().map((c) => (
            <label key={c.id} className="erpDropItem">
              <input type="checkbox" checked={!filters.hidden.includes(c.id)} onChange={() => set({ hidden: filters.hidden.includes(c.id) ? filters.hidden.filter((h) => h !== c.id) : [...filters.hidden, c.id] })} />
              <span>{c.label}</span>
            </label>
          ))}
          <button type="button" className="erpDropAction" disabled={!filters.hidden.length} onClick={() => set({ hidden: [] })}>
            {T("Показать все столбцы", "Show all columns", "Hiện tất cả cột")}
          </button>
          <hr />
          <button
            type="button"
            className="erpDropAction"
            disabled={!list.length}
            onClick={() => {
              close();
              exportCsv();
            }}
          >
            {T("Экспорт в CSV", "Export to CSV", "Xuất CSV")}
          </button>
        </div>
      )}
    </DropMenu>
  );

  const add = (
    <NavLink href={NEW_HREF} className="erpBtn primary erpWoAdd">
      {T("Добавить", "Add", "Thêm")}
    </NavLink>
  );

  const removeExtra = (id: ExtraId) => set({ extras: filters.extras.filter((e) => e !== id) });
  const x = (id: ExtraId) => (
    <button type="button" className="erpCondX" aria-label={T("Убрать фильтр", "Remove filter", "Bỏ lọc")} onClick={() => removeExtra(id)}>
      ×
    </button>
  );
  const extraChip = (id: ExtraId) => {
    if (id === "amount" || id === "comment") {
      return (
        <div key={id} className="erpCond">
          <span className="erpCondName">{extraLabels()[id]}</span>
          {id === "amount" ? (
            <>
              <select value={filters.amountOp} onChange={(e) => set({ amountOp: e.target.value as AmountOp })} aria-label={T("Условие", "Condition", "Điều kiện")}>
                {([">", ">=", "<", "<=", "="] as AmountOp[]).map((op) => (
                  <option key={op} value={op}>
                    {op === ">=" ? "≥" : op === "<=" ? "≤" : op}
                  </option>
                ))}
              </select>
              <input inputMode="decimal" value={filters.amount} onChange={(e) => set({ amount: e.target.value })} aria-label={extraLabels().amount} placeholder="₫" />
            </>
          ) : (
            <input type="search" value={filters.comment} onChange={(e) => set({ comment: e.target.value })} aria-label={extraLabels().comment} placeholder={T("содержит…", "contains…", "chứa…")} />
          )}
          {x(id)}
        </div>
      );
    }
    const options =
      id === "products"
        ? usedProducts.map((p) => ({ id: p.id, label: productTitle(p) }))
        : id === "employee"
          ? employees.map((e) => ({ id: e, label: personName(e) || e }))
          : ["posted", "draft", "cancelled"].map((s) => ({ id: s, label: statusLabel(s) }));
    const value = id === "products" ? filters.products : id === "employee" ? filters.employees : filters.statuses;
    return (
      <div key={id} className="erpCondMulti erpWoCondMulti">
        <MultiSelect
          label={extraLabels()[id]}
          options={options}
          value={value}
          searchable={id === "products"}
          onChange={(next) => set(id === "products" ? { products: next } : id === "employee" ? { employees: next } : { statuses: next })}
        />
        {x(id)}
      </div>
    );
  };

  const addFilter = (
    <DropMenu
      trigger={({ open: menuOpen, toggle }) => (
        <button type="button" className="erpFilterBtn" aria-expanded={menuOpen} onClick={toggle} data-testid="wo-add-filter">
          <span>+ {T("Фильтр", "Filter", "Bộ lọc")}</span>
          <Caret />
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
                set({ extras: [...filters.extras, id] });
                close();
              }}
            >
              {extraLabels()[id]}
            </button>
          ))}
        </div>
      )}
    </DropMenu>
  );

  const head = (c: ReturnType<typeof columns>[number]) => (
    <th key={c.id} className={c.num ? "num" : ""} aria-sort={c.sort && filters.sort === c.sort ? (filters.desc ? "descending" : "ascending") : undefined}>
      {c.sort ? (
        <button type="button" className="erpWoSort" onClick={() => toggleSort(c.sort as SortKey)}>
          {c.label}
          {filters.sort === c.sort ? <span aria-hidden>{filters.desc ? " ↓" : " ↑"}</span> : null}
        </button>
      ) : (
        c.label
      )}
    </th>
  );

  const cell = (row: Row, id: ColumnId) => {
    const doc = row.doc;
    switch (id) {
      case "warehouse":
        return (
          <td key={id} className="erpWoClip" title={row.warehouse}>
            {row.warehouse || "—"}
          </td>
        );
      case "products":
        return (
          <td key={id} className="erpWoClip erpWoProducts" title={row.products.join("\n")}>
            {row.products.join(", ") || "—"}
          </td>
        );
      case "amount":
        return (
          <td key={id} className="num erpWoAmount">
            {doc.status !== "posted" ? (
              <span className="erpWoMuted">—</span>
            ) : doc.cost_known === false ? (
              <span className="erpBadge warn" title={T("У части партий неизвестна цена", "Some lots have no known price", "Một số lô chưa rõ giá")}>
                {T("неполная", "incomplete", "chưa đủ")}
              </span>
            ) : (
              vnd(row.amount)
            )}
          </td>
        );
      case "employee":
        return (
          <td key={id} className="erpWoClip erpWoEmployee" title={row.employee}>
            {personName(row.employee) || "—"}
          </td>
        );
      case "reason":
        return (
          <td key={id} className="erpWoClip">
            <ReasonMark reason={row.reason} name={row.reason ? undefined : (doc.reason ?? undefined)} />
          </td>
        );
    }
  };

  const rowMenu = (doc: ErpDocument) => (
    <DropMenu
      align="right"
      fixed
      trigger={({ open: menuOpen, toggle }) => (
        <button type="button" className="erpWoDots" aria-label={T("Действия с документом", "Document actions", "Thao tác")} aria-expanded={menuOpen} onClick={toggle} data-testid="wo-row-menu">
          ⋮
        </button>
      )}
    >
      {(close) => (
        <div className="erpDropList">
          <NavLink href={docHref({ id: doc.id, doc_type: "writeoff" })} className="erpDropAction">
            {doc.status === "draft" ? T("Редактировать", "Edit", "Sửa") : T("Открыть", "Open", "Mở")}
          </NavLink>
          <NavLink href={`${NEW_HREF}&copy=${doc.id}`} className="erpDropAction">
            {T("Копировать", "Copy", "Sao chép")}
          </NavLink>
          {doc.status === "draft" ? (
            <button
              type="button"
              className="erpDropAction erpWoDanger"
              onClick={() => {
                close();
                void deleteDraft(doc);
              }}
            >
              {T("Удалить черновик", "Delete draft", "Xóa bản nháp")}
            </button>
          ) : doc.status === "posted" ? (
            <button
              type="button"
              className="erpDropAction erpWoDanger"
              onClick={() => {
                close();
                void cancelDoc(doc);
              }}
            >
              {T("Отменить списание…", "Cancel write-off…", "Hủy phiếu…")}
            </button>
          ) : null}
        </div>
      )}
    </DropMenu>
  );

  return (
    <>
      <Head tabs={tabs} menu={sectionMenu} add={add} />
      <section className="erpWoPanel">
        <div className="erpWoFilters">
          <input type="search" className="erpWoSearch" placeholder={T("Поиск…", "Search…", "Tìm…")} value={filters.query} onChange={(e) => set({ query: e.target.value })} aria-label={T("Поиск", "Search", "Tìm")} />
          <PeriodMenu filters={filters} set={set} from={from} to={to} />
          <MultiSelect label={T("Склад", "Location", "Kho")} options={state.warehouses.filter((w) => !w.archived_at).map((w) => ({ id: w.id, label: w.name }))} value={filters.warehouses} onChange={(warehouses) => set({ warehouses })} />
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
          <MultiSelect label={T("Причина", "Reason", "Lý do")} options={reasonOptions} value={filters.reasons} onChange={(reasons) => set({ reasons })} />
          {filters.extras.map(extraChip)}
          {addFilter}
          {anyFilter ? (
            <button type="button" className="erpLink erpWoReset" onClick={resetAll}>
              {T("Сбросить", "Reset", "Đặt lại")}
            </button>
          ) : null}
        </div>

        {more ? (
          <p className="erpWoNote">
            {T("Показаны 1000 последних списаний периода — выберите период короче.", "Showing the latest 1000 write-offs of the period — choose a shorter period.", "Chỉ hiện 1000 phiếu mới nhất — hãy chọn kỳ ngắn hơn.")}
          </p>
        ) : null}
        <div className="erpWoTableWrap" data-testid="wo-table-wrap">
          <table className="erpWoTable" data-testid="wo-table">
            <thead>
              <tr>
                <th className="erpWoExpandCol" aria-label={T("Раскрыть", "Expand", "Mở rộng")} />
                <th aria-sort={filters.sort === "date" ? (filters.desc ? "descending" : "ascending") : undefined} className="erpWoDateCol">
                  <button type="button" className="erpWoSort" onClick={() => toggleSort("date")}>
                    {T("Дата", "Date", "Ngày")}
                    {filters.sort === "date" ? <span aria-hidden>{filters.desc ? " ↓" : " ↑"}</span> : null}
                  </button>
                </th>
                {shown.map(head)}
                <th className="erpWoMenuCol" aria-label={T("Действия", "Actions", "Thao tác")} />
              </tr>
            </thead>
            <tbody>
              {!rows ? (
                <LoadState error={error} reload={reload} colSpan={colSpan} />
              ) : !pageRows.length ? (
                <tr>
                  <td colSpan={colSpan} className="erpWoEmpty" data-testid="wo-empty">
                    {!rows.length && filters.period === "all" ? (
                      <strong>{T("Списаний пока нет", "No write-offs yet", "Chưa có phiếu xuất hủy")}</strong>
                    ) : (
                      <>
                        <strong>{T("Ничего не найдено", "Nothing found", "Không tìm thấy")}</strong>
                        <span>{T("Попробуйте изменить поиск, фильтры или период.", "Try changing the search, filters or period.", "Hãy đổi từ khóa, bộ lọc hoặc kỳ.")}</span>
                      </>
                    )}
                  </td>
                </tr>
              ) : (
                pageRows.map((row) => {
                  const doc = row.doc;
                  const id = doc.id ?? "";
                  const expanded = open.has(id);
                  return (
                    <Fragment key={id}>
                      <tr className={`${expanded ? "open" : ""} ${doc.status === "cancelled" ? "cancelled" : ""}`} data-testid="wo-row">
                        <td className="erpWoExpandCol">
                          <button type="button" className="erpWoExpand" aria-expanded={expanded} aria-label={T("Состав списания", "Write-off lines", "Chi tiết")} onClick={() => toggleOpen(id)}>
                            <Chevron open={expanded} />
                          </button>
                        </td>
                        <td className="erpWoDateCol">
                          <button type="button" className="erpWoDate" onClick={() => toggleOpen(id)}>
                            {dateText(doc.doc_date)}
                            {timeOf(doc) ? `, ${timeOf(doc)}` : ""}
                          </button>
                          {doc.status !== "posted" ? <span className={`erpWoStatus ${doc.status}`}>{statusLabel(doc.status ?? "draft")}</span> : null}
                        </td>
                        {shown.map((c) => cell(row, c.id))}
                        <td className="erpWoMenuCol">{rowMenu(doc)}</td>
                      </tr>
                      {expanded ? (
                        <tr className="erpWoDetailRow">
                          <td colSpan={colSpan}>
                            <WriteoffDetail state={state} row={row} />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })
              )}
            </tbody>
            <tfoot>
              <tr data-testid="wo-total">
                <td className="erpWoExpandCol" />
                <td className="erpWoTotalLabel erpWoDateCol">{T("Всего", "Total", "Tổng")}</td>
                {shown.map((c) => (
                  <td key={c.id} className={c.num ? "num erpWoAmount" : ""}>
                    {c.id === "amount" ? (
                      <>
                        {vnd(total)}
                        {incomplete ? <small className="erpWoSub">{T("без неизвестных цен", "excl. unknown prices", "trừ giá chưa rõ")}</small> : null}
                      </>
                    ) : null}
                  </td>
                ))}
                <td className="erpWoMenuCol" />
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="erpWoFoot">
          <Pager total={list.length} page={current} pages={pages} onPage={setPageNo} />
          <span className="erpWoFound" data-testid="wo-found">
            {T("Найдено", "Found", "Tìm thấy")}: {list.length}
            {drafts || cancelled
              ? ` · ${T("в «Всего» только проведённые", "“Total” counts completed only", "Tổng chỉ tính phiếu đã ghi sổ")}${drafts ? ` · ${T("черновики", "drafts", "nháp")}: ${drafts}` : ""}${cancelled ? ` · ${T("отменённые", "cancelled", "đã hủy")}: ${cancelled}` : ""}`
              : ""}
          </span>
        </div>
      </section>
    </>
  );
}

const lineAmount = (line: ErpDocumentLine) => (line.cost_known === false ? null : (line.cost_amount ?? null));

function WriteoffDetail({ state, row }: { state: ErpState; row: Row }) {
  const doc = row.doc;
  const packs = new Map(state.packs.map((p) => [p.id, p]));
  const lines = doc.lines ?? [];
  const posted = doc.status === "posted" || doc.status === "cancelled";
  return (
    <div className="erpWoDetail" data-testid="wo-detail">
      <dl className="erpWoFacts">
        <div>
          <dt>{T("Документ", "Document", "Chứng từ")}</dt>
          <dd>{doc.doc_no}</dd>
        </div>
        <div>
          <dt>{T("Статус", "Status", "Trạng thái")}</dt>
          <dd>{statusLabel(doc.status ?? "draft")}</dd>
        </div>
        <div>
          <dt>{T("Создал", "Created by", "Người tạo")}</dt>
          <dd>{doc.created_by ?? "—"}</dd>
        </div>
        {doc.posted_at ? (
          <div>
            <dt>{T("Проведено", "Completed", "Ghi sổ")}</dt>
            <dd>
              {dateText(doc.posted_at)} · {doc.posted_by ?? "—"}
            </dd>
          </div>
        ) : null}
        {doc.status === "cancelled" ? (
          <div>
            <dt>{T("Отменено", "Cancelled", "Đã hủy")}</dt>
            <dd>
              {doc.cancelled_by ?? "—"}: {doc.cancel_reason || "—"}
            </dd>
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
        <p className="erpWoMuted">{T("В документе нет строк.", "The document has no lines.", "Chứng từ không có dòng.")}</p>
      ) : (
        <table className="erpWoLines">
          <thead>
            <tr>
              <th>{T("Товар", "Product", "Hàng hóa")}</th>
              <th className="num">{T("Количество", "Quantity", "Số lượng")}</th>
              <th>{T("Фасовка", "Pack", "Quy cách")}</th>
              <th className="num">{T("Себестоимость ед.", "Unit cost", "Giá vốn/đv")}</th>
              <th className="num">{T("Сумма", "Amount", "Số tiền")}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => {
              const product = state.products.find((p) => p.id === line.product_id);
              const pack = line.pack_id ? packs.get(line.pack_id) : undefined;
              const unit = unitOf(state, line.product_id);
              const amount = lineAmount(line);
              return (
                <tr key={line.id ?? `${line.product_id}-${index}`}>
                  <td>
                    {product ? productTitle(product) : "?"}
                    {line.reason ? <small className="erpWoSub">{line.reason}</small> : null}
                  </td>
                  <td className="num">{qtyText(line.qty, unit)}</td>
                  <td>{line.pack_qty && (line.pack_name || pack) ? `${line.pack_qty} × ${packText(line.pack_name || pack?.name || "")}` : "—"}</td>
                  <td className="num">{posted && line.unit_cost !== null && line.unit_cost !== undefined ? vnd(line.unit_cost) : "—"}</td>
                  <td className="num">{!posted ? "—" : amount === null ? <span className="erpBadge warn">{T("цена неизвестна", "price unknown", "chưa rõ giá")}</span> : vnd(amount)}</td>
                </tr>
              );
            })}
          </tbody>
          {posted ? (
            <tfoot>
              <tr>
                <td colSpan={4}>{T("Себестоимость по списанным партиям (FIFO)", "Cost of the lots taken (FIFO)", "Giá vốn theo lô (FIFO)")}</td>
                <td className="num">{doc.cost_known === false ? T("неполная", "incomplete", "chưa đủ") : vnd(doc.total_cost)}</td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      )}
      {!posted ? <p className="erpWoMuted">{T("Черновик: остатки не изменены, стоимость появится после проведения.", "Draft: stock is unchanged; the cost appears once completed.", "Nháp: tồn kho chưa đổi.")}</p> : null}
    </div>
  );
}

/* ---------------------------------------------------------------- reasons */

const REASON_COLORS = ["#3b82f6", "#e11d48", "#f97316", "#eab308", "#16a34a", "#0d9488", "#8b5cf6", "#6b7280"];

function ReasonsTab({
  state,
  rows,
  error,
  reload,
  filters,
  set,
  tabs,
  form,
  setForm,
}: {
  state: ErpState;
  rows: Row[] | null;
  error: string | null;
  reload: () => void;
  filters: Saved;
  set: (patch: Partial<Saved>) => void;
  tabs: ReactNode;
  form: Partial<ErpWriteoffReason> | null;
  setForm: (form: Partial<ErpWriteoffReason> | null) => void;
}) {
  const { act, busy } = useErp();
  const [from, to] = periodRange(filters);
  const [sortDesc, setSortDesc] = useState(false);

  const stats = useMemo(() => {
    const out = new Map<string, { count: number; cost: number }>();
    for (const row of rows ?? []) {
      if (row.doc.status !== "posted" || !row.doc.reason_id) continue;
      const s = out.get(row.doc.reason_id) ?? { count: 0, cost: 0 };
      s.count += 1;
      s.cost += row.amount ?? 0;
      out.set(row.doc.reason_id, s);
    }
    return out;
  }, [rows]);

  const q = filters.reasonsQuery.trim().toLowerCase();
  const list = state.writeoffReasons
    .filter((r) => (filters.reasonsArchived ? true : !r.archived_at) && (!q || r.name.toLowerCase().includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name) * (sortDesc ? -1 : 1));
  const hasArchived = state.writeoffReasons.some((r) => r.archived_at);

  const save = async () => {
    if (!form?.name?.trim()) return;
    const result = await act(
      { action: "saveWriteoffReason", reason: { id: form.id, name: form.name, color: form.color ?? REASON_COLORS[0], pnl_block: form.pnl_block ?? "cost", archived: Boolean(form.archived_at) } },
      form.id ? T("Причина сохранена", "Reason saved", "Đã lưu lý do") : T("Причина добавлена", "Reason added", "Đã thêm lý do"),
    );
    if (result) setForm(null);
  };
  const archive = async (reason: ErpWriteoffReason, archived: boolean) => {
    if (archived && !window.confirm(T(`Убрать «${reason.name}» в архив? В старых списаниях причина останется.`, `Archive “${reason.name}”? Old write-offs keep it.`, `Lưu trữ “${reason.name}”?`))) return;
    await act(
      { action: "saveWriteoffReason", reason: { id: reason.id, name: reason.name, color: reason.color, pnl_block: reason.pnl_block, archived } },
      archived ? T("Причина в архиве", "Reason archived", "Đã lưu trữ") : T("Причина возвращена", "Reason restored", "Đã khôi phục"),
    );
  };

  const sectionMenu = (
    <DropMenu
      align="right"
      trigger={({ open, toggle }) => (
        <button type="button" className="erpWoDots big" aria-label={T("Действия", "Actions", "Thao tác")} aria-expanded={open} onClick={toggle} data-testid="wo-section-menu">
          ⋮
        </button>
      )}
    >
      {(close) => (
        <div className="erpDropList">
          <label className="erpDropItem">
            <input type="checkbox" checked={filters.reasonsArchived} onChange={() => set({ reasonsArchived: !filters.reasonsArchived })} />
            <span>{T("Показывать архивные", "Show archived", "Hiện lưu trữ")}</span>
          </label>
          <hr />
          <button
            type="button"
            className="erpDropAction"
            disabled={!list.length}
            onClick={() => {
              close();
              downloadCsv(
                "write-off-reasons",
                [T("Название", "Name", "Tên"), T("Цвет", "Color", "Màu"), T("Блок в P&L", "P&L block", "Khối P&L"), T("Количество списаний", "Write-offs", "Số phiếu"), T("Стоимость продуктов", "Products cost", "Giá trị hàng"), T("Архив", "Archived", "Lưu trữ")],
                list.map((r) => [r.name, r.color, pnlLabel(r.pnl_block), String(stats.get(r.id)?.count ?? 0), String(Math.round(stats.get(r.id)?.cost ?? 0)), r.archived_at ? "1" : ""]),
              );
            }}
          >
            {T("Экспорт в CSV", "Export to CSV", "Xuất CSV")}
          </button>
        </div>
      )}
    </DropMenu>
  );

  const add = (
    <button type="button" className="erpBtn primary erpWoAdd" onClick={() => setForm({ name: "", color: REASON_COLORS[1], pnl_block: "cost" })}>
      {T("Добавить", "Add", "Thêm")}
    </button>
  );

  return (
    <>
      <Head tabs={tabs} menu={sectionMenu} add={add} />
      {form ? (
        <section className="erpWoPanel erpWoReasonForm" data-testid="wo-reason-form">
          <h2>{form.id ? T("Причина списания", "Write-off reason", "Lý do xuất hủy") : T("Новая причина списания", "New write-off reason", "Lý do mới")}</h2>
          <label className="erpWoField">
            <span>{T("Название", "Name", "Tên")}</span>
            <input value={form.name ?? ""} maxLength={100} autoFocus onChange={(e) => setForm({ ...form, name: e.target.value })} onKeyDown={(e) => e.key === "Enter" && void save()} />
          </label>
          <div className="erpWoField">
            <span>{T("Цвет", "Color", "Màu")}</span>
            <div className="erpWoColors">
              {REASON_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`erpWoColor ${form.color === color ? "on" : ""}`}
                  style={{ background: color }}
                  aria-label={color}
                  aria-pressed={form.color === color}
                  onClick={() => setForm({ ...form, color })}
                />
              ))}
              <input type="color" value={form.color ?? REASON_COLORS[0]} onChange={(e) => setForm({ ...form, color: e.target.value })} aria-label={T("Свой цвет", "Custom color", "Màu khác")} />
            </div>
          </div>
          <div className="erpWoField">
            <span>{T("Учитывать в блоке P&L", "Count in P&L block", "Tính vào khối P&L")}</span>
            <div className="erpWoRadios">
              {(["cost", "expense"] as const).map((block) => (
                <label key={block}>
                  <input type="radio" name="pnl" checked={(form.pnl_block ?? "cost") === block} onChange={() => setForm({ ...form, pnl_block: block })} />
                  {pnlLabel(block)}
                </label>
              ))}
            </div>
          </div>
          <div className="erpWoFormActions">
            <button type="button" className="erpBtn ghost" onClick={() => setForm(null)}>
              {T("Отмена", "Cancel", "Hủy")}
            </button>
            <button type="button" className="erpBtn primary" disabled={busy || !form.name?.trim()} onClick={() => void save()}>
              {T("Сохранить", "Save", "Lưu")}
            </button>
          </div>
        </section>
      ) : null}
      <section className="erpWoPanel">
        <div className="erpWoFilters">
          <input type="search" className="erpWoSearch" placeholder={T("Поиск…", "Search…", "Tìm…")} value={filters.reasonsQuery} onChange={(e) => set({ reasonsQuery: e.target.value })} aria-label={T("Поиск", "Search", "Tìm")} />
          <PeriodMenu filters={filters} set={set} from={from} to={to} />
          <DropMenu
            trigger={({ open, toggle }) => (
              <button type="button" className="erpFilterBtn" aria-expanded={open} onClick={toggle}>
                <span>+ {T("Фильтр", "Filter", "Bộ lọc")}</span>
                <Caret />
              </button>
            )}
          >
            {() => (
              <div className="erpDropList">
                <label className="erpDropItem">
                  <input type="checkbox" checked={filters.reasonsArchived} onChange={() => set({ reasonsArchived: !filters.reasonsArchived })} />
                  <span>{T("Архивные", "Archived", "Lưu trữ")}</span>
                </label>
              </div>
            )}
          </DropMenu>
          {filters.reasonsArchived ? (
            <div className="erpCond">
              <span className="erpCondName">{T("С архивными", "With archived", "Gồm lưu trữ")}</span>
              <button type="button" className="erpCondX" aria-label={T("Убрать фильтр", "Remove filter", "Bỏ lọc")} onClick={() => set({ reasonsArchived: false })}>
                ×
              </button>
            </div>
          ) : null}
        </div>
        <div className="erpWoTableWrap">
          <table className="erpWoTable" data-testid="wo-reasons-table">
            <thead>
              <tr>
                <th aria-sort={sortDesc ? "descending" : "ascending"}>
                  <button type="button" className="erpWoSort" onClick={() => setSortDesc(!sortDesc)}>
                    {T("Название", "Name", "Tên")}
                    <span aria-hidden>{sortDesc ? " ↓" : " ↑"}</span>
                  </button>
                </th>
                <th>{T("Блок в P&L", "P&L block", "Khối P&L")}</th>
                <th className="num">{T("Количество списаний", "Write-offs", "Số phiếu")}</th>
                <th className="num">{T("Стоимость продуктов", "Products cost", "Giá trị hàng")}</th>
                <th className="erpWoMenuCol" aria-label={T("Действия", "Actions", "Thao tác")} />
              </tr>
            </thead>
            <tbody>
              {!list.length ? (
                <tr>
                  <td colSpan={5} className="erpWoEmpty" data-testid="wo-reasons-empty">
                    {state.writeoffReasons.length && (q || hasArchived) ? (
                      <>
                        <strong>{T("Ничего не найдено", "Nothing found", "Không tìm thấy")}</strong>
                        <span>{T("Попробуйте изменить поиск или фильтры.", "Try changing the search or filters.", "Hãy đổi từ khóa hoặc bộ lọc.")}</span>
                      </>
                    ) : (
                      <>
                        <strong>{T("Причин пока нет", "No reasons yet", "Chưa có lý do")}</strong>
                        <span>{T("Добавьте причины: порча, истёк срок, проба, брак…", "Add reasons: spoiled, expired, tasting, defect…", "Thêm lý do: hư, hết hạn, thử món…")}</span>
                      </>
                    )}
                  </td>
                </tr>
              ) : (
                list.map((reason) => {
                  const s = stats.get(reason.id);
                  return (
                    <tr key={reason.id} className={reason.archived_at ? "cancelled" : ""} data-testid="wo-reason-row">
                      <td>
                        <ReasonMark reason={reason} />
                      </td>
                      <td>{pnlLabel(reason.pnl_block)}</td>
                      <td className="num">{!rows ? (error ? "—" : "…") : (s?.count ?? 0)}</td>
                      <td className="num erpWoAmount">{!rows ? (error ? "—" : "…") : vnd(s?.cost ?? 0)}</td>
                      <td className="erpWoMenuCol">
                        <DropMenu
                          align="right"
                          fixed
                          trigger={({ open, toggle }) => (
                            <button type="button" className="erpWoDots" aria-label={T("Действия с причиной", "Reason actions", "Thao tác")} aria-expanded={open} onClick={toggle} data-testid="wo-reason-menu">
                              ⋮
                            </button>
                          )}
                        >
                          {(close) => (
                            <div className="erpDropList">
                              <button
                                type="button"
                                className="erpDropAction"
                                onClick={() => {
                                  close();
                                  setForm({ ...reason });
                                }}
                              >
                                {T("Редактировать", "Edit", "Sửa")}
                              </button>
                              <button
                                type="button"
                                className={`erpDropAction ${reason.archived_at ? "" : "erpWoDanger"}`}
                                onClick={() => {
                                  close();
                                  void archive(reason, !reason.archived_at);
                                }}
                              >
                                {reason.archived_at ? T("Вернуть из архива", "Restore", "Khôi phục") : T("В архив", "Archive", "Lưu trữ")}
                              </button>
                            </div>
                          )}
                        </DropMenu>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="erpWoFoot">
          <span className="erpWoFound">
            {T("Найдено", "Found", "Tìm thấy")}: {list.length}
            {error ? ` · ${T("счётчики не загрузились", "counts did not load", "không tải được số liệu")}` : ` · ${T("счётчики — проведённые списания за период", "counts are completed write-offs of the period", "số liệu: phiếu đã ghi sổ trong kỳ")}`}
          </span>
          {error ? (
            <button type="button" className="erpLink" onClick={reload}>
              {T("Повторить", "Try again", "Thử lại")}
            </button>
          ) : null}
        </div>
      </section>
    </>
  );
}
