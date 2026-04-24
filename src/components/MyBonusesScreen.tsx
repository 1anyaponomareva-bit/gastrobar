"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import type { Bonus, BonusStatus } from "@/services/bonusService";
import {
  getActiveBonus,
  getBonusStatus,
  formatRemainingTime,
  isBonusExpired,
  removeActiveBonus,
  BONUS_PERIOD,
  isCategoryBonus,
} from "@/services/bonusService";
import { bonusDisplayTitleT, barNavigateButtonLabelT, barNavigateHintLineT } from "@/lib/bonusCopyI18n";
import type { BonusTypeKey } from "@/lib/bonusCopy";
import { useBonusScreen } from "@/components/BonusScreenContext";
import { useHighlightProduct } from "@/components/HighlightProductContext";
import { useTranslation } from "@/lib/useTranslation";

type Props = { onClose: () => void };

function statusToLabel(t: (k: string) => string, status: BonusStatus) {
  if (status === "active") return t("bonus_status_active");
  if (status === "redeemed") return t("bonus_status_redeemed");
  return t("bonus_status_expired");
}

export function MyBonusesScreen({ onClose }: Props) {
  const { t, lang } = useTranslation();
  const [bonus, setBonus] = useState<Bonus | null>(() => getActiveBonus());
  const { openBonusScreen } = useBonusScreen();
  const { goToProduct, goToBarCategory } = useHighlightProduct();

  useEffect(() => {
    const b = getActiveBonus();
    setBonus(b);
  }, []);

  useEffect(() => {
    if (!bonus) return;
    const id = setInterval(() => {
      if (isBonusExpired(bonus)) {
        removeActiveBonus();
        setBonus(null);
        return;
      }
      const current = getActiveBonus();
      setBonus(current ?? null);
    }, 1000);
    return () => clearInterval(id);
  }, [bonus?.id, bonus?.expiresAt]);

  if (!bonus) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-[1200] flex flex-col bg-[#0b0b0b]"
        style={{
          paddingTop: "max(0.75rem, env(safe-area-inset-top))",
          paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))",
        }}
      >
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="text-xl font-bold text-white">{t("my_bonuses_title")}</h1>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white"
            aria-label={t("close")}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <p className="text-white/70">{t("no_active_bonuses")}</p>
          <p className="mt-2 text-sm text-white/50">{t("spin_wheel_cta")}</p>
          <button
            type="button"
            onClick={onClose}
            className="mt-6 rounded-full border border-amber-500/50 bg-transparent px-6 py-2.5 font-semibold text-amber-400"
          >
            {t("close")}
          </button>
        </div>
      </motion.div>
    );
  }

  const status = getBonusStatus(bonus);
  const period = BONUS_PERIOD[bonus.type];
  const productId = bonus.productId;
  const navCat = bonus.navBarCategory ?? null;
  const navBtnLabel = barNavigateButtonLabelT(t, navCat, Boolean(productId));
  const navHint = barNavigateHintLineT(t, navCat);
  const title = bonusDisplayTitleT(t, bonus.type as BonusTypeKey, bonus.productId ?? null, lang);
  const hours = t("bonus_validity_label");
  const subline = navHint
    ? navHint
    : isCategoryBonus(bonus.type)
      ? t("my_bonuses_hint_cat")
          .replace("{hours}", hours)
          .replace("{section}", period === "bar" ? t("bar") : t("menu"))
      : t("my_bonuses_hint_item").replace("{hours}", hours);

  const handleShowBartender = () => {
    openBonusScreen(bonus);
    onClose();
  };

  const handleNavigateToMenu = () => {
    if (navCat) {
      goToBarCategory(navCat);
      onClose();
      return;
    }
    if (period && productId) goToProduct(period, productId);
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[1200] flex flex-col bg-[#0b0b0b]"
      style={{
        paddingTop: "max(0.75rem, env(safe-area-inset-top))",
        paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))",
      }}
    >
      <div className="flex items-center justify-between px-4 py-3">
        <h1 className="text-xl font-bold text-white">{t("my_bonuses_title")}</h1>
        <button
          type="button"
          onClick={onClose}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white"
          aria-label={t("close")}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6">
        <div className="mx-auto max-w-sm">
          <div
            className="rounded-2xl border border-amber-500/40 bg-[linear-gradient(180deg,rgba(26,24,22,0.95)_0%,rgba(15,14,13,0.98)_100%)] p-5 shadow-[0_0_32px_rgba(212,175,55,0.08)]"
          >
            <h2 className="text-lg font-bold leading-snug text-white">{title}</h2>
            <p className="mt-2 text-sm text-white/55">{subline}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                  status === "active"
                    ? "bg-amber-500/20 text-amber-400"
                    : status === "redeemed"
                      ? "bg-white/10 text-white/50"
                      : "bg-red-950/40 text-red-400/90"
                }`}
              >
                {statusToLabel(t, status)}
              </span>
              {status === "active" && (
                <span className="font-mono text-sm tabular-nums text-amber-400/95">
                  {t("remaining_prefix")} {formatRemainingTime(bonus.expiresAt)}
                </span>
              )}
            </div>
            <div className="mt-4 rounded-xl border border-amber-500/30 bg-black/40 px-4 py-3">
              <p className="text-[10px] uppercase tracking-widest text-white/50">{t("code_label")}</p>
              <p className="mt-1 font-mono text-xl font-bold tracking-wider text-amber-400">{bonus.id}</p>
            </div>

            <div className="mt-5 flex flex-col gap-3">
              <button
                type="button"
                onClick={handleShowBartender}
                className="w-full rounded-full border border-amber-500/50 bg-amber-500/15 py-3.5 font-semibold text-amber-400"
              >
                {t("show_to_bartender")}
              </button>
              {status === "active" && navBtnLabel && (
                <button
                  type="button"
                  onClick={handleNavigateToMenu}
                  className="w-full rounded-full border border-white/25 bg-white/10 py-3.5 font-semibold text-white"
                >
                  {navBtnLabel}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
