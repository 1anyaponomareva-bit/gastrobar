"use client";

import { useEffect } from "react";

const SESSION_KEY = "gastrobar_dev_chunk_reload";

/**
 * В `next dev` после правок кода старые JS-чанки в браузере иногда ломают страницу
 * (ChunkLoadError / failed dynamic import) — внешне «некорректное» отображение.
 * Один hard reload в такой ситуации обычно лечит без `npm run clean`.
 */
export function DevChunkLoadRecovery() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;

    const isChunkish = (msg: string) =>
      /ChunkLoadError|Loading chunk \d+ failed|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(
        msg
      );

    const tryReload = (detail: string) => {
      if (!isChunkish(detail)) return;
      if (sessionStorage.getItem(SESSION_KEY) === "1") return;
      sessionStorage.setItem(SESSION_KEY, "1");
      window.location.reload();
    };

    const onError = (e: ErrorEvent) => {
      const err = (e as ErrorEvent & { error?: { message?: string } }).error;
      const msg = [e.message, e.filename, err?.message].filter(Boolean).join(" ");
      tryReload(msg);
    };

    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason;
      const msg = r instanceof Error ? r.message : String(r);
      tryReload(msg);
    };

    const resetTimer = window.setTimeout(() => {
      try {
        sessionStorage.removeItem(SESSION_KEY);
      } catch {
        /* ignore */
      }
    }, 4_000);

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      window.clearTimeout(resetTimer);
    };
  }, []);

  return null;
}
