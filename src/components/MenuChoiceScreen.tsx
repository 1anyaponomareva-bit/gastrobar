"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { CONFIG } from "@/lib/config";
import { getAssetUrl } from "@/lib/appVersion";
import { GASTROBAR_LOGO_WIDTH_PX } from "@/lib/appShellLayout";
import { useTranslation } from "@/lib/useTranslation";
import { cn } from "@/lib/utils";

const CHOICE_LOGO_HEIGHT_PX = 88;
const CHOICE_LOGO_MAX_WIDTH = "min(260px, calc(100vw - 3rem))";
const CHOICE_ILLUSTRATION_HEIGHT_PX = 60;
const CHOICE_ILLUSTRATION_MAX_WIDTH = "min(140px, 42vw)";

const CHOICE_CARD_CLASS =
  "group relative flex w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border border-white/15 bg-white/[0.06] px-4 py-3.5 text-center shadow-[0_16px_48px_rgba(0,0,0,0.5)] backdrop-blur-md transition hover:border-white/30 hover:bg-white/[0.1] active:scale-[0.98]";

function ChoiceCard({
  href,
  title,
  description,
  logoSrc,
  logoAlt,
  illustrationSrc,
  illustrationAlt,
  accentClass,
}: {
  href: string;
  title: string;
  description: string;
  logoSrc: string;
  logoAlt: string;
  illustrationSrc: string;
  illustrationAlt: string;
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
        <img
          src={logoSrc}
          alt={logoAlt}
          width={GASTROBAR_LOGO_WIDTH_PX}
          height={CHOICE_LOGO_HEIGHT_PX}
          className="w-auto object-contain drop-shadow-[0_2px_22px_rgba(0,0,0,0.7)]"
          style={{
            height: CHOICE_LOGO_HEIGHT_PX,
            maxWidth: CHOICE_LOGO_MAX_WIDTH,
          }}
          loading="eager"
          decoding="async"
        />
        <img
          src={illustrationSrc}
          alt={illustrationAlt}
          className="w-auto object-contain drop-shadow-[0_4px_16px_rgba(0,0,0,0.55)]"
          style={{
            height: CHOICE_ILLUSTRATION_HEIGHT_PX,
            maxWidth: CHOICE_ILLUSTRATION_MAX_WIDTH,
          }}
          loading="eager"
          decoding="async"
        />
        <span className="text-lg font-semibold tracking-tight text-white">{title}</span>
        <span className="line-clamp-2 max-w-[16rem] text-xs leading-snug text-white/65">
          {description}
        </span>
      </Link>
    </motion.div>
  );
}

export function MenuChoiceScreen() {
  const { t } = useTranslation();

  return (
    <main className="relative mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))]">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_50%_at_50%_-10%,rgba(248,214,109,0.16),transparent_55%),radial-gradient(ellipse_70%_45%_at_100%_100%,rgba(127,180,255,0.12),transparent_50%),radial-gradient(ellipse_55%_40%_at_0%_85%,rgba(255,179,71,0.08),transparent_45%)]"
        aria-hidden
      />

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-5 py-3">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="text-center"
        >
          <h1 className="text-xl font-bold tracking-tight text-white">
            {t("menu_chooser_title")}
          </h1>
          <p className="mt-1.5 text-xs leading-relaxed text-white/60 sm:text-sm">
            {t("menu_chooser_subtitle")}
          </p>
        </motion.div>

        <div className="flex w-full max-w-sm flex-col gap-3">
          <ChoiceCard
            href="/food"
            title={t("tab_food")}
            description={t("menu_chooser_food_desc")}
            logoSrc="/food/menu/GASTROFOOD.png"
            logoAlt="GASTROFOOD"
            illustrationSrc={getAssetUrl(CONFIG.menuChooserFoodIllustration)}
            illustrationAlt={t("tab_food")}
            accentClass="hover:shadow-[0_24px_70px_rgba(248,214,109,0.14)]"
          />
          <ChoiceCard
            href="/"
            title={t("bar")}
            description={t("menu_chooser_bar_desc")}
            logoSrc={getAssetUrl(CONFIG.logoSrc)}
            logoAlt="GASTROBAR"
            illustrationSrc={getAssetUrl(CONFIG.menuChooserBarIllustration)}
            illustrationAlt={t("bar")}
            accentClass="hover:shadow-[0_24px_70px_rgba(127,180,255,0.14)]"
          />
        </div>
      </div>
    </main>
  );
}
