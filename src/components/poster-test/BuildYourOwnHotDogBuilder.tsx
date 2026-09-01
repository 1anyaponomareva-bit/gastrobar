"use client";

import type { AppLang } from "@/lib/i18n";
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
  foodBuildYourOwnOptionLabel,
  foodMenuDisplayName,
  foodSausageOptionLabel,
} from "@/lib/poster/foodMenuI18n";
import { useTranslation } from "@/lib/useTranslation";
import {
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
  lang,
}: {
  title: string;
  hint: string;
  options: BuildYourOwnHotDogOption[];
  max: number;
  group: "toppings" | "sauces";
  selectedOptionIds: string[];
  onToggleOption: (id: string, group: "toppings" | "sauces") => void;
  lang: AppLang;
}) {
  const { t } = useTranslation();
  const selectedCount = options.filter((option) => selectedOptionIds.includes(option.id)).length;

  return (
    <section className="mb-6">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[17px] font-extrabold text-white">{title}</h3>
          <p className="mt-1 text-xs text-white/55">{hint}</p>
        </div>
        <span className="shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold text-white/70">
          {selectedCount}/{max}
        </span>
      </div>
      <div className="flex flex-col">
        {options.map((option) => {
          const active = selectedOptionIds.includes(option.id);
          const disabled = !active && selectedCount >= max;
          return (
            <button
              key={option.id}
              type="button"
              disabled={disabled}
              aria-pressed={active}
              onClick={() => onToggleOption(option.id, group)}
              className="flex min-h-12 w-full items-center gap-3 px-1 py-2.5 text-left text-white/90 disabled:cursor-not-allowed disabled:opacity-35"
            >
              <span
                className={`inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md border text-xs font-extrabold text-black ${
                  active
                    ? "border-amber-300 bg-amber-300"
                    : "border-white/35 bg-transparent"
                }`}
                aria-hidden="true"
              >
                {active ? "✓" : ""}
              </span>
              <span className="min-w-0 flex-1 text-[15px]">
                {foodBuildYourOwnOptionLabel(option.id, option.label, lang)}
              </span>
              <span className="text-xs tabular-nums text-white/55">
                {option.price > 0 ? `+${formatVnd(option.price)}` : t("food_byo_included")}
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
  const { t, lang } = useTranslation();
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
    Math.max(
      0,
      (selected?.price ?? BUILD_YOUR_OWN_HOT_DOG_BASE_PRICE) - BUILD_YOUR_OWN_HOT_DOG_BASE_PRICE,
    );

  return (
    <div
      className="fixed inset-0 z-[3000] flex flex-col overflow-hidden bg-[#050505] text-white"
      role="dialog"
      aria-modal="true"
      aria-label={foodMenuDisplayName(item, lang)}
    >
      <button
        type="button"
        aria-label={t("back")}
        onClick={onClose}
        className="absolute left-3 top-[max(12px,calc(env(safe-area-inset-top,0px)+8px))] z-20 flex h-11 w-11 items-center justify-center rounded-full bg-black/80 text-white"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
        <div className="relative h-[180px] shrink-0 overflow-hidden bg-black">
          {item.image ? (
            <img
              src={getAssetUrl(item.image)}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : null}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.55) 45%, rgba(5,5,5,0.98) 100%)",
            }}
            aria-hidden="true"
          />
          <div className="absolute inset-x-4 bottom-4 z-[2]">
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-amber-300">
              {t("food_byo_builder")}
            </p>
            <h2 className="text-[26px] font-extrabold leading-tight text-white drop-shadow">
              {foodMenuDisplayName(item, lang)}
            </h2>
            <p className="mt-2 text-[13px] leading-snug text-white/80">
              {t("food_byo_base_hint").replace("{price}", formatVnd(BUILD_YOUR_OWN_HOT_DOG_BASE_PRICE))}
            </p>
          </div>
        </div>

        <div className="bg-[#050505] px-4 pb-6 pt-4">
          <section className="mb-6">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-[17px] font-extrabold text-white">{t("food_byo_sausage_step")}</h3>
                <p className="mt-1 text-xs text-white/55">{t("food_byo_sausage_required")}</p>
              </div>
              <span className="shrink-0 rounded-full bg-emerald-500/20 px-2.5 py-1 text-[11px] font-bold text-emerald-300">
                {t("food_byo_pick_one")}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {options.map((option) => {
                const addon =
                  option.addon ??
                  Math.max(0, option.price - BUILD_YOUR_OWN_HOT_DOG_BASE_PRICE);
                const active = option.id === (selected?.id ?? "");
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onSelectSausage(option.id)}
                    className={`flex w-full flex-col items-start gap-1 rounded-[14px] border-[1.5px] px-3.5 py-3.5 text-left ${
                      active
                        ? "border-amber-300/70 bg-amber-300/15"
                        : "border-white/15 bg-white/5"
                    }`}
                  >
                    <span className="text-[15px] font-bold leading-snug text-white">
                      {foodSausageOptionLabel(option, lang)}
                    </span>
                    <span className="text-xs text-amber-300">
                      {option.grammage}
                      {addon > 0 ? ` · +${formatVnd(addon)}` : ` · ${t("food_byo_in_base")}`}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <OptionGroup
            title={t("food_byo_toppings_step")}
            hint={t("food_byo_toppings_optional")}
            options={HOT_DOG_TOPPINGS}
            max={3}
            group="toppings"
            selectedOptionIds={selectedOptionIds}
            onToggleOption={onToggleOption}
            lang={lang}
          />

          <OptionGroup
            title={t("food_byo_sauces_step")}
            hint={t("food_byo_sauces_optional")}
            options={HOT_DOG_SAUCES}
            max={5}
            group="sauces"
            selectedOptionIds={selectedOptionIds}
            onToggleOption={onToggleOption}
            lang={lang}
          />

          <section
            className="mt-2 rounded-[18px] border border-amber-300/35 bg-gradient-to-br from-amber-300/15 to-white/5 p-4"
            aria-live="polite"
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-base font-extrabold text-white">{t("food_byo_your_hotdog")}</h3>
              <span className="rounded-full bg-amber-300/15 px-2.5 py-1 text-[11px] font-bold text-amber-300">
                {t("food_byo_ready")}
              </span>
            </div>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              <li className="flex items-baseline justify-between gap-3 text-sm text-white/80">
                <span>{t("food_byo_base")}</span>
                <span className="tabular-nums text-white/55">
                  {formatVnd(BUILD_YOUR_OWN_HOT_DOG_BASE_PRICE)}
                </span>
              </li>
              <li className="flex items-baseline justify-between gap-3 text-sm text-white/80">
                <span>
                  {selected
                    ? foodSausageOptionLabel(selected, lang)
                    : t("food_byo_sausage_fallback")}
                </span>
                <span className="tabular-nums text-white/55">
                  {sausageAddon > 0 ? `+${formatVnd(sausageAddon)}` : t("food_byo_included")}
                </span>
              </li>
              {selectedExtras.map((extra) => (
                <li
                  key={extra.id}
                  className="flex items-baseline justify-between gap-3 text-sm text-white/80"
                >
                  <span>{foodBuildYourOwnOptionLabel(extra.id, extra.label, lang)}</span>
                  <span className="tabular-nums text-white/55">
                    {extra.price > 0 ? `+${formatVnd(extra.price)}` : t("food_byo_included")}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-3.5 flex items-baseline justify-between gap-3 border-t border-white/12 pt-3.5 text-sm text-white/65">
              <span>{t("food_byo_total")}</span>
              <strong className="text-[22px] font-extrabold text-amber-300">
                {formatVnd(price.unitPrice)} VND
              </strong>
            </div>
          </section>
        </div>
      </div>

      <div className="shrink-0 border-t border-white/10 bg-[#0a0a0a] px-4 pb-[calc(14px+env(safe-area-inset-bottom,0px))] pt-3">
        <div className="mb-2.5 flex items-baseline justify-between gap-3 text-[13px] text-white/55">
          <span>{t("food_byo_final_price")}</span>
          <strong className="text-xl font-extrabold text-white">
            {formatVnd(price.unitPrice)} VND
          </strong>
        </div>
        <button
          type="button"
          onClick={onAddToCart}
          className="w-full rounded-[14px] bg-gradient-to-br from-amber-300 to-amber-500 px-4 py-3.5 text-[15px] font-extrabold text-black"
        >
          {t("food_byo_add_to_cart").replace("{price}", formatVnd(price.unitPrice))}
        </button>
        {addToCartError ? (
          <p className="mt-2.5 text-center text-[13px] text-red-300">{addToCartError}</p>
        ) : null}
      </div>
    </div>
  );
}
