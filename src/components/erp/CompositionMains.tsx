"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import { MAX_MAIN_INGREDIENTS, mainLineIndexes } from "@/lib/erp/compositionLines";
import { T } from "./ui";

type DragHandleProps = (index: number) => {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
};

export function MainIngredientChips({
  labels,
  mains,
  disabled,
  onToggle,
}: {
  labels: string[];
  mains: boolean[];
  disabled?: boolean;
  onToggle: (index: number) => void;
}) {
  if (!labels.length) return null;
  const selected = mainLineIndexes(mains);
  return (
    <div className="erpMainBlock">
      <span>
        {T(
          "Основные продукты (до 4) — нажмите, чтобы отметить",
          "Main products (up to 4) — tap to select",
          "Nguyên liệu chính (tối đa 4) — nhấn để chọn",
        )}
      </span>
      <div className="erpMainChips">
        {labels.map((label, index) => {
          const active = selected.includes(index);
          return (
            <button
              key={index}
              type="button"
              aria-pressed={active}
              className={`erpMainChip${active ? " on" : ""}`}
              disabled={disabled || (!active && selected.length >= MAX_MAIN_INGREDIENTS)}
              onClick={() => onToggle(index)}
            >
              {active ? "★ " : ""}
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ComposeDragHandle({
  index,
  handleProps,
}: {
  index: number;
  handleProps: DragHandleProps;
}) {
  return (
    <button
      type="button"
      className="erpDragHandle"
      aria-label={T("Перетащить", "Drag to reorder", "Kéo để sắp xếp")}
      {...handleProps(index)}
    >
      ⠿
    </button>
  );
}
