"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { MenuPeriod } from "@/lib/utils";
import { HOOKAH_MENU_ENABLED } from "@/lib/menuFeatures";

type ThemeContextValue = {
  period: MenuPeriod;
  setPeriod: (p: MenuPeriod) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({
  initialPeriod,
  children,
}: {
  initialPeriod: MenuPeriod;
  children: React.ReactNode;
}) {
  const [period, setPeriodState] = useState<MenuPeriod>(initialPeriod);

  useEffect(() => {
    document.documentElement.setAttribute("data-period", period);
  }, [period]);

  const setPeriod = (p: MenuPeriod) => {
    const next = p === "hookahs" && !HOOKAH_MENU_ENABLED ? "bar" : p;
    if (typeof document === "undefined") {
      setPeriodState(next);
      return;
    }
    document.documentElement.setAttribute("data-period", next);
    setPeriodState(next);
  };

  return (
    <ThemeContext.Provider value={{ period, setPeriod }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
