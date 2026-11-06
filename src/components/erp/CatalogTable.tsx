"use client";

import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { downloadDocumentExport } from "./docs";
import { useErp } from "./ErpShell";
import { DropMenu } from "./filters";
import { POSTER_VENUES, POSTER_WORKSHOPS } from "./menuFields";
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

/** Extra-filter contents were not opened in Poster — the button opens that fact, it does not pretend to filter. */
export function ExtraFilterStub() {
  return (
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
          <p className="erpDropEmpty">
            {T(
              "Состав «+ Фильтр» в Poster не проверен. Не фильтрует список.",
              "Poster's extra-filter items were not verified. This does not filter the list.",
              "Mục «+ Bộ lọc» của Poster chưa kiểm. Không lọc danh sách.",
            )}
          </p>
        </div>
      )}
    </DropMenu>
  );
}

/** Poster: one venue, radio, cannot clear. No availability field yet — choosing a name does not hide rows. */
export function VenueFilter() {
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

/** @deprecated use VenueFilter — kept so existing imports keep working. */
export const VenueStubFilter = VenueFilter;

/** Workshop names from the add form. Not warehouses — choosing does not filter rows (no workshop_id yet). */
export function WorkshopFilter() {
  const [workshop, setWorkshop] = useState<string>("");
  const label = T("Цех", "Workshop", "Phân xưởng");
  return (
    <DropMenu
      trigger={({ open, toggle }) => (
        <button type="button" className={`erpFilterBtn ${workshop ? "on" : ""}`} aria-expanded={open} onClick={toggle}>
          <span>{workshop ? `${label}: ${workshop}` : label}</span>
          <Caret />
        </button>
      )}
    >
      {(close) => (
        <div className="erpDropList" role="radiogroup" aria-label={label}>
          {POSTER_WORKSHOPS.map((name) => (
            <button
              key={name}
              type="button"
              className={`erpDropAction ${name === workshop ? "on" : ""}`}
              role="radio"
              aria-checked={name === workshop}
              onClick={() => {
                setWorkshop(name);
                close();
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

/** @deprecated use WorkshopFilter */
export const WorkshopStubFilter = WorkshopFilter;

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
  rowLinks,
  rowMenu,
  trashHref,
  hideTrash,
  hideMore,
  showImport,
  exportKind = "button",
  onExportComposition,
  emptyMessage,
  backHref,
  backLabel,
  banner,
  note,
  defaultSort = "name",
  defaultDesc = false,
  sheetName,
  expandedId,
  rowExpand,
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
  /** Visible Poster links (Состав, Ред., Детали) — not inside ⋯. */
  rowLinks?: (row: Row) => ReactNode;
  rowMenu?: (row: Row, close: () => void) => ReactNode;
  onTrash?: (ids: string[]) => void | Promise<void>;
  trashHref?: string;
  hideTrash?: boolean;
  hideMore?: boolean;
  showImport?: boolean;
  exportKind?: "button" | "menu";
  onExportComposition?: (rows: Row[]) => void;
  emptyMessage?: string;
  backHref?: string;
  backLabel?: string;
  banner?: ReactNode;
  catalogEmpty?: boolean;
  emptyTitle?: string;
  emptyText?: ReactNode;
  emptyAction?: ReactNode;
  note?: ReactNode;
  defaultSort?: string;
  defaultDesc?: boolean;
  sheetName: string;
  expandedId?: string | null;
  rowExpand?: (row: Row) => ReactNode;
}) {
  const { notify } = useErp();
  const router = useRouter();
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
  const [exportOpen, setExportOpen] = useState(false);
  const [exportWithLines, setExportWithLines] = useState(false);

  useEffect(() => setSaved(readSaved(storeKey, initial)), [storeKey, initial]);
  useEffect(() => {
    if (saved) window.localStorage.setItem(storeKey, JSON.stringify(saved));
  }, [saved, storeKey]);

  const filters = saved ?? initial;
  const set = (patch: Partial<Saved>) => setSaved((prev) => ({ ...(prev ?? initial), ...patch }));
  const shown = columns.filter((c) => c.locked || !filters.hidden.includes(c.id));
  const resetHidden = () => set({ hidden: columns.filter((c) => c.defaultHidden && !c.locked).map((c) => c.id) });
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

  const toggleSort = (id: string) => set(filters.sort === id ? { desc: !filters.desc } : { sort: id, desc: false });

  const exportList = () => {
    if (!sorted.length) return;
    downloadDocumentExport(
      `${sheetName}_${today()}`,
      sheetName,
      shown.map((c) => c.label),
      sorted.map((row) => shown.map((c) => c.text(row))),
    );
  };

  const runExport = () => {
    if (exportWithLines && onExportComposition) onExportComposition(sorted);
    else exportList();
    setExportOpen(false);
  };

  const stubImport = () => notify({ ok: false, text: notImplemented(T("Импорт", "Import", "Nhập")) });

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
          {T("Столбцы", "Columns", "Cột")}
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

  const exportButton =
    exportKind === "menu" ? (
      <button type="button" className="erpHeadBtn" disabled={!sorted.length} onClick={() => setExportOpen(true)}>
        {T("Экспорт", "Export", "Xuất")}
        <Caret />
      </button>
    ) : (
      <button type="button" className="erpHeadBtn" disabled={!sorted.length} onClick={exportList}>
        {T("Экспорт", "Export", "Xuất")}
      </button>
    );

  const moreMenu =
    hideMore || !moreItems ? null : (
      <DropMenu
        align="right"
        trigger={({ open, toggle }) => (
          <button type="button" className="erpHeadBtn" aria-label={T("Ещё", "More", "Thêm")} aria-expanded={open} onClick={toggle}>
            ⋯
          </button>
        )}
      >
        {(close) => <div className="erpDropList">{moreItems(close)}</div>}
      </DropMenu>
    );

  const trashButton =
    hideTrash || !trashHref ? null : (
      <NavLink href={trashHref} className="erpHeadBtn erpMenuTrash" aria-label={T("Корзина", "Trash", "Thùng rác")} title={T("Корзина", "Trash", "Thùng rác")}>
        <TrashIcon />
      </NavLink>
    );

  const actions = (
    <div className="erpHeadActions">
      <div className="erpHeadGroup">
        {trashButton}
        {columnsMenu}
        {exportButton}
        {showImport ? (
          <button type="button" className="erpHeadBtn" onClick={stubImport}>
            {T("Импорт", "Import", "Nhập")}
          </button>
        ) : null}
        <button type="button" className="erpHeadBtn" onClick={() => window.print()}>
          {T("Печать", "Print", "In")}
        </button>
        {moreMenu}
      </div>
      {extraActions}
      {addButton}
    </div>
  );

  const actionCol = Boolean(rowLinks || rowMenu);

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
          <div className="erpMenuSearch">
            <input type="search" className="erpSearch" placeholder={searchPlaceholder} value={query} onChange={(e) => onQuery(e.target.value)} />
            {query ? (
              <button type="button" className="erpMenuSearchClear" aria-label={T("Очистить", "Clear", "Xóa")} onClick={() => onQuery("")}>
                ×
              </button>
            ) : null}
          </div>
          {filterBar}
        </div>

        <div className="erpTableWrap erpMenuWrap erpPrintArea">
          <h2 className="erpPrintOnly">{title}</h2>
          <table className="erpTable erpMenuTable">
            <thead>
              <tr>
                {shown.map((c) => (
                  <th key={c.id} className={c.num ? "num" : ""} aria-sort={filters.sort === c.id ? (filters.desc ? "descending" : "ascending") : undefined}>
                    {c.sort !== false ? (
                      <button type="button" className="erpSortBtn" onClick={() => toggleSort(c.id)}>
                        {c.label}
                        {filters.sort === c.id ? <span aria-hidden>{filters.desc ? " ▼" : " ▲"}</span> : null}
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                ))}
                {actionCol ? <th className="erpMenuRowActions erpNoPrint" aria-label={T("Действия", "Actions", "Thao tác")} /> : null}
              </tr>
            </thead>
            <tbody>
              {!pageRows.length ? (
                <tr>
                  <td colSpan={shown.length + (actionCol ? 1 : 0)} className="erpMenuEmpty">
                    {emptyMessage ??
                      T("Нет данных, соответствующих выбранным фильтрам", "No data matches the selected filters", "Không có dữ liệu khớp bộ lọc")}
                  </td>
                </tr>
              ) : (
                pageRows.map((row) => {
                  const href = rowHref?.(row);
                  return (
                    <Fragment key={row.id}>
                    <tr
                      className={href ? "clickable" : ""}
                      onClick={(e) => {
                        if (!href) return;
                        if ((e.target as HTMLElement).closest("a, button, input, label")) return;
                        router.push(href);
                      }}
                    >
                      {shown.map((c) => (
                        <td key={c.id} className={c.num ? "num" : ""}>
                          {c.cell(row)}
                        </td>
                      ))}
                      {actionCol ? (
                        <td className="erpMenuRowActions erpNoPrint">
                          <div className="erpMenuLinks">
                            {rowLinks?.(row)}
                            {rowMenu ? (
                              <DropMenu
                                align="right"
                                fixed
                                trigger={({ open, toggle }) => (
                                  <button type="button" className="erpMenuDots" aria-label={T("Ещё", "More", "Thêm")} aria-expanded={open} onClick={toggle}>
                                    ⋯
                                  </button>
                                )}
                              >
                                {(close) => <div className="erpDropList">{rowMenu(row, close)}</div>}
                              </DropMenu>
                            ) : null}
                          </div>
                        </td>
                      ) : null}
                    </tr>
                    {expandedId === row.id && rowExpand ? (
                      <tr className="erpMenuExpandRow">
                        <td colSpan={shown.length + (actionCol ? 1 : 0)}>{rowExpand(row)}</td>
                      </tr>
                    ) : null}
                    </Fragment>
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

      {exportOpen ? (
        <div className="erpMenuModal" role="dialog" aria-modal="true" aria-labelledby="erp-menu-export-title">
          <div className="erpMenuModalCard">
            <h2 id="erp-menu-export-title">{T("Выберите содержание таблицы для экспорта:", "Choose what to export:", "Chọn nội dung xuất:")}</h2>
            <div className="erpMenuExportCards">
              <button type="button" className={`erpMenuExportCard ${!exportWithLines ? "on" : ""}`} onClick={() => setExportWithLines(false)}>
                {T("Только список", "List only", "Chỉ danh sách")}
              </button>
              <button
                type="button"
                className={`erpMenuExportCard ${exportWithLines ? "on" : ""}`}
                disabled={!onExportComposition}
                onClick={() => setExportWithLines(true)}
              >
                {T("С составом", "With composition", "Kèm thành phần")}
              </button>
            </div>
            <p className="erpHint">
              {T("CSV/XLSX этого ERP, не файл Poster. Формат Poster не проверяли.", "This ERP's CSV/XLSX, not Poster's file. Poster's format was not verified.", "CSV/XLSX của ERP này, không phải file Poster.")}
            </p>
            <div className="erpActions">
              <button type="button" className="erpBtn" onClick={() => setExportOpen(false)}>
                {T("Отмена", "Cancel", "Hủy")}
              </button>
              <button type="button" className="erpBtn primary" onClick={runExport}>
                {T("Выгрузить", "Download", "Tải")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
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
