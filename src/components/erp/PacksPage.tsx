"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ErpUnit } from "@/lib/erp/costing";
import type { ErpPack } from "@/lib/erp/types";
import { downloadXlsx } from "@/lib/erp/xlsx";
import { useErp } from "./ErpShell";
import { ConditionFilters, DropMenu, matches, MultiSelect, type CondField, type Condition } from "./filters";
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

type ColumnId = "no" | "name" | "unit" | "qty";
type SortKey = "name" | "unit" | "qty";
type Saved = { units: string[]; conditions: Condition[]; hidden: ColumnId[]; sort: SortKey; desc: boolean };

const initial: Saved = { units: [], conditions: [], hidden: ["no"], sort: "name", desc: false };
const DEFAULT_HIDDEN: ColumnId[] = ["no"];

const columns = (): { id: ColumnId; label: string; num?: boolean; sort?: SortKey }[] => [
  { id: "no", label: "№" },
  { id: "name", label: T("Название", "Name", "Tên"), sort: "name" },
  { id: "unit", label: T("Ед. измерения", "Unit", "Đơn vị"), sort: "unit" },
  { id: "qty", label: T("Количество", "Quantity", "Số lượng"), num: true, sort: "qty" },
];

const condFields = (): CondField[] => [
  { id: "name", label: T("Название", "Name", "Tên"), kind: "text" },
  { id: "qty", label: T("Количество", "Quantity", "Số lượng"), kind: "number" },
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
      sort: raw.sort === "unit" || raw.sort === "qty" ? raw.sort : "name",
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
  const q = query.trim().toLowerCase();
  const unitFilter = new Set(filters.units);
  const fields = condFields();
  const shownCols = columns().filter((c) => !filters.hidden.includes(c.id));

  const filtered = packs.filter((pack) => {
    if (q && !pack.name.toLowerCase().includes(q)) return false;
    if (unitFilter.size && !unitFilter.has(pack.unit)) return false;
    return filters.conditions.every((cond) => {
      const field = fields.find((f) => f.id === cond.field);
      if (!field) return true;
      return matches(cond, field.kind, field.id === "name" ? pack.name : pack.qty_base);
    });
  });

  const rows = [...filtered].sort((a, b) => {
    const dir = filters.desc ? -1 : 1;
    if (filters.sort === "qty") return (a.qty_base - b.qty_base) * dir;
    if (filters.sort === "unit") return a.unit.localeCompare(b.unit) * dir || a.name.localeCompare(b.name);
    return a.name.localeCompare(b.name) * dir || a.qty_base - b.qty_base;
  });

  const toggleSort = (key: SortKey) => persist(filters.sort === key ? { desc: !filters.desc } : { sort: key, desc: false });

  const cell = (pack: ErpPack, id: ColumnId, index: number): string | number => {
    switch (id) {
      case "no":
        return index + 1;
      case "name":
        return pack.name;
      case "unit":
        return packUnitLabel(pack.unit);
      case "qty":
        return pack.qty_base;
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
          return String(cell(pack, c.id, index));
        }),
      ),
    );
  };

  const remove = async (pack: ErpPack) => {
    if (
      !window.confirm(
        T(
          `Удалить фасовку «${pack.name}»? Она исчезнет из новых документов, старые поставки сохранятся.`,
          `Delete pack “${pack.name}”? It will leave new documents; old deliveries keep it.`,
          `Xóa quy cách “${pack.name}”? Không còn ở phiếu mới, phiếu cũ giữ nguyên.`,
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
                        <strong className="erpPackName">{packText(pack.name)}</strong>
                      ) : c.id === "qty" ? (
                        packQtyText(Number(pack.qty_base), pack.unit)
                      ) : (
                        cell(pack, c.id, index)
                      )}
                    </td>
                  ))}
                  <td className="erpPackActs">
                    <NavLink href={`/erp/stock/packs/${pack.id}`} className="erpRcLink" aria-label={T("Открыть", "Open", "Mở")}>
                      <Arrow />
                    </NavLink>
                    <DropMenu
                      align="right"
                      fixed
                      trigger={({ open, toggle }) => (
                        <button type="button" className="erpRcDots" aria-label={T("Действия", "Actions", "Thao tác")} aria-expanded={open} onClick={toggle}>
                          ⋮
                        </button>
                      )}
                    >
                      {(close) => (
                        <div className="erpDropList">
                          <button
                            type="button"
                            className="erpDropAction erpDanger"
                            disabled={busy}
                            onClick={() => {
                              close();
                              void remove(pack);
                            }}
                          >
                            {T("Удалить", "Delete", "Xóa")}
                          </button>
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
    </>
  );
}

function eqText(value: number, unit: ErpUnit | "") {
  if (!unit || !(value > 0)) return "";
  return `${T("1 фасовка", "1 pack", "1 quy cách")} = ${packQtyText(value, unit)} ${unitLabel(unit)}`;
}

export function PackEditor({ id }: { id: string }) {
  const { state, act, busy } = useErp();
  const router = useRouter();
  const isNew = id === "new";
  const pack = isNew ? null : state!.packs.find((p) => p.id === id);
  const [name, setName] = useState(pack?.name ?? "");
  const [unit, setUnit] = useState<ErpUnit | "">(pack?.unit ?? "");
  const [qty, setQty] = useState<number | null>(pack?.qty_base ?? null);
  const [error, setError] = useState<string | null>(null);
  const dirty = name !== (pack?.name ?? "") || unit !== (pack?.unit ?? "") || qty !== (pack?.qty_base ?? null);
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
      { action: "savePack", pack: { id: pack?.id, name: name.trim(), unit, qty_base: qty } },
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
      <PageHead title={isNew ? T("Новая фасовка", "New pack", "Quy cách mới") : pack?.name} />
      <section className="erpCard">
        <div className="erpGrid two">
          <Field label={T("Название *", "Name *", "Tên *")}>
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus={isNew} maxLength={80} data-testid="pack-name" />
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
