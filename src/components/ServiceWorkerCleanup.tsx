"use client";

import { useEffect } from "react";

/**
 * Снимает старые service workers и очищает Cache Storage, чтобы не ловить
 * «FetchEvent.respondWith … Load failed» (Safari / PWA) после sw.js.
 * Не трогает localStorage (избранное и т.д.).
 */
export function ServiceWorkerCleanup() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const run = () => {
      const sw =
        "serviceWorker" in navigator
          ? navigator.serviceWorker
              .getRegistrations()
              .then((regs) => Promise.all(regs.map((r) => r.unregister())))
              .catch(() => undefined)
          : Promise.resolve();
      return sw
        .then(() => {
          if (!("caches" in window) || !window.caches?.keys) return;
          return window.caches.keys().then((keys) =>
            Promise.all(keys.map((k) => window.caches.delete(k).catch(() => false)))
          );
        })
        .catch(() => undefined);
    };

    if (document.readyState === "complete") void run();
    else window.addEventListener("load", () => void run(), { once: true });
  }, []);

  return null;
}
