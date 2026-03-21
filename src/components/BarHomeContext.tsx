"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { useHighlightProduct } from "@/components/HighlightProductContext";

type BarHomeContextValue = {
  /** Полный сброс: Бар → «Все», закрыть карточку, скролл наверх */
  requestBarHome: () => void;
  /** Счётчик для подписки (сброс локального UI в MenuList) */
  barHomeToken: number;
};

const BarHomeContext = createContext<BarHomeContextValue | null>(null);

export function BarHomeProvider({ children }: { children: React.ReactNode }) {
  const { setPeriod } = useTheme();
  const { setHighlightProductId } = useHighlightProduct();
  const [barHomeToken, setBarHomeToken] = useState(0);

  const requestBarHome = useCallback(() => {
    setPeriod("bar");
    setHighlightProductId(null);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
    }
    setBarHomeToken((t) => t + 1);
  }, [setPeriod, setHighlightProductId]);

  return (
    <BarHomeContext.Provider value={{ requestBarHome, barHomeToken }}>
      {children}
    </BarHomeContext.Provider>
  );
}

export function useBarHome() {
  const ctx = useContext(BarHomeContext);
  if (!ctx) throw new Error("useBarHome must be used within BarHomeProvider");
  return ctx;
}
