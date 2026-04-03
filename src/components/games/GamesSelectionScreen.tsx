"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const easeOut = [0.22, 1, 0.36, 1] as const;

/** Веер карт — без emoji, вектор. */
function DurakTableIllustration({ className }: { className?: string }) {
  return (
    <svg
      className={cn("overflow-visible", className)}
      viewBox="0 0 120 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <linearGradient id="durakCardA" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f8fafc" />
          <stop offset="100%" stopColor="#e2e8f0" />
        </linearGradient>
        <linearGradient id="durakCardB" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#fef3c7" />
          <stop offset="100%" stopColor="#fde68a" />
        </linearGradient>
        <linearGradient id="durakCardC" x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#ecfdf5" />
          <stop offset="100%" stopColor="#a7f3d0" />
        </linearGradient>
        <filter id="durakSoftShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="3" stdDeviation="3" floodOpacity="0.35" />
        </filter>
      </defs>
      <g filter="url(#durakSoftShadow)">
        <rect
          x="52"
          y="18"
          width="38"
          height="54"
          rx="5"
          fill="url(#durakCardC)"
          stroke="rgba(15,118,110,0.35)"
          strokeWidth="1"
          transform="rotate(18 71 45)"
        />
        <rect
          x="28"
          y="12"
          width="38"
          height="54"
          rx="5"
          fill="url(#durakCardB)"
          stroke="rgba(180,83,9,0.35)"
          strokeWidth="1"
          transform="rotate(-8 47 39)"
        />
        <rect
          x="8"
          y="22"
          width="38"
          height="54"
          rx="5"
          fill="url(#durakCardA)"
          stroke="rgba(148,163,184,0.5)"
          strokeWidth="1"
          transform="rotate(-22 27 49)"
        />
      </g>
      <text
        x="58"
        y="78"
        fill="rgba(248,250,252,0.85)"
        fontSize="11"
        fontWeight="700"
        fontFamily="system-ui, sans-serif"
      >
        A
      </text>
      <text
        x="78"
        y="88"
        fill="rgba(251,191,36,0.9)"
        fontSize="10"
        fontWeight="700"
        fontFamily="system-ui, sans-serif"
      >
        ♠
      </text>
    </svg>
  );
}

/** Фишки + карты — для покера. */
function PokerTableIllustration({ className }: { className?: string }) {
  return (
    <svg
      className={cn("overflow-visible", className)}
      viewBox="0 0 120 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <linearGradient id="chipStack" x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#fca5a5" />
          <stop offset="50%" stopColor="#b91c1c" />
          <stop offset="100%" stopColor="#7f1d1d" />
        </linearGradient>
        <linearGradient id="pokerCard" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#fff" />
          <stop offset="100%" stopColor="#e5e7eb" />
        </linearGradient>
      </defs>
      <ellipse cx="44" cy="58" rx="22" ry="7" fill="rgba(0,0,0,0.35)" />
      <ellipse cx="42" cy="52" rx="20" ry="6" fill="url(#chipStack)" opacity="0.9" />
      <ellipse cx="42" cy="46" rx="20" ry="6" fill="#dc2626" opacity="0.95" />
      <rect
        x="62"
        y="24"
        width="34"
        height="48"
        rx="4"
        fill="url(#pokerCard)"
        stroke="rgba(148,163,184,0.45)"
        strokeWidth="1"
        transform="rotate(12 79 48)"
      />
      <rect
        x="72"
        y="30"
        width="34"
        height="48"
        rx="4"
        fill="#1e293b"
        stroke="rgba(251,191,36,0.25)"
        strokeWidth="1"
        transform="rotate(-6 89 54)"
      />
      <text x="82" y="56" fill="rgba(248,250,252,0.7)" fontSize="11" fontWeight="600" fontFamily="system-ui">
        K
      </text>
    </svg>
  );
}

const noiseDataUri =
  "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

