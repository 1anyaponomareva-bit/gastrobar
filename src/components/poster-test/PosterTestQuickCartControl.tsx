"use client";

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
            aria-label={`Количество: ${label}`}
          >
            <button
              type="button"
              className="poster-test-bar-cart-control__btn"
              aria-label={`Уменьшить количество ${label}`}
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
              aria-label={`Добавить ещё ${label}`}
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
            aria-label={`Добавить ${label} в корзину`}
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
