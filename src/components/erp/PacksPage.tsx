"use client";

import { useEffect, useState } from "react";
import { useErpRouter } from "./erpHref";
import { productTitle, type ErpUnit } from "@/lib/erp/costing";
import { defaultPackId, packDisplayName, packNameSubtitle, packUsageCountMap, productsUsingPack } from "@/lib/erp/packs";
import type { ErpPack, ErpProduct, ErpState } from "@/lib/erp/types";
import { downloadXlsx } from "@/lib/erp/xlsx";
import { useErp } from "./ErpShell";
import { ConditionFilters, DropMenu, matches, MultiSelect, type CondField, type Condition } from "./filters";
import { categoryLabel } from "./menuFields";
import { StockMobileNav } from "./stockNav";
import {
  Empty,
  Field,
  NavLink,
  NumberInput,
  packQtyText,
  packText,
  packUnitLabel,
  PageHead,
  T,
  today,
  unitLabel,
  useDirtyGuard,
} from "./ui";

const STORE_KEY = "gastrofood-erp-packs";
const UNITS: ErpUnit[] = ["kg", "l", "pcs"];

type ColumnId = "no" | "name" | "unit" | "qty" | "use";
type SortKey = "name" | "unit" | "qty" | "use";
type Saved = { units: string[]; conditions: Condition[]; hidden: ColumnId[]; sort: SortKey; desc: boolean };

const initial: Saved = { units: [], conditions: [], hidden: ["no"], sort: "name", desc: false };
const DEFAULT_HIDDEN: ColumnId[] = ["no"];

const ingredientsLabel = () => T("Ингредиенты", "Ingredients", "Nguyên liệu");

const columns = (): { id: ColumnId; label: string; num?: boolean; sort?: SortKey }[] => [
  { id: "no", label: "№" },
  { id: "name", label: T("Название", "Name", "Tên"), sort: "name" },
  { id: "unit", label: T("Ед. измерения", "Unit", "Đơn vị"), sort: "unit" },
  { id: "qty", label: T("Количество", "Quantity", "Số lượng"), num: true, sort: "qty" },
  { id: "use", label: ingredientsLabel(), num: true, sort: "use" },
];

const condFields = (): CondField[] => [
  { id: "name", label: T("Название", "Name", "Tên"), kind: "text" },
  { id: "qty", label: T("Количество", "Quantity", "Số lượng"), kind: "number" },
  { id: "use", label: ingredientsLabel(), kind: "number" },
];

const unitOptions = () => UNITS.map((id) => ({ id, label: packUnitLabel(id) }));

function readSaved(): Saved {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) ?? "null") as Partial<Saved> | null;
    if (!raw) return initial;
    return {
      units: Array.isArray(raw.units) ? raw.units.map(String) : [],
      conditions: Array.isArray(raw.conditions) ? raw.conditions : [],
      hidden: Array.isArray(raw.hidden) ? (raw.hidden as ColumnId[]) : DEFAULT_HIDDEN,
      sort: raw.sort === "unit" || raw.sort === "qty" || raw.sort === "use" ? raw.sort : "name",
      desc: Boolean(raw.desc),
    };
  } catch {
    return initial;
  }
}

const Arrow = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
    <path d="M9 6l6 6-6 6" />
  </svg>
);

function sortMark(active: boolean, desc: boolean) {
  if (!active) return "";
  return desc ? " ↓" : " ↑";
}

