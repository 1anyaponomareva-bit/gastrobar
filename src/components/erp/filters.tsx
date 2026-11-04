"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { T } from "./ui";

const Caret = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden>
    <path d="M7 10l5 5 5-5z" />
  </svg>
);

/** Button with a popup that closes on an outside click or Escape. */
export function DropMenu({
  trigger,
  children,
  align = "left",
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div className="erpDrop" ref={ref}>
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      {open ? <div className={`erpDropMenu ${align}`}>{children(() => setOpen(false))}</div> : null}
    </div>
  );
}

export type Option = { id: string; label: string };

/** Poster-style multi-choice filter; nothing chosen means "all". */
export function MultiSelect({
  label,
  options,
  value,
  onChange,
  searchable,
}: {
  label: string;
  options: Option[];
  value: string[];
  onChange: (value: string[]) => void;
  searchable?: boolean;
}) {
  const [query, setQuery] = useState("");
  const chosen = new Set(value);
  const q = query.trim().toLowerCase();
  const shown = options.filter((o) => !q || o.label.toLowerCase().includes(q));
  const summary =
    !value.length
      ? label
      : value.length === 1
        ? (options.find((o) => o.id === value[0])?.label ?? label)
        : value.length >= options.length
          ? `${label}: ${T("все", "all", "tất cả")}`
          : `${label}: ${value.length}`;
  return (
    <DropMenu
      trigger={({ open, toggle }) => (
        <button type="button" className={`erpFilterBtn ${value.length ? "on" : ""}`} aria-expanded={open} onClick={toggle}>
          <span>{summary}</span>
          <Caret />
        </button>
      )}
    >
      {() => (
        <>
          <div className="erpDropLinks">
            <button type="button" className="erpLink" onClick={() => onChange(options.map((o) => o.id))}>
              {T("Выбрать все", "Select all", "Chọn tất cả")}
            </button>
            <button type="button" className="erpLink" onClick={() => onChange([])}>
              {T("Очистить", "Clear", "Xóa")}
            </button>
          </div>
          {searchable ? (
            <input type="search" className="erpDropSearch" placeholder={T("Поиск", "Search", "Tìm")} value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
          ) : null}
          <div className="erpDropList">
            {shown.map((o) => (
              <label key={o.id} className="erpDropItem">
                <input type="checkbox" checked={chosen.has(o.id)} onChange={() => onChange(chosen.has(o.id) ? value.filter((v) => v !== o.id) : [...value, o.id])} />
                <span>{o.label}</span>
              </label>
            ))}
            {!shown.length ? <p className="erpDropEmpty">{T("Ничего не найдено", "Nothing found", "Không tìm thấy")}</p> : null}
          </div>
        </>
      )}
    </DropMenu>
  );
}

export type CondOp = "contains" | "=" | "!=" | ">" | ">=" | "<" | "<=" | "empty" | "!empty";
export type CondField = { id: string; label: string; kind: "text" | "number" };
export type Condition = { field: string; op: CondOp; value: string };

const opLabels = (): Record<CondOp, string> => ({
  contains: T("Содержит", "Contains", "Chứa"),
  "=": T("Равно", "Equals", "Bằng"),
  "!=": T("Не равно", "Not equal", "Khác"),
  ">": T("Больше", "Greater than", "Lớn hơn"),
  ">=": T("Больше или равно", "Greater or equal", "Lớn hơn hoặc bằng"),
  "<": T("Меньше", "Less than", "Nhỏ hơn"),
  "<=": T("Меньше или равно", "Less or equal", "Nhỏ hơn hoặc bằng"),
  empty: T("Пусто", "Empty", "Trống"),
  "!empty": T("Не пусто", "Not empty", "Không trống"),
});

const TEXT_OPS: CondOp[] = ["contains", "=", "!=", "empty", "!empty"];
const NUMBER_OPS: CondOp[] = ["=", "!=", ">", ">=", "<", "<=", "empty", "!empty"];

/** True when the value passes the condition; an unfinished condition lets everything through. */
export function matches(cond: Condition, kind: CondField["kind"], value: string | number | null): boolean {
  const isEmpty = value === null || value === "";
  if (cond.op === "empty") return isEmpty;
  if (cond.op === "!empty") return !isEmpty;
  const raw = cond.value.trim();
  if (!raw) return true;
  if (kind === "text") {
    const a = String(value ?? "").toLowerCase();
    const b = raw.toLowerCase();
    return cond.op === "contains" ? a.includes(b) : cond.op === "=" ? a === b : cond.op === "!=" ? a !== b : true;
  }
  const target = Number(raw.replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(target)) return true;
  if (isEmpty) return false;
  const n = Number(value);
  switch (cond.op) {
    case "=":
      return Math.abs(n - target) < 1e-9;
    case "!=":
      return Math.abs(n - target) >= 1e-9;
    case ">":
      return n > target;
    case ">=":
      return n >= target;
    case "<":
      return n < target;
    case "<=":
      return n <= target;
    default:
      return true;
  }
}

export function ConditionFilters({
  fields,
  value,
  onChange,
}: {
  fields: CondField[];
  value: Condition[];
  onChange: (value: Condition[]) => void;
}) {
  const labels = opLabels();
  const update = (index: number, patch: Partial<Condition>) => onChange(value.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  return (
    <>
      {value.map((cond, index) => {
        const field = fields.find((f) => f.id === cond.field);
        if (!field) return null;
        const ops = field.kind === "text" ? TEXT_OPS : NUMBER_OPS;
        return (
          <div key={index} className="erpCond">
            <span className="erpCondName">{field.label}</span>
            <select value={cond.op} onChange={(e) => update(index, { op: e.target.value as CondOp })} aria-label={T("Условие", "Condition", "Điều kiện")}>
              {ops.map((op) => (
                <option key={op} value={op}>
                  {labels[op]}
                </option>
              ))}
            </select>
            {cond.op !== "empty" && cond.op !== "!empty" ? (
              <input
                type={field.kind === "number" ? "text" : "search"}
                inputMode={field.kind === "number" ? "decimal" : undefined}
                value={cond.value}
                onChange={(e) => update(index, { value: e.target.value })}
                aria-label={field.label}
                autoFocus
              />
            ) : null}
            <button type="button" className="erpCondX" aria-label={T("Убрать фильтр", "Remove filter", "Bỏ lọc")} onClick={() => onChange(value.filter((_, i) => i !== index))}>
              ×
            </button>
          </div>
        );
      })}
      <DropMenu
        trigger={({ open, toggle }) => (
          <button type="button" className="erpFilterBtn" aria-expanded={open} onClick={toggle}>
            <span>+ {T("Фильтр", "Filter", "Bộ lọc")}</span>
            <Caret />
          </button>
        )}
      >
        {(close) => (
          <div className="erpDropList">
            {fields.map((f) => (
              <button
                key={f.id}
                type="button"
                className="erpDropAction"
                onClick={() => {
                  onChange([...value, { field: f.id, op: f.kind === "text" ? "contains" : ">", value: "" }]);
                  close();
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
      </DropMenu>
    </>
  );
}