function GameTableCardActive({
  href,
  illustration,
  title,
  tagline,
  detail,
}: {
  href: string;
  illustration: ReactNode;
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
        <motion.div
          className="relative w-full overflow-visible rounded-[28px] outline-none"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.985 }}
          transition={{ type: "spring", stiffness: 420, damping: 32 }}
        >
          <div
            className={cn(
              "pointer-events-none absolute -inset-px rounded-[29px] opacity-90",
              "bg-gradient-to-br from-amber-500/25 via-transparent to-emerald-600/15 blur-xl",
              "transition-opacity duration-300 group-hover:opacity-100"
            )}
            aria-hidden
          />
          <motion.div
            className="pointer-events-none absolute inset-0 rounded-[28px]"
            style={{
              boxShadow:
                "inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -1px 0 rgba(0,0,0,0.35)",
            }}
            animate={{ opacity: [0.45, 0.72, 0.45] }}
            transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut" }}
            aria-hidden
          />
          <div
            className={cn(
              "relative flex min-h-[204px] w-full items-stretch overflow-hidden rounded-[28px]",
              "border border-white/[0.1] bg-black/25 backdrop-blur-[20px]",
              "shadow-[0_18px_48px_-12px_rgba(0,0,0,0.75),0_0_80px_-20px_rgba(251,191,36,0.35),inset_0_0_0_1px_rgba(251,191,36,0.12)]",
              "transition-[box-shadow] duration-300",
              "group-hover:shadow-[0_22px_56px_-12px_rgba(0,0,0,0.8),0_0_100px_-18px_rgba(251,191,36,0.48),inset_0_0_0_1px_rgba(251,191,36,0.14)]",
              "group-focus-visible:ring-2 group-focus-visible:ring-amber-400/50 group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-[#030201]"
            )}
          >
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.35]"
              style={{
                backgroundImage: `${noiseDataUri}`,
                mixBlendMode: "overlay",
              }}
              aria-hidden
            />
            <div
              className="pointer-events-none absolute inset-0 rounded-[28px] bg-[radial-gradient(ellipse_85%_75%_at_20%_15%,rgba(251,191,36,0.14),transparent_55%),radial-gradient(ellipse_60%_50%_at_95%_100%,rgba(16,185,129,0.12),transparent_50%)]"
              aria-hidden
            />
            <div className="relative z-[1] flex min-w-0 flex-1 flex-row items-center gap-2 pl-4 pr-5 py-5 sm:gap-4 sm:pl-6 sm:pr-7">
              <div className="relative flex w-[38%] max-w-[140px] shrink-0 items-center justify-center sm:w-[42%]">
                <div className="pointer-events-none absolute -left-3 -top-2 h-24 w-28 rounded-full bg-amber-400/15 blur-2xl" />
                <motion.div
                  className="relative w-full translate-x-[-4%] sm:translate-x-[-6%]"
                  animate={{ y: [0, -3, 0] }}
                  transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                >
                  {illustration}
                </motion.div>
              </div>
              <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 text-left">
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-amber-200/75">
                  За столом сейчас
                </p>
                <h2 className="text-[1.65rem] font-extrabold leading-[1.05] tracking-[0.04em] text-white sm:text-[1.85rem]">
                  {title}
                </h2>
                <p className="text-[0.9375rem] font-medium leading-snug text-white/78">{tagline}</p>
                <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-emerald-300/75">
                  {detail}
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      </Link>
    </motion.div>
  );
}

function GameTableCardSoon({
  illustration,
  title,
  tagline,
  detail,
}: {
  illustration: ReactNode;
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
          "relative flex min-h-[204px] w-full flex-row items-center gap-2 overflow-hidden rounded-[28px]",
          "border border-white/[0.06] bg-black/40 backdrop-blur-md",
          "shadow-[0_12px_36px_-16px_rgba(0,0,0,0.8)]",
          "pointer-events-none select-none opacity-[0.72] saturate-[0.72] grayscale-[0.15]"
        )}
        aria-disabled
      >
        <span
          className="absolute right-4 top-4 z-10 rounded-full border border-white/10 bg-black/50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white/55 backdrop-blur-md sm:right-5 sm:top-5"
          aria-label="Скоро в баре"
        >
          Скоро
        </span>
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,rgba(255,255,255,0.04),transparent_55%)]"
          aria-hidden
        />
        <div className="relative z-[1] flex min-w-0 flex-1 flex-row items-center gap-2 pl-4 pr-5 py-5 sm:gap-4 sm:pl-6 sm:pr-7">
          <div className="relative flex w-[38%] max-w-[140px] shrink-0 items-center justify-center opacity-80 sm:w-[42%]">
            <div className="relative w-full translate-x-[-4%] sm:translate-x-[-6%]">{illustration}</div>
          </div>
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 text-left">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/35">Стол готовится</p>
            <h2 className="text-[1.65rem] font-extrabold leading-[1.05] tracking-[0.04em] text-white/55 sm:text-[1.85rem]">
              {title}
            </h2>
            <p className="text-[0.9375rem] font-medium leading-snug text-white/40">{tagline}</p>
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-white/30">{detail}</p>
          </div>
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
          illustration={<DurakTableIllustration className="h-[100px] w-full sm:h-[118px]" />}
          title="ДУРАК"
          tagline="Уже играют. Можешь присоединиться"
          detail="Есть свободные места"
        />
        <GameTableCardSoon
          illustration={<PokerTableIllustration className="h-[100px] w-full sm:h-[118px]" />}
          title="ПОКЕР"
          tagline="Скоро откроем стол"
          detail="Стол пока закрыт — загляни позже"
        />
      </div>
    </div>
  );
}
