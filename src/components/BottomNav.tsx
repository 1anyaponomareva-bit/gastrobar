"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "@/components/ThemeProvider";
import { abandonDurakStoredRoom } from "@/lib/durak/activeRoomStorage";
import type { MenuPeriod } from "@/lib/utils";
import { cn } from "@/lib/utils";

const TABS: { id: MenuPeriod; label: string }[] = [
  { id: "bar", label: "Бар" },
  { id: "hookahs", label: "Кальяны" },
  { id: "promo", label: "Акции" },
  { id: "favorites", label: "Любимое" },
];

export function BottomNav() {
  const { period, setPeriod } = useTheme();
  const pathname = usePathname();
  const router = useRouter();
  const path = pathname ?? "";
  const onGames = path === "/games" || path === "/durak" || path.startsWith("/durak/");

  const goPeriod = (id: MenuPeriod) => {
    if (onGames) abandonDurakStoredRoom();
    setPeriod(id);
    if (path !== "/") router.push("/");
  };

  return (
    <motion.nav
      initial={{ opacity: 1, y: 0 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-4 flex justify-center safe-bottom px-3",
        onGames ? "z-[1050]" : "z-40",
      )}
    >
      <div className="pointer-events-auto mx-auto flex w-[min(24.5rem,calc(100vw-1rem))] max-w-none flex-nowrap items-center justify-between gap-0 rounded-full bg-white/10 px-1.5 py-1.5 text-sm text-white shadow-[0_18px_60px_rgba(0,0,0,0.9)] backdrop-blur-md sm:w-[min(26rem,calc(100vw-2rem))] sm:gap-0.5 sm:px-2 sm:py-2">
        {TABS.map((tab) => {
          const active = !onGames && tab.id === period;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => goPeriod(tab.id)}
              className={cn(
                "relative flex min-w-[2.85rem] flex-1 flex-col items-center justify-center gap-0.5 rounded-full px-0.5 py-1.5 text-[12px] font-medium transition-all sm:min-w-0 sm:px-1 sm:py-2",
                active
                  ? "bg-white text-black shadow-sm"
                  : "text-white/70 hover:text-white"
              )}
            >
              <motion.span
                className={cn(
                  "inline-flex min-h-[1.25em] items-center justify-center text-[1.05rem] leading-none sm:text-[1.1rem]",
                  tab.id === "hookahs" && "min-h-[1.75rem] min-w-[1.75rem]",
                )}
                animate={
                  active
                    ? tab.id === "bar"
                      ? {
                          scale: [1, 1.35, 1],
                          rotate: [0, -10, 10, 0],
                          y: [0, -2, 0],
                        }
                      : tab.id === "hookahs"
                        ? {
                            scale: [1, 1.15, 1],
                            y: [0, -4, -1, -3, 0],
                            rotate: [0, -4, 4, -2, 0],
                            opacity: [1, 0.92, 1, 0.95, 1],
                          }
                        : tab.id === "favorites"
                          ? { scale: [1, 1.2, 1] }
                          : {
                              scale: [1, 1.25, 1],
                              y: [0, -3, 0],
                            }
                    : { scale: 1, rotate: 0, y: 0, opacity: 1 }
                }
                transition={
                  active
                    ? {
                        duration:
                          tab.id === "bar" ? 0.9 : tab.id === "hookahs" ? 1.05 : tab.id === "favorites" ? 0.6 : 0.7,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }
                    : { duration: 0.2 }
                }
              >
                {tab.id === "bar" && "🍸"}
                {tab.id === "hookahs" && (
                  <img
                    src="/hookah/emojie.png"
                    alt=""
                    width={28}
                    height={28}
                    draggable={false}
                    className={cn(
                      "pointer-events-none h-7 w-7 max-h-[1.75rem] max-w-[1.75rem] select-none object-contain",
                      /* На тёмной кнопке «убираем» чёрный мат в PNG/JPG; на активной белой — обычное наложение */
                      active ? "mix-blend-normal" : "mix-blend-screen",
                    )}
                  />
                )}
                {tab.id === "promo" && "🎉"}
                {tab.id === "favorites" && "❤️"}
              </motion.span>
              <span className="max-w-[3.5rem] text-center text-[8px] leading-tight sm:max-w-none sm:whitespace-nowrap sm:text-[10px]">
                {tab.label}
              </span>
            </button>
          );
        })}
        <Link
          href="/games"
          className={cn(
            "relative flex min-w-[3.1rem] shrink-0 flex-col items-center justify-center gap-0.5 rounded-full px-1.5 py-1.5 text-[12px] font-medium transition-all sm:min-w-[3.25rem] sm:px-2 sm:py-2",
            onGames
              ? "bg-white text-black shadow-sm"
              : "text-white/70 hover:text-white"
          )}
        >
          <span className="inline-flex min-h-[1.25em] items-center justify-center text-[1.05rem] leading-none sm:text-[1.1rem]" aria-hidden>
            🎯
          </span>
          <span className="text-center text-[9px] leading-tight sm:text-[10px] sm:whitespace-nowrap">
            Игры
          </span>
        </Link>
      </div>
    </motion.nav>
  );
}
