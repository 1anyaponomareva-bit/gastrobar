"use client";

import { useState, useEffect } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { useHighlightProduct } from "@/components/HighlightProductContext";
import type { SpinOutcome } from "@/lib/wheel";
import type { Bonus } from "@/services/bonusService";
import { getBonusStatus, BONUS_PERIOD, isCategoryBonus } from "@/services/bonusService";
import { BONUS_VALIDITY_LABEL } from "@/lib/bonusCopy";

function formatLeft(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

const LOSE_VARIANTS: Array<{
  title: string;
  subtitle: string;
  button: string;
  footnote: string;
}> = [
  {
    title: "В этот раз мимо 😏",
    subtitle: "Но это не та история, где уходят с пустыми руками",
    button: "Выбрать напиток",
    footnote: "Б-52 сейчас берут чаще всего 👀",
  },
  {
    title: "Не сегодня 😏",
    subtitle: "Но ты явно знаешь, куда заходить",
    button: "Выбрать напиток",
    footnote: "Виски сауэр сейчас в топе 👀",
  },
  {
    title: "Без бонуса… но с хорошим вкусом 😏",
    subtitle: "А это здесь важнее",
    button: "Найти свой коктейль",
    footnote: "Бармен сегодня часто делает Б-52 👀",
  },
  {
    title: "Колесо капризничает 😏",
    subtitle: "Зато меню сегодня в настроении",
    button: "Посмотреть хиты",
    footnote: "Светлое Sapporo сейчас разлетается 👀",
  },
  {
    title: "Не выпало 😏",
    subtitle: "Значит возьмёшь что-то поинтереснее",
    button: "Выбрать напиток",
    footnote: "Попробуй Виски сауэр — не промахнёшься 👀",
  },
  {
    title: "Сегодня без подарка 😏",
    subtitle: "Но с таким выбором он и не нужен",
    button: "Открыть меню",
    footnote: "Б-52 сейчас чаще всего заказывают 👀",
  },
];

function pickLoseVariant(): (typeof LOSE_VARIANTS)[number] {
  return LOSE_VARIANTS[Math.floor(Math.random() * LOSE_VARIANTS.length)]!;
}

type Props = {
  outcome: SpinOutcome;
  bonus: Bonus | null;
  onClose: () => void;
  onAction: (action: "menu" | "close") => void;
  onShowToBartender: (bonus: Bonus) => void;
};

export function WheelResultView({
  outcome,
  bonus,
  onClose,
  onAction,
  onShowToBartender,
}: Props) {
  const { setPeriod } = useTheme();
  const { goToProduct } = useHighlightProduct();
  const [leftMs, setLeftMs] = useState(
    bonus ? Math.max(0, bonus.expiresAt - Date.now()) : 0
  );
  const [loseVariant] = useState(() => pickLoseVariant());

  useEffect(() => {
    if (!bonus) return;
    const t = setInterval(() => {
      setLeftMs(Math.max(0, bonus.expiresAt - Date.now()));
    }, 1000);
    return () => clearInterval(t);
  }, [bonus]);

  const isLose = outcome.isLoss;

  if (bonus && !isLose) {
    const status = getBonusStatus(bonus);
    const hasProduct = Boolean(bonus.productId);
    const period = BONUS_PERIOD[bonus.type];
    const isCategory = isCategoryBonus(bonus.type);

    const handleGoToProduct = () => {
      if (bonus.productId) {
        goToProduct(period, bonus.productId);
        onClose();
      }
    };

    return (
      <div
        className="flex max-h-[min(85dvh,640px)] flex-col gap-5 overflow-y-auto px-5 py-6 text-center"
        style={{
          paddingTop: "max(1rem, env(safe-area-inset-top))",
          paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
        }}
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-500/80">
            Ты выиграл
          </p>
          <h2 className="mt-2 text-xl font-bold leading-snug text-white">{bonus.title}</h2>
          <p className="mt-3 text-sm leading-relaxed text-white/70">{bonus.description}</p>
        </div>

        <div className="w-full rounded-2xl border border-amber-500/35 bg-black/40 px-4 py-4 text-left">
          <p className="text-[10px] uppercase tracking-widest text-white/45">Код для бармена</p>
          <p className="mt-1 font-mono text-xl font-bold tracking-wider text-amber-400">{bonus.id}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
            <span className="font-mono text-lg tabular-nums text-amber-400/95">{formatLeft(leftMs)}</span>
            <span className="text-xs text-white/50">· действует {BONUS_VALIDITY_LABEL}</span>
            <span
              className={`ml-auto rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                status === "active"
                  ? "bg-emerald-500/20 text-emerald-400"
                  : status === "redeemed"
                    ? "bg-white/10 text-white/45"
                    : "bg-red-500/15 text-red-400"
              }`}
            >
              {status === "active" ? "Активен" : status === "redeemed" ? "Использован" : "Истёк"}
            </span>
          </div>
        </div>

        <p className="text-xs text-white/50">
          Покажи код бармену при заказе · в меню открой позицию по кнопке ниже
        </p>

        <div className="flex w-full max-w-sm flex-col gap-2.5">
          <button
            type="button"
            onClick={() => onShowToBartender(bonus)}
            className="w-full rounded-full bg-amber-500 py-3.5 text-sm font-semibold text-black"
          >
            Показать бармену
          </button>
          {hasProduct && (
            <button
              type="button"
              onClick={handleGoToProduct}
              className="w-full rounded-full border border-amber-500/45 bg-transparent py-3.5 text-sm font-semibold text-amber-400"
            >
              {isCategory ? "Перейти в категорию" : "Перейти к позиции в меню"}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2 text-sm font-medium text-white/45"
          >
            Закрыть
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col items-center gap-6 px-6 py-8 text-center"
      style={{
        paddingTop: "max(1rem, env(safe-area-inset-top))",
        paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
      }}
    >
      <p className="text-xl font-semibold text-white">{loseVariant.title}</p>
      <p className="text-white/70">{loseVariant.subtitle}</p>
      <button
        type="button"
        onClick={() => {
          setPeriod("bar");
          onAction("menu");
        }}
        className="rounded-full bg-amber-500 px-8 py-3 font-semibold text-black"
      >
        {loseVariant.button}
      </button>
      <p className="text-xs text-white/45">{loseVariant.footnote}</p>
    </div>
  );
}
