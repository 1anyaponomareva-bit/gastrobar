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
    const apply = () => document.documentElement.setAttribute("data-period", p);
    if ("startViewTransition" in document) {
      (document as unknown as { startViewTransition: (cb: () => void) => void }).startViewTransition(apply);
    } else {
      apply();
    }
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
