"use client";

import { useEffect } from "react";

/** Снимает глобальный pb-28 у body только на /durak (без CSS :has — стабильнее в Next.js). */
export function DurakBodyReset() {
  useEffect(() => {
    document.body.style.setProperty("padding-bottom", "0", "important");
    return () => {
      document.body.style.removeProperty("padding-bottom");
    };
  }, []);
  return null;
}
