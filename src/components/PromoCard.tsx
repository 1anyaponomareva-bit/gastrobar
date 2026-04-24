"use client";

import { motion } from "framer-motion";

import { getAssetUrl } from "@/lib/appVersion";

const PROMO_IMAGE = "/menu/promo_happy_hour_ultra.png";
const PROMO_TITLE = "HAPPY HOURS";
const PROMO_DESCRIPTION =
  "Ежедневно с 19:00 до 20:00 специальная цена на коктейльную карту.";

export function PromoCard() {
  return (
    <motion.article
      initial={{ opacity: 1, y: 0 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      whileTap={{ scale: 0.98 }}
      className="relative h-[100dvh] w-full overflow-hidden bg-black"
    >
      <div className="absolute inset-0 h-full w-full">
        <img
          src={getAssetUrl(PROMO_IMAGE)}
          alt={PROMO_TITLE}
          className="min-h-full min-w-full h-full w-full object-cover object-center"
          loading="eager"
        />
      </div>
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[58%] min-h-[320px]"
        style={{
          background: `linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0.92) 18%, rgba(0,0,0,0.5) 45%, rgba(0,0,0,0.15) 70%, rgba(0,0,0,0) 100%)`,
        }}
      />
      <div className="absolute inset-x-0 bottom-0 px-4 pb-[max(calc(6rem+1cm),calc(env(safe-area-inset-bottom)+5rem+1cm))] pt-28">
        <div className="space-y-2">
          <h3 className="text-xl font-semibold leading-tight text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">
            {PROMO_TITLE}
          </h3>
          <p className="line-clamp-3 text-[15px] leading-snug text-white/95 drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
            {PROMO_DESCRIPTION}
          </p>
        </div>
      </div>
    </motion.article>
  );
}
