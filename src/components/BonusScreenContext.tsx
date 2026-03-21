"use client";

import { createContext, useCallback, useContext, useState } from "react";
import type { Bonus } from "@/services/bonusService";
import { BonusShowScreen } from "@/components/BonusShowScreen";

type BonusScreenContextValue = {
  openBonusScreen: (bonus: Bonus) => void;
  closeBonusScreen: () => void;
};

const BonusScreenContext = createContext<BonusScreenContextValue | null>(null);

export function BonusScreenProvider({ children }: { children: React.ReactNode }) {
  const [bonus, setBonus] = useState<Bonus | null>(null);

  const openBonusScreen = useCallback((b: Bonus) => setBonus(b), []);
  const closeBonusScreen = useCallback(() => setBonus(null), []);

  return (
    <BonusScreenContext.Provider value={{ openBonusScreen, closeBonusScreen }}>
      {children}
      {bonus && (
        <BonusShowScreen bonus={bonus} onClose={closeBonusScreen} />
      )}
    </BonusScreenContext.Provider>
  );
}

export function useBonusScreen() {
  const ctx = useContext(BonusScreenContext);
  if (!ctx) throw new Error("useBonusScreen must be used within BonusScreenProvider");
  return ctx;
}
