"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { usePosterTestAuth } from "@/components/poster-test/PosterTestAuthProvider";
import { usePosterTestCart } from "@/components/poster-test/PosterTestCartProvider";
import { cn } from "@/lib/utils";
import {
  POSTER_TEST_ACCOUNT_PATH,
  POSTER_TEST_BAR_PATH,
  POSTER_TEST_FOOD_PATH,
  POSTER_TEST_LOGIN_PATH,
  POSTER_TEST_ROOT,
} from "@/lib/posterTestRoutes";

type NavTab =
  | { id: "menu"; label: string; icon: string; href: string }
  | { id: "cart"; label: string; icon: string }
  | { id: "bonuses"; label: string; icon: string };

const NAV_TABS: NavTab[] = [
  { id: "menu", label: "Меню", icon: "📋", href: POSTER_TEST_FOOD_PATH },
  { id: "cart", label: "Корзина", icon: "🛒" },
  { id: "bonuses", label: "Бонусы", icon: "🎁" },
];

export function PosterTestBottomNav() {
  const { user } = usePosterTestAuth();
  const { cartCount, checkoutOpen, openCart } = usePosterTestCart();
  const pathname = usePathname();
  const router = useRouter();
  const path = pathname ?? "";

  const onMenu =
    path === POSTER_TEST_ROOT ||
    path === POSTER_TEST_FOOD_PATH ||
    path.startsWith(`${POSTER_TEST_FOOD_PATH}?`) ||
    path === POSTER_TEST_BAR_PATH;
  const onBonuses = path === POSTER_TEST_ACCOUNT_PATH || path === POSTER_TEST_LOGIN_PATH;

  const openCartFromNav = () => {
    openCart("cart");
  };

  const goBonuses = () => {
    router.push(user ? POSTER_TEST_ACCOUNT_PATH : POSTER_TEST_LOGIN_PATH);
  };

  const tabClass = (active: boolean) =>
    cn(
      "relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-full px-1 py-1.5 text-[12px] font-medium transition-all sm:px-2 sm:py-2",
      active ? "bg-white text-black shadow-sm" : "text-white/70 hover:text-white",
    );

  const labelClass =
    "max-w-[4.5rem] text-center text-[9px] leading-tight sm:max-w-none sm:whitespace-nowrap sm:text-[10px]";

  const iconMotion = (tabId: NavTab["id"], active: boolean) => (
    <motion.span
      className="relative inline-flex min-h-[1.25em] items-center justify-center text-[1.05rem] leading-none sm:text-[1.1rem]"
      animate={
        active
          ? tabId === "cart"
            ? { scale: [1, 1.2, 1] }
            : { scale: [1, 1.2, 1], y: [0, -2, 0] }
          : { scale: 1, y: 0, opacity: 1 }
      }
      transition={
        active
          ? {
              duration: tabId === "cart" ? 0.6 : 0.7,
              repeat: Infinity,
              ease: "easeInOut",
            }
          : { duration: 0.2 }
      }
    >
      {NAV_TABS.find((tab) => tab.id === tabId)?.icon}
      {tabId === "cart" && cartCount > 0 ? (
        <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-300 px-1 text-[9px] font-bold leading-none text-black">
          {cartCount > 9 ? "9+" : cartCount}
        </span>
      ) : null}
    </motion.span>
  );

  return (
    <motion.nav
      initial={{ opacity: 1, y: 0 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-4 flex justify-center safe-bottom px-3",
        checkoutOpen ? "z-[30]" : "z-40",
      )}
    >
      <div className="pointer-events-auto mx-auto flex w-[min(22rem,calc(100vw-1.5rem))] max-w-none items-center justify-between gap-1 rounded-full bg-white/10 px-1.5 py-1.5 text-sm text-white shadow-[0_18px_60px_rgba(0,0,0,0.9)] backdrop-blur-md sm:w-[min(24rem,calc(100vw-2rem))] sm:gap-2 sm:px-2 sm:py-2">
        {NAV_TABS.map((tab) => {
          const active =
            tab.id === "menu"
              ? onMenu && !checkoutOpen
              : tab.id === "cart"
                ? checkoutOpen
                : tab.id === "bonuses"
                  ? onBonuses
                  : false;

          if (tab.id === "cart") {
            return (
              <button
                key={tab.id}
                type="button"
                onClick={openCartFromNav}
                className={tabClass(active)}
              >
                {iconMotion(tab.id, active)}
                <span className={labelClass}>{tab.label}</span>
              </button>
            );
          }

          if (tab.id === "bonuses") {
            return (
              <button
                key={tab.id}
                type="button"
                onClick={goBonuses}
                className={tabClass(active)}
              >
                {iconMotion(tab.id, active)}
                <span className={labelClass}>{tab.label}</span>
              </button>
            );
          }

          return (
            <Link key={tab.id} href={tab.href} className={tabClass(active)}>
              {iconMotion(tab.id, active)}
              <span className={labelClass}>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </motion.nav>
  );
}
