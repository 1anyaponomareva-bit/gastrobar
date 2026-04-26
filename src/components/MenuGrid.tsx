"use client";

import { motion } from "framer-motion";
import type { MenuItem } from "@/data/menu";
import { getAssetUrl } from "@/lib/appVersion";
import { SmartImage } from "@/components/SmartImage";

export function MenuGrid({
  items,
  onSelect,
}: {
  items: MenuItem[];
  onSelect: (item: MenuItem) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-1.5 p-3 pb-28">
      {items.map((item, index) => (
        <motion.button
            key={item.id}
            type="button"
            onClick={() => onSelect(item)}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.25, delay: index * 0.02 }}
            className="relative w-full overflow-hidden rounded-xl focus:outline-none focus:ring-2 focus:ring-white/40 focus:ring-offset-2 focus:ring-offset-[#121212]"
            style={{ aspectRatio: "1 / 1" }}
        >
          <SmartImage
            src={getAssetUrl(item.image)}
            alt=""
            className="block h-full w-full object-cover object-center"
            style={{ width: "100%", height: "100%", aspectRatio: "1 / 1", objectFit: "cover" }}
            loading="lazy"
            onError={(e) => {
              const src = (e.target as HTMLImageElement)?.src ?? getAssetUrl(item.image);
              console.error("[MenuGrid] Ошибка загрузки изображения:", src, "id:", item.id);
            }}
          />
        </motion.button>
      ))}
    </div>
  );
}
