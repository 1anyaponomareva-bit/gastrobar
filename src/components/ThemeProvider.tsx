"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { MenuPeriod } from "@/lib/utils";

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
    if (typeof document === "undefined") {
      setPeriodState(p);
      return;
    }
    document.documentElement.setAttribute("data-period", p);
    setPeriodState(p);
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
