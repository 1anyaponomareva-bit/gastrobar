"use client";

import { useEffect } from "react";

/**
 * /durak: снимает pb-28 у body; помечает `<html>`, чтобы globals.css дал фон стола вместо «чёрной дыры».
 */
export function DurakBodyReset() {
  useEffect(() => {
    document.documentElement.setAttribute("data-durak-route", "1");
    document.body.style.setProperty("padding-bottom", "0", "important");
    return () => {
      document.documentElement.removeAttribute("data-durak-route");
      document.body.style.removeProperty("padding-bottom");
    };
  }, []);
  return null;
}
