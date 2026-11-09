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
            const raw = event.target.value;
            const next = dotOnly ? sanitizeDotDecimal(raw.replace(/,/g, ".")) : raw;
            setText(next);
            onChange(next);
          }}
        />
        {unit ? <span className="orders-unit">{unit}</span> : null}
      </div>
    </div>
  );
}