export function PacksPage() {
  const { state, act, busy } = useErp();
  const [query, setQuery] = useState("");
  const [saved, setSaved] = useState<Saved | null>(null);
  const filters = saved ?? initial;
  const [draftHidden, setDraftHidden] = useState<ColumnId[] | null>(null);

  const persist = (patch: Partial<Saved>) =>
    setSaved((prev) => {
      const next = { ...(prev ?? initial), ...patch };
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });

  useEffect(() => {
    const next = readSaved();
    setSaved(next);
    setDraftHidden(next.hidden);
  }, []);

  if (!state) return null;
  const packs = state.packs;
  const usage = packUsageCountMap(state.productPacks, state.products);
  const q = query.trim().toLowerCase();
  const unitFilter = new Set(filters.units);
  const fields = condFields();
  const shownCols = columns().filter((c) => !filters.hidden.includes(c.id));

  const filtered = packs.filter((pack) => {
    const names = `${pack.name} ${pack.name_vn ?? ""}`.toLowerCase();
    if (q && !names.includes(q)) return false;
    if (unitFilter.size && !unitFilter.has(pack.unit)) return false;
    return filters.conditions.every((cond) => {
      const field = fields.find((f) => f.id === cond.field);
      if (!field) return true;
      const value = field.id === "name" ? names : field.id === "use" ? (usage.get(pack.id) ?? 0) : pack.qty_base;
      return matches(cond, field.kind, value);
    });
  });

  const rows = [...filtered].sort((a, b) => {
    const dir = filters.desc ? -1 : 1;
    if (filters.sort === "qty") return (a.qty_base - b.qty_base) * dir;
    if (filters.sort === "use") return ((usage.get(a.id) ?? 0) - (usage.get(b.id) ?? 0)) * dir || a.name.localeCompare(b.name);
    if (filters.sort === "unit") return a.unit.localeCompare(b.unit) * dir || a.name.localeCompare(b.name);
    return a.name.localeCompare(b.name) * dir || a.qty_base - b.qty_base;
  });

  const toggleSort = (key: SortKey) => persist(filters.sort === key ? { desc: !filters.desc } : { sort: key, desc: false });

  const cell = (pack: ErpPack, id: ColumnId, index: number): string | number => {
    switch (id) {
      case "no":
        return index + 1;
      case "name": {
        const sub = packNameSubtitle(pack);
        const main = packDisplayName(pack);
        return sub ? `${main} · ${sub}` : main;
      }
      case "unit":
        return packUnitLabel(pack.unit);
      case "qty":
        return pack.qty_base;
      case "use":
        return usage.get(pack.id) ?? 0;
    }
  };

  const exportXlsx = () => {
    downloadXlsx(
      `packs_${today()}`,
      T("Фасовки", "Packs", "Quy cách"),
      shownCols.map((c) => c.label),
      rows.map((pack, index) =>
        shownCols.map((c) => {
          if (c.id === "qty") return Number(pack.qty_base);
          if (c.id === "use") return usage.get(pack.id) ?? 0;
          return String(cell(pack, c.id, index));
        }),
      ),
    );
  };

  const remove = async (pack: ErpPack) => {
    if (
      !window.confirm(
        T(
          `Удалить фасовку «${packDisplayName(pack)}»? Она исчезнет из новых документов, старые поставки сохранятся.`,
          `Delete pack “${packDisplayName(pack)}”? It will leave new documents; old deliveries keep it.`,
          `Xóa quy cách “${packDisplayName(pack)}”? Không còn ở phiếu mới, phiếu cũ giữ nguyên.`,
        ),
      )
    )
      return;
    await act({ action: "setArchived", entity: "pack", id: pack.id, archived: true }, T("Фасовка удалена", "Pack deleted", "Đã xóa quy cách"));
  };

  const hidden = draftHidden ?? filters.hidden;
  const columnsMenu = (
    <div className="erpDropList erpPackCols">
      <p className="erpDropTitle">{T("Столбцы", "Columns", "Cột")}</p>
      {columns().map((c) => (
        <label key={c.id} className="erpDropItem">
          <input
            type="checkbox"
            checked={!hidden.includes(c.id)}
            onChange={() => setDraftHidden(hidden.includes(c.id) ? hidden.filter((h) => h !== c.id) : [...hidden, c.id])}
          />
          <span>{c.label}</span>
        </label>
      ))}
      <button type="button" className="erpDropAction" onClick={() => persist({ hidden })}>
        {T("Применить", "Apply", "Áp dụng")}
      </button>
      <button
        type="button"
        className="erpDropAction"
        onClick={() => {
          setDraftHidden(DEFAULT_HIDDEN);
          persist({ hidden: DEFAULT_HIDDEN });
        }}
      >
        {T("Сбросить до стандартных", "Reset to default", "Về mặc định")}
      </button>
    </div>
  );

  const sectionMenu = (
    <DropMenu
      align="right"
      trigger={({ open, toggle }) => (
        <button type="button" className="erpDots" aria-label={T("Действия", "Actions", "Thao tác")} aria-expanded={open} onClick={toggle} data-testid="packs-menu">
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
              exportXlsx();
            }}
          >
            {T("Экспорт", "Export", "Xuất")}
          </button>
          {columnsMenu}
        </div>
      )}
    </DropMenu>
  );

  const add = (
    <NavLink href="/erp/stock/packs/new" className="erpBtn primary" data-testid="packs-add">
      {T("Добавить", "Add", "Thêm")}
    </NavLink>
  );

  return (
    <>
      <PageHead
        title={T("Фасовки", "Packs", "Quy cách")}
        actions={
          <div className="erpHeadActions">
            {sectionMenu}
            {add}
          </div>
        }
      />
      <StockMobileNav active="/erp/stock/packs" />
      <div className="erpToolbar erpFilters">
        <input
          className="erpSearch"
          type="search"
          placeholder={T("Поиск…", "Search…", "Tìm…")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          data-testid="packs-search"
        />
        <MultiSelect label={T("Ед. измерения", "Unit", "Đơn vị")} options={unitOptions()} value={filters.units} onChange={(units) => persist({ units })} />
        <ConditionFilters fields={fields} value={filters.conditions} onChange={(conditions) => persist({ conditions })} />
      </div>
      <div className="erpTableWrap">
        <table className="erpTable stack erpPackTable" data-testid="packs-table">
          <thead>
            <tr>
              {shownCols.map((c) => (
                <th key={c.id} className={c.num ? "num" : undefined}>
                  {c.sort ? (
                    <button type="button" className="erpSortBtn" onClick={() => toggleSort(c.sort!)}>
                      {c.label}
                      {sortMark(filters.sort === c.sort, filters.desc)}
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              ))}
              <th className="erpPackActs" aria-label={T("Действия", "Actions", "Thao tác")} />
            </tr>
          </thead>
          <tbody>
            {!rows.length ? (
              <tr>
                <td colSpan={shownCols.length + 1} className="erpNoRows">
                  {packs.length || q || filters.units.length || filters.conditions.length
                    ? T("Ничего не найдено", "No matches", "Không tìm thấy")
                    : T("Фасовок пока нет. Нажмите «Добавить».", "No packs yet. Click Add.", "Chưa có quy cách. Bấm Thêm.")}
                </td>
              </tr>
            ) : (
              rows.map((pack, index) => (
                <tr key={pack.id} data-testid="pack-row">
                  {shownCols.map((c) => (
                    <td key={c.id} className={c.id === "name" ? "main" : c.num ? "num" : undefined} data-label={c.label}>
                      {c.id === "name" ? (
                        <>
                          <strong className="erpPackName">{packDisplayName(pack)}</strong>
                          {packNameSubtitle(pack) ? <span className="erpCellSub">{packNameSubtitle(pack)}</span> : null}
                        </>
                      ) : c.id === "qty" ? (
                        packQtyText(Number(pack.qty_base), pack.unit)
                      ) : c.id === "use" ? (
                        <PackUseCount packId={pack.id} count={usage.get(pack.id) ?? 0} />
                      ) : (
                        cell(pack, c.id, index)
                      )}
                    </td>
                  ))}
                  <td className="erpPackActs">
                    <NavLink href={`/erp/stock/packs/${pack.id}`} className="erpRcLink" aria-label={T("Открыть", "Open", "Mở")}>
                      <Arrow />
                    </NavLink>
                    <button type="button" className="erpBtn erpPackDelete" disabled={busy} onClick={() => void remove(pack)}>
                      {T("Удалить", "Delete", "Xóa")}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function PackUseCount({ packId, count }: { packId: string; count: number }) {
  if (count <= 0) {
    return (
      <span className="erpPackUseZero" data-testid="pack-use-count">
        {count}
      </span>
    );
  }
  return (
    <NavLink
      href={`/erp/stock/packs/${packId}/ingredients`}
      className="erpPackUse"
      data-testid="pack-use-count"
      aria-label={`${ingredientsLabel()}: ${count}`}
    >
      {count}
    </NavLink>
  );
}

function defaultPackName(state: ErpState, product: ErpProduct): string {
  const id = defaultPackId(state.productPacks, product.id);
  if (!id) return "—";
  const pack = state.packs.find((item) => item.id === id);
  if (pack) return packDisplayName(pack);
  const link = state.productPacks.find((item) => item.product_id === product.id && item.pack_id === id);
  return packText(link?.label || "—");
}

export function PackIngredientsPage({ id }: { id: string }) {
  const { state } = useErp();
  const router = useErpRouter();
  if (!state) return null;
  const pack = state.packs.find((item) => item.id === id);
  if (!pack) {
    return (
      <Empty
        kind="error"
        title={T("Фасовка не найдена", "Pack not found", "Không tìm thấy quy cách")}
        action={
          <NavLink href="/erp/stock/packs" className="erpBtn">
            {T("К списку фасовок", "Back to packs", "Về danh sách")}
          </NavLink>
        }
      />
    );
  }
  const rows = productsUsingPack(pack.id, state.productPacks, state.products);
  const cats = new Map(state.categories.map((c) => [c.id, c]));

  return (
    <>
      <NavLink href="/erp/stock/packs" className="erpBack">
        ← {T("Фасовки", "Packs", "Quy cách")}
      </NavLink>
      <PageHead
        title={packDisplayName(pack)}
        sub={`${ingredientsLabel()}: ${rows.length}`}
      />
      <StockMobileNav active="/erp/stock/packs" />
      {!rows.length ? (
        <Empty title={T("Нет ингредиентов", "No ingredients", "Không có nguyên liệu")} />
      ) : (
        <div className="erpTableWrap">
          <table className="erpTable stack" data-testid="pack-ingredients-table">
            <thead>
              <tr>
                <th>{T("Название", "Name", "Tên")}</th>
                <th>{T("Категория", "Category", "Nhóm")}</th>
                <th>{T("Фасовка по умолчанию", "Default pack", "Quy cách mặc định")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((product) => {
                const href = `/erp/products/${product.id}`;
                return (
                  <tr
                    key={product.id}
                    className="clickable"
                    data-testid="pack-ingredient-row"
                    onClick={(e) => {
                      if (!(e.target as HTMLElement).closest("a")) router.push(href);
                    }}
                  >
                    <td className="main">
                      <NavLink href={href} className="erpName">
                        {productTitle(product)}
                      </NavLink>
                      {product.brand ? <span className="erpCellSub">{product.brand}</span> : null}
                    </td>
                    <td data-label={T("Категория", "Category", "Nhóm")}>
                      {categoryLabel(product.category_id ? cats.get(product.category_id) : undefined)}
                    </td>
                    <td data-label={T("Фасовка по умолчанию", "Default pack", "Quy cách mặc định")}>{defaultPackName(state, product)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function eqText(value: number, unit: ErpUnit | "") {
  if (!unit || !(value > 0)) return "";
  return `${T("1 фасовка", "1 pack", "1 quy cách")} = ${packQtyText(value, unit)} ${unitLabel(unit)}`;
}

export function PackEditor({ id }: { id: string }) {
  const { state, act, busy } = useErp();
  const router = useErpRouter();
  const isNew = id === "new";
  const pack = isNew ? null : state!.packs.find((p) => p.id === id);
  const [name, setName] = useState(pack?.name ?? "");
  const [nameVn, setNameVn] = useState(pack?.name_vn ?? "");
  const [unit, setUnit] = useState<ErpUnit | "">(pack?.unit ?? "");
  const [qty, setQty] = useState<number | null>(pack?.qty_base ?? null);
  const [error, setError] = useState<string | null>(null);
  const dirty =
    name !== (pack?.name ?? "") ||
    nameVn !== (pack?.name_vn ?? "") ||
    unit !== (pack?.unit ?? "") ||
    qty !== (pack?.qty_base ?? null);
  useDirtyGuard(dirty);
  if (!isNew && !pack) {
    return (
      <Empty
        kind="error"
        title={T("Фасовка не найдена", "Pack not found", "Không tìm thấy quy cách")}
        action={
          <NavLink href="/erp/stock/packs" className="erpBtn">
            {T("К списку фасовок", "Back to packs", "Về danh sách")}
          </NavLink>
        }
      />
    );
  }

  const save = async () => {
    const problems: string[] = [];
    if (!name.trim()) problems.push(T("Укажите название", "Enter a name", "Nhập tên"));
    if (!unit) problems.push(T("Выберите единицу измерения", "Choose a unit", "Chọn đơn vị"));
    if (qty === null || !(qty > 0)) problems.push(T("Количество должно быть больше нуля", "Quantity must be greater than 0", "Số lượng phải lớn hơn 0"));
    if (problems.length) {
      setError(problems.join(". "));
      return;
    }
    setError(null);
    const result = await act<{ id: string }>(
      { action: "savePack", pack: { id: pack?.id, name: name.trim(), name_vn: nameVn.trim(), unit, qty_base: qty } },
      isNew ? T("Фасовка создана", "Pack created", "Đã tạo quy cách") : T("Изменения сохранены", "Changes saved", "Đã lưu"),
    );
    if (!result) return;
    if (isNew) router.replace("/erp/stock/packs");
    else router.push("/erp/stock/packs");
  };

  return (
    <>
      <NavLink href="/erp/stock/packs" className="erpBack">
        ← {T("Фасовки", "Packs", "Quy cách")}
      </NavLink>
      <PageHead title={isNew || !pack ? T("Новая фасовка", "New pack", "Quy cách mới") : packDisplayName(pack)} />
      <section className="erpCard">
        <div className="erpGrid two">
          <Field label={T("Название (EN) *", "Name (EN) *", "Name (EN) *")}>
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus={isNew} maxLength={80} data-testid="pack-name" />
          </Field>
          <Field label={T("Tên (VN)", "Tên (VN)", "Tên (VN)")}>
            <input value={nameVn} onChange={(e) => setNameVn(e.target.value)} maxLength={80} data-testid="pack-name-vn" />
          </Field>
          <Field label={T("Ед. измерения *", "Unit *", "Đơn vị *")}>
            <select value={unit} onChange={(e) => setUnit(e.target.value as ErpUnit | "")} data-testid="pack-unit">
              <option value="">{T("— выберите —", "— choose —", "— chọn —")}</option>
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {packUnitLabel(u)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={T("Количество *", "Quantity *", "Số lượng *")}>
            <NumberInput value={qty} onChange={setQty} />
          </Field>
        </div>
        {qty !== null && unit && qty > 0 ? <p className="erpHint">{eqText(qty, unit)}</p> : null}
        {error ? <p className="erpNotice warn">{error}</p> : null}
        <div className="erpActions">
          <button type="button" className="erpBtn primary" disabled={busy} onClick={() => void save()} data-testid="pack-save">
            {T("Сохранить", "Save", "Lưu")}
          </button>
          <NavLink href="/erp/stock/packs" className="erpBtn ghost">
            {T("Отмена", "Cancel", "Hủy")}
          </NavLink>
        </div>
      </section>
    </>
  );
}

export function PackCard({ id }: { id: string }) {
  const { state } = useErp();
  if (!state) return null;
  return <PackEditor key={id} id={id} />;
}
