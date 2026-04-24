"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  getActiveBonus,
  getCurrentBonus,
  getBonusStatus,
  removeActiveBonus,
  formatRemainingTime,
  type Bonus,
} from "@/services/bonusService";
import { bonusDisplayTitleT } from "@/lib/bonusCopyI18n";
import type { BonusTypeKey } from "@/lib/bonusCopy";
import { useBonusScreen } from "@/components/BonusScreenContext";
import { useTranslation } from "@/lib/useTranslation";

export function BonusBanner() {
  const { t, lang } = useTranslation();
  const { openBonusScreen } = useBonusScreen();
  const [bonus, setBonus] = useState<Bonus | null>(null);
  const [showExpired, setShowExpired] = useState(false);

  useEffect(() => {
    const current = getCurrentBonus();
    if (current && getBonusStatus(current) === "expired") {
      removeActiveBonus();
      setShowExpired(true);
      setBonus(null);
      return;
    }
    const active = getActiveBonus();
    setBonus(active);
  }, []);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!bonus) return;
    const id = setInterval(() => {
      setNow(Date.now());
      const current = getCurrentBonus();
      if (current && current.id === bonus.id && getBonusStatus(current) === "expired") {
        removeActiveBonus();
        setBonus(null);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [bonus]);

  void now;

  if (showExpired) {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="fixed left-0 right-0 top-0 z-[45] mx-4 mt-4 rounded-2xl bg-white/10 p-4 backdrop-blur-md"
          style={{ marginTop: "max(1rem, env(safe-area-inset-top))" }}
        >
          <p className="text-center font-semibold text-white">{t("bonus_expired_toast")}</p>
          <button
            type="button"
            onClick={() => setShowExpired(false)}
            className="mt-3 w-full rounded-full bg-amber-500 py-2.5 font-semibold text-black"
          >
            {t("try_again_tomorrow")}
          </button>
        </motion.div>
      </AnimatePresence>
    );
  }

  if (!bonus) return null;

  const line2 = bonusDisplayTitleT(t, bonus.type as BonusTypeKey, bonus.productId ?? null, lang);

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed left-0 right-0 top-0 z-[45] mx-4 mt-2 rounded-xl border border-amber-500/30 bg-black/90 px-4 py-3 text-left shadow-lg"
      style={{ marginTop: "max(0.5rem, env(safe-area-inset-top))" }}
      onClick={() => openBonusScreen(bonus)}
    >
      <p className="text-sm font-semibold text-white">{t("active_bonus_banner")}</p>
      <p className="mt-0.5 text-sm text-white/90">{line2}</p>
      <p className="mt-0.5 text-xs text-amber-400/90">
        {t("remaining_colon")} {formatRemainingTime(bonus.expiresAt)}
      </p>
    </motion.button>
  );
}
