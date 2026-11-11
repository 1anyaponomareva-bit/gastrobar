"use client";

import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { useErpRouter } from "./erpHref";
import { withMenuListReturn } from "@/lib/erp/menuListQuery";
import { downloadDocumentExport } from "./docs";
import { useErp } from "./ErpShell";
import { DropMenu } from "./filters";
import { POSTER_VENUES, POSTER_WORKSHOPS } from "./menuFields";
import { MenuMobileNav } from "./menuNav";
import { Pager, usePageSize } from "./Pager";
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
  const [venue, setVenue] = useState<string>(POSTER_VENUES[0].id);
  const label = T("Заведение", "Venue", "Cơ sở");
  return (
    <DropMenu
      trigger={({ open, toggle }) => (
        <button type="button" className="erpFilterBtn on" aria-expanded={open} onClick={toggle}>
          <span>
            {label}: {venue}
          </span>
          <Caret />
        </button>
      )}
    >
      {(close) => (
        <div className="erpDropList" role="radiogroup" aria-label={label}>
          {POSTER_VENUES.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`erpDropAction ${item.id === venue ? "on" : ""}`}
              role="radio"
              aria-checked={item.id === venue}
              onClick={() => {
                setVenue(item.id);
                close();
                notify({ ok: false, text: notImplemented(label) });
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </DropMenu>
  );
}

/** Poster workshop names. Not warehouses — choosing does not filter. */
export function WorkshopStubFilter() {
  const { notify } = useErp();
  const label = T("Цех", "Workshop", "Phân xưởng");
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
          {POSTER_WORKSHOPS.map((name) => (
            <button
              key={name}
              type="button"
              className="erpDropAction"
              onClick={() => {
                close();
                notify({ ok: false, text: notImplemented(label) });
              }}
            >
              {name}
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
  /** Poster: «Название» is always on screen and not in the columns menu. */
  locked?: boolean;
  defaultHidden?: boolean;
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
  trashHref,
  hideTrash,
  hideMore,
  hideCheck,
  showImport,
  expandedId,
  rowExpand,
  emptyMessage,
  backHref,
  backLabel,
  banner,
  note,
  footer,
  rowEnd,
  defaultSort = "name",
  defaultDesc = false,
  sheetName,
  listHref,
  urlSort,
  urlDesc,
  onSortChange,
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
  /** Poster header trash opens the recycle bin, it does not bulk-delete. */
  trashHref?: string;
  hideTrash?: boolean;
  hideMore?: boolean;
  hideCheck?: boolean;
  /** Poster ingredients toolbar has Импорт as its own button, not inside ⋯. */
  showImport?: boolean;
  expandedId?: string | null;
  rowExpand?: (row: Row) => ReactNode;
  emptyMessage?: string;
  backHref?: string;
  backLabel?: string;
  banner?: ReactNode;
  /** True when the catalog itself has no rows (before search/filters). */
  catalogEmpty?: boolean;
  emptyTitle: string;
  emptyText?: ReactNode;
  emptyAction?: ReactNode;
  note?: ReactNode;
  footer?: (shown: CatalogColumn<Row>[]) => ReactNode;
  rowEnd?: (row: Row) => ReactNode;
  defaultSort?: string;
  defaultDesc?: boolean;
  sheetName: string;
  /** Current Menu list URL (with filters). Card links keep it as `from`. */
  listHref?: string;
  urlSort?: string;
  urlDesc?: boolean;
  onSortChange?: (sort: string, desc: boolean) => void;
}) {
  const { notify, busy } = useErp();
  const router = useErpRouter();
  const defaultHiddenKey = columns
    .filter((c) => c.defaultHidden && !c.locked)
    .map((c) => c.id)
    .join(",");
  const initial = useMemo<Saved>(
    () => ({ hidden: defaultHiddenKey ? defaultHiddenKey.split(",") : [], sort: defaultSort, desc: defaultDesc }),
    [defaultHiddenKey, defaultSort, defaultDesc],
  );
  const [saved, setSaved] = useState<Saved | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = usePageSize();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    const stored = readSaved(storeKey, initial);
    setSaved(urlSort ? { ...stored, sort: urlSort, desc: Boolean(urlDesc) } : stored);
  }, [storeKey, initial, urlSort, urlDesc]);
  useEffect(() => {
    if (saved) window.localStorage.setItem(storeKey, JSON.stringify(saved));
  }, [saved, storeKey]);

  const filters = saved ?? initial;
  const set = (patch: Partial<Saved>) => setSaved((prev) => ({ ...(prev ?? initial), ...patch }));
  const shown = columns.filter((c) => c.locked || !filters.hidden.includes(c.id));
  const resetHidden = () => set({ hidden: columns.filter((c) => c.defaultHidden && !c.locked).map((c) => c.id) });
  const sortCol =
    shown.find((c) => c.id === filters.sort) ?? shown.find((c) => c.id === defaultSort) ?? columns.find((c) => c.id === filters.sort);
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

  useEffect(() => setPage(0), [query, rows.length, filters.sort, filters.desc, pageSize]);

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = Math.min(page, pages - 1);
  const pageRows = sorted.slice(current * pageSize, current * pageSize + pageSize);
  const allOnPage = pageRows.length > 0 && pageRows.every((row) => selected.has(row.id));

  const toggleSort = (id: string) => {
    const next = filters.sort === id ? { desc: !filters.desc } : { sort: id, desc: false };
    set(next);
    onSortChange?.(next.sort ?? id, next.desc ?? false);
  };
  const hrefWithReturn = (href: string) => (listHref ? withMenuListReturn(href, listHref) : href);
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
    if (trashHref) {
      router.push(trashHref);
      return;
    }
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
    <NavLink href={hrefWithReturn(addHref)} className="erpBtn primary">
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
          <div className="erpDropTitle">{T("Отображать столбцы:", "Show columns:", "Hiện cột:")}</div>
          {columns
            .filter((c) => !c.locked)
            .map((c) => (
              <label key={c.id} className="erpDropItem">
                <input
                  type="checkbox"
                  checked={!filters.hidden.includes(c.id)}
                  onChange={() =>
                    set({
                      hidden: filters.hidden.includes(c.id) ? filters.hidden.filter((h) => h !== c.id) : [...filters.hidden, c.id],
                    })
                  }
                />
                <span>{c.label}</span>
              </label>
            ))}
          <hr />
          <button type="button" className="erpDropAction" onClick={resetHidden}>
            {T("Вернуть по умолчанию", "Reset to default", "Về mặc định")}
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

  const trashButton = hideTrash ? null : trashHref ? (
    <NavLink href={trashHref} className="erpHeadBtn erpMenuTrash" aria-label={T("Корзина", "Trash", "Thùng rác")} title={T("Корзина", "Trash", "Thùng rác")}>
      <TrashIcon />
    </NavLink>
  ) : (
    <button type="button" className="erpHeadBtn erpMenuTrash" aria-label={T("Корзина", "Trash", "Thùng rác")} disabled={busy} onClick={trash} title={T("Корзина", "Trash", "Thùng rác")}>
      <TrashIcon />
    </button>
  );

  const actions = (
    <div className="erpHeadActions">
      <div className="erpHeadGroup">
        {trashButton}
        {columnsMenu}
        <button type="button" className="erpHeadBtn" disabled={!sorted.length} onClick={exportList}>
          {T("Экспорт", "Export", "Xuất")}
        </button>
        {showImport ? (
          <button
            type="button"
            className="erpHeadBtn"
            onClick={() => notify({ ok: false, text: notImplemented(T("Импорт", "Import", "Nhập")) })}
          >
            {T("Импорт", "Import", "Nhập")}
          </button>
        ) : null}
        <button type="button" className="erpHeadBtn" onClick={() => window.print()}>
          {T("Печать", "Print", "In")}
        </button>
        {hideMore ? null : moreMenu}
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
            {backHref ? (
              <NavLink href={backHref} className="erpMenuBack" aria-label={backLabel ?? T("Назад", "Back", "Quay lại")}>
                ‹
              </NavLink>
            ) : null}
            {title} <span className="erpHeadCount">{sorted.length}</span>
          </>
        }
        actions={actions}
      />
      <MenuMobileNav active={activeHref} />

      <section className="erpMenuPanel">
        {banner ? <div className="erpMenuBanner erpNoPrint">{banner}</div> : null}
        <div className="erpFilters erpNoPrint">
          <input type="search" className="erpSearch" placeholder={searchPlaceholder} value={query} onChange={(e) => onQuery(e.target.value)} />
          {filterBar}
        </div>

        <div className="erpTableWrap erpMenuWrap erpPrintArea">
          <h2 className="erpPrintOnly">{title}</h2>
          <table className="erpTable erpMenuTable">
            <thead>
              <tr>
                {hideCheck ? null : (
                  <th className="erpMenuCheck erpNoPrint">
                    <input type="checkbox" checked={allOnPage} onChange={togglePage} aria-label={T("Выбрать все", "Select all", "Chọn tất cả")} />
                  </th>
                )}
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
                  <td colSpan={shown.length + (hideCheck ? 1 : 2)} className="erpMenuEmpty">
                    {emptyMessage ??
                      T("Нет данных, соответствующих выбранным фильтрам", "No data matches the selected filters", "Không có dữ liệu khớp bộ lọc")}
                  </td>
                </tr>
              ) : (
                pageRows.map((row) => {
                  const href = rowHref?.(row);
                  const openHref = href ? hrefWithReturn(href) : undefined;
                  const span = shown.length + (hideCheck ? 1 : 2);
                  return (
                    <Fragment key={row.id}>
                    <tr
                      className={openHref ? "clickable" : ""}
                      onClick={(e) => {
                        if (!openHref) return;
                        if ((e.target as HTMLElement).closest("a, button, input, label")) return;
                        router.push(openHref);
                      }}
                    >
                      {hideCheck ? null : (
                        <td className="erpMenuCheck erpNoPrint">
                          <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleOne(row.id)} aria-label={T("Выбрать", "Select", "Chọn")} />
                        </td>
                      )}
                      {shown.map((c) => (
                        <td key={c.id} className={c.num ? "num" : ""}>
                          {c.cell(row)}
                        </td>
                      ))}
                      <td className="erpMenuRowActions erpNoPrint">
                        <div className="erpMenuLinks">
                          {rowEnd?.(row)}
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
                        </div>
                      </td>
                    </tr>
                    {expandedId === row.id && rowExpand ? (
                      <tr className="erpMenuExpandRow">
                        <td colSpan={span}>{rowExpand(row)}</td>
                      </tr>
                    ) : null}
                    </Fragment>
                  );
                })
              )}
            </tbody>
            {footer && sorted.length ? <tfoot>{footer(shown)}</tfoot> : null}
          </table>
        </div>
        {sorted.length ? (
          <div className="erpNoPrint">
            <Pager total={sorted.length} page={current} pages={pages} pageSize={pageSize} onPage={setPage} onPageSize={setPageSize} />
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
