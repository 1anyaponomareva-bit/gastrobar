"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/useTranslation";

function GameTableCardActive({
  href,
  variant,
  title,
  atTable,
  tagline,
  detail,
}: {
  href: string;
  variant: "durak";
  title: string;
  atTable: string;
  tagline: string;
  detail: string;
}) {
  return (
    <div className="w-full">
      <Link href={href} className="group block w-full outline-none" prefetch>
        <div
          className={cn(
            "games-pick-card games-pick-card--interactive shadow-[0_18px_48px_-12px_rgba(0,0,0,0.75)] outline-none transition-[box-shadow] duration-300",
            variant === "durak" && "games-pick-card--durak",
            "group-hover:shadow-[0_22px_52px_-12px_rgba(0,0,0,0.82)]",
            "group-focus-visible:ring-2 group-focus-visible:ring-amber-400/50 group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-[#030201]"
          )}
        >
          <div className="games-pick-card__bg" aria-hidden />
          <div className="games-pick-card__overlay" aria-hidden />
          <div className="games-pick-card__content">
            <div className="games-pick-card__text">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-amber-200/75">
                {atTable}
              </p>
              <h2 className="mt-1 text-[1.65rem] font-extrabold leading-[1.05] tracking-[0.04em] text-white sm:text-[1.85rem]">
                {title}
              </h2>
              <p className="mt-1.5 text-[0.9375rem] font-medium leading-snug text-white/78">{tagline}</p>
              <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.12em] text-emerald-300/75">{detail}</p>
            </div>
          </div>
        </div>
      </Link>
    </div>
  );
}

function GameTableCardSoon({
  variant,
  title,
  tagline,
  detail,
  soon,
  tablePrep,
  soonAria,
}: {
  variant: "durak" | "battleship";
  title: string;
  tagline: string;
  detail: string;
  soon: string;
  tablePrep: string;
  soonAria: string;
}) {
  return (
    <div className="relative w-full">
      <div
        className={cn(
          "games-pick-card games-pick-card--soon relative shadow-[0_12px_36px_-16px_rgba(0,0,0,0.8)]",
          variant === "durak" && "games-pick-card--durak",
          variant === "battleship" && "games-pick-card--battleship"
        )}
        aria-disabled
      >
        <span
          className="absolute right-4 top-4 z-[4] rounded-full bg-black/75 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white/70 sm:right-5 sm:top-5"
          aria-label={soonAria}
        >
          {soon}
        </span>
        <div className="games-pick-card__bg" aria-hidden />
        <div className="games-pick-card__overlay" aria-hidden />
        <div className="games-pick-card__content">
          <div className="games-pick-card__text">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/35">{tablePrep}</p>
            <h2 className="mt-1 text-[1.65rem] font-extrabold leading-[1.05] tracking-[0.04em] text-white/55 sm:text-[1.85rem]">
              {title}
            </h2>
            <p className="mt-1.5 text-[0.9375rem] font-medium leading-snug text-white/40">{tagline}</p>
            <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.12em] text-white/30">{detail}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function GamesSelectionScreen() {
  const { t } = useTranslation();
  return (
    <div className="relative z-[1] mx-auto w-full max-w-md px-4 pt-4 pb-2 sm:px-6 sm:pt-6">
      <header className="mb-8 text-center sm:mb-10">
        <h1 className="text-balance text-[1.75rem] font-bold leading-tight tracking-tight text-white sm:text-[2rem]">
          {t("games_heading")}
        </h1>
        <p className="mx-auto mt-3 max-w-[22rem] text-pretty text-[0.95rem] leading-relaxed text-white/55 sm:text-base">
          {t("games_sub")}
        </p>
      </header>

      <div className="flex w-full flex-col gap-6 sm:gap-7">
        <GameTableCardActive
          href="/durak?new=1"
          variant="durak"
          title={t("games_durak_title")}
          atTable={t("games_at_table")}
          tagline={t("games_durak_sub")}
          detail={t("games_durak_detail")}
        />
        <GameTableCardSoon
          variant="battleship"
          title={t("games_battleship_title")}
          tagline={t("games_battleship_sub")}
          detail={t("games_battleship_detail")}
          soon={t("games_soon_badge")}
          tablePrep={t("games_table_prep")}
          soonAria={t("games_soon_aria")}
        />
      </div>
    </div>
  );
}
