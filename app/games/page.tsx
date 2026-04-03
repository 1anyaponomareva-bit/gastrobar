import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/Header";
import { BottomNav } from "@/components/BottomNav";
import { HEADER_OFFSET_TOP } from "@/components/durak/durakLayoutConstants";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Игры — GASTROBAR",
  description: "Дурак онлайн и скоро — покер.",
  openGraph: {
    title: "Игры — GASTROBAR",
    description: "Выбор игры за столом.",
  },
};

/** ~140–160px по ТЗ; на узком экране чуть ниже, на sm — выше в пределах диапазона. */
const TILE_CLASS = "h-[142px] sm:h-[154px]";

function GameCardInner({
  emoji,
  title,
  subtitle,
}: {
  emoji: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1 px-6 py-5 text-center">
      <span className="text-[40px] leading-none select-none sm:text-[48px]" aria-hidden>
        {emoji}
      </span>
      <h2 className="mt-1 text-[1.0625rem] font-bold tracking-[0.02em] text-white/[0.96] sm:text-[1.1rem]">
        {title}
      </h2>
      <p className="mt-0.5 max-w-[18rem] text-[0.8125rem] font-normal leading-snug text-white/45 sm:text-[0.84rem]">
        {subtitle}
      </p>
    </div>
  );
}

export default function GamesPage() {
  return (
    <>
      <Header />
      <main
        className={cn(
          "relative mx-auto min-h-[100dvh] w-full max-w-lg overflow-x-hidden",
          "pb-[max(7rem,calc(env(safe-area-inset-bottom,0px)+6rem))]",
          "text-[#f5f0e8]",
          HEADER_OFFSET_TOP,
          "bg-[#060504]"
        )}
      >
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_50%_at_50%_-10%,rgba(201,162,39,0.08),transparent_50%),radial-gradient(ellipse_70%_45%_at_100%_100%,rgba(58,92,72,0.1),transparent_42%)]"
          aria-hidden
        />

        <div className="relative z-[1] mx-auto w-full px-4 pt-5 sm:px-6 sm:pt-7">
          <h1 className="text-center text-[1.35rem] font-semibold tracking-[0.02em] text-white/95 sm:text-2xl">
            Игры
          </h1>

          <div className="mx-auto mt-6 flex w-full max-w-md flex-col gap-5 sm:mt-7">
            <Link
              href="/durak"
              className={cn(
                "group relative block w-full shrink-0 outline-none",
                TILE_CLASS,
                "rounded-[24px] bg-[#151515]",
                "shadow-[0_10px_36px_-12px_rgba(0,0,0,0.55),0_0_0_1px_rgba(201,162,39,0.09)]",
                "transition-[transform,box-shadow,filter] duration-200",
                "hover:shadow-[0_12px_40px_-10px_rgba(0,0,0,0.58),0_0_40px_-10px_rgba(212,168,75,0.22)]",
                "focus-visible:ring-2 focus-visible:ring-[#d4a84b]/65 focus-visible:ring-offset-2 focus-visible:ring-offset-[#060504]",
                "active:scale-[0.99]"
              )}
            >
              <div
                className="pointer-events-none absolute inset-0 rounded-[24px] bg-[radial-gradient(ellipse_90%_75%_at_50%_-10%,rgba(232,200,122,0.14),transparent_55%)]"
                aria-hidden
              />
              <div
                className="pointer-events-none absolute inset-0 rounded-[24px] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]"
                aria-hidden
              />
              <div className="relative z-[1] flex h-full w-full">
                <GameCardInner emoji="🎴" title="Дурак" subtitle="Онлайн за столом" />
              </div>
            </Link>

            <div className="relative w-full shrink-0" aria-disabled>
              <div
                className={cn(
                  "relative w-full overflow-hidden rounded-[24px] bg-[#151515]",
                  TILE_CLASS,
                  "opacity-[0.68]",
                  "shadow-[0_8px_28px_-12px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.04)]",
                  "pointer-events-none select-none"
                )}
              >
                <div
                  className="pointer-events-none absolute inset-0 rounded-[24px] bg-[radial-gradient(ellipse_88%_72%_at_50%_-8%,rgba(200,170,100,0.07),transparent_56%)]"
                  aria-hidden
                />
                <div className="relative z-[1] flex h-full w-full">
                  <GameCardInner emoji="♠️" title="Покер" subtitle="Скоро в Gastrobar" />
                </div>
              </div>
              <span
                className="pointer-events-none absolute right-4 top-4 z-10 rounded-full border border-[#c9a227]/28 bg-black/50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#e8d5a8]/95 backdrop-blur-[6px] sm:right-5 sm:top-5 sm:text-[11px]"
                aria-label="Скоро"
              >
                Скоро
              </span>
            </div>
          </div>
        </div>
      </main>
      <BottomNav />
    </>
  );
}
