"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PROMOS, type PromoItem } from "@/data/promos";
import { getAssetUrl } from "@/lib/appVersion";
import { useBarHome } from "@/components/BarHomeContext";

const CENTER_SCALE = 1;
const SIDE_SCALE = 0.88;
const SIDE_ROTATE = 14;
const SWIPE_THRESHOLD = 48;
const CARD_ASPECT = 9 / 16;

function PromoSlide({
  promo,
  index,
  currentIndex,
  onSelect,
}: {
  promo: PromoItem;
  index: number;
  currentIndex: number;
  onSelect: () => void;
}) {
  const diff = index - currentIndex;
  const isCenter = diff === 0;
  const scale = isCenter ? CENTER_SCALE : SIDE_SCALE;
  const rotateY = -diff * SIDE_ROTATE;
  const zIndex = isCenter ? 20 : 10 - Math.abs(diff);
  const offsetXPercent = 52;

  return (
    <button
      type="button"
      onClick={onSelect}
      className="absolute left-1/2 top-[46%] flex flex-col overflow-hidden rounded-[20px] border transition-transform duration-300 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50"
      style={{
        width: "min(72vw, 268px)",
        aspectRatio: `${CARD_ASPECT}`,
        maxHeight: "68dvh",
        transform: `translate(-50%, -50%) translateX(${diff * offsetXPercent}%) scale(${scale}) rotateY(${rotateY}deg)`,
        zIndex,
        transformStyle: "preserve-3d",
        backfaceVisibility: "hidden",
        borderColor: isCenter ? "rgba(212,175,55,0.22)" : "rgba(255,255,255,0.06)",
        background: "#0c0c0c",
        boxShadow: isCenter
          ? "0 24px 48px rgba(0,0,0,0.65), 0 0 0 1px rgba(212,175,55,0.08), inset 0 1px 0 rgba(255,255,255,0.04)"
          : "0 12px 32px rgba(0,0,0,0.5)",
      }}
    >
      <div className="relative flex-1 overflow-hidden bg-[#111]">
        <img
          src={getAssetUrl(promo.image)}
          alt=""
          className={`h-full w-full ${promo.imageFit === "contain" ? "object-contain" : "object-cover"}`}
          style={{ opacity: isCenter ? 1 : 0.72 }}
        />
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-black/25 to-transparent"
          style={{ opacity: isCenter ? 1 : 0.85 }}
        />
      </div>
      <div
        className="absolute inset-x-0 bottom-0 px-4 pb-4 pt-10 text-left"
        style={{
          background: "linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.5) 45%, transparent 100%)",
        }}
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-500/70">Акция</p>
        <h3 className="mt-1.5 text-[17px] font-semibold leading-snug tracking-tight text-white/95 line-clamp-2">
          {promo.title}
        </h3>
        <p className="mt-2 font-medium tracking-wide text-amber-400/95" style={{ fontSize: "15px" }}>
          {promo.price}
        </p>
      </div>
    </button>
  );
}

export function PromoCarousel() {
  const { barHomeToken } = useBarHome();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [detailPromo, setDetailPromo] = useState<PromoItem | null>(null);
  const touchStartX = useRef(0);

  useEffect(() => {
    if (barHomeToken === 0) return;
    setCurrentIndex(0);
    setDetailPromo(null);
  }, [barHomeToken]);

  const goTo = useCallback((index: number) => {
    setCurrentIndex((prev) => Math.max(0, Math.min(PROMOS.length - 1, index)));
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const endX = e.changedTouches[0].clientX;
      const diff = touchStartX.current - endX;
      if (Math.abs(diff) > SWIPE_THRESHOLD) {
        if (diff > 0) goTo(currentIndex + 1);
        else goTo(currentIndex - 1);
      }
    },
    [currentIndex, goTo]
  );

  return (
    <div
      className="relative h-[100dvh] w-full overflow-hidden"
      style={{
        minHeight: "100dvh",
        maxHeight: "100dvh",
        touchAction: "pan-x",
        background: "radial-gradient(ellipse 100% 80% at 50% 20%, #151210 0%, #060606 55%, #030303 100%)",
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div
        className="relative h-full w-full"
        style={{ perspective: "1400px", transformStyle: "preserve-3d" }}
      >
        {PROMOS.map((promo, index) => (
          <PromoSlide
            key={promo.id}
            promo={promo}
            index={index}
            currentIndex={currentIndex}
            onSelect={() => {
              if (index === currentIndex) setDetailPromo(promo);
              else goTo(index);
            }}
          />
        ))}
      </div>

      <div
        className="absolute left-0 right-0 z-[35] flex justify-center gap-1.5"
        style={{
          bottom: "calc(6.25rem + env(safe-area-inset-bottom, 0px))",
        }}
      >
        {PROMOS.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => goTo(i)}
            className="h-1 rounded-full transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40"
            style={{
              width: i === currentIndex ? 22 : 6,
              backgroundColor: i === currentIndex ? "#C9A227" : "rgba(255,255,255,0.12)",
              opacity: i === currentIndex ? 1 : 0.65,
            }}
            aria-label={`Акция ${i + 1} из ${PROMOS.length}`}
          />
        ))}
      </div>

      <AnimatePresence>
        {detailPromo && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/75 backdrop-blur-md"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
            onClick={() => setDetailPromo(null)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 32, stiffness: 380 }}
              className="w-full max-w-md border-t border-amber-500/15 bg-[#0e0e0e] px-6 pt-6 shadow-[0_-20px_60px_rgba(0,0,0,0.85)]"
              style={{
                borderTopLeftRadius: "1.5rem",
                borderTopRightRadius: "1.5rem",
                paddingBottom: "max(1.75rem, calc(env(safe-area-inset-bottom) + 1rem))",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-white/15" aria-hidden />
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-500/65">
                    Подробнее
                  </p>
                  <h3 className="mt-2 text-xl font-semibold leading-snug text-white">
                    {detailPromo.title}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setDetailPromo(null)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/80"
                  aria-label="Закрыть"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <p className="text-[15px] leading-relaxed text-white/72">{detailPromo.description}</p>
              <p className="mt-5 text-lg font-semibold text-amber-400">{detailPromo.price}</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
