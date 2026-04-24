"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { getAssetUrl } from "@/lib/appVersion";

const STORAGE_KEY = "gastrobar_happy_hour_dismissed";
const DELAY_MS = 10_000;

export function HappyHourModal() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || typeof window === "undefined") return;
    if (sessionStorage.getItem(STORAGE_KEY) === "true") return;

    const timer = setTimeout(() => {
      setOpen(true);
    }, DELAY_MS);

    return () => clearTimeout(timer);
  }, [mounted]);

  const handleClose = () => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem(STORAGE_KEY, "true");
    }
    setOpen(false);
  };

  const modal = (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center px-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          <div className="pointer-events-none fixed inset-0 bg-black/40 backdrop-blur-sm" />
          <motion.div
            className="pointer-events-auto relative w-full max-w-sm rounded-[24px] border border-white/10 bg-black/80 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.85)] backdrop-blur-xl"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
            <button
              type="button"
              onClick={handleClose}
              className="absolute right-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/90 text-base text-white shadow-lg hover:bg-black active:scale-95"
              aria-label="Закрыть уведомление Happy Hour"
            >
              ✕
            </button>

            <div className="space-y-3 pt-2">
              <div className="relative overflow-hidden rounded-2xl border border-white/8 bg-black/40">
                <img
                  src={getAssetUrl("/menu/promo_happy_hour_ultra.png")}
                  alt="Happy Hours в GASTROBAR"
                  className="h-28 w-full object-cover"
                  loading="lazy"
                />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
              </div>

              <div className="space-y-1 px-1 pb-1">
                <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-white/70">
                  HAPPY HOURS
                </p>
                <p className="text-sm font-semibold text-white">
                  Ежедневно с 19:00 до 20:00 специальная цена на коктейльную карту.
                </p>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (!mounted || typeof document === "undefined" || !document.body) return null;
  try {
    return createPortal(modal, document.body);
  } catch {
    return null;
  }
}

