"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { usePosterTestAuth } from "@/components/poster-test/PosterTestAuthProvider";
import { usePosterTestCart } from "@/components/poster-test/PosterTestCartProvider";
import { useTranslation } from "@/lib/useTranslation";
import { cn } from "@/lib/utils";
import {
  POSTER_TEST_ACCOUNT_PATH,
  POSTER_TEST_BAR_PATH,
  POSTER_TEST_FOOD_PATH,
  POSTER_TEST_LOGIN_PATH,
} from "@/lib/posterTestRoutes";

type NavTab =
  | { id: "food"; tkey: "tab_food"; icon: string; href: string }
  | { id: "bar"; tkey: "bar"; icon: string; href: string }
  | { id: "cart"; icon: string; label: string }
  | { id: "bonuses"; icon: string; label: string };

const NAV_TABS: NavTab[] = [
  { id: "food", tkey: "tab_food", icon: "🍔", href: POSTER_TEST_FOOD_PATH },
  { id: "bar", tkey: "bar", icon: "🍸", href: POSTER_TEST_BAR_PATH },
  { id: "cart", icon: "🛒", label: "Корзина" },
  { id: "bonuses", icon: "🎁", label: "Бонусы" },
];

export function PosterTestBottomNav() {
  const { t } = useTranslation();
  const { user } = usePosterTestAuth();
  const { cartCount, checkoutOpen, openCart } = usePosterTestCart();
  const pathname = usePathname();
  const router = useRouter();
  const path = pathname ?? "";

  const onFood =
    path === POSTER_TEST_FOOD_PATH || path.startsWith(`${POSTER_TEST_FOOD_PATH}?`);
  const onBar = path === POSTER_TEST_BAR_PATH;
  const onBonuses = path === POSTER_TEST_ACCOUNT_PATH || path === POSTER_TEST_LOGIN_PATH;

  const openCartFromNav = () => {
    openCart("cart");
  };

  const goBonuses = () => {
    router.push(user ? POSTER_TEST_ACCOUNT_PATH : POSTER_TEST_LOGIN_PATH);
  };

  const tabLabel = (tab: NavTab) => ("tkey" in tab ? t(tab.tkey) : tab.label);

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
      <div className="pointer-events-auto mx-auto flex w-[min(26rem,calc(100vw-1.5rem))] max-w-none items-center justify-between gap-1 rounded-full bg-white/10 px-1.5 py-1.5 text-sm text-white shadow-[0_18px_60px_rgba(0,0,0,0.9)] backdrop-blur-md sm:w-[min(28rem,calc(100vw-2rem))] sm:gap-2 sm:px-2 sm:py-2">
        {NAV_TABS.map((tab) => {
          const active =
            tab.id === "food"
              ? onFood && !checkoutOpen
              : tab.id === "bar"
                ? onBar && !checkoutOpen
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
                <span className={labelClass}>{tabLabel(tab)}</span>
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
                <span className={labelClass}>{tabLabel(tab)}</span>
              </button>
            );
          }

          return (
            <Link key={tab.id} href={tab.href} className={tabClass(active)}>
              {iconMotion(tab.id, active)}
              <span className={labelClass}>{tabLabel(tab)}</span>
            </Link>
          );
        })}
      </div>
    </motion.nav>
  );
}
