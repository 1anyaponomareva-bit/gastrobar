"use client";

import { Fragment, useDeferredValue, useEffect, useMemo, useState } from "react";
import { productTitle, type CostSource } from "@/lib/erp/costing";
import { addTotals, costInfo, costNumber, stockByProduct, stockOf, stockValue, type CostInfo, type StockTotals } from "@/lib/erp/stockView";
import type { ErpCategory, ErpProduct, ErpProductReceipt, ErpState } from "@/lib/erp/types";
import { useErp } from "./ErpShell";
import { ConditionFilters, DropMenu, matches, MultiSelect, type CondField, type Condition } from "./filters";
import { StockMobileNav } from "./stockNav";
import { costSourceLabel, dateText, Empty, errorText, loadingText, NavLink, PageHead, PRODUCT_TYPES, qtyText, T, today, typeLabel, unitLabel, vnd } from "./ui";

const STORE_KEY = "gastrofood-erp-balances";
const PAGE = 100;

type ColumnId = "type" | "category" | "qty" | "cost" | "value";
type SortKey = "name" | ColumnId;
type Saved = { warehouses: string[]; types: string[]; categories: string[]; conditions: Condition[]; hidden: ColumnId[]; sort: SortKey; desc: boolean };

const initial: Saved = { warehouses: [], types: [], categories: [], conditions: [], hidden: [], sort: "name", desc: false };

const columns = (): { id: ColumnId; label: string; num?: boolean }[] => [
  { id: "type", label: T("Тип", "Type", "Loại") },
  { id: "category", label: T("Категория", "Category", "Nhóm") },
  { id: "qty", label: T("Остатки", "In stock", "Tồn kho"), num: true },
  { id: "cost", label: T("Себестоимость", "Unit cost", "Giá vốn"), num: true },
  { id: "value", label: T("Сумма", "Value", "Giá trị"), num: true },
];

const condFields = (): CondField[] => [
  { id: "name", label: T("Название", "Name", "Tên"), kind: "text" },
  { id: "qty", label: T("Остатки", "In stock", "Tồn kho"), kind: "number" },
  { id: "cost", label: T("Себестоимость", "Unit cost", "Giá vốn"), kind: "number" },
  { id: "value", label: T("Сумма", "Value", "Giá trị"), kind: "number" },
];

const categoryName = (category: ErpCategory | undefined) =>
  category ? `${category.name_en}${category.name_vn && category.name_vn !== category.name_en ? ` / ${category.name_vn}` : ""}` : "";

type Row = {
  product: ErpProduct;
  name: string;
  category: string;
  /** Stock on the chosen warehouses (all when none chosen). */
  stock: StockTotals;
  /** Stock on all warehouses, for the separate grand total. */
  all: StockTotals;
  qty: number;
  value: number | null;
  cost: CostInfo;
};

function buildRows(state: ErpState, warehouses: Set<string>): Row[] {
  const categories = new Map(state.categories.map((c) => [c.id, c]));
  const chosen = stockByProduct(state.stock, warehouses);
  const all = stockByProduct(state.stock, null);
  return state.products
    .filter((p) => !p.archived_at || stockOf(all, p.id).qty !== 0)
    .map((product) => {
      const s = stockOf(chosen, product.id);
      return {
        product,
        name: productTitle(product),
        category: categoryName(product.category_id ? categories.get(product.category_id) : undefined),
        stock: s,
        all: stockOf(all, product.id),
        qty: s.qty,
        value: stockValue(s),
        cost: costInfo(s, product),
      };
    });
}

function CostCell({ cost, unit }: { cost: CostInfo; unit: string | null }) {
  if (cost.kind === "lots") return <>{`${vnd(cost.unitCost)} / ${unitLabel(unit)}`}</>;
  if (cost.kind === "unknown") return <span className="erpBadge warn">{T("неизвестна", "unknown", "chưa rõ")}</span>;
  if (cost.kind === "reference") {
    return (
      <span title={T("Остатка нет. Это справочная цена продукта, а не стоимость остатка.", "No stock. This is the product's reference price, not a stock value.", "Không có tồn. Đây là giá tham khảo, không phải giá trị tồn kho.")}>
        {`${vnd(cost.unitCost)} / ${unitLabel(unit)}`} <span className="erpBadge">{T("справочная", "reference", "tham khảo")}</span>
        {cost.source ? <small className="erpCellSub">{costSourceLabel(cost.source as CostSource)}</small> : null}
      </span>
    );
  }
  return <>—</>;
}

