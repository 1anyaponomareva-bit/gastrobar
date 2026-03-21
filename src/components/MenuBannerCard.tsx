"use client";

import { motion } from "framer-motion";
import type { MenuItem } from "@/data/menu";

function formatVnd(price: string): string {
  const vnd = Number(price) || 0;
  if (vnd >= 1000) {
    const k = Math.round(vnd / 1000);
    return `${k.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}.000`;
  }
  return vnd.toString();
}

export function MenuBannerCard({
  item,
  index,
  onClick,
}: {
  item: MenuItem;
  index: number;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.03 }}
      className="relative w-full overflow-hidden rounded-none focus:outline-none focus:ring-2 focus:ring-white/40 focus:ring-inset"
      style={{ aspectRatio: "21 / 9", minHeight: 140 }}
    >
      {/* Фото на весь фон */}
      <img
        src={item.image}
        alt=""
        className="absolute inset-0 h-full w-full object-cover object-center"
      />
      {/* Градиент справа под текстом */}
      <div
        className="pointer-events-none absolute inset-y-0 right-0 w-1/2 min-w-[180px]"
        style={{
          background: "linear-gradient(to left, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 50%, transparent 100%)",
        }}
      />
      {/* Название и цена справа */}
      <div className="absolute inset-y-0 right-0 flex flex-col justify-center gap-0.5 pr-4 text-right">
        <span className="text-base font-bold leading-tight text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)]">
          {item.name}
        </span>
        <span className="text-sm font-semibold text-[var(--theme-accent)] drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)]">
          {formatVnd(item.price)} VND
        </span>
      </div>
    </motion.button>
  );
}
