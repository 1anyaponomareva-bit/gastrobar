"use client";

import { useEffect, useState } from "react";
import { formatQty, parseDotQty, parseQty, sanitizeDotDecimal } from "@/lib/orders/qty";

type Props = {
  label: string;
  value: string;
  unit?: string;
  disabled?: boolean;
  /** Receive “other”: period only, comma is ignored. */
  dotOnly?: boolean;
  onChange: (value: string) => void;
};

export function QtyField({ label, value, unit, disabled, dotOnly, onChange }: Props) {
  const [text, setText] = useState(value);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(value);
  }, [value, focused]);

  return (
    <div className="orders-field">
      <label>{label}</label>
      <div className="orders-qtyWrap">
        <input
          inputMode="decimal"
          autoComplete="off"
          disabled={disabled}
          value={text}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            if (text.trim() === "") {
              setText("");
              onChange("");
              return;
            }
            const next = formatQty(dotOnly ? parseDotQty(text) : parseQty(text));
            setText(next);
            onChange(next);
          }}
          onChange={(event) => {
            const next = event.target.value;
            if (dotOnly && next.includes(",")) return;
            const value = dotOnly ? sanitizeDotDecimal(next) : next;
            setText(value);
            onChange(value);
          }}
        />
        {unit ? <span className="orders-unit">{unit}</span> : null}
      </div>
    </div>
  );
}
