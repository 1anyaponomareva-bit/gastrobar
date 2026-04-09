"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { MenuItem } from "@/data/menu";
import { strengthDisplayLabel } from "@/data/menu";

function formatVnd(price: string): string {
  const vnd = Number(price) || 0;
  if (vnd >= 1000) {
    const k = Math.round(vnd / 1000);
    return `${k.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}.000`;
  }
  return vnd.toString();
}

const SWIPE_THRESHOLD = 60;

export function MenuDetailView({
  items,
  initialIndex,
  onClose,
}: {
  items: MenuItem[];
  initialIndex: number;
  onClose: () => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(
    Math.max(0, Math.min(initialIndex, items.length - 1))
  );
  const [dragY, setDragY] = useState(0);
  const [isExiting, setIsExiting] = useState(false);
  const [slideDirection, setSlideDirection] = useState(0); // 1 = вверх/след, -1 = вниз/пред
  const startY = useRef(0);

  const item = items[currentIndex];
  const strengthLbl = item ? strengthDisplayLabel(item) : null;
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < items.length - 1;

  const runClose = useCallback(() => {
    if (isExiting) return;
    setIsExiting(true);
  }, [isExiting]);

  const handleCloseComplete = useCallback(() => {
    onClose();
  }, [onClose]);

  const goPrev = useCallback(() => {
    if (hasPrev) {
      setSlideDirection(-1);
      setCurrentIndex((i) => i - 1);
    } else runClose();
  }, [hasPrev, runClose]);

  const goNext = useCallback(() => {
    if (hasNext) {
      setSlideDirection(1);
      setCurrentIndex((i) => i + 1);
    }
  }, [hasNext]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const y = e.touches[0].clientY;
    setDragY(y - startY.current);
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (dragY > SWIPE_THRESHOLD) {
      goPrev();
    } else if (dragY < -SWIPE_THRESHOLD) {
      goNext();
    }
    setDragY(0);
  }, [dragY, goPrev, goNext]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") runClose();
      if (e.key === "ArrowDown") goPrev();
      if (e.key === "ArrowUp") goNext();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [runClose, goPrev, goNext]);

  if (!item) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{
        opacity: isExiting ? 0 : 1,
        scale: isExiting ? 0.98 : 1,
        y: isExiting ? 24 : dragY * 0.4,
      }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      onAnimationComplete={() => {
        if (isExiting) handleCloseComplete();
      }}
      className="fixed inset-0 z-[1100] flex flex-col bg-black origin-center"
      style={{ touchAction: "pan-y" }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Кнопка Назад */}
      <button
        type="button"
        onClick={runClose}
        className="absolute left-4 top-[max(18px,calc(env(safe-area-inset-top)+6px))] z-20 flex h-11 w-11 items-center justify-center rounded-full bg-black/70 text-white shadow-lg backdrop-blur-md hover:bg-black/90"
        aria-label="Назад"
      >
        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      {/* Счётчик позиции */}
      {items.length > 1 && (
        <div className="absolute right-4 top-[max(18px,calc(env(safe-area-inset-top)+6px))] z-20 rounded-full bg-black/50 px-3 py-1.5 text-sm font-medium text-white/90 backdrop-blur-sm">
          {currentIndex + 1} / {items.length}
        </div>
      )}

      <AnimatePresence initial={false} mode="wait">
        <motion.div
          key={item.id}
          initial={{
            opacity: slideDirection === 0 ? 1 : 0,
            y: slideDirection === 0 ? 0 : slideDirection > 0 ? 80 : -80,
          }}
          animate={{ opacity: 1, y: dragY * 0.4 }}
          exit={{ opacity: 0, y: slideDirection > 0 ? -80 : 80 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="absolute inset-0"
        >
          {/* Фото / иллюстрация на весь экран */}
          <div
            className={`absolute inset-0 ${item.category === "hookah" ? "bg-gradient-to-b from-zinc-900 via-black to-black" : ""}`}
          >
            <img
              src={item.image}
              alt={item.name}
              className={
                item.category === "hookah"
                  ? "h-full min-h-full w-full min-w-full object-cover object-center"
                  : "h-full w-full object-cover object-center"
              }
            />
          </div>

          {/* Градиент внизу */}
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 min-h-[280px]"
            style={{
              height: "40vh",
              background: `linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0.98) 15%, rgba(0,0,0,0.9) 35%, rgba(0,0,0,0.6) 55%, rgba(0,0,0,0.25) 78%, rgba(0,0,0,0) 100%)`,
            }}
          />

          {/* Текст в тёмной зоне: крупное название, описание, цена, граммовка/объём */}
          <div className="absolute inset-x-0 bottom-0 px-4 pb-[max(calc(6rem+1cm),calc(env(safe-area-inset-bottom)+5rem+1cm))] pt-10">
            <div className="space-y-3">
              {item.badge === "hit" && (
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-black"
                  style={{ backgroundColor: "#F59E0B", boxShadow: "0 0 14px rgba(245,158,11,0.5)" }}
                >
                  <span>🔥</span>
                  <span>Хит продаж</span>
                </span>
              )}
              <h2 className="text-2xl font-semibold leading-tight text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] sm:text-3xl">
                {item.name}
              </h2>
              {strengthLbl && (
                <span
                  className="mt-1.5 inline-flex w-fit rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide"
                  style={{
                    backgroundColor:
                      item.strength === "weak"
                        ? "rgba(34,197,94,0.3)"
                        : item.strength === "medium"
                          ? "rgba(245,158,11,0.3)"
                          : "rgba(239,68,68,0.3)",
                    color:
                      item.strength === "weak"
                        ? "#86efac"
                        : item.strength === "medium"
                          ? "#fcd34d"
                          : "#fca5a5",
                  }}
                >
                  {strengthLbl}
                </span>
              )}
              <p className="line-clamp-3 text-[15px] leading-snug text-white/95 drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
                {item.description || "Описание блюда."}
              </p>
              {item.category === "hookah" && item.tobacco && (
                <p className="text-sm font-medium text-white/85 drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
                  Табак · {item.tobacco}
                </p>
              )}
              {item.category === "hookah" && item.flavor && (
                <p className="text-sm text-white/75 drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
                  Вкус · {item.flavor}
                </p>
              )}
              {item.taste && (
                <p className="text-sm text-white/75 drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
                  {item.taste}
                </p>
              )}
              {item.category === "food" && item.pairing && item.pairing.length > 0 && (
                <p className="text-sm text-white/70 drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
                  {item.pairing.map((p) => (p === "beer" ? "к пиву" : p === "cocktail" ? "к коктейлям" : "к вину")).join(", ")}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <p className="text-xl font-semibold text-[#D4AF37] drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)] sm:text-2xl">
                  {formatVnd(item.price)} VND
                </p>
                <p className="text-sm text-white/90 drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
                  {item.grammage ??
                    (item.category === "cocktail" ? "300 мл" : item.category === "hookah" ? "50–60 мин" : "150 г")}
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}
