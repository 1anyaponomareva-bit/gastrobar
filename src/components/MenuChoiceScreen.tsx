"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { CONFIG } from "@/lib/config";
import { getAssetUrl } from "@/lib/appVersion";
import {
  GASTROBAR_LOGO_HEIGHT_PX,
  GASTROBAR_LOGO_MAX_WIDTH,
  GASTROBAR_LOGO_WIDTH_PX,
} from "@/lib/appShellLayout";
import { useTranslation } from "@/lib/useTranslation";
import { cn } from "@/lib/utils";

const CHOICE_CARD_CLASS =
  "group relative flex min-h-[11.5rem] w-full flex-col items-center justify-center gap-3 overflow-hidden rounded-3xl border border-white/15 bg-white/[0.06] px-5 py-6 text-center shadow-[0_20px_60px_rgba(0,0,0,0.55)] backdrop-blur-md transition hover:border-white/30 hover:bg-white/[0.1] active:scale-[0.98]";

function ChoiceCard({
  href,
  icon,
  title,
  description,
  logoSrc,
  logoAlt,
  accentClass,
}: {
  href: string;
  icon: string;
  title: string;
  description: string;
  logoSrc: string;
  logoAlt: string;
  accentClass: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="w-full"
    >
      <Link href={href} className={cn(CHOICE_CARD_CLASS, accentClass)}>
        <span
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100"
          aria-hidden
        />
        <img
          src={logoSrc}
          alt={logoAlt}
          width={GASTROBAR_LOGO_WIDTH_PX}
          height={GASTROBAR_LOGO_HEIGHT_PX}
          className="h-[3.25rem] w-auto max-w-[min(200px,calc(100vw-4rem))] object-contain drop-shadow-[0_2px_18px_rgba(0,0,0,0.65)]"
          loading="eager"
          decoding="async"
        />
        <span className="text-[1.75rem] leading-none" aria-hidden>
          {icon}
        </span>
        <span className="text-xl font-semibold tracking-tight text-white">{title}</span>
        <span className="max-w-[16rem] text-sm leading-snug text-white/65">{description}</span>
      </Link>
    </motion.div>
  );
}

export function MenuChoiceScreen() {
  const { t } = useTranslation();

  return (
    <main className="relative mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_50%_at_50%_-10%,rgba(248,214,109,0.16),transparent_55%),radial-gradient(ellipse_70%_45%_at_100%_100%,rgba(127,180,255,0.12),transparent_50%),radial-gradient(ellipse_55%_40%_at_0%_85%,rgba(255,179,71,0.08),transparent_45%)]"
        aria-hidden
      />

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-8 py-6">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="flex flex-col items-center gap-4 text-center"
        >
          <img
            src={getAssetUrl(CONFIG.logoSrc)}
            alt="GASTROBAR"
            width={GASTROBAR_LOGO_WIDTH_PX}
            height={GASTROBAR_LOGO_HEIGHT_PX}
            className="object-contain drop-shadow-[0_2px_24px_rgba(0,0,0,0.75)]"
            style={{
              height: GASTROBAR_LOGO_HEIGHT_PX,
              maxWidth: GASTROBAR_LOGO_MAX_WIDTH,
              width: "auto",
            }}
            loading="eager"
            decoding="async"
          />
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-[1.65rem]">
              {t("menu_chooser_title")}
            </h1>
            <p className="text-sm leading-relaxed text-white/60 sm:text-[0.95rem]">
              {t("menu_chooser_subtitle")}
            </p>
          </div>
        </motion.div>

        <div className="flex w-full max-w-sm flex-col gap-4">
          <ChoiceCard
            href="/food"
            icon="🍔"
            title={t("tab_food")}
            description={t("menu_chooser_food_desc")}
            logoSrc="/food/menu/GASTROFOOD.png"
            logoAlt="GASTROFOOD"
            accentClass="hover:shadow-[0_24px_70px_rgba(248,214,109,0.14)]"
          />
          <ChoiceCard
            href="/"
            icon="🍸"
            title={t("bar")}
            description={t("menu_chooser_bar_desc")}
            logoSrc={getAssetUrl(CONFIG.logoSrc)}
            logoAlt="GASTROBAR"
            accentClass="hover:shadow-[0_24px_70px_rgba(127,180,255,0.14)]"
          />
        </div>
      </div>
    </main>
  );
}
