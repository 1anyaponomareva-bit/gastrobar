"use client";

import { createContext, useCallback, useContext, useState } from "react";
import type { MenuPeriod } from "@/lib/utils";
import { useTheme } from "@/components/ThemeProvider";
import { getListNavForProductId } from "@/lib/bonusProductNav";
import type { BarCategoryId, MenuCategoryId } from "@/components/CategoryTabs";

export type PendingListCategory = { bar: BarCategoryId } | { menu: MenuCategoryId };

type HighlightProductContextValue = {
  highlightProductId: string | null;
  setHighlightProductId: (id: string | null) => void;
  pendingListCategory: PendingListCategory | null;
  clearPendingListCategory: () => void;
  /** Открыть нужный раздел и вкладку, подсветить карточку */
  goToProduct: (period: MenuPeriod, productId: string) => void;
};

const HighlightProductContext = createContext<HighlightProductContextValue | null>(null);

export function HighlightProductProvider({ children }: { children: React.ReactNode }) {
  const { setPeriod } = useTheme();
  const [highlightProductId, setHighlightProductId] = useState<string | null>(null);
  const [pendingListCategory, setPendingListCategory] = useState<PendingListCategory | null>(null);

  const clearPendingListCategory = useCallback(() => setPendingListCategory(null), []);

  const goToProduct = useCallback(
    (period: MenuPeriod, productId: string) => {
      const nav = getListNavForProductId(productId);
      if (nav) {
        setPeriod(nav.period);
        setPendingListCategory(
          nav.period === "bar"
            ? { bar: nav.categoryTab as BarCategoryId }
            : { menu: nav.categoryTab as MenuCategoryId }
        );
      } else {
        setPeriod(period);
        setPendingListCategory(null);
      }
      setHighlightProductId(productId);
      setTimeout(() => setHighlightProductId(null), 5000);
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