function ValueCell({ totals }: { totals: StockTotals }) {
  if (totals.complete) return <>{vnd(totals.knownValue)}</>;
  return (
    <span
      className="erpBadge warn"
      title={T("У части партий нет цены: показана только известная часть", "Some lots have no price: only the known part is shown", "Một số lô chưa có giá")}
    >
      {totals.knownValue > 0 ? `≥ ${vnd(totals.knownValue)}` : T("неизвестна", "unknown", "chưa rõ")}
    </span>
  );
}

const sortValue = (row: Row, key: SortKey): string | number => {
  switch (key) {
    case "name":
      return row.name.toLowerCase();
    case "type":
      return typeLabel(row.product.type);
    case "category":
      return row.category.toLowerCase();
    case "qty":
      return row.qty;
    case "cost":
      return costNumber(row.cost) ?? -Infinity;
    case "value":
      return row.value ?? row.stock.knownValue;
  }
};

const fieldValue = (row: Row, field: string): string | number | null =>
  field === "name" ? row.name : field === "qty" ? row.qty : field === "cost" ? costNumber(row.cost) : field === "value" ? row.value : null;

function readSaved(): Saved {
  try {
    return { ...initial, ...(JSON.parse(window.localStorage.getItem(STORE_KEY) ?? "{}") as Partial<Saved>) };
  } catch {
    return initial;
  }
}

