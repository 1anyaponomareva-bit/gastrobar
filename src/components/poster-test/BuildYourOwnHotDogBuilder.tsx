"use client";

import type { PosterFoodMenuItem } from "@/lib/poster/mapProducts";
import { getAssetUrl } from "@/lib/appVersion";
import {
  BUILD_YOUR_OWN_HOT_DOG_BASE_PRICE,
  HOT_DOG_SAUCES,
  HOT_DOG_TOPPINGS,
  getBuildYourOwnSausageOptions,
  type BuildYourOwnHotDogOption,
} from "@/lib/poster/buildYourOwnHotDog";
import {
  displayFoodName,
  formatVnd,
  getHotDogSausageOptions,
  selectedCartPrice,
} from "@/lib/poster/posterTestCartHelpers";
import styles from "./BuildYourOwnHotDogBuilder.module.css";

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
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <div>
          <h3 className={styles.sectionTitle}>{title}</h3>
          <p className={styles.sectionHint}>{hint}</p>
        </div>
        <span className={styles.count}>
          {selectedCount}/{max}
        </span>
      </div>
      <div className={styles.optionList}>
        {options.map((option) => {
          const active = selectedOptionIds.includes(option.id);
          const disabled = !active && selectedCount >= max;
          return (
            <button
              key={option.id}
              type="button"
              className={styles.option}
              disabled={disabled}
              aria-pressed={active}
              onClick={() => onToggleOption(option.id, group)}
            >
              <span className={active ? styles.checkOn : styles.check} aria-hidden="true">
                {active ? "✓" : ""}
              </span>
              <span className={styles.optionLabel}>{option.label}</span>
              <span className={styles.optionPrice}>
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
  const fromItem = getHotDogSausageOptions(item);
  const options =
    fromItem.length > 0
      ? fromItem
      : getBuildYourOwnSausageOptions(item.price ?? BUILD_YOUR_OWN_HOT_DOG_BASE_PRICE);
  const selected =
    options.find((option) => option.id === selectedSausageId) ?? options[0] ?? null;
  const price = selectedCartPrice(
    { ...item, sausageOptions: options, hotDogNoSausage: false },
    selected?.id ?? selectedSausageId,
    selectedOptionIds,
  );
  const selectedExtras = [
    ...HOT_DOG_TOPPINGS.filter((option) => selectedOptionIds.includes(option.id)),
    ...HOT_DOG_SAUCES.filter((option) => selectedOptionIds.includes(option.id)),
  ];
  const sausageAddon =
    selected?.addon ??
    Math.max(0, (selected?.price ?? BUILD_YOUR_OWN_HOT_DOG_BASE_PRICE) - BUILD_YOUR_OWN_HOT_DOG_BASE_PRICE);

  return (
    <div className={styles.root} role="dialog" aria-modal="true" aria-label={displayFoodName(item)}>
      <button type="button" className={styles.back} aria-label="Назад" onClick={onClose}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      <div className={styles.scroll}>
        <div className={styles.hero}>
          {item.image ? (
            <img src={getAssetUrl(item.image)} alt="" className={styles.heroImg} />
          ) : null}
          <div className={styles.heroShade} aria-hidden="true" />
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>Конструктор</p>
            <h2 className={styles.title}>{displayFoodName(item)}</h2>
            <p className={styles.lead}>
              База {formatVnd(BUILD_YOUR_OWN_HOT_DOG_BASE_PRICE)} · сосиска, добавки и соусы
            </p>
          </div>
        </div>

        <div className={styles.body}>
          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <div>
                <h3 className={styles.sectionTitle}>1. Сосиска</h3>
                <p className={styles.sectionHint}>Обязательно · выберите одну</p>
              </div>
              <span className={styles.badge}>Выберите 1</span>
            </div>
            <div className={styles.sausageList}>
              {options.map((option) => {
                const addon =
                  option.addon ??
                  Math.max(0, option.price - BUILD_YOUR_OWN_HOT_DOG_BASE_PRICE);
                const active = option.id === (selected?.id ?? "");
                return (
                  <button
                    key={option.id}
                    type="button"
                    className={active ? styles.sausageActive : styles.sausage}
                    aria-pressed={active}
                    onClick={() => onSelectSausage(option.id)}
                  >
                    <span className={styles.sausageName}>{option.shortLabel || option.label}</span>
                    <span className={styles.sausageMeta}>
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

          <section className={styles.summary} aria-live="polite">
            <div className={styles.summaryHead}>
              <h3 className={styles.summaryTitle}>Ваш хот-дог</h3>
              <span className={styles.summaryReady}>Готово к заказу</span>
            </div>
            <ul className={styles.summaryList}>
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
            <div className={styles.summaryTotal}>
              <span>Итого</span>
              <strong>{formatVnd(price.unitPrice)} VND</strong>
            </div>
          </section>
        </div>
      </div>

      <div className={styles.footer}>
        <div className={styles.footerTotal}>
          <span>Итоговая цена</span>
          <strong>{formatVnd(price.unitPrice)} VND</strong>
        </div>
        <button type="button" className={styles.cta} onClick={onAddToCart}>
          Добавить в корзину · {formatVnd(price.unitPrice)}
        </button>
        {addToCartError ? <p className={styles.error}>{addToCartError}</p> : null}
      </div>
    </div>
  );
}
