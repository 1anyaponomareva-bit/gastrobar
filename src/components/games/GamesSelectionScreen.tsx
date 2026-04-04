"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const easeOut = [0.22, 1, 0.36, 1] as const;

function GameTableCardActive({
  href,
  variant,
  title,
  tagline,
  detail,
}: {
  href: string;
  variant: "durak" | "poker";
  title: string;
  tagline: string;
  detail: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: easeOut }}
      className="w-full"
    >
      <Link href={href} className="group block w-full outline-none" prefetch>
        <div
          className={cn(
            "games-pick-card games-pick-card--interactive shadow-[0_18px_48px_-12px_rgba(0,0,0,0.75)] outline-none transition-[box-shadow] duration-300",
            variant === "durak" && "games-pick-card--durak",
            variant === "poker" && "games-pick-card--poker",
            "group-hover:shadow-[0_22px_52px_-12px_rgba(0,0,0,0.82)]",
            "group-focus-visible:ring-2 group-focus-visible:ring-amber-400/50 group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-[#030201]"
          )}
        >
          <div className="games-pick-card__image" aria-hidden />
          <div className="games-pick-card__text">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-amber-200/75">
              За столом сейчас
            </p>
            <h2 className="mt-1 text-[1.65rem] font-extrabold leading-[1.05] tracking-[0.04em] text-white sm:text-[1.85rem]">
              {title}
            </h2>
            <p className="mt-1.5 text-[0.9375rem] font-medium leading-snug text-white/78">{tagline}</p>
            <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.12em] text-emerald-300/75">{detail}</p>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

function GameTableCardSoon({
  variant,
  title,
  tagline,
  detail,
}: {
  variant: "durak" | "poker";
  title: string;
  tagline: string;
  detail: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.08, ease: easeOut }}
      className="relative w-full"
    >
      <div
        className={cn(
          "games-pick-card games-pick-card--soon relative shadow-[0_12px_36px_-16px_rgba(0,0,0,0.8)]",
          variant === "durak" && "games-pick-card--durak",
          variant === "poker" && "games-pick-card--poker"
        )}
        aria-disabled
      >
        <span
          className="absolute right-4 top-4 z-[3] rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white/65 backdrop-blur-md sm:right-5 sm:top-5"
          aria-label="Скоро в баре"
        >
          Скоро
        </span>
        <div className="games-pick-card__image" aria-hidden />
        <div className="games-pick-card__text">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/35">Стол готовится</p>
          <h2 className="mt-1 text-[1.65rem] font-extrabold leading-[1.05] tracking-[0.04em] text-white/55 sm:text-[1.85rem]">
            {title}
          </h2>
          <p className="mt-1.5 text-[0.9375rem] font-medium leading-snug text-white/40">{tagline}</p>
          <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.12em] text-white/30">{detail}</p>
        </div>
      </div>
    </motion.div>
  );
}

export function GamesSelectionScreen() {
  return (
    <div className="relative z-[1] mx-auto w-full max-w-md px-4 pt-4 pb-2 sm:px-6 sm:pt-6">
      <motion.header
        className="mb-8 text-center sm:mb-10"
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: easeOut }}
      >
        <h1 className="text-balance text-[1.75rem] font-bold leading-tight tracking-tight text-white sm:text-[2rem]">
          Во что сыграем?
        </h1>
        <p className="mx-auto mt-3 max-w-[22rem] text-pretty text-[0.95rem] leading-relaxed text-white/55 sm:text-base">
          Выбери игру и займи место за столом
        </p>
      </motion.header>

      <div className="flex w-full flex-col gap-6 sm:gap-7">
        <GameTableCardActive
          href="/durak?new=1"
          variant="durak"
          title="ДУРАК"
          tagline="Уже играют. Можешь присоединиться"
          detail="Есть свободные места"
        />
        <GameTableCardSoon
          variant="poker"
          title="ПОКЕР"
          tagline="Скоро откроем стол"
          detail="Стол пока закрыт — загляни позже"
        />
      </div>
    </div>
  );
}