export function StockPage() {
  const { state } = useErp();
  const [saved, setSaved] = useState<Saved | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<Set<string>>(new Set());

  useEffect(() => setSaved(readSaved()), []);
  useEffect(() => {
    if (saved) window.localStorage.setItem(STORE_KEY, JSON.stringify(saved));
  }, [saved]);

  const filters = saved ?? initial;
  // Typing stays instant; the table follows as soon as the browser is free.
  const search = useDeferredValue(query);
  const rows = useMemo(() => (state ? buildRows(state, new Set(filters.warehouses)) : []), [state, filters.warehouses]);
  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    const types = new Set(filters.types);
    const cats = new Set(filters.categories);
    const fields = condFields();
    const out = rows.filter(
      (row) =>
        (!q || `${row.product.name_en} ${row.product.name_vn} ${row.product.brand ?? ""} ${row.product.code}`.toLowerCase().includes(q)) &&
        (!types.size || types.has(row.product.type)) &&
        (!cats.size || cats.has(row.product.category_id ?? "none")) &&
        filters.conditions.every((c) => matches(c, fields.find((f) => f.id === c.field)?.kind ?? "text", fieldValue(row, c.field))),
    );
    const dir = filters.desc ? -1 : 1;
    return out.sort((a, b) => {
      const x = sortValue(a, filters.sort);
      const y = sortValue(b, filters.sort);
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * dir || a.name.localeCompare(b.name);
    });
  }, [rows, search, filters]);

  useEffect(() => setPage(0), [query, filters.warehouses, filters.types, filters.categories, filters.conditions]);

  if (!state) return null;
  const set = (patch: Partial<Saved>) => setSaved((prev) => ({ ...(prev ?? initial), ...patch }));
  const activeWarehouses = state.warehouses.filter((w) => !w.archived_at);
  const shownColumns = columns().filter((c) => !filters.hidden.includes(c.id));
  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  const current = Math.min(page, pages - 1);
  const pageRows = list.slice(current * PAGE, current * PAGE + PAGE);
  const chosenWarehouses = activeWarehouses.filter((w) => filters.warehouses.includes(w.id));
  const filtered = chosenWarehouses.length > 0 && chosenWarehouses.length < activeWarehouses.length;
  const chosenNames = chosenWarehouses.map((w) => w.name).join(", ");
  const totalChosen = addTotals(list.map((row) => row.stock));
  const totalAll = addTotals(list.map((row) => row.all));
  const anyFilter = Boolean(query || filters.warehouses.length || filters.types.length || filters.categories.length || filters.conditions.length);

  const toggleSort = (key: SortKey) => set(filters.sort === key ? { desc: !filters.desc } : { sort: key, desc: false });
  const toggleOpen = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const exportCsv = () => {
    const cell = (v: unknown) => {
      const s = v === null || v === undefined ? "" : String(v);
      return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ["Product", "Type", "Category", "Unit", filtered ? `In stock (${chosenNames})` : "In stock (all locations)", "Avg cost of remaining lots", "Reference price (no stock)", "Value"];
    const lines = list.map((row) =>
      [
        row.name,
        typeLabel(row.product.type),
        row.category,
        row.product.base_unit,
        row.qty,
        row.cost.kind === "lots" ? Math.round(row.cost.unitCost) : "",
        row.cost.kind === "reference" ? Math.round(row.cost.unitCost) : "",
        row.value === null ? "" : Math.round(row.value),
      ]
        .map(cell)
        .join(","),
    );
    const blob = new Blob([`\uFEFF${[header.join(","), ...lines].join("\n")}`], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `stock_${today()}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const actions = (
    <DropMenu
      align="right"
      trigger={({ open: menuOpen, toggle }) => (
        <button type="button" className="erpDots" aria-label={T("Действия", "Actions", "Thao tác")} aria-expanded={menuOpen} onClick={toggle}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden>
            <circle cx="12" cy="5" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="12" cy="19" r="2" />
          </svg>
        </button>
      )}
    >
      {(close) => (
        <div className="erpDropList">
          <p className="erpDropTitle">{T("Столбцы", "Columns", "Cột")}</p>
          {columns().map((c) => (
            <label key={c.id} className="erpDropItem">
              <input
                type="checkbox"
                checked={!filters.hidden.includes(c.id)}
                onChange={() => set({ hidden: filters.hidden.includes(c.id) ? filters.hidden.filter((h) => h !== c.id) : [...filters.hidden, c.id] })}
              />
              <span>{c.label}</span>
            </label>
          ))}
          <hr />
          <button
            type="button"
            className="erpDropAction"
            onClick={() => {
              exportCsv();
              close();
            }}
          >
            {T("Экспорт в CSV", "Export to CSV", "Xuất CSV")}
          </button>
          <NavLink href="/erp/documents/new?type=opening" className="erpDropAction">
            {T("Внести начальные остатки", "Enter opening balances", "Nhập tồn đầu kỳ")}
          </NavLink>
        </div>
      )}
    </DropMenu>
  );

  const head = (key: SortKey, label: string, num?: boolean) => (
    <th className={num ? "num" : ""} aria-sort={filters.sort === key ? (filters.desc ? "descending" : "ascending") : undefined}>
      <button type="button" className="erpSortBtn" onClick={() => toggleSort(key)}>
        {label}
        {filters.sort === key ? <span aria-hidden>{filters.desc ? " ↓" : " ↑"}</span> : null}
      </button>
    </th>
  );

  const cell = (row: Row, id: ColumnId) => {
    switch (id) {
      case "type":
        return <td key={id}>{typeLabel(row.product.type)}</td>;
      case "category":
        return <td key={id}>{row.category || "—"}</td>;
      case "qty":
        return (
          <td key={id} className={`num ${row.qty < 0 ? "erpNeg" : ""}`}>
            {qtyText(row.qty, row.product.base_unit)}
          </td>
        );
      case "cost":
        return (
          <td key={id} className="num">
            <CostCell cost={row.cost} unit={row.product.base_unit} />
          </td>
        );
      case "value":
        return (
          <td key={id} className="num">
            <ValueCell totals={row.stock} />
          </td>
        );
    }
  };

  return (
    <>
      <PageHead title={T("Остатки", "Balances", "Tồn kho")} actions={actions} />
      <StockMobileNav active="/erp/stock" />

      {!activeWarehouses.length ? (
        <Empty
          title={T("Складов пока нет", "No locations yet", "Chưa có kho")}
          text={T("Добавьте склады: основной склад, кухня заготовок, фудтрак…", "Add locations: main warehouse, prep kitchen, food truck…", "Thêm kho: kho chính, bếp sơ chế, xe bán đồ ăn…")}
          action={
            <NavLink href="/erp/stock/warehouses" className="erpBtn primary">
              {T("Добавить склад", "Add location", "Thêm kho")}
            </NavLink>
          }
        />
      ) : (
        <section className="erpPanel">
          <div className="erpFilters">
            <input type="search" className="erpSearch" placeholder={T("Поиск…", "Search…", "Tìm…")} value={query} onChange={(e) => setQuery(e.target.value)} />
            <MultiSelect
              label={T("Склад", "Location", "Kho")}
              options={activeWarehouses.map((w) => ({ id: w.id, label: w.name }))}
              value={filters.warehouses}
              onChange={(warehouses) => set({ warehouses })}
              emptyLabel={T("Все склады", "All locations", "Tất cả kho")}
            />
            <MultiSelect label={T("Тип", "Type", "Loại")} options={PRODUCT_TYPES.map((t) => ({ id: t, label: typeLabel(t) }))} value={filters.types} onChange={(types) => set({ types })} />
            <MultiSelect
              label={T("Категория", "Category", "Nhóm")}
              options={[
                ...state.categories.filter((c) => !c.archived_at).map((c) => ({ id: c.id, label: categoryName(c) })),
                { id: "none", label: T("Без категории", "No category", "Chưa phân nhóm") },
              ]}
              value={filters.categories}
              onChange={(categories) => set({ categories })}
              searchable
            />
            <ConditionFilters fields={condFields()} value={filters.conditions} onChange={(conditions) => set({ conditions })} />
            {anyFilter ? (
              <button
                type="button"
                className="erpLink"
                onClick={() => {
                  setQuery("");
                  set({ warehouses: [], types: [], categories: [], conditions: [] });
                }}
              >
                {T("Сбросить всё", "Reset all", "Đặt lại")}
              </button>
            ) : null}
          </div>

          <p className="erpScope" data-testid="stock-scope">
            {filtered ? (
              <>
                {T("Остатки и суммы — только по складам:", "Stock and values for:", "Tồn kho và giá trị tại:")} <b>{chosenNames}</b>
              </>
            ) : (
              T("Остатки и суммы — по всем складам", "Stock and values — all locations", "Tồn kho và giá trị — tất cả kho")
            )}
            {" · "}
            {T(
              "Себестоимость — средняя по оставшимся партиям, только для показа: списание всегда идёт по FIFO, с самых старых партий по их цене; при нулевом остатке — справочная цена продукта",
              "Unit cost is the average of the remaining lots, for display only: stock always leaves first-in, first-out, oldest lots at their own cost; with no stock, the product's reference price",
              "Giá vốn = bình quân các lô còn lại, chỉ để hiển thị: xuất kho luôn theo FIFO, lô cũ nhất theo giá của lô; khi hết hàng là giá tham khảo",
            )}
          </p>

          <Pager total={list.length} page={current} pages={pages} onPage={setPage} />

          <div className="erpTableWrap erpScrollX">
            <table className="erpTable erpBalances">
              <thead>
                <tr>
                  {head("name", T("Название", "Name", "Tên"))}
                  {shownColumns.map((c) => (
                    <Fragment key={c.id}>{head(c.id, c.label, c.num)}</Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {!pageRows.length ? (
                  <tr>
                    <td colSpan={shownColumns.length + 1} className="erpNoRows">
                      {T("Ничего не найдено. Попробуйте изменить поиск или фильтры.", "Nothing found. Try changing the search or filters.", "Không tìm thấy. Hãy đổi từ khóa hoặc bộ lọc.")}
                    </td>
                  </tr>
                ) : (
                  pageRows.map((row) => {
                    const expanded = open.has(row.product.id);
                    return (
                      <Fragment key={row.product.id}>
                        <tr className={expanded ? "open" : ""}>
                          <td className="main">
                            <button type="button" className="erpExpand" aria-expanded={expanded} onClick={() => toggleOpen(row.product.id)}>
                              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                <path d="m9 6 6 6-6 6" />
                              </svg>
                              <span>{row.name}</span>
                            </button>
                          </td>
                          {shownColumns.map((c) => cell(row, c.id))}
                        </tr>
                        {expanded ? (
                          <tr className="erpDetailRow">
                            <td colSpan={shownColumns.length + 1}>
                              <ProductDetail state={state} product={row.product} selected={filtered ? new Set(filters.warehouses) : null} />
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })
                )}
              </tbody>
              {list.length && !filters.hidden.includes("value") ? (
                <tfoot>
                  <tr data-testid="total-chosen">
                    <td colSpan={shownColumns.length} className="erpTotalLabel">
                      {filtered
                        ? `${T("Всего по выбранным складам", "Total, chosen locations", "Tổng kho đã chọn")} (${chosenNames})`
                        : T("Всего по всем складам", "Total, all locations", "Tổng tất cả kho")}
                    </td>
                    <td className="num">
                      <ValueCell totals={totalChosen} />
                    </td>
                  </tr>
                  {filtered ? (
                    <tr data-testid="total-all" className="erpMutedRow">
                      <td colSpan={shownColumns.length} className="erpTotalLabel">
                        {T("Всего по всем складам", "Total, all locations", "Tổng tất cả kho")}
                      </td>
                      <td className="num">
                        <ValueCell totals={totalAll} />
                      </td>
                    </tr>
                  ) : null}
                </tfoot>
              ) : null}
            </table>
          </div>

          {pages > 1 ? <Pager total={list.length} page={current} pages={pages} onPage={setPage} /> : null}
        </section>
      )}
    </>
  );
}

function Pager({ total, page, pages, onPage }: { total: number; page: number; pages: number; onPage: (page: number) => void }) {
  const from = total ? page * PAGE + 1 : 0;
  const to = Math.min(total, (page + 1) * PAGE);
  const btn = (label: string, target: number, disabled: boolean, text: string) => (
    <button type="button" className="erpPagerBtn" aria-label={label} disabled={disabled} onClick={() => onPage(target)}>
      {text}
    </button>
  );
  return (
    <div className="erpPager">
      <span>
        {from}–{to} {T("из", "of", "/")} {total}
      </span>
      <span className="erpPagerBtns">
        {btn(T("Первая страница", "First page", "Trang đầu"), 0, page === 0, "«")}
        {btn(T("Предыдущая страница", "Previous page", "Trang trước"), page - 1, page === 0, "‹")}
        <span>
          {T("Стр.", "Page", "Trang")} {page + 1} {T("из", "of", "/")} {pages}
        </span>
        {btn(T("Следующая страница", "Next page", "Trang sau"), page + 1, page >= pages - 1, "›")}
        {btn(T("Последняя страница", "Last page", "Trang cuối"), pages - 1, page >= pages - 1, "»")}
      </span>
    </div>
  );
}

function ProductDetail({ state, product, selected }: { state: ErpState; product: ErpProduct; selected: Set<string> | null }) {
  const [receipts, setReceipts] = useState<ErpProductReceipt[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/erp/product-receipts?product=${product.id}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error ?? "server");
        if (alive) setReceipts(data.receipts as ErpProductReceipt[]);
      })
      .catch((e) => alive && setError(errorText(e instanceof Error && e.message !== "Failed to fetch" ? e.message : "network")));
    return () => {
      alive = false;
    };
  }, [product.id]);

  const unit = product.base_unit;
  const rows = state.stock.filter((s) => s.product_id === product.id);
  const warehouses = state.warehouses.filter((w) => !w.archived_at || rows.some((s) => s.warehouse_id === w.id && s.qty));
  const lines = warehouses.map((w) => {
    const s = rows.find((r) => r.warehouse_id === w.id);
    const totals = stockOf(stockByProduct(s ? [s] : [], null), product.id);
    return { w, s, totals, chosen: Boolean(selected?.has(w.id)) };
  });
  const totalChosen = addTotals(lines.filter((l) => l.chosen).map((l) => l.totals));
  const totalAll = addTotals(lines.map((l) => l.totals));
  const costText = (cost: number | null) => (cost === null ? "—" : `${vnd(cost)} / ${unitLabel(unit)}`);
  const lotCost = (t: StockTotals) => {
    const c = costInfo(t, { est_unit_cost: null });
    return c.kind === "lots" ? costText(c.unitCost) : c.kind === "unknown" ? <span className="erpBadge warn">{T("неизвестна", "unknown", "chưa rõ")}</span> : "—";
  };
  const now = today();
  const supplier = (id: string | null) => state.suppliers.find((s) => s.id === id)?.name ?? "—";
  const warehouse = (id: string | null) => state.warehouses.find((w) => w.id === id)?.name ?? "—";

  return (
    <div className="erpDetail">
      <div className="erpDetailHead">
        <h3>{T("Остатки по всем складам", "Stock at all locations", "Tồn tại tất cả kho")}</h3>
        <NavLink href={`/erp/products/${product.id}`} className="erpLink">
          {T("Открыть продукт", "Open product", "Mở sản phẩm")}
        </NavLink>
      </div>
      <div className="erpScrollX">
        <table className="erpTable">
          <thead>
            <tr>
              <th>{T("Склад", "Location", "Kho")}</th>
              <th className="num">{T("Остаток", "In stock", "Tồn")}</th>
              <th className="num" title={T("Средняя по оставшимся партиям", "Average of the remaining lots", "Bình quân các lô còn lại")}>
                {T("Себестоимость партий", "Lot cost", "Giá vốn lô")}
              </th>
              <th className="num">{T("Стоимость", "Value", "Giá trị")}</th>
              <th>{T("Ближайший срок", "Nearest use-by", "Hạn gần nhất")}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map(({ w, s, totals, chosen }) => (
              <tr key={w.id} className={chosen ? "erpChosen" : ""}>
                <td>
                  {w.name}
                  {chosen ? <span className="erpBadge ok">{T("в фильтре", "filtered", "đã lọc")}</span> : null}
                </td>
                <td className={`num ${totals.qty < 0 ? "erpNeg" : ""}`}>{qtyText(totals.qty, unit)}</td>
                <td className="num">{lotCost(totals)}</td>
                <td className="num">
                  <ValueCell totals={totals} />
                </td>
                <td>
                  {!s?.nearest_expiry ? (
                    "—"
                  ) : s.nearest_expiry < now ? (
                    <span className="erpBadge bad">
                      {T("просрочено", "expired", "hết hạn")} {dateText(s.nearest_expiry)}
                    </span>
                  ) : (
                    dateText(s.nearest_expiry)
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            {selected ? (
              <tr data-testid="detail-chosen">
                <td>{T("Итого по выбранным складам", "Total, chosen locations", "Tổng kho đã chọn")}</td>
                <td className="num">{qtyText(totalChosen.qty, unit)}</td>
                <td className="num">{lotCost(totalChosen)}</td>
                <td className="num">
                  <ValueCell totals={totalChosen} />
                </td>
                <td />
              </tr>
            ) : null}
            <tr data-testid="detail-all">
              <td>{T("Всего по всем складам", "Total, all locations", "Tổng tất cả kho")}</td>
              <td className="num">{qtyText(totalAll.qty, unit)}</td>
              <td className="num">{lotCost(totalAll)}</td>
              <td className="num">
                <ValueCell totals={totalAll} />
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      {totalAll.qty <= 0 && product.est_unit_cost !== null ? (
        <p className="erpHint">
          {T("Справочная цена (остатка нет)", "Reference price (no stock)", "Giá tham khảo (hết hàng)")}: {costText(product.est_unit_cost)}
          {product.est_cost_source ? ` · ${costSourceLabel(product.est_cost_source)}` : ""}
        </p>
      ) : null}

      <h3>{T("Поставки", "Deliveries", "Nhập hàng")}</h3>
      {error ? (
        <p className="erpHint">{error}</p>
      ) : !receipts ? (
        <p className="erpHint">{loadingText()}</p>
      ) : !receipts.length ? (
        <p className="erpHint">{T("Поставок этой позиции ещё не было", "No deliveries of this item yet", "Chưa nhập mặt hàng này")}</p>
      ) : (
        <div className="erpScrollX">
          <table className="erpTable">
            <thead>
              <tr>
                <th>{T("Дата поставки", "Delivery date", "Ngày nhập")}</th>
                <th>{T("Склад", "Location", "Kho")}</th>
                <th>{T("Поставщик", "Supplier", "Nhà cung cấp")}</th>
                <th className="num">{T("Количество", "Quantity", "Số lượng")}</th>
                <th className="num">{T("Цена за единицу", "Unit price", "Đơn giá")}</th>
                <th className="num">{T("Сумма", "Amount", "Thành tiền")}</th>
              </tr>
            </thead>
            <tbody>
              {receipts.map((r, i) => (
                <tr key={`${r.document_id}-${i}`}>
                  <td>
                    <NavLink href={`/erp/documents/${r.document_id}`} className="erpName">
                      {dateText(r.doc_date)}
                    </NavLink>
                    <span className="erpCellSub">
                      {r.doc_no}
                      {r.doc_type === "opening" ? ` · ${T("начальный остаток", "opening balance", "tồn đầu kỳ")}` : ""}
                    </span>
                  </td>
                  <td>{warehouse(r.warehouse_id)}</td>
                  <td>{r.doc_type === "opening" ? "—" : supplier(r.supplier_id)}</td>
                  <td className="num">{qtyText(r.qty, unit)}</td>
                  <td className="num">{costText(r.unit_cost)}</td>
                  <td className="num">{vnd(r.cost_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
