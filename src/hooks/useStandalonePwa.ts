"use client";

import { useEffect, useState } from "react";

/** Добавлено на главный экран (PWA) — iOS `standalone`, Android/desktop `display-mode: standalone`. */
export function useStandalonePwa(): boolean {
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(display-mode: standalone)");
    const sync = () => {
      const nav = window.navigator as Navigator & { standalone?: boolean };
      setStandalone(mq.matches === true || nav.standalone === true);
    };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return standalone;
}
