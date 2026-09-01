"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { CONFIG } from "@/lib/config";
import { getAssetUrl } from "@/lib/appVersion";
import { GASTROBAR_LOGO_WIDTH_PX } from "@/lib/appShellLayout";
import { useTranslation } from "@/lib/useTranslation";
import {
  POSTER_TEST_BAR_PATH,
  POSTER_TEST_FOOD_PATH,
} from "@/lib/posterTestRoutes";
import { cn } from "@/lib/utils";

const CHOICE_LOGO_HEIGHT_PX = 108;
const CHOICE_LOGO_MAX_WIDTH = "min(300px, calc(100vw - 2.5rem))";
const CHOICE_ILLUSTRATION_HEIGHT_PX = 52;
const CHOICE_ILLUSTRATION_MAX_WIDTH = "min(130px, 40vw)";

const ILLUSTRATION_SOFT_EDGE_MASK =
  "radial-gradient(ellipse 92% 84% at 50% 50%, #000 32%, transparent 72%)";

const CHOICE_CARD_CLASS =
  "group relative flex w-full flex-col items-center justify-center gap-1 overflow-hidden rounded-2xl border border-white/15 bg-white/[0.06] px-3.5 py-2 text-center shadow-[0_16px_48px_rgba(0,0,0,0.5)] backdrop-blur-md transition hover:border-white/30 hover:bg-white/[0.1] active:scale-[0.98]";

function ChoiceCard({
  href,
  title,
  description,
  logoSrc,
  logoAlt,
  illustrationSrc,
  illustrationAlt,
  illustrationSoftEdges = false,
  accentClass,
}: {
  href: string;
  title: string;
  description: string;
  logoSrc: string;
  logoAlt: string;
  illustrationSrc: string;
  illustrationAlt: string;
  illustrationSoftEdges?: boolean;
  accentClass: string;
}) {
  const illustrationWrapStyle = illustrationSoftEdges
    ? {
        WebkitMaskImage: ILLUSTRATION_SOFT_EDGE_MASK,
        maskImage: ILLUSTRATION_SOFT_EDGE_MASK,
      }
    : undefined;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="w-full"
    >
      <Link href={href} className={cn(CHOICE_CARD_CLASS, accentClass)}>
        <div className="flex flex-col items-center">
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
          <div
            className={cn(
              "-mt-4 flex items-center justify-center",
              illustrationSoftEdges && "px-1",
            )}
            style={illustrationWrapStyle}
          >
            <img
              src={illustrationSrc}
              alt={illustrationAlt}
              className={cn(
                "w-auto object-contain drop-shadow-[0_4px_16px_rgba(0,0,0,0.55)]",
                illustrationSoftEdges && "scale-[1.04]",
              )}
              style={{
                height: CHOICE_ILLUSTRATION_HEIGHT_PX,
                maxWidth: CHOICE_ILLUSTRATION_MAX_WIDTH,
              }}
              loading="eager"
              decoding="async"
            />
          </div>
        </div>
        <span className="text-base font-semibold tracking-tight text-white">{title}</span>
        <span className="line-clamp-1 max-w-[16rem] text-[11px] leading-snug text-white/60">
          {description}
        </span>
      </Link>
    </motion.div>
  );
}

export function PosterTestMenuChoiceScreen() {
  const { t } = useTranslation();

  return (
    <main
      className="relative mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      style={{
        paddingTop: `calc(var(--poster-test-top-bar-reserve) + 0.5rem)`,
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_50%_at_50%_-10%,rgba(248,214,109,0.16),transparent_55%),radial-gradient(ellipse_70%_45%_at_100%_100%,rgba(127,180,255,0.12),transparent_50%),radial-gradient(ellipse_55%_40%_at_0%_85%,rgba(255,179,71,0.08),transparent_45%)]"
        aria-hidden
      />

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-5 py-1">
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
            href={POSTER_TEST_FOOD_PATH}
            title={t("tab_food")}
            description={t("menu_chooser_food_desc")}
            logoSrc="/food/menu/GASTROFOOD.png"
            logoAlt="GASTROFOOD"
            illustrationSrc={getAssetUrl(CONFIG.menuChooserFoodIllustration)}
            illustrationAlt={t("tab_food")}
            illustrationSoftEdges
            accentClass="hover:shadow-[0_24px_70px_rgba(248,214,109,0.14)]"
          />
          <ChoiceCard
            href={POSTER_TEST_BAR_PATH}
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
