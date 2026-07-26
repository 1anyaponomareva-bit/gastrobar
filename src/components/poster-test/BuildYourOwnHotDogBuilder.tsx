"use client";

import type { PosterFoodMenuItem } from "@/lib/poster/mapProducts";
import { getAssetUrl } from "@/lib/appVersion";
import {
  BUILD_YOUR_OWN_HOT_DOG_BASE_PRICE,
  HOT_DOG_SAUCES,
  HOT_DOG_TOPPINGS,
  type BuildYourOwnHotDogOption,
} from "@/lib/poster/buildYourOwnHotDog";
import {
  displayFoodName,
  formatVnd,
  getHotDogSausageOptions,
  selectedCartPrice,
} from "@/lib/poster/posterTestCartHelpers";

type Props = {
  item: PosterFoodMenuItem;
  selectedSausageId: string;
  selectedOptionIds: string[];
  addToCartError: string | null;
  onSelectSausage: (id: string) => void;
  onToggleOption: (id: string, group: "toppings" | "sauces") => void;
  onAddToCart: () => void;
  onClose: () => void;
};

function OptionGroup({
  title,
  hint,
  options,
  max,
  group,
  selectedOptionIds,
  onToggleOption,
}: {
  title: string;
  hint: string;
  options: BuildYourOwnHotDogOption[];
  max: number;
  group: "toppings" | "sauces";
  selectedOptionIds: string[];
  onToggleOption: (id: string, group: "toppings" | "sauces") => void;
}) {
  const selectedCount = options.filter((option) => selectedOptionIds.includes(option.id)).length;

  return (
    <section className="byo-section">
      <div className="byo-section__head">
        <div>
          <h3 className="byo-section__title">{title}</h3>
          <p className="byo-section__hint">{hint}</p>
        </div>
        <span className="byo-section__count">
          {selectedCount}/{max}
        </span>
      </div>
      <div className="byo-option-list">
        {options.map((option) => {
          const active = selectedOptionIds.includes(option.id);
          const disabled = !active && selectedCount >= max;
          return (
            <button
              key={option.id}
              type="button"
              className={`byo-option${active ? " is-active" : ""}`}
              disabled={disabled}
              aria-pressed={active}
              onClick={() => onToggleOption(option.id, group)}
            >
              <span className={`byo-option__check${active ? " is-on" : ""}`} aria-hidden="true">
                {active ? "✓" : ""}
              </span>
              <span className="byo-option__label">{option.label}</span>
              <span className="byo-option__price">
                {option.price > 0 ? `+${formatVnd(option.price)}` : "вкл."}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function BuildYourOwnHotDogBuilder({
  item,
  selectedSausageId,
  selectedOptionIds,
  addToCartError,
  onSelectSausage,
  onToggleOption,
  onAddToCart,
  onClose,
}: Props) {
  const options = getHotDogSausageOptions(item);
  const selected =
    options.find((option) => option.id === selectedSausageId) ?? options[0] ?? null;
  const price = selectedCartPrice(item, selectedSausageId, selectedOptionIds);
  const selectedExtras = [
    ...HOT_DOG_TOPPINGS.filter((option) => selectedOptionIds.includes(option.id)),
    ...HOT_DOG_SAUCES.filter((option) => selectedOptionIds.includes(option.id)),
  ];
  const sausageAddon =
    selected?.addon ??
    Math.max(0, (selected?.price ?? BUILD_YOUR_OWN_HOT_DOG_BASE_PRICE) - BUILD_YOUR_OWN_HOT_DOG_BASE_PRICE);

  return (
    <div className="byo-builder">
      <button type="button" className="byo-builder__back" aria-label="Назад" onClick={onClose}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      <div className="byo-builder__hero">
        {item.image ? (
          <img src={getAssetUrl(item.image)} alt="" className="byo-builder__hero-img" />
        ) : (
          <div className="byo-builder__hero-fallback">нет изображения</div>
        )}
        <div className="byo-builder__hero-shade" aria-hidden="true" />
        <div className="byo-builder__hero-copy">
          <p className="byo-builder__eyebrow">Конструктор</p>
          <h2 className="byo-builder__title">{displayFoodName(item)}</h2>
          <p className="byo-builder__lead">
            База {formatVnd(BUILD_YOUR_OWN_HOT_DOG_BASE_PRICE)} · выберите сосиску, добавки и соусы
          </p>
        </div>
      </div>

      <div className="byo-builder__sheet">
        <div className="byo-builder__scroll">
          <section className="byo-section">
            <div className="byo-section__head">
              <div>
                <h3 className="byo-section__title">1. Сосиска</h3>
                <p className="byo-section__hint">Обязательно · выберите одну</p>
              </div>
              <span className="byo-section__badge">Выберите 1</span>
            </div>
            <div className="byo-sausage-grid">
              {options.map((option) => {
                const addon =
                  option.addon ??
                  Math.max(0, option.price - BUILD_YOUR_OWN_HOT_DOG_BASE_PRICE);
                const active = option.id === (selected?.id ?? "");
                return (
                  <button
                    key={option.id}
                    type="button"
                    className={`byo-sausage${active ? " is-active" : ""}`}
                    aria-pressed={active}
                    onClick={() => onSelectSausage(option.id)}
                  >
                    <span className="byo-sausage__name">{option.shortLabel || option.label}</span>
                    <span className="byo-sausage__meta">
                      {option.grammage}
                      {addon > 0 ? ` · +${formatVnd(addon)}` : " · в базе"}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <OptionGroup
            title="2. Добавки"
            hint="Необязательно · максимум 3"
            options={HOT_DOG_TOPPINGS}
            max={3}
            group="toppings"
            selectedOptionIds={selectedOptionIds}
            onToggleOption={onToggleOption}
          />

          <OptionGroup
            title="3. Соусы"
            hint="Необязательно · максимум 5"
            options={HOT_DOG_SAUCES}
            max={5}
            group="sauces"
            selectedOptionIds={selectedOptionIds}
            onToggleOption={onToggleOption}
          />

          <section className="byo-summary" aria-live="polite">
            <div className="byo-summary__head">
              <h3 className="byo-summary__title">Ваш хот-дог</h3>
              <span className="byo-summary__ready">Готово к заказу</span>
            </div>
            <ul className="byo-summary__list">
              <li>
                <span>База</span>
                <span>{formatVnd(BUILD_YOUR_OWN_HOT_DOG_BASE_PRICE)}</span>
              </li>
              <li>
                <span>{selected?.shortLabel || selected?.label || "Сосиска"}</span>
                <span>{sausageAddon > 0 ? `+${formatVnd(sausageAddon)}` : "вкл."}</span>
              </li>
              {selectedExtras.map((extra) => (
                <li key={extra.id}>
                  <span>{extra.label}</span>
                  <span>{extra.price > 0 ? `+${formatVnd(extra.price)}` : "вкл."}</span>
                </li>
              ))}
            </ul>
            <div className="byo-summary__total">
              <span>Итого</span>
              <strong>{formatVnd(price.unitPrice)} VND</strong>
            </div>
          </section>
        </div>

        <div className="byo-builder__footer">
          <div className="byo-builder__total">
            <span>Итоговая цена</span>
            <strong>{formatVnd(price.unitPrice)} VND</strong>
          </div>
          <button type="button" className="byo-builder__cta" onClick={onAddToCart}>
            Добавить в корзину
          </button>
          {addToCartError ? <p className="byo-builder__error">{addToCartError}</p> : null}
        </div>
      </div>
    </div>
  );
}
