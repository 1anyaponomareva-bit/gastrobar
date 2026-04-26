"use client";

import { motion } from "framer-motion";
import type { MenuItem } from "@/data/menu";
import { getAssetUrl } from "@/lib/appVersion";
import { SmartImage } from "@/components/SmartImage";
import { menuItemDisplayDescription, menuItemDisplayName } from "@/lib/menuItemI18n";
import { useTranslation } from "@/lib/useTranslation";

export function MenuCard({
  item,
  index,
}: {
  item: MenuItem;
  index: number;
}) {
  const { lang } = useTranslation();
  const title = menuItemDisplayName(item, lang);
  const blurb = menuItemDisplayDescription(item, lang);
  const vnd = Number(item.price) || 0;
  const formattedVnd =
    vnd >= 1000
      ? `${Math.round(vnd / 1000)
          .toString()
          .replace(/\B(?=(\d{3})+(?!\d))/g, ".")}.000`
      : vnd.toString();

  return (
    <motion.article
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: "easeOut", delay: index * 0.03 }}
      whileTap={{ scale: 0.98 }}
      className="relative h-[100dvh] w-full overflow-hidden bg-black"
    >
      {/* Фото на весь экран */}
      <div className="absolute inset-0 h-full w-full">
        <SmartImage
          src={getAssetUrl(item.image)}
          alt={title}
          className="min-h-full min-w-full h-full w-full object-cover object-center"
          loading="lazy"
        />
      </div>

      {/* Плавный градиент: начинается выше (~40% карточки), от чёрного в ноль */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[58%] min-h-[320px]"
        style={{
          background: `linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0.92) 18%, rgba(0,0,0,0.5) 45%, rgba(0,0,0,0.15) 70%, rgba(0,0,0,0) 100%)`,
        }}
      />

      {/* Название, описание и цена — выше строчки приёмов, крупнее */}
      <div className="absolute inset-x-0 bottom-0 px-4 pb-[max(calc(6rem+1cm),calc(env(safe-area-inset-bottom)+5rem+1cm))] pt-8">
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-2">
            <h3 className="text-xl font-semibold leading-tight text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">
              {title}
            </h3>
            <p className="line-clamp-2 text-[15px] leading-snug text-white/95 drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
              {blurb}
            </p>
          </div>
          <p className="shrink-0 text-base font-semibold text-[var(--theme-accent)] drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
            {formattedVnd}&nbsp;VND
          </p>
        </div>
      </div>
    </motion.article>
  );
}
