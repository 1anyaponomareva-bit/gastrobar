"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { CountListItem, CountLogic } from "@/lib/erp/inventoryUi";
import { fetchCountList } from "@/lib/erp/inventoryUi";
import { StatusBadge, docHref } from "./docs";
import { useErp } from "./ErpShell";
import { DropMenu, MultiSelect } from "./filters";
import { Pager, PAGE } from "./StockBalances";
import { StockMobileNav } from "./stockNav";
import { addDays, dateText, dateTimeText, Empty, errorText, loadingText, NavLink, PageHead, T, today, vnd, warehouseName } from "./ui";

const STORE_KEY = "gastrofood-erp-inventory";

type ColumnId = "warehouse" | "periodStart" | "postedAt" | "type" | "result" | "status";
type SortKey = ColumnId;
type PeriodId = "all" | "today" | "yesterday" | "week" | "days30" | "month" | "lastMonth" | "custom";
type ExtraId = "type" | "status";

type Saved = {
  warehouses: string[];
  extras: ExtraId[];
  types: string[];
  statuses: string[];
  period: PeriodId;
  from: string;
  to: string;
  hidden: ColumnId[];
  sort: SortKey;
  desc: boolean;
};

const initial: Saved = {
  warehouses: [],
  extras: [],
  types: [],
  statuses: [],
  period: "all",
  from: "",
  to: "",
  hidden: [],
  sort: "postedAt",
  desc: true,
};

