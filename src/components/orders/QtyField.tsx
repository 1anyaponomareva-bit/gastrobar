"use client";

import { useEffect, useState } from "react";
import { formatQty, parseQty } from "@/lib/orders/qty";

type Props = {
  label: string;
  value: string;
  unit?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
};

export function QtyField({ label, value, unit, disabled, onChange }: Props) {
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
            const next = text.trim() === "" ? "" : formatQty(parseQty(text));
            setText(next);
            onChange(next);
          }}
          onChange={(event) => {
            const next = event.target.value;
            setText(next);
            onChange(next);
          }}
        />
        {unit ? <span className="orders-unit">{unit}</span> : null}
      </div>
    </div>
  );
}
