"use client";

import { Fragment, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { liveCatalogName } from "@/lib/erp/costing";
import { PROCESSING_LIST_PATH, PROCESSING_NEW_HREF, processingDocPath } from "@/lib/erp/processing";
import type { ErpDocument, ErpDocumentLine, ErpState } from "@/lib/erp/types";
import { vietnamNowTime } from "@/lib/orders/datetime";
import { StatusBadge } from "./docs";
import { useErp } from "./ErpShell";
import { DropMenu, MultiSelect } from "./filters";
import { MenuMobileNav, MENU_HREFS } from "./menuNav";
import { Pager, usePageSize } from "./Pager";
import { addDays, dateText, errorText, loadingText, NavLink, qtyText, statusLabel, T, today, unitOf, vnd, warehouseName } from "./ui";
import "./writeoffs.css";
import "./processing.css";

const STORE_KEY = "gastrofood-erp-processing";
const LIST_HREF = PROCESSING_LIST_PATH;
const NEW_HREF = PROCESSING_NEW_HREF;

type ColumnId = "source" | "result" | "comment";
type SortKey = "date" | "result" | "amount";
type PeriodId = "all" | "today" | "yesterday" | "week" | "days30" | "month" | "lastMonth" | "custom";

type Saved = {
  query: string;
  period: PeriodId;
  from: string;
  to: string;
  warehouses: string[];
  hidden: ColumnId[];
  sort: SortKey;
  desc: boolean;
};

const initial: Saved = {
  query: "",
  period: "days30",
  from: "",
  to: "",
  warehouses: [],
  hidden: [],
  sort: "date",
  desc: true,
};

const columns = (): { id: ColumnId; label: string }[] => [
  { id: "source", label: T("Исходные продукты", "Source products", "Nguyên liệu đầu") },
  { id: "result", label: T("Полученные продукты", "Result products", "Sản phẩm nhận") },
  { id: "comment", label: T("Комментарий", "Comment", "Ghi chú") },
];

const periodLabels = (): Record<PeriodId, string> => ({
  all: T("За всё время", "All time", "Toàn bộ"),
  today: T("Сегодня", "Today", "Hôm nay"),
  yesterday: T("Вчера", "Yesterday", "Hôm qua"),
  week: T("Последние 7 дней", "Last 7 days", "7 ngày qua"),
  days30: T("Последние 30 дней", "Last 30 days", "30 ngày qua"),
  month: T("Этот месяц", "This month", "Tháng này"),
  lastMonth: T("Прошлый месяц", "Last month", "Tháng trước"),
  custom: T("Свой период", "Custom range", "Tùy chọn"),
});

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
    case "days30":
      return [addDays(now, -29), now];
    case "month":
      return [`${y}-${m}-01`, now];
    case "lastMonth": {
      const end = addDays(`${y}-${m}-01`, -1);
      return [`${end.slice(0, 7)}-01`, end];
    }
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

function useProcessingDocs(from: string, to: string, enabled: boolean) {
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
      const response = await fetch(`/api/erp/processing?${params}`, { cache: "no-store" });
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
  sources: string[];
  result: string;
  amount: number | null;
  when: string;
};

function timeOf(doc: ErpDocument): string {
  if (doc.doc_time) return doc.doc_time.slice(0, 5);
  if (doc.occurred_at) {
    const at = new Date(doc.occurred_at);
    if (!Number.isNaN(at.getTime())) return vietnamNowTime(at);
  }
  return "";
}

function resultText(state: ErpState, doc: ErpDocument): string {
  if (!doc.output_product_id) return "";
  const name = liveCatalogName(state.products, doc.output_product_id);
  const qty = qtyText(doc.output_qty, unitOf(state, doc.output_product_id));
  return qty ? `${name} (${qty})` : name;
}

function sourceNames(state: ErpState, lines: ErpDocumentLine[]): string[] {
  return lines
    .filter((line) => line.product_id && line.qty > 0)
    .map((line) => liveCatalogName(state.products, line.product_id));
}

function buildRows(state: ErpState, documents: ErpDocument[]): Row[] {
  return documents.map((doc) => ({
    doc,
    warehouse: warehouseName(state, doc.warehouse_id),
    sources: sourceNames(state, doc.lines ?? []),
    result: resultText(state, doc),
    amount: doc.status === "posted" ? (doc.cost_known === false ? null : (doc.total_cost ?? null)) : null,
    when: `${doc.doc_date ?? ""} ${timeOf(doc)}`.trim(),
  }));
}

function sortValue(row: Row, key: SortKey): string | number {
  if (key === "amount") return row.amount ?? -1;
  if (key === "result") return row.result;
  return row.when;
}

function readSaved(): Saved {
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return initial;
    const parsed = JSON.parse(raw) as Partial<Saved>;
    return { ...initial, ...parsed, hidden: Array.isArray(parsed.hidden) ? parsed.hidden : [] };
  } catch {
    return initial;
  }
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

function downloadCsv(filename: string, header: string[], rows: string[][]) {
  const cell = (v: string) => (/[",;\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = [header.map(cell).join(","), ...rows.map((row) => row.map(cell).join(","))];
  const blob = new Blob([`\uFEFF${lines.join("\n")}`], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function ProcessingPage() {
  const { state, act } = useErp();
  const [saved, setSaved] = useState<Saved | null>(null);
  const [pageNo, setPageNo] = useState(0);
  const [pageSize, setPageSize] = usePageSize();
  const [open, setOpen] = useState<Set<string>>(new Set());

  useEffect(() => setSaved(readSaved()), []);
  useEffect(() => {
    if (saved) window.localStorage.setItem(STORE_KEY, JSON.stringify(saved));
  }, [saved]);

  const filters = saved ?? initial;
  const [from, to] = periodRange(filters);
  const { page: data, error, reload } = useProcessingDocs(from, to, Boolean(saved));
  const search = useDeferredValue(filters.query);

  const rows = useMemo(() => (state && data && saved ? buildRows(state, data.documents) : null), [state, data, saved]);
  const list = useMemo(() => {
    if (!rows) return [];
    const q = search.trim().toLowerCase();
    const wh = new Set(filters.warehouses);
    const out = rows.filter(
      (row) =>
        (!q || `${row.doc.doc_no ?? ""} ${row.result} ${row.sources.join(" ")} ${row.doc.comment ?? ""} ${row.warehouse}`.toLowerCase().includes(q)) &&
        (!wh.size || wh.has(row.doc.warehouse_id ?? "") || wh.has(row.doc.target_warehouse_id ?? "")),
    );
    const dir = filters.desc ? -1 : 1;
    return out.sort((a, b) => {
      const x = sortValue(a, filters.sort);
      const y = sortValue(b, filters.sort);
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * dir;
    });
  }, [rows, search, filters]);

  useEffect(() => setPageNo(0), [filters.query, filters.warehouses, filters.period, from, to, pageSize]);

  const set = (patch: Partial<Saved>) => setSaved((prev) => ({ ...(prev ?? initial), ...patch }));
  if (!state) return null;

  const shown = columns().filter((c) => !filters.hidden.includes(c.id));
  const colSpan = shown.length + 3;
  const pages = Math.max(1, Math.ceil(list.length / pageSize));
  const current = Math.min(pageNo, pages - 1);
  const pageRows = list.slice(current * pageSize, current * pageSize + pageSize);
  const anyFilter = Boolean(filters.query || filters.warehouses.length || filters.period !== "days30");

  const toggleSort = (key: SortKey) => set(filters.sort === key ? { desc: !filters.desc } : { sort: key, desc: key === "date" });
  const toggleOpen = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const cellText = (row: Row, id: ColumnId) => {
    if (id === "source") return row.sources.join(", ");
    if (id === "result") return row.result;
    return row.doc.comment ?? "";
  };

  const exportList = () => {
    const header = [T("Дата", "Date", "Ngày"), ...shown.map((c) => c.label), T("Статус", "Status", "Trạng thái"), "№"];
    const body = list.map((row) => [
      `${dateText(row.doc.doc_date)}${timeOf(row.doc) ? `, ${timeOf(row.doc)}` : ""}`,
      ...shown.map((c) => cellText(row, c.id)),
      statusLabel(row.doc.status ?? "draft"),
      row.doc.doc_no ?? "",
    ]);
    downloadCsv(`processing_${today()}`, header, body);
    void import("@/lib/erp/xlsx").then(({ downloadXlsx }) => downloadXlsx(`processing_${today()}`, T("Переработки", "Processing", "Chế biến"), header, body));
  };

  const deleteDraft = async (doc: ErpDocument) => {
    if (!doc.id || !window.confirm(T(`Удалить черновик ${doc.doc_no}?`, `Delete draft ${doc.doc_no}?`, `Xóa bản nháp ${doc.doc_no}?`))) return;
    if (await act({ action: "deleteDraft", id: doc.id }, T("Черновик удалён", "Draft deleted", "Đã xóa bản nháp"))) void reload();
  };
  const cancelDoc = async (doc: ErpDocument) => {
    if (!doc.id) return;
    const reason = window.prompt(
      T(
        `Отменить переработку ${doc.doc_no}? Остатки вернутся. Укажите причину:`,
        `Cancel processing ${doc.doc_no}? Stock is restored. Why is it cancelled?`,
        `Hủy chế biến ${doc.doc_no}? Tồn kho sẽ hoàn. Lý do:`,
      ),
    );
    if (!reason?.trim()) return;
    if (await act({ action: "cancelDocument", id: doc.id, reason }, T("Переработка отменена", "Processing cancelled", "Đã hủy chế biến"))) void reload();
  };

  const sectionMenu = (
    <DropMenu
      align="right"
      trigger={({ open: menuOpen, toggle }) => (
        <button type="button" className="erpWoDots big" aria-label={T("Действия", "Actions", "Thao tác")} aria-expanded={menuOpen} onClick={toggle} data-testid="proc-section-menu">
          ⋮
        </button>
      )}
    >
      {(close) => (
        <div className="erpDropList">
          <p className="erpDropTitle">{T("Отображать столбцы:", "Show columns:", "Hiện cột:")}</p>
          {columns().map((c) => (
            <label key={c.id} className="erpDropItem">
              <input type="checkbox" checked={!filters.hidden.includes(c.id)} onChange={() => set({ hidden: filters.hidden.includes(c.id) ? filters.hidden.filter((h) => h !== c.id) : [...filters.hidden, c.id] })} />
              <span>{c.label}</span>
            </label>
          ))}
          <button type="button" className="erpDropAction" disabled={!filters.hidden.length} onClick={() => set({ hidden: [] })}>
            {T("Сбросить до стандартных", "Reset to default", "Về mặc định")}
          </button>
          <hr />
          <button
            type="button"
            className="erpDropAction"
            disabled={!list.length}
            data-testid="docs-export"
            onClick={() => {
              close();
              exportList();
            }}
          >
            {T("Экспорт", "Export", "Xuất")}
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

  const rowMenu = (doc: ErpDocument) => (
    <DropMenu
      align="right"
      fixed
      trigger={({ open: menuOpen, toggle }) => (
        <button type="button" className="erpPackDots" aria-label={T("Действия с документом", "Document actions", "Thao tác")} aria-expanded={menuOpen} onClick={toggle} data-testid="proc-row-menu">
          ⋮
        </button>
      )}
    >
      {(close) => (
        <div className="erpDropList">
          <NavLink href={processingDocPath(doc.id ?? "")} className="erpDropAction">
            {doc.status === "draft" ? T("Редактировать", "Edit", "Sửa") : T("Открыть", "Open", "Mở")}
          </NavLink>
          <NavLink href={`${NEW_HREF}?copy=${doc.id}`} className="erpDropAction">
            {T("Копировать", "Copy", "Sao chép")}
          </NavLink>
          {doc.status === "draft" ? (
            <button
              type="button"
              className="erpDropAction erpDanger"
              onClick={() => {
                close();
                void deleteDraft(doc);
              }}
            >
              {T("Удалить", "Delete", "Xóa")}
            </button>
          ) : doc.status === "posted" ? (
            <button
              type="button"
              className="erpDropAction erpDanger"
              onClick={() => {
                close();
                void cancelDoc(doc);
              }}
            >
              {T("Отменить…", "Cancel…", "Hủy…")}
            </button>
          ) : null}
        </div>
      )}
    </DropMenu>
  );

  return (
    <div className="erpMenu erpWo erpProc">
      <div className="erpWoHead">
        <h1>
          {T("Переработки", "Processing", "Chế biến")}
          {rows ? <span className="erpProcCount">{rows.length}</span> : null}
        </h1>
        <div className="erpWoHeadActions">
          <button type="button" className="erpSr" data-testid="docs-export" disabled={!list.length} onClick={exportList}>
            {T("Экспорт", "Export", "Xuất")}
          </button>
          {sectionMenu}
          {add}
        </div>
      </div>
      <MenuMobileNav active={MENU_HREFS.processing} />
      <section className="erpWoPanel">
        <div className="erpWoFilters">
          <input
            type="search"
            className="erpWoSearch"
            placeholder={T("Поиск…", "Search…", "Tìm…")}
            value={filters.query}
            onChange={(e) => set({ query: e.target.value })}
            aria-label={T("Поиск", "Search", "Tìm")}
            data-testid="docs-search"
          />
          <PeriodMenu filters={filters} set={set} from={from} to={to} />
          <MultiSelect label={T("Склад", "Location", "Kho")} options={state.warehouses.filter((w) => !w.archived_at).map((w) => ({ id: w.id, label: w.name }))} value={filters.warehouses} onChange={(warehouses) => set({ warehouses })} />
          {anyFilter ? (
            <button type="button" className="erpLink erpWoReset" onClick={() => set({ query: "", period: "days30", from: "", to: "", warehouses: [] })}>
              {T("Сбросить", "Reset", "Đặt lại")}
            </button>
          ) : null}
        </div>
        {data?.more ? (
          <p className="erpWoNote">{T("Показаны 1000 последних документов периода — выберите период короче.", "Showing the latest 1000 of the period — choose a shorter period.", "Chỉ hiện 1000 phiếu mới nhất — hãy chọn kỳ ngắn hơn.")}</p>
        ) : null}
        <div className="erpWoTableWrap">
          <table className="erpWoTable" data-testid="proc-table">
            <thead>
              <tr>
                <th className="erpWoExpandCol" aria-label={T("Раскрыть", "Expand", "Mở rộng")} />
                <th aria-sort={filters.sort === "date" ? (filters.desc ? "descending" : "ascending") : undefined} className="erpWoDateCol">
                  <button type="button" className="erpWoSort" onClick={() => toggleSort("date")}>
                    {T("Дата", "Date", "Ngày")}
                    {filters.sort === "date" ? <span aria-hidden>{filters.desc ? " ↓" : " ↑"}</span> : null}
                  </button>
                </th>
                {shown.map((c) => (
                  <th key={c.id}>{c.label}</th>
                ))}
                <th className="erpPackActs" aria-label={T("Действия", "Actions", "Thao tác")} />
              </tr>
            </thead>
            <tbody>
              {!rows ? (
                <tr>
                  <td colSpan={colSpan} className="erpWoEmpty">
                    {error ? (
                      <>
                        <strong>{T("Не удалось загрузить переработки", "Could not load processing", "Không tải được chế biến")}</strong>
                        <span>{error}</span>
                        <button type="button" className="erpBtn" onClick={() => void reload()}>
                          {T("Повторить", "Try again", "Thử lại")}
                        </button>
                      </>
                    ) : (
                      loadingText()
                    )}
                  </td>
                </tr>
              ) : !pageRows.length ? (
                <tr>
                  <td colSpan={colSpan} className="erpWoEmpty" data-testid="proc-empty">
                    {!rows.length && filters.period === "all" ? (
                      <>
                        <strong>{T("Здесь будут переработки", "Processing documents will appear here", "Chứng từ chế biến sẽ hiện ở đây")}</strong>
                        <span>
                          {T(
                            "Переработка списывает исходные продукты и приходует полученные. Если это тех. карта или полуфабрикат — состав берётся из текущей карточки.",
                            "Processing writes off source products and receives the result. For a recipe or prep, ingredients come from the current tech card.",
                            "Chế biến trừ nguyên liệu đầu và nhập thành phẩm. Công thức lấy từ thẻ kỹ thuật hiện tại.",
                          )}
                        </span>
                      </>
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
                      <tr className={`${expanded ? "open" : ""} ${doc.status === "cancelled" ? "cancelled" : ""}`} data-testid="proc-row">
                        <td className="erpWoExpandCol">
                          <button type="button" className="erpWoExpand" aria-expanded={expanded} aria-label={T("Состав переработки", "Processing lines", "Chi tiết")} onClick={() => toggleOpen(id)}>
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
                        {shown.map((c) => (
                          <td key={c.id} className="erpWoClip" title={cellText(row, c.id)}>
                            {cellText(row, c.id) || "—"}
                          </td>
                        ))}
                        <td className="erpPackActs">
                          <NavLink href={processingDocPath(id)} className="erpBtn primary erpPackOpen" data-testid="proc-open">
                            {T("Открыть", "Open", "Mở")}
                          </NavLink>
                          {rowMenu(doc)}
                        </td>
                      </tr>
                      {expanded ? (
                        <tr className="erpWoDetailRow">
                          <td colSpan={colSpan}>
                            <Detail state={state} row={row} />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="erpWoFoot">
          <Pager total={list.length} page={current} pages={pages} pageSize={pageSize} onPage={setPageNo} onPageSize={setPageSize} />
        </div>
      </section>
    </div>
  );
}

function PeriodMenu({ filters, set, from, to }: { filters: Saved; set: (patch: Partial<Saved>) => void; from: string; to: string }) {
  return (
    <DropMenu
      trigger={({ open, toggle }) => (
        <button type="button" className={`erpFilterBtn ${filters.period !== "all" ? "on" : ""}`} aria-expanded={open} onClick={toggle} data-testid="proc-period">
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

function Detail({ state, row }: { state: ErpState; row: Row }) {
  const doc = row.doc;
  const lines = (doc.lines ?? []).filter((line) => line.product_id);
  const posted = doc.status === "posted" || doc.status === "cancelled";
  return (
    <div className="erpWoDetail erpProcDetail" data-testid="proc-detail">
      <dl className="erpWoFacts">
        <div>
          <dt>{T("Документ", "Document", "Chứng từ")}</dt>
          <dd>{doc.doc_no}</dd>
        </div>
        <div>
          <dt>{T("Статус", "Status", "Trạng thái")}</dt>
          <dd>
            <StatusBadge status={doc.status} />
          </dd>
        </div>
        <div>
          <dt>{T("Склад сырья", "Ingredients from", "Kho nguyên liệu")}</dt>
          <dd>{warehouseName(state, doc.warehouse_id)}</dd>
        </div>
        <div>
          <dt>{T("Склад готового", "Result location", "Kho thành phẩm")}</dt>
          <dd>{warehouseName(state, doc.target_warehouse_id)}</dd>
        </div>
        {doc.comment ? (
          <div className="wide">
            <dt>{T("Комментарий", "Comment", "Ghi chú")}</dt>
            <dd>{doc.comment}</dd>
          </div>
        ) : null}
      </dl>
      <div className="erpProcDetailGrid">
        <div>
          <h3>{T("Исходные продукты", "Source products", "Nguyên liệu đầu")}</h3>
          {!lines.length ? (
            <p className="erpWoMuted">{T("Нет строк.", "No lines.", "Không có dòng.")}</p>
          ) : (
            <ul className="erpList">
              {lines.map((line, index) => (
                <li key={line.id ?? index}>
                  <span>{liveCatalogName(state.products, line.product_id)}</span>
                  <span>{qtyText(line.qty, unitOf(state, line.product_id))}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3>{T("Полученные продукты", "Result products", "Sản phẩm nhận")}</h3>
          <ul className="erpList">
            <li>
              <span>{row.result || "—"}</span>
              <span>{posted && doc.cost_known ? vnd(doc.total_cost) : posted && doc.cost_known === false ? T("неполная", "incomplete", "chưa đủ") : "100%"}</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
