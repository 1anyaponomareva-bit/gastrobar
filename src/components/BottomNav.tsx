"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "@/components/ThemeProvider";
import { abandonDurakStoredRoom } from "@/lib/durak/activeRoomStorage";
import type { MenuPeriod } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/useTranslation";

type NavTab =
  | { id: "food"; tkey: "tab_food"; icon: string; href: string }
  | { id: "combo"; tkey: "tab_combo"; icon: string; href: string }
  | { id: "bar"; tkey: "bar"; icon: string; period: MenuPeriod }
  | { id: "favorites"; tkey: "favorites"; icon: string; period: MenuPeriod }
  | { id: "games"; tkey: "tab_games"; icon: string; href: string };

const NAV_TABS: NavTab[] = [
  { id: "food", tkey: "tab_food", icon: "🍔", href: "/food" },
  { id: "combo", tkey: "tab_combo", icon: "🍱", href: "/food?section=combo" },
  { id: "bar", tkey: "bar", icon: "🍸", period: "bar" },
  { id: "favorites", tkey: "favorites", icon: "❤️", period: "favorites" },
  { id: "games", tkey: "tab_games", icon: "🎯", href: "/games" },
];

export function BottomNav() {
  const { t } = useTranslation();
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

  const tabClass = (active: boolean, games = false) =>
    cn(
      "relative flex flex-col items-center justify-center gap-0.5 rounded-full px-0.5 py-1.5 text-[12px] font-medium transition-all sm:px-1 sm:py-2",
      games
        ? "min-w-[3.25rem] shrink-0 sm:min-w-[3.5rem]"
        : "min-w-[2.85rem] flex-1 sm:min-w-0",
      active ? "bg-white text-black shadow-sm" : "text-white/70 hover:text-white",
    );

  const labelClass = "max-w-[3.5rem] text-center text-[8px] leading-tight sm:max-w-none sm:whitespace-nowrap sm:text-[10px]";

  const iconMotion = (tabId: NavTab["id"], active: boolean) => (
    <motion.span
      className="inline-flex min-h-[1.25em] items-center justify-center text-[1.05rem] leading-none sm:text-[1.1rem]"
      animate={
        active
          ? tabId === "bar"
            ? { scale: [1, 1.35, 1], rotate: [0, -10, 10, 0], y: [0, -2, 0] }
            : tabId === "favorites"
              ? { scale: [1, 1.2, 1] }
              : { scale: [1, 1.25, 1], y: [0, -3, 0] }
          : { scale: 1, rotate: 0, y: 0, opacity: 1 }
      }
      transition={
        active
          ? {
              duration: tabId === "bar" ? 0.9 : tabId === "favorites" ? 0.6 : 0.7,
              repeat: Infinity,
              ease: "easeInOut",
            }
          : { duration: 0.2 }
      }
    >
      {NAV_TABS.find((tab) => tab.id === tabId)?.icon}
    </motion.span>
  );

  return (
    <motion.nav
      initial={{ opacity: 1, y: 0 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-4 flex justify-center safe-bottom px-3",
        onGames ? "z-[1180]" : "z-40",
      )}
    >
      <div className="pointer-events-auto mx-auto flex w-[min(28rem,calc(100vw-1rem))] max-w-none flex-nowrap items-center justify-between gap-0 rounded-full bg-white/10 px-1.5 py-1.5 text-sm text-white shadow-[0_18px_60px_rgba(0,0,0,0.9)] backdrop-blur-md sm:w-[min(30rem,calc(100vw-2rem))] sm:gap-0.5 sm:px-2 sm:py-2">
        {NAV_TABS.map((tab) => {
          const label = t(tab.tkey);
          const active =
            tab.id === "games"
              ? onGames
              : tab.id === "bar"
                ? !onGames && period === "bar"
                : tab.id === "favorites"
                  ? !onGames && period === "favorites"
                  : false;

          if ("href" in tab) {
            return (
              <Link
                key={tab.id}
                href={tab.href}
                className={tabClass(active, tab.id === "games")}
              >
                {iconMotion(tab.id, active)}
                <span className={labelClass}>{label}</span>
              </Link>
            );
          }

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => goPeriod(tab.period)}
              className={tabClass(active)}
            >
              {iconMotion(tab.id, active)}
              <span className={labelClass}>{label}</span>
            </button>
          );
        })}
      </div>
    </motion.nav>
  );
}
