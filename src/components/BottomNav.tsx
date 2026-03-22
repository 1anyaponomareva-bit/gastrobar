"use client";

import { motion } from "framer-motion";
import { useTheme } from "@/components/ThemeProvider";
import type { MenuPeriod } from "@/lib/utils";
import { cn } from "@/lib/utils";

const TABS: { id: MenuPeriod; label: string }[] = [
  { id: "bar", label: "Бар" },
  { id: "promo", label: "Акции" },
  { id: "favorites", label: "Любимое" },
];

export function BottomNav() {
  const { period, setPeriod } = useTheme();

  return (
    <motion.nav
      initial={{ opacity: 1, y: 0 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center safe-bottom"
    >
      <div className="pointer-events-auto mx-auto flex max-w-xs items-center justify-between rounded-full bg-white/10 px-2.5 py-2.5 text-sm text-white shadow-[0_18px_60px_rgba(0,0,0,0.9)] backdrop-blur-md">
        {TABS.map((tab) => {
          const active = tab.id === period;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setPeriod(tab.id)}
              className={cn(
                "relative mx-1 flex-1 rounded-full px-3 py-2 text-[13px] font-medium transition-all",
                active
                  ? "bg-white text-black shadow-sm"
                  : "text-white/70 hover:text-white"
              )}
            >
              <motion.span
                className="mr-1 inline-flex items-center justify-center"
                animate={
                  active
                    ? tab.id === "bar"
                      ? {
                          scale: [1, 1.35, 1],
                          rotate: [0, -10, 10, 0],
                          y: [0, -2, 0],
                        }
                      : tab.id === "favorites"
                        ? { scale: [1, 1.2, 1] }
                        : {
                            scale: [1, 1.25, 1],
                            y: [0, -3, 0],
                          }
                    : { scale: 1, rotate: 0, y: 0 }
                }
                transition={
                  active
                    ? {
                        duration: tab.id === "bar" ? 0.9 : tab.id === "favorites" ? 0.6 : 0.7,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }
                    : { duration: 0.2 }
                }
              >
                {tab.id === "bar" && "🍸"}
                {tab.id === "promo" && "🎉"}
                {tab.id === "favorites" && "❤️"}
              </motion.span>
              {tab.label}
            </button>
          );
        })}
      </div>
    </motion.nav>
  );
}