const columns = (): { id: ColumnId; label: string; num?: boolean; sort?: SortKey }[] => [
  { id: "warehouse", label: T("Склад", "Location", "Kho"), sort: "warehouse" },
  { id: "periodStart", label: T("Начало периода", "Period start", "Đầu kỳ"), sort: "periodStart" },
  { id: "postedAt", label: T("Дата и время проведения", "Posted at", "Ngày giờ kiểm kê"), sort: "postedAt" },
  { id: "type", label: T("Тип", "Type", "Loại"), sort: "type" },
  { id: "result", label: T("Результат", "Result", "Kết quả"), num: true, sort: "result" },
  { id: "status", label: T("Статус", "Status", "Trạng thái"), sort: "status" },
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

const extraLabels = (): Record<ExtraId, string> => ({
  type: T("Тип", "Type", "Loại"),
  status: T("Статус", "Status", "Trạng thái"),
});

const typeLabel = (mode: string) => (mode === "partial" ? T("Частичная", "Partial", "Một phần") : T("Полная", "Full", "Toàn bộ"));

const countStatusLabel = (status: string) =>
  status === "posted"
    ? T("Проведённая", "Posted", "Đã ghi sổ")
    : status === "editing"
      ? T("На редактировании", "Being edited", "Đang sửa")
      : status === "cancelled"
        ? T("Отменённая", "Cancelled", "Đã hủy")
        : T("Открытая", "Open", "Đang mở");

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
    case "days30":
      return [addDays(now, -29), now];
    case "month":
      return [`${y}-${m}-01`, now];
    case "lastMonth": {
      const first = `${y}-${m}-01`;
      const end = addDays(first, -1);
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

type Page = { documents: CountListItem[]; more: boolean; logic: CountLogic };
const cache = new Map<string, Page & { docsVersion: number }>();

function useCounts(from: string, to: string) {
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
      const data = await fetchCountList(from, to);
      if (id !== request.current) return;
      cache.set(key, { ...data, docsVersion });
      setPage(data);
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

const sortValue = (row: CountListItem, key: SortKey, warehouse: string): string | number => {
  switch (key) {
    case "warehouse":
      return warehouse.toLowerCase();
    case "periodStart":
      return row.period_start ?? "";
    case "postedAt":
      return row.posted_at ?? row.counted_at ?? row.created_at ?? "";
    case "type":
      return row.mode;
    case "result":
      return row.result_amount ?? -Infinity;
    case "status":
      return row.status;
  }
};

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

const countHref = (id: string) => `/erp/stock/counts/${id}`;

export function InventoryPage() {
  const { state } = useErp();
  const [saved, setSaved] = useState<Saved | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPageNo] = useState(0);

  useEffect(() => setSaved(readSaved()), []);
  useEffect(() => {
    if (saved) window.localStorage.setItem(STORE_KEY, JSON.stringify(saved));
  }, [saved]);

  const filters = saved ?? initial;
  const [from, to] = periodRange(filters);
  const { page: data, error, reload } = useCounts(saved ? from : "", saved ? to : "");
  const search = useDeferredValue(query);

  const rows = data && saved ? data.documents : null;
  const list = useMemo(() => {
    if (!rows || !state) return [];
    const q = search.trim().toLowerCase();
    const wh = new Set(filters.warehouses);
    const types = new Set(filters.extras.includes("type") ? filters.types : []);
    const statuses = new Set(filters.extras.includes("status") ? filters.statuses : []);
    const out = rows.filter((row) => {
      const warehouse = row.warehouse_id ? warehouseName(state, row.warehouse_id) : "";
      const day = (row.posted_at ?? row.counted_at ?? row.created_at ?? "").slice(0, 10);
      return (
        (!q || `${row.doc_no ?? ""} ${warehouse} ${typeLabel(row.mode)} ${countStatusLabel(row.status)} ${row.comment}`.toLowerCase().includes(q)) &&
        (!wh.size || wh.has(row.warehouse_id ?? "")) &&
        (!types.size || types.has(row.mode)) &&
        (!statuses.size || statuses.has(row.status)) &&
        (!from || day >= from) &&
        (!to || day <= to)
      );
    });
    const dir = filters.desc ? -1 : 1;
    return out.sort((a, b) => {
      const x = sortValue(a, filters.sort, a.warehouse_id ? warehouseName(state, a.warehouse_id) : "");
      const y = sortValue(b, filters.sort, b.warehouse_id ? warehouseName(state, b.warehouse_id) : "");
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * dir;
    });
  }, [rows, search, filters, state, from, to]);

  useEffect(() => setPageNo(0), [query, filters.warehouses, filters.types, filters.statuses, filters.extras, from, to]);

  if (!state) return null;
  const set = (patch: Partial<Saved>) => setSaved((prev) => ({ ...(prev ?? initial), ...patch }));
  const shown = columns().filter((c) => !filters.hidden.includes(c.id));
  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  const current = Math.min(page, pages - 1);
  const pageRows = list.slice(current * PAGE, current * PAGE + PAGE);
  const anyFilter = Boolean(query || filters.warehouses.length || filters.extras.length);

  const toggleSort = (key: SortKey) => set(filters.sort === key ? { desc: !filters.desc } : { sort: key, desc: key === "postedAt" || key === "result" });

  const cellText = (row: CountListItem, id: ColumnId): string => {
    switch (id) {
      case "warehouse":
        return row.warehouse_id ? warehouseName(state, row.warehouse_id) : "";
      case "periodStart":
        return row.period_start ? dateTimeText(row.period_start) : "";
      case "postedAt":
        return row.posted_at ? dateTimeText(row.posted_at) : row.counted_at ? dateTimeText(row.counted_at) : "";
      case "type":
        return typeLabel(row.mode);
      case "result":
        return row.result_amount === null ? "" : String(Math.round(row.result_amount));
      case "status":
        return countStatusLabel(row.status);
    }
  };

  const exportCsv = () => {
    const cell = (v: string) => (/[",;\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const lines = [shown.map((c) => cell(c.label)).join(","), ...list.map((row) => shown.map((c) => cell(cellText(row, c.id))).join(","))];
    const blob = new Blob([`\uFEFF${lines.join("\n")}`], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `inventories_${today()}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
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
          <p className="erpDropTitle">{T("Отображать столбцы:", "Show columns:", "Hiện cột:")}</p>
          {columns().map((c) => (
            <label key={c.id} className="erpDropItem">
              <input type="checkbox" checked={!filters.hidden.includes(c.id)} onChange={() => set({ hidden: filters.hidden.includes(c.id) ? filters.hidden.filter((h) => h !== c.id) : [...filters.hidden, c.id] })} />
              <span>{c.label}</span>
            </label>
          ))}
          <hr />
          <button type="button" className="erpDropAction" onClick={() => set({ hidden: [] })}>
            {T("Вернуть по умолчанию", "Reset to default", "Mặc định")}
          </button>
        </div>
      )}
    </DropMenu>
  );

  const periodMenu = (
    <DropMenu
      align="right"
      trigger={({ open: menuOpen, toggle }) => (
        <button type="button" className={`erpHeadBtn ${filters.period !== "all" ? "on" : ""}`} aria-expanded={menuOpen} onClick={toggle} data-testid="inventory-period">
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
        <button type="button" className="erpHeadBtn" onClick={() => window.print()}>
          {T("Печать", "Print", "In")}
        </button>
      </div>
      {periodMenu}
      <NavLink href="/erp/stock/counts/new" className="erpBtn primary">
        {T("Добавить", "Add", "Thêm")}
      </NavLink>
    </div>
  );

  const extraChip = (id: ExtraId) => {
    const remove = () => set({ extras: filters.extras.filter((e) => e !== id) });
    return (
      <div key={id} className="erpCondMulti">
        <MultiSelect
          label={extraLabels()[id]}
          options={
            id === "type"
              ? [
                  { id: "full", label: typeLabel("full") },
                  { id: "partial", label: typeLabel("partial") },
                ]
              : [
                  { id: "draft", label: countStatusLabel("draft") },
                  { id: "posted", label: countStatusLabel("posted") },
                  { id: "editing", label: countStatusLabel("editing") },
                  { id: "cancelled", label: countStatusLabel("cancelled") },
                ]
          }
          value={id === "type" ? filters.types : filters.statuses}
          onChange={(value) => set(id === "type" ? { types: value } : { statuses: value })}
        />
        <button type="button" className="erpCondX" aria-label={T("Убрать фильтр", "Remove filter", "Bỏ lọc")} onClick={remove}>
          ×
        </button>
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
          <p className="erpDropTitle">{T("Показать только те, в которых:", "Show only those where:", "Chỉ hiện khi:")}</p>
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
    <th key={c.id} className={`erpInvC-${c.id} ${c.num ? "num" : ""}`} aria-sort={c.sort && filters.sort === c.sort ? (filters.desc ? "descending" : "ascending") : undefined}>
      {c.sort ? (
        <button type="button" className="erpSortBtn" onClick={() => toggleSort(c.sort as SortKey)}>
          {c.label}
          {filters.sort === c.sort ? <span aria-hidden>{filters.desc ? " v" : " ^"}</span> : null}
        </button>
      ) : (
        c.label
      )}
    </th>
  );

  const cell = (row: CountListItem, id: ColumnId) => {
    switch (id) {
      case "warehouse":
        return (
          <td key={id} className="erpInvC-warehouse">
            {row.warehouse_id ? warehouseName(state, row.warehouse_id) : "—"}
          </td>
        );
      case "periodStart":
        return (
          <td key={id} className="erpInvC-period">
            {row.period_start ? dateTimeText(row.period_start) : "—"}
          </td>
        );
      case "postedAt":
        return (
          <td key={id} className="erpInvC-posted">
            {row.status === "posted" || row.status === "editing" ? dateTimeText(row.posted_at ?? row.counted_at) : "—"}
          </td>
        );
      case "type":
        return (
          <td key={id} className="erpInvC-type">
            {typeLabel(row.mode)}
          </td>
        );
      case "result":
        return (
          <td key={id} className="erpInvC-result num">
            {row.result_amount === null ? "—" : row.result_known === false ? <span className="erpBadge warn">{T("цена неизвестна", "price unknown", "chưa rõ giá")}</span> : vnd(row.result_amount)}
          </td>
        );
      case "status":
        return (
          <td key={id} className="erpInvC-status">
            <StatusBadge status={row.status === "editing" ? "draft" : row.status} />
            <span className="erpInvStatusText">{countStatusLabel(row.status)}</span>
          </td>
        );
    }
  };

  return (
    <div className="erpInv">
      <PageHead
        title={
          <>
            {T("Инвентаризации", "Stock counts", "Kiểm kê")} {rows ? <span className="erpHeadCount">{list.length}</span> : null}
          </>
        }
        actions={actions}
      />
      <StockMobileNav active="/erp/stock/counts" />

      <section className="erpInvInfo erpNoPrint" data-testid="inventory-info">
        <div className="erpInvInfoIcon" aria-hidden>
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M8 4h8a2 2 0 0 1 2 2v14H6V6a2 2 0 0 1 2-2z" />
            <path d="M8 4v2h8V4M9 12h6M9 16h4" />
          </svg>
        </div>
        <div>
          <h2>{T("Проведите инвентаризацию", "Run a stock count", "Hãy kiểm kê")}</h2>
          <p>
            {T(
              "Инвентаризация — это проверка остатков на складе. Проводите полную инвентаризацию минимум каждые 2 месяца, чтобы узнать, сходится ли количество и сумма продуктов с учётом всех продаж.",
              "A stock count checks warehouse balances. Run a full count at least every two months to see if quantity and value match recorded sales.",
              "Kiểm kê là đối chiếu tồn kho. Nên kiểm kê toàn bộ ít nhất mỗi 2 tháng.",
            )}
          </p>
        </div>
      </section>

      <section className="erpPanel erpInvPanel">
        <div className="erpFilters erpNoPrint">
          <input type="search" className="erpSearch" placeholder={T("Быстрый поиск", "Quick search", "Tìm nhanh")} value={query} onChange={(e) => setQuery(e.target.value)} />
          <MultiSelect label={T("Склад", "Location", "Kho")} options={state.warehouses.filter((w) => !w.archived_at).map((w) => ({ id: w.id, label: w.name }))} value={filters.warehouses} onChange={(warehouses) => set({ warehouses })} emptyLabel={T("Склад", "Location", "Kho")} />
          {filters.extras.map(extraChip)}
          {addFilter}
          {anyFilter ? (
            <button
              type="button"
              className="erpLink"
              onClick={() => {
                setQuery("");
                set({ warehouses: [], extras: [], types: [], statuses: [] });
              }}
            >
              {T("Сбросить всё", "Reset all", "Đặt lại")}
            </button>
          ) : null}
        </div>

        {error ? (
          <Empty
            kind="error"
            title={T("Не удалось загрузить инвентаризации", "Could not load stock counts", "Không tải được kiểm kê")}
            text={error}
            action={
              <button type="button" className="erpBtn" onClick={() => void reload()}>
                {T("Повторить", "Try again", "Thử lại")}
              </button>
            }
          />
        ) : !rows ? (
          <div className="erpLoading">{loadingText()}</div>
        ) : (
          <>
            {data?.more ? (
              <p className="erpScope erpNoPrint">
                {T("Показаны 300 последних документов периода — выберите период короче.", "Showing the latest 300 documents of the period — choose a shorter period.", "Chỉ hiện 300 phiếu mới nhất — hãy chọn kỳ ngắn hơn.")}
              </p>
            ) : null}
            <div className="erpTableWrap erpPrintArea">
              <h2 className="erpPrintOnly">
                {T("Инвентаризации", "Stock counts", "Kiểm kê")} · {periodTitle(filters)}
              </h2>
              <table className="erpTable erpInvTable">
                <thead>
                  <tr>
                    {shown.map(head)}
                    <th className="erpInvActions erpNoPrint" aria-label={T("Действия", "Actions", "Thao tác")} />
                  </tr>
                </thead>
                <tbody>
                  {!pageRows.length ? (
                    <tr>
                      <td colSpan={shown.length + 1} className="erpInvEmpty">
                        {rows.length || anyFilter || filters.period !== "all" ? (
                          T("Ничего не найдено. Попробуйте изменить поиск, фильтры или период.", "Nothing found. Try changing the search, filters or period.", "Không tìm thấy. Hãy đổi từ khóa, bộ lọc hoặc kỳ.")
                        ) : (
                          <div>
                            <h2>{T("Здесь будут инвентаризации", "Stock counts will appear here", "Các lần kiểm kê sẽ hiện ở đây")}</h2>
                            <p>
                              {T(
                                "Создавайте склады и проверяйте остатки продуктов, которые на них хранятся. Система покажет излишки или недостачи и поможет найти причины расхождений.",
                                "Create locations and count the products stored there. The system will show surplus or shortage and help find the cause.",
                                "Tạo kho và kiểm tồn. Hệ thống sẽ hiện thừa/thiếu và giúp tìm nguyên nhân.",
                              )}
                            </p>
                          </div>
                        )}
                      </td>
                    </tr>
                  ) : (
                    pageRows.map((row) => (
                      <tr key={row.id} data-testid="inventory-row">
                        {shown.map((c) => cell(row, c.id))}
                        <td className="erpInvActions erpNoPrint">
                          <NavLink href={countHref(row.id)} className="erpLink">
                            {row.status === "draft" || row.status === "editing" ? T("Открыть", "Open", "Mở") : T("Посмотреть", "View", "Xem")}
                          </NavLink>
                          <DropMenu
                            align="right"
                            fixed
                            trigger={({ open: menuOpen, toggle }) => (
                              <button type="button" className="erpRcDots" aria-label={T("Ещё", "More", "Thêm")} aria-expanded={menuOpen} onClick={toggle}>
                                ⋯
                              </button>
                            )}
                          >
                            {() => (
                              <div className="erpDropList">
                                <NavLink href={countHref(row.id)} className="erpDropAction">
                                  {T("Открыть документ", "Open document", "Mở chứng từ")}
                                </NavLink>
                                <NavLink href={docHref({ id: row.id, doc_type: "count" })} className="erpDropAction">
                                  {T("Печать листа", "Print sheet", "In phiếu")}
                                </NavLink>
                              </div>
                            )}
                          </DropMenu>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {pages > 1 ? (
              <div className="erpNoPrint">
                <Pager total={list.length} page={current} pages={pages} onPage={setPageNo} />
              </div>
            ) : null}
            {data?.logic === "documents-fallback" ? (
              <p className="erpScope erpNoPrint">
                {T(
                  "Список читает документы type=count. Период, результат FIFO и статусы «на редактировании» появятся из /api/erp/counts, когда логика будет влита.",
                  "The list reads type=count documents. Period, FIFO result and “being edited” will come from /api/erp/counts once logic is merged.",
                  "Danh sách đọc chứng từ type=count. Kỳ và kết quả FIFO sẽ đến từ /api/erp/counts.",
                )}
              </p>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
