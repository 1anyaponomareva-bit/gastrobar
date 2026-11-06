"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { downloadDocumentExport } from "./docs";
import { useErp } from "./ErpShell";
import { DropMenu } from "./filters";
import { POSTER_VENUES } from "./menuFields";
import { MenuMobileNav } from "./menuNav";
import { Pager, PAGE } from "./StockBalances";
import { NavLink, PageHead, T, today } from "./ui";

export function notImplemented(what?: string) {
  const base = T("Не реализовано", "Not implemented", "Chưa làm");
  return what ? `${base}: ${what}` : base;
}

export const Caret = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden>
    <path d="M7 10l5 5 5-5z" />
  </svg>
);

export function StubFilter({ label }: { label: string }) {
  const { notify } = useErp();
  return (
    <button type="button" className="erpFilterBtn" onClick={() => notify({ ok: false, text: notImplemented(label) })}>
      <span>{label}</span>
      <Caret />
    </button>
  );
}

/** Poster: one venue, radio, cannot clear. No ERP field yet — choosing a name does not filter. */
export function VenueStubFilter() {
  const { notify } = useErp();
  const label = T("Заведение", "Venue", "Cơ sở");
  return (
    <DropMenu
      trigger={({ open, toggle }) => (
        <button type="button" className="erpFilterBtn" aria-expanded={open} onClick={toggle}>
          <span>{label}</span>
          <Caret />
        </button>
      )}
    >
      {(close) => (
        <div className="erpDropList">
          {POSTER_VENUES.map((venue) => (
            <button
              key={venue.id}
              type="button"
              className="erpDropAction"
              onClick={() => {
                close();
                notify({ ok: false, text: notImplemented(label) });
              }}
            >
              {venue.label}
            </button>
          ))}
        </div>
      )}
    </DropMenu>
  );
}

export type CatalogColumn<Row> = {
  id: string;
  label: string;
  num?: boolean;
  sort?: boolean;
  cell: (row: Row) => ReactNode;
  text: (row: Row) => string;
};

type Saved = { hidden: string[]; sort: string; desc: boolean };

function readSaved(key: string, fallback: Saved): Saved {
  try {
    return { ...fallback, ...(JSON.parse(window.localStorage.getItem(key) ?? "{}") as Partial<Saved>) };
  } catch {
    return fallback;
  }
}

