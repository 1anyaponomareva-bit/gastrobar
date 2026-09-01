"use client";

import { useTranslation } from "@/lib/useTranslation";

type PosterTestQuickCartControlProps = {
  label: string;
  quantity: number;
  canAdd: boolean;
  onAdd: () => void;
  onDecrease: () => void;
  variant?: "food" | "bar";
};

export function PosterTestQuickCartControl({
  label,
  quantity,
  canAdd,
  onAdd,
  onDecrease,
  variant = "bar",
}: PosterTestQuickCartControlProps) {
  const { t } = useTranslation();
  const expanded = quantity > 0;
  const rootClass =
    variant === "food"
      ? `menu-card__cart-control${expanded ? " menu-card__cart-control--expanded" : ""}`
      : `poster-test-bar-cart-control${expanded ? " poster-test-bar-cart-control--expanded" : ""}`;

  return (
    <div
      className={rootClass}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <div key={expanded ? "qty" : "add"} className="poster-test-bar-cart-control__view">
        {expanded ? (
          <div
            className="poster-test-bar-cart-control__qty"
            role="group"
            aria-label={t("food_qty_group").replace("{name}", label)}
          >
            <button
              type="button"
              className="poster-test-bar-cart-control__btn"
              aria-label={t("food_decrease_qty").replace("{name}", label)}
              onClick={onDecrease}
            >
              −
            </button>
            <span className="poster-test-bar-cart-control__value" aria-live="polite">
              {quantity}
            </span>
            <button
              type="button"
              className="poster-test-bar-cart-control__btn poster-test-bar-cart-control__btn--plus"
              aria-label={t("food_increase_qty").replace("{name}", label)}
              onClick={onAdd}
              disabled={!canAdd}
            >
              +
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="poster-test-bar-cart-control__add"
            aria-label={t("food_add_to_cart").replace("{name}", label)}
            onClick={onAdd}
            disabled={!canAdd}
          >
            +
          </button>
        )}
      </div>
    </div>
  );
}
