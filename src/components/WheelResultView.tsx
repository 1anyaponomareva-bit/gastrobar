"use client";

import { useState, useEffect, useMemo } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { useHighlightProduct } from "@/components/HighlightProductContext";
import { WHEEL_SEGMENTS, type SpinOutcome, type WheelSegmentId } from "@/lib/wheel";
import {
  mimoLoseCopyFromT,
  noBonusLoseCopyFromT,
  pickMimoLoseIndex,
  pickNoBonusLoseIndex,
  type WheelLoseCopyBundle,
} from "@/lib/wheelLoseCopy";
import type { Bonus } from "@/services/bonusService";
import { getBonusStatus, BONUS_PERIOD } from "@/services/bonusService";
import {
  bonusDisplayTitleT,
  barNavigateButtonLabelT,
  bonusDisplayDescriptionT,
} from "@/lib/bonusCopyI18n";
import type { BonusTypeKey } from "@/lib/bonusCopy";
import { useTranslation } from "@/lib/useTranslation";
import { wheelSegmentWinTitleT } from "@/lib/wheelCopyI18n";

function formatLeft(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function wheelLoseSectorTitle(segmentId: string | undefined, t: (k: string) => string): string | null {
  if (segmentId === "mimo") return t("wheel_sector_mimo");
  if (segmentId === "no_bonus") return t("wheel_sector_no_bonus");
  return null;
}

function lossWheelSegmentId(outcome: SpinOutcome): WheelSegmentId | undefined {
  if (!outcome.isLoss) return undefined;
  return WHEEL_SEGMENTS[outcome.segmentIndex]?.id;
}

function loseTitleDuplicatesHeading(heading: string | null, bundleTitle: string): boolean {
  if (!heading) return false;
  const n = (s: string) => s.toLowerCase().replace(/ё/g, "е").trim();
  const h = n(heading).split(/\s+/)[0] ?? "";
  if (!h || h.length < 2) return false;
  return n(bundleTitle).includes(h);
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
  const { t, lang } = useTranslation();
  const { setPeriod } = useTheme();
  const { goToProduct, goToBarCategory } = useHighlightProduct();
  const [leftMs, setLeftMs] = useState(
    bonus ? Math.max(0, bonus.expiresAt - Date.now()) : 0
  );

  const lossSegId = lossWheelSegmentId(outcome);
  const losePackIndex = useMemo(() => {
    if (!outcome.isLoss) return 0;
    return lossSegId === "no_bonus" ? pickNoBonusLoseIndex() : pickMimoLoseIndex();
  }, [outcome.isLoss, outcome.segmentIndex, lossSegId]);

  const loseBundle = useMemo<WheelLoseCopyBundle | null>(() => {
    if (!outcome.isLoss) return null;
    return lossSegId === "no_bonus"
      ? noBonusLoseCopyFromT(t, losePackIndex)
      : mimoLoseCopyFromT(t, losePackIndex);
  }, [outcome.isLoss, lossSegId, losePackIndex, t]);

  useEffect(() => {
    if (!bonus) return;
    const id = setInterval(() => {
      setLeftMs(Math.max(0, bonus.expiresAt - Date.now()));
    }, 1000);
    return () => clearInterval(id);
  }, [bonus]);

  const isLose = outcome.isLoss;
  const hoursLbl = t("bonus_validity_label");

  if (bonus && !isLose) {
    const status = getBonusStatus(bonus);
    const hasProduct = Boolean(bonus.productId);
    const navCat = bonus.navBarCategory ?? null;
    const period = BONUS_PERIOD[bonus.type];
    const navLabel = barNavigateButtonLabelT(t, navCat, hasProduct);
    const showNavButton = Boolean(navCat || hasProduct);
    const title = bonusDisplayTitleT(t, bonus.type as BonusTypeKey, bonus.productId ?? null, lang);
    const desc = bonusDisplayDescriptionT(t, bonus.type as BonusTypeKey, bonus.productId ?? null, lang);

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
            {t("you_won")}
          </p>
          <p className="mt-2 text-xl font-bold leading-snug text-white">{title}</p>
          <p className="mt-3 text-sm leading-relaxed text-white/70">{desc}</p>
        </div>

        <div className="w-full rounded-2xl border border-amber-500/35 bg-black/40 px-4 py-4 text-left">
          <p className="text-[10px] uppercase tracking-widest text-white/45">
            {t("wheel_bartender_code")}
          </p>
          <p className="mt-1 font-mono text-xl font-bold tracking-wider text-amber-400">{bonus.id}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
            <span className="font-mono text-lg tabular-nums text-amber-400/95">{formatLeft(leftMs)}</span>
            <span className="text-xs text-white/50">
              {t("valid_for").replace("{hours}", hoursLbl)}
            </span>
            <span
              className={`ml-auto rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                status === "active"
                  ? "bg-emerald-500/20 text-emerald-400"
                  : status === "redeemed"
                    ? "bg-white/10 text-white/45"
                    : "bg-red-500/15 text-red-400"
              }`}
            >
              {status === "active"
                ? t("bonus_status_active")
                : status === "redeemed"
                  ? t("bonus_status_redeemed")
                  : t("bonus_status_expired")}
            </span>
          </div>
        </div>

        <p className="text-xs text-white/50">
          {navCat ? t("hint_nav") : t("hint_menu")}
        </p>

        <div className="flex w-full max-w-sm flex-col gap-2.5">
          <button
            type="button"
            onClick={() => onShowToBartender(bonus)}
            className="w-full rounded-full bg-amber-500 py-3.5 text-sm font-semibold text-black"
          >
            {t("show_to_bartender")}
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
            {t("close")}
          </button>
        </div>
      </div>
    );
  }

  if (!isLose && !bonus) {
    const winTitle = outcome.bonusType
      ? bonusDisplayTitleT(t, outcome.bonusType as BonusTypeKey, null, lang)
      : wheelSegmentWinTitleT(t, WHEEL_SEGMENTS[outcome.segmentIndex]?.id);
    return (
      <div
        className="flex max-h-[min(85dvh,640px)] flex-col gap-4 px-5 py-6 text-center"
        style={{
          paddingTop: "max(1rem, env(safe-area-inset-top))",
          paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
        }}
      >
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-500/80">
          {t("wheel_could_not_save")}
        </p>
        <p className="text-xl font-bold leading-snug text-white">{winTitle}</p>
        <p className="text-sm leading-relaxed text-white/55">{t("wheel_save_error_body")}</p>
        <button
          type="button"
          onClick={onClose}
          className="mt-2 w-full max-w-sm self-center rounded-full border border-amber-500/45 py-3 text-sm font-semibold text-amber-400"
        >
          {t("close")}
        </button>
      </div>
    );
  }

  if (!isLose) return null;
  if (!loseBundle) return null;

  const sectorHeading = wheelLoseSectorTitle(lossSegId, t);
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
        {t("find_cocktail")}
      </button>
      <p className="mt-3 max-w-[22rem] text-xs leading-relaxed text-white/45">{loseBundle.footer}</p>
    </div>
  );
}
