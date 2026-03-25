"use client";

import { useState, useEffect, useMemo } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { useHighlightProduct } from "@/components/HighlightProductContext";
import { WHEEL_SEGMENTS, type SpinOutcome, type WheelSegmentId } from "@/lib/wheel";
import {
  pickMimoLoseCopy,
  pickNoBonusLoseCopy,
  type WheelLoseCopyBundle,
} from "@/lib/wheelLoseCopy";
import type { Bonus } from "@/services/bonusService";
import { getBonusStatus, BONUS_PERIOD } from "@/services/bonusService";
import {
  BONUS_VALIDITY_LABEL,
  barNavigateButtonLabel,
  bonusDisplayTitle,
  type BonusTypeKey,
} from "@/lib/bonusCopy";

function formatLeft(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

/** Главный заголовок свитка при проигрыше — по id сектора из WHEEL_SEGMENTS. */
function wheelLoseSectorTitle(segmentId: string | undefined): string | null {
  if (segmentId === "mimo") return "Мимо";
  if (segmentId === "no_bonus") return "Без бонуса";
  return null;
}

/** Единый источник: подпись проигрышного сектора по индексу (segmentId в outcome может рассинхрониться). */
function lossWheelSegmentId(outcome: SpinOutcome): WheelSegmentId | undefined {
  if (!outcome.isLoss) return undefined;
  return WHEEL_SEGMENTS[outcome.segmentIndex]?.id;
}

/** Не показываем loseBundle.title вторым абзацем, если там снова то же, что в заголовке сектора. */
function loseTitleDuplicatesHeading(heading: string | null, bundleTitle: string): boolean {
  if (!heading) return false;
  const n = (s: string) => s.toLowerCase().replace(/ё/g, "е");
  const h = n(heading);
  const t = n(bundleTitle);
  if (h === n("Без бонуса") && t.includes("без бонуса")) return true;
  if (h === n("Мимо") && t.includes("мимо")) return true;
  return false;
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
  const { goToProduct, goToBarCategory } = useHighlightProduct();
  const [leftMs, setLeftMs] = useState(
    bonus ? Math.max(0, bonus.expiresAt - Date.now()) : 0
  );
  const loseBundle = useMemo<WheelLoseCopyBundle | null>(() => {
    if (!outcome.isLoss) return null;
    const id = lossWheelSegmentId(outcome);
    return id === "no_bonus" ? pickNoBonusLoseCopy() : pickMimoLoseCopy();
  }, [outcome.isLoss, outcome.segmentIndex]);

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
    const navCat = bonus.navBarCategory ?? null;
    const period = BONUS_PERIOD[bonus.type];
    const navLabel = barNavigateButtonLabel(navCat, hasProduct);
    const showNavButton = Boolean(navCat || hasProduct);

    const handleNavigateToMenu = () => {
      if (navCat) {
        goToBarCategory(navCat);
        onClose();
        return;
      }
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
          <p className="mt-2 text-xl font-bold leading-snug text-white">{bonus.title}</p>
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
          {navCat
            ? "Покажи код бармену при заказе · перейди в нужный раздел по кнопке ниже"
            : "Покажи код бармену при заказе · в меню открой позицию по кнопке ниже"}
        </p>

        <div className="flex w-full max-w-sm flex-col gap-2.5">
          <button
            type="button"
            onClick={() => onShowToBartender(bonus)}
            className="w-full rounded-full bg-amber-500 py-3.5 text-sm font-semibold text-black"
          >
            Показать бармену
          </button>
          {showNavButton && navLabel && (
            <button
              type="button"
              onClick={handleNavigateToMenu}
              className="w-full rounded-full border border-amber-500/45 bg-transparent py-3.5 text-sm font-semibold text-amber-400"
            >
              {navLabel}
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

  if (!isLose && !bonus) {
    const title = outcome.bonusType
      ? bonusDisplayTitle(outcome.bonusType as BonusTypeKey, null)
      : (WHEEL_SEGMENTS[outcome.segmentIndex]?.line1 ?? "Выигрыш");
    return (
      <div
        className="flex max-h-[min(85dvh,640px)] flex-col gap-4 px-5 py-6 text-center"
        style={{
          paddingTop: "max(1rem, env(safe-area-inset-top))",
          paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
        }}
      >
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-500/80">Ты выиграл</p>
        <p className="text-xl font-bold leading-snug text-white">{title}</p>
        <p className="text-sm leading-relaxed text-white/55">
          Не удалось сохранить код в приложении. Закрой окно и открой «Твои бонусы» или обратись к персоналу
          гастробара.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-2 w-full max-w-sm self-center rounded-full border border-amber-500/45 py-3 text-sm font-semibold text-amber-400"
        >
          Закрыть
        </button>
      </div>
    );
  }

  if (!isLose) return null;
  if (!loseBundle) return null;

  const sectorHeading = wheelLoseSectorTitle(lossWheelSegmentId(outcome));
  const showLoseBundleTitle = !loseTitleDuplicatesHeading(sectorHeading, loseBundle.title);

  return (
    <div
      className="flex flex-col items-center px-6 py-8 text-center"
      style={{
        paddingTop: "max(1rem, env(safe-area-inset-top))",
        paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
      }}
    >
      {sectorHeading && (
        <p className="text-2xl font-bold leading-tight text-white">{sectorHeading}</p>
      )}
      {showLoseBundleTitle ? (
        <p
          className={`max-w-[22rem] text-base font-semibold leading-snug text-white/90 ${sectorHeading ? "mt-2" : "text-2xl leading-tight text-white"}`}
        >
          {loseBundle.title}
        </p>
      ) : null}
      <p className="mt-3 max-w-[22rem] text-sm leading-relaxed text-white/70">{loseBundle.subtitle}</p>
      <button
        type="button"
        onClick={() => {
          setPeriod("bar");
          onAction("menu");
        }}
        className="mt-6 rounded-full bg-amber-500 px-8 py-3 font-semibold text-black"
      >
        Найти свой коктейль
      </button>
      <p className="mt-3 max-w-[22rem] text-xs leading-relaxed text-white/45">{loseBundle.footer}</p>
    </div>
  );
}
