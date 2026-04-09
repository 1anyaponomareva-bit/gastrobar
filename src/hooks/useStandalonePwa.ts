"use client";

import { useEffect, useState } from "react";

/** Добавлено на главный экран (PWA) — iOS `standalone`, Android/desktop `display-mode: standalone`. */
export function useStandalonePwa(): boolean {
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    const mqStandalone = window.matchMedia("(display-mode: standalone)");
    const mqFullscreen = window.matchMedia("(display-mode: fullscreen)");
    const sync = () => {
      const nav = window.navigator as Navigator & { standalone?: boolean };
      setStandalone(
        nav.standalone === true ||
          mqStandalone.matches === true ||
          mqFullscreen.matches === true,
      );
    };
    sync();
    mqStandalone.addEventListener("change", sync);
    mqFullscreen.addEventListener("change", sync);
    return () => {
      mqStandalone.removeEventListener("change", sync);
      mqFullscreen.removeEventListener("change", sync);
    };
  }, []);

  return standalone;
}
