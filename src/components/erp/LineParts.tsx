"use client";

import {
  canCutParts,
  cutsPlaqueOpen,
  filledParts,
  MAX_LINE_PARTS,
  netToSmallUnit,
  partsIssue,
  partsRemainderGrams,
  partsSumGrams,
  type LinePart,
  type PartsIssue,
} from "@/lib/erp/lineParts";
import type { ErpState } from "@/lib/erp/types";
import { netOf, type LossLine } from "./losses";
import { NumberInput, T, unitOf } from "./ui";

const issueText = (issue: PartsIssue, parent: number | null, sum: number, unitLabel: string) => {
  if (!issue) return null;
  if (issue === "too_many") return T("Не больше 10 частей", "No more than 10 parts", "Không quá 10 phần");
  if (issue === "need_net") return T("Сначала укажите нетто родителя", "Set the parent net first", "Nhập netto của dòng trước");
  if (issue === "unit") return T("Части только для весовых продуктов", "Parts are only for weighed products", "Chỉ cho hàng cân");
  if (issue === "empty_row") return T("У каждой части нужно имя и граммы", "Each part needs a name and grams", "Mỗi phần cần tên và số gram");
  return T(
    `Сумма частей ${sum} ${unitLabel} должна равняться нетто ${parent} ${unitLabel}`,
    `Parts (${sum} ${unitLabel}) must equal the parent net (${parent} ${unitLabel})`,
    `Tổng phần ${sum} ${unitLabel} phải bằng netto ${parent} ${unitLabel}`,
  );
};

export function compositionPartsMessage(state: ErpState, line: LossLine & { parts?: LinePart[] }): string | null {
  const unit = unitOf(state, line.product_id);
  const parent = netToSmallUnit(netOf(state, line));
  const issue = partsIssue(line.parts, parent, unit);
  if (!issue) return null;
  const small = unit === "l" ? T("мл", "ml", "ml") : T("г", "g", "g");
  return issueText(issue, parent, partsSumGrams(line.parts), small);
}

export function LinePartsButton({
  parts,
  unit,
  open,
  disabled,
  onToggle,
}: {
  parts: LinePart[];
  unit: string | null;
  open: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  if (!canCutParts(unit)) return null;
  const count = filledParts(parts).length;
  if (disabled && !count) return null;
  return (
    <button type="button" className={`erpCutsBtn${open ? " on" : ""}`} aria-expanded={open} onClick={onToggle}>
      {T("Нарезка", "Cuts", "Thái")}
      {count ? <span className="erpCutsCount">{count}</span> : null}
    </button>
  );
}

export function LinePartsPlaque({
  colSpan,
  open,
  parts,
  parentSmall,
  unit,
  disabled,
  onChange,
}: {
  colSpan: number;
  open: boolean;
  parts: LinePart[];
  parentSmall: number | null;
  unit: string | null;
  disabled?: boolean;
  onChange: (parts: LinePart[]) => void;
}) {
  if (!cutsPlaqueOpen(open, unit)) return null;
  if (disabled && !filledParts(parts).length) return null;
  return (
    <tr className="erpCutsPlaqueRow">
      <td colSpan={colSpan}>
        <LinePartsEditor parts={parts} parentSmall={parentSmall} unit={unit} disabled={disabled} onChange={onChange} />
      </td>
    </tr>
  );
}

export function LinePartsEditor({
  parts,
  parentSmall,
  unit,
  disabled,
  onChange,
}: {
  parts: LinePart[];
  parentSmall: number | null;
  unit: string | null;
  disabled?: boolean;
  onChange: (parts: LinePart[]) => void;
}) {
  if (!canCutParts(unit)) return null;
  const rows = parts;
  if (disabled && !filledParts(rows).length) return null;
  const small = unit === "l" ? T("мл", "ml", "ml") : T("г", "g", "g");
  const issue = partsIssue(rows, parentSmall, unit);
  const sum = partsSumGrams(rows);
  const left = partsRemainderGrams(rows, parentSmall);
  return (
    <div className="erpLineParts erpCutsPlaque">
      <p className="erpHint">
        {T("Нарезка", "Cuts", "Thái")}
        {parentSmall != null ? ` · ${T("нетто", "net", "netto")} ${parentSmall} ${small}` : ""}
        {rows.length ? ` · ${T("сумма", "sum", "tổng")} ${sum} ${small}` : ""}
        {left != null && rows.length ? ` · ${T("осталось", "left", "còn")} ${left} ${small}` : ""}
      </p>
      {rows.map((part, index) => (
        <div key={index} className="erpLinePart">
          <input
            value={part.name}
            disabled={disabled}
            placeholder={T("Фарш, кубик…", "Mince, dice…", "Xay, hạt lựu…")}
            onChange={(event) =>
              onChange(rows.map((item, i) => (i === index ? { ...item, name: event.target.value } : item)))
            }
          />
          <label>
            <NumberInput
              value={part.grams}
              disabled={disabled}
              onChange={(grams) =>
                onChange(rows.map((item, i) => (i === index ? { ...item, grams: grams == null ? null : Math.round(grams) } : item)))
              }
            />
            <span>{small}</span>
          </label>
          {disabled ? null : (
            <button
              type="button"
              className="erpIconBtn"
              aria-label={T("Удалить часть", "Remove part", "Xóa phần")}
              onClick={() => onChange(rows.filter((_, i) => i !== index))}
            >
              ×
            </button>
          )}
        </div>
      ))}
      {disabled || rows.length >= MAX_LINE_PARTS ? null : (
        <button type="button" className="erpLink" onClick={() => onChange([...rows, { name: "", grams: null }])}>
          + {T("Добавить часть", "Add part", "Thêm phần")}
        </button>
      )}
      {issue ? <div className="erpNotice warn">{issueText(issue, parentSmall, sum, small)}</div> : null}
    </div>
  );
}
