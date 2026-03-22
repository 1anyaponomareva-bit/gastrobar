"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { CONFIG } from "@/lib/config";

const STORAGE_LAST_SHOWN = "gastrobar-tg-popup-last-shown";
const SESSION_SHOWN = "gastrobar-tg-popup-shown-session";
/** Показ не чаще чем раз в N дней */
const COOLDOWN_DAYS = 5;
const DELAY_MS = 40_000;

const PROMO_IMAGE = "/menu/promo_tg_ultra.png";

function getLastShownAt(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_LAST_SHOWN);
    if (!raw) return null;
    const ts = parseInt(raw, 10);
    return Number.isFinite(ts) ? ts : null;
  } catch {
    return null;
  }
}

function isOnCooldown(lastShownAt: number): boolean {
  const cooldownMs = COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
  return Date.now() - lastShownAt < cooldownMs;
}

function wasShownThisBrowserSession(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(SESSION_SHOWN) === "1";
  } catch {
    return false;
  }
}

function markShown(): void {
  try {
    const now = Date.now();
    localStorage.setItem(STORAGE_LAST_SHOWN, String(now));
    sessionStorage.setItem(SESSION_SHOWN, "1");
  } catch {}
}

export function PromoBanner() {
  const [isVisible, setIsVisible] = useState(false);
  const [mounted, setMounted] = useState(false);

  const close = useCallback(() => {
    setIsVisible(false);
  }, []);

  const goToChannel = useCallback(() => {
    window.open(CONFIG.telegramUrl, "_blank", "noopener,noreferrer");
    setIsVisible(false);
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const last = getLastShownAt();
    if (last != null && isOnCooldown(last)) return;
    if (wasShownThisBrowserSession()) return;

    const timer = setTimeout(() => {
      const lastAgain = getLastShownAt();
      if (lastAgain != null && isOnCooldown(lastAgain)) return;
      if (wasShownThisBrowserSession()) return;
      markShown();
      setIsVisible(true);
    }, DELAY_MS);

    return () => clearTimeout(timer);
  }, [mounted]);

  if (!mounted || typeof document === "undefined") return null;
  /* Не монтируем портал, пока попап не нужен — пустой AnimatePresence в body мог перехватывать клики по всей странице */
  if (!isVisible) return null;

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{
        backgroundColor: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="relative w-[90vw] max-w-sm"
      >
        <a
          href={CONFIG.telegramUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            e.preventDefault();
            goToChannel();
          }}
          className="block overflow-hidden rounded-2xl bg-black"
          aria-label="Перейти в Telegram GASTROBAR"
        >
          <img
            src={PROMO_IMAGE}
            alt="Перейти в Telegram GASTROBAR"
            className="h-auto max-h-[85vh] w-full object-contain"
          />
        </a>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            close();
          }}
          className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white/90 backdrop-blur-sm transition hover:bg-black/80 hover:text-white"
          aria-label="Закрыть"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </motion.div>
    </motion.div>,
    document.body
  );
}
