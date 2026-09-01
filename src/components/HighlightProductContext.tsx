"use client";

import { createContext, useCallback, useContext, useState } from "react";
import type { MenuPeriod } from "@/lib/utils";
import { useTheme } from "@/components/ThemeProvider";
import { getListNavForProductId } from "@/lib/bonusProductNav";
import { goToGastrofoodSnacks, isGastrofoodSnackProductId } from "@/lib/gastrofoodNav";
import {
  isPosterTestBonusNavigation,
  navigatePosterTestBonusCategory,
  navigatePosterTestBonusProduct,
} from "@/lib/posterTestBonusNav";
import type { BarCategoryId } from "@/components/CategoryTabs";

export type PendingListCategory = { bar: BarCategoryId };

type HighlightProductContextValue = {
  highlightProductId: string | null;
  setHighlightProductId: (id: string | null) => void;
  pendingListCategory: PendingListCategory | null;
  clearPendingListCategory: () => void;
  /** Открыть нужный раздел и вкладку, подсветить карточку */
  goToProduct: (period: MenuPeriod, productId: string) => void;
  /** Бар: перейти на вкладку списка (без подсветки позиции) */
  goToBarCategory: (categoryTab: BarCategoryId) => void;
};

const HighlightProductContext = createContext<HighlightProductContextValue | null>(null);

export function HighlightProductProvider({ children }: { children: React.ReactNode }) {
  const { setPeriod } = useTheme();
  const [highlightProductId, setHighlightProductId] = useState<string | null>(null);
  const [pendingListCategory, setPendingListCategory] = useState<PendingListCategory | null>(null);

  const clearPendingListCategory = useCallback(() => setPendingListCategory(null), []);

  const goToProduct = useCallback(
    (period: MenuPeriod, productId: string) => {
      if (isPosterTestBonusNavigation()) {
        navigatePosterTestBonusProduct(period, productId);
        return;
      }
      if (isGastrofoodSnackProductId(productId)) {
        goToGastrofoodSnacks();
        return;
      }
      const nav = getListNavForProductId(productId);
      if (nav) {
        setPeriod(nav.period);
        setPendingListCategory({ bar: nav.categoryTab });
      } else {
        setPeriod(period);
        setPendingListCategory(null);
      }
      setHighlightProductId(productId);
      setTimeout(() => setHighlightProductId(null), 5000);
    },
    [setPeriod]
  );

  const goToBarCategory = useCallback(
    (categoryTab: BarCategoryId) => {
      if (isPosterTestBonusNavigation()) {
        navigatePosterTestBonusCategory(categoryTab);
        return;
      }
      if (categoryTab === "snacks") {
        goToGastrofoodSnacks();
        return;
      }
      setPeriod("bar");
      setPendingListCategory({ bar: categoryTab });
      setHighlightProductId(null);
    },
    [setPeriod]
  );

  return (
    <HighlightProductContext.Provider
      value={{
        highlightProductId,
        setHighlightProductId,
        pendingListCategory,
        clearPendingListCategory,
        goToProduct,
        goToBarCategory,
      }}
    >
      {children}
    </HighlightProductContext.Provider>
  );
}

export function useHighlightProduct() {
  const ctx = useContext(HighlightProductContext);
  if (!ctx) throw new Error("useHighlightProduct must be used within HighlightProductProvider");
  return ctx;
}