export function CatalogTable<Row extends { id: string }>({
  storeKey,
  activeHref,
  title,
  columns,
  rows,
  query,
  onQuery,
  searchPlaceholder,
  filterBar,
  addHref,
  addLabel,
  onAdd,
  extraActions,
  moreItems,
  rowHref,
  rowMenu,
  onTrash,
  catalogEmpty,
  emptyTitle,
  emptyText,
  emptyAction,
  note,
  defaultSort = "name",
  defaultDesc = false,
  sheetName,
}: {
  storeKey: string;
  activeHref: string;
  title: string;
  columns: CatalogColumn<Row>[];
  rows: Row[];
  query: string;
  onQuery: (value: string) => void;
  searchPlaceholder: string;
  filterBar?: ReactNode;
  addHref?: string;
  addLabel?: string;
  onAdd?: () => void;
  extraActions?: ReactNode;
  moreItems?: (close: () => void) => ReactNode;
  rowHref?: (row: Row) => string;
  rowMenu?: (row: Row, close: () => void) => ReactNode;
  onTrash?: (ids: string[]) => void | Promise<void>;
  /** True when the catalog itself has no rows (before search/filters). */
  catalogEmpty?: boolean;
  emptyTitle: string;
  emptyText?: ReactNode;
  emptyAction?: ReactNode;
  note?: ReactNode;
  defaultSort?: string;
  defaultDesc?: boolean;
  sheetName: string;
}) {
  const { notify, busy } = useErp();
  const router = useRouter();
  const initial = useMemo<Saved>(() => ({ hidden: [], sort: defaultSort, desc: defaultDesc }), [defaultSort, defaultDesc]);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => setSaved(readSaved(storeKey, initial)), [storeKey, initial]);
  useEffect(() => {
    if (saved) window.localStorage.setItem(storeKey, JSON.stringify(saved));
  }, [saved, storeKey]);

  const filters = saved ?? initial;
  const set = (patch: Partial<Saved>) => setSaved((prev) => ({ ...(prev ?? initial), ...patch }));
  const shown = columns.filter((c) => !filters.hidden.includes(c.id));
  const sortCol = shown.find((c) => c.id === filters.sort) ?? columns.find((c) => c.id === filters.sort);
  const sorted = useMemo(() => {
    const dir = filters.desc ? -1 : 1;
    const list = [...rows];
    if (!sortCol) return list;
    return list.sort((a, b) => {
      const x = sortCol.text(a);
      const y = sortCol.text(b);
      const nx = Number(x.replace(/\s/g, "").replace(",", "."));
      const ny = Number(y.replace(/\s/g, "").replace(",", "."));
      if (sortCol.num && Number.isFinite(nx) && Number.isFinite(ny)) return (nx - ny) * dir;
      return x.localeCompare(y, undefined, { numeric: true, sensitivity: "base" }) * dir;
    });
  }, [rows, sortCol, filters.desc]);

  useEffect(() => setPage(0), [query, rows.length, filters.sort, filters.desc]);

  const pages = Math.max(1, Math.ceil(sorted.length / PAGE));
  const current = Math.min(page, pages - 1);
  const pageRows = sorted.slice(current * PAGE, current * PAGE + PAGE);
  const allOnPage = pageRows.length > 0 && pageRows.every((row) => selected.has(row.id));

  const toggleSort = (id: string) => set(filters.sort === id ? { desc: !filters.desc } : { sort: id, desc: false });
  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const togglePage = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPage) pageRows.forEach((row) => next.delete(row.id));
      else pageRows.forEach((row) => next.add(row.id));
      return next;
    });
  };

  const exportList = () => {
    if (!sorted.length) return;
    downloadDocumentExport(`${sheetName}_${today()}`, sheetName, shown.map((c) => c.label), sorted.map((row) => shown.map((c) => c.text(row))));
  };

  const trash = () => {
    if (!onTrash) {
      notify({ ok: false, text: notImplemented(T("Корзина", "Trash", "Thùng rác")) });
      return;
    }
    if (!selected.size) {
      notify({ ok: false, text: T("Выберите позиции", "Select items first", "Hãy chọn dòng") });
      return;
    }
    void onTrash([...selected]);
    setSelected(new Set());
  };

  const addButton = addHref ? (
    <NavLink href={addHref} className="erpBtn primary">
      {addLabel ?? T("Добавить", "Add", "Thêm")}
    </NavLink>
  ) : onAdd ? (
    <button type="button" className="erpBtn primary" onClick={onAdd}>
      {addLabel ?? T("Добавить", "Add", "Thêm")}
    </button>
  ) : null;

  const columnsMenu = (
    <DropMenu
      align="right"
      trigger={({ open, toggle }) => (
        <button type="button" className="erpHeadBtn" aria-expanded={open} onClick={toggle}>
          {T("Столбцы", "Columns", "Cột")}+
          <Caret />
        </button>
      )}
    >
      {() => (
        <div className="erpDropList">
          {columns.map((c) => (
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

  const moreMenu = (
    <DropMenu
      align="right"
      trigger={({ open, toggle }) => (
        <button type="button" className="erpHeadBtn" aria-label={T("Ещё", "More", "Thêm")} aria-expanded={open} onClick={toggle}>
          ⋯
        </button>
      )}
    >
      {(close) => (
        <div className="erpDropList">
          {moreItems ? moreItems(close) : null}
          <button
            type="button"
            className="erpDropAction"
            onClick={() => {
              close();
              notify({ ok: false, text: notImplemented(T("Импорт", "Import", "Nhập")) });
            }}
          >
            {T("Импорт", "Import", "Nhập")}
          </button>
        </div>
      )}
    </DropMenu>
  );

  const actions = (
    <div className="erpHeadActions">
      <div className="erpHeadGroup">
        <button type="button" className="erpHeadBtn erpMenuTrash" aria-label={T("Корзина", "Trash", "Thùng rác")} disabled={busy} onClick={trash} title={T("Корзина", "Trash", "Thùng rác")}>
          <TrashIcon />
        </button>
        {columnsMenu}
        <button type="button" className="erpHeadBtn" disabled={!sorted.length} onClick={exportList}>
          {T("Экспорт", "Export", "Xuất")}
        </button>
        <button type="button" className="erpHeadBtn" disabled={!sorted.length} onClick={() => window.print()}>
          {T("Печать", "Print", "In")}
        </button>
        {moreMenu}
      </div>
      {extraActions}
      {addButton}
    </div>
  );

  return (
    <div className="erpMenu">
      <PageHead
        title={
          <>
            {title} <span className="erpHeadCount">{sorted.length}</span>
          </>
        }
        actions={actions}
      />
      <MenuMobileNav active={activeHref} />

      <section className="erpMenuPanel">
        <div className="erpFilters erpNoPrint">
          <input type="search" className="erpSearch" placeholder={searchPlaceholder} value={query} onChange={(e) => onQuery(e.target.value)} />
          {filterBar}
        </div>

        <div className="erpTableWrap erpMenuWrap erpPrintArea">
          <h2 className="erpPrintOnly">{title}</h2>
          <table className="erpTable erpMenuTable">
            <thead>
              <tr>
                <th className="erpMenuCheck erpNoPrint">
                  <input type="checkbox" checked={allOnPage} onChange={togglePage} aria-label={T("Выбрать все", "Select all", "Chọn tất cả")} />
                </th>
                {shown.map((c) => (
                  <th key={c.id} className={c.num ? "num" : ""} aria-sort={filters.sort === c.id ? (filters.desc ? "descending" : "ascending") : undefined}>
                    {c.sort !== false ? (
                      <button type="button" className="erpSortBtn" onClick={() => toggleSort(c.id)}>
                        {c.label}
                        {filters.sort === c.id ? <span aria-hidden>{filters.desc ? " ↓" : " ↑"}</span> : null}
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                ))}
                <th className="erpMenuRowActions erpNoPrint" aria-label={T("Действия", "Actions", "Thao tác")} />
              </tr>
            </thead>
            <tbody>
              {!pageRows.length ? (
                <tr>
                  <td colSpan={shown.length + 2} className="erpMenuEmpty">
                    {T("Нет данных, соответствующих выбранным фильтрам", "No data matches the selected filters", "Không có dữ liệu khớp bộ lọc")}
                  </td>
                </tr>
              ) : (
                pageRows.map((row) => {
                  const href = rowHref?.(row);
                  return (
                    <tr
                      key={row.id}
                      className={href ? "clickable" : ""}
                      onClick={(e) => {
                        if (!href) return;
                        if ((e.target as HTMLElement).closest("a, button, input, label")) return;
                        router.push(href);
                      }}
                    >
                      <td className="erpMenuCheck erpNoPrint">
                        <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleOne(row.id)} aria-label={T("Выбрать", "Select", "Chọn")} />
                      </td>
                      {shown.map((c) => (
                        <td key={c.id} className={c.num ? "num" : ""}>
                          {c.cell(row)}
                        </td>
                      ))}
                      <td className="erpMenuRowActions erpNoPrint">
                        {rowMenu ? (
                          <DropMenu
                            align="right"
                            fixed
                            trigger={({ open, toggle }) => (
                              <button type="button" className="erpRcDots" aria-label={T("Ещё", "More", "Thêm")} aria-expanded={open} onClick={toggle}>
                                ⋯
                              </button>
                            )}
                          >
                            {(close) => <div className="erpDropList">{rowMenu(row, close)}</div>}
                          </DropMenu>
                        ) : null}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {pages > 1 ? (
          <div className="erpNoPrint">
            <Pager total={sorted.length} page={current} pages={pages} onPage={setPage} />
          </div>
        ) : null}
        {note ? <div className="erpMenuNote erpNoPrint">{note}</div> : null}
      </section>
    </div>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 7h16M9 7V5h6v2M8 7l1 12h6l1-12" />
    </svg>
  );
}
