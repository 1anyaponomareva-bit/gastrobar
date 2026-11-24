"use client";

import { emptyStorageOption, type StorageOption } from "@/lib/erp/storageOptions";
import { Field, NumberInput, T } from "./ui";

export function StorageOptionsEditor({
  options,
  disabled,
  onChange,
}: {
  options: StorageOption[];
  disabled?: boolean;
  onChange: (options: StorageOption[]) => void;
}) {
  const rows = options.length ? options : [emptyStorageOption()];

  const setRow = (index: number, patch: Partial<StorageOption>) => {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  return (
    <div className="erpStorageOptions">
      {rows.map((row, index) => (
        <div key={index} className="erpStorageOptionRow">
          <Field
            label={T("Условия / температура", "Conditions / temperature", "Điều kiện / nhiệt độ")}
            hint={index === 0 ? T("Например 0…4 °C или −10 °C", "e.g. 0…4 °C or −10 °C", "VD: 0…4 °C hoặc −10 °C") : undefined}
          >
            <input
              value={row.conditions}
              disabled={disabled}
              placeholder="0…4 °C"
              onChange={(event) => setRow(index, { conditions: event.target.value })}
            />
          </Field>
          <Field label={T("Срок, дней", "Shelf life, days", "Hạn dùng, ngày")}>
            <NumberInput
              value={row.days}
              disabled={disabled}
              onChange={(value) => setRow(index, { days: value === null ? null : Math.round(value) })}
            />
          </Field>
          {!disabled && rows.length > 1 ? (
            <button
              type="button"
              className="erpIconBtn erpStorageOptionRemove"
              aria-label={T("Удалить вариант хранения", "Remove storage option", "Xóa cách bảo quản")}
              onClick={() => onChange(rows.filter((_, i) => i !== index))}
            >
              ×
            </button>
          ) : (
            <span className="erpStorageOptionRemoveSpacer" aria-hidden />
          )}
        </div>
      ))}
      {!disabled ? (
        <button
          type="button"
          className="erpBtn"
          onClick={() => onChange([...rows, emptyStorageOption()])}
        >
          + {T("Добавить вариант хранения", "Add storage option", "Thêm cách bảo quản")}
        </button>
      ) : null}
      <p className="erpHint">
        {T(
          "Можно указать холодильник только температурой, а морозильник — сроком и температурой (например 15 дней при −10 °C).",
          "Fridge can be temperature only; freezer can add days (for example 15 days at −10 °C).",
          "Tủ mát có thể chỉ ghi nhiệt độ; tủ đông có thể thêm số ngày (ví dụ 15 ngày ở −10 °C).",
        )}
      </p>
    </div>
  );
}
