"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
  const pathname = usePathname();
  const router = useRouter();
  const onDurak = pathname === "/durak";

  const goPeriod = (id: MenuPeriod) => {
    setPeriod(id);
    if (pathname !== "/") router.push("/");
  };

  return (
    <motion.nav
      initial={{ opacity: 1, y: 0 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center safe-bottom"
    >
      <div className="pointer-events-auto mx-auto flex max-w-md flex-wrap items-center justify-center gap-x-0 gap-y-1 rounded-full bg-white/10 px-2 py-2.5 text-sm text-white shadow-[0_18px_60px_rgba(0,0,0,0.9)] backdrop-blur-md sm:flex-nowrap sm:justify-between sm:gap-0">
        {TABS.map((tab) => {
          const active = !onDurak && tab.id === period;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => goPeriod(tab.id)}
              className={cn(
                "relative mx-1 flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-full px-2 py-1.5 text-[13px] font-medium transition-all sm:px-3 sm:py-2",
                active
                  ? "bg-white text-black shadow-sm"
                  : "text-white/70 hover:text-white"
              )}
            >
              <motion.span
                className="inline-flex min-h-[1.25em] items-center justify-center text-[1.05rem] leading-none sm:text-[1.1rem]"
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
              <span className="max-w-full truncate text-center text-[10px] leading-tight sm:text-[11px]">
                {tab.label}
              </span>
            </button>
          );
        })}
        <Link
          href="/durak"
          className={cn(
            "relative mx-0.5 flex min-w-[3rem] shrink-0 flex-col items-center justify-center gap-0.5 rounded-full px-2 py-1.5 text-[12px] font-medium transition-all sm:mx-1 sm:min-w-[3.25rem] sm:px-2.5 sm:py-2 sm:text-[13px]",
            onDurak
              ? "bg-white text-black shadow-sm"
              : "text-white/70 hover:text-white"
          )}
        >
          <span className="inline-flex min-h-[1.25em] items-center justify-center text-[1.05rem] leading-none sm:text-[1.1rem]" aria-hidden>
            🎯
          </span>
          <span className="max-w-[3.25rem] truncate text-center text-[10px] leading-tight sm:max-w-none sm:text-[11px]">
            Игра
          </span>
        </Link>
      </div>
    </motion.nav>
  );
}
